/** The search surface. */

import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  applyDecorators,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { GetSearchSchemaUseCase, SearchSchema } from '../../application/get-search-schema.use-case';
import {
  ResultWindowExceededError,
  SearchProfilesUseCase,
} from '../../application/search-profiles.use-case';
import {
  NotSuggestableFieldError,
  SuggestValuesUseCase,
} from '../../application/suggest-values.use-case';
import { PRIMARY_FIELDS, SearchField } from '../../domain/search/field-registry';
import {
  FilterValue,
  SearchCriteria,
  UnknownFilterFieldError,
} from '../../domain/search/search-criteria';
import { SearchResult } from '../../domain/search/search-result';
import { FILTER_PREFIX, FilterQueryError, parseFilterQuery } from './filter-query.parser';
import { SearchQueryDto, SuggestQueryDto } from './dto/search-query.dto';
import { SearchResultDto } from './dto/search-response.dto';
import { SearchSchemaDto, SuggestResponseDto } from './dto/search-schema.dto';
import { BOUND_VALIDATION_PIPE } from './bound-validation.pipe';

const FILTER_ENCODING = [
  'Filters are flat query parameters named `f.<key>`, where `<key>` is a field key from',
  '`GET /api/search/schema`. How the value is written follows from that field\'s `kind`:',
  '',
  '- `terms` and `ordered_terms`: a comma-separated list, matched as "any of":',
  '  `f.skills=leadership,training`. A comma **inside** a value must be escaped as `%2C`,',
  '  which is how the salary bands are sent: `f.salaryBand=%3C20%2C000` means `<20,000`.',
  '- `range`: `min..max`, either end optional: `f.yearsExperience=5..15`, `5..`, `..15`.',
  '- `date_range`: the same, with years or partial dates: `f.graduationYear=2000..2010`.',
  '- `exists`: `true` or `false`, as in `f.hasGithub=true`.',
  '',
  'Filters on different fields are combined with AND. An unknown key, a malformed range or a',
  'value outside a closed vocabulary is a 400 naming the parameter; a parameter with no value',
  'is ignored.',
].join('\n');

const FILTER_EXAMPLES: Readonly<Record<string, string>> = {
  skills: 'leadership,training',
  jobTitle: 'head of growth',
  jobRole: 'marketing',
  seniority: 'director,vp',
  industry: 'information technology and services',
  salaryBand: '%3E250%2C000',
  companyName: 'northwind trading',
  companySize: '201-500',
  country: 'united states',
};

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchProfiles: SearchProfilesUseCase,
    private readonly searchSchema: GetSearchSchemaUseCase,
    private readonly suggestValues: SuggestValuesUseCase,
  ) {}

  @Get('schema')
  @ApiOperation({
    summary: 'Every filterable field, sort order and filter group',
    description:
      'The whole filter vocabulary, served as data. Clients render from this and hold no field ' +
      'list of their own, so a filter added to the registry appears in the UI with no client ' +
      'change. Fields arrive in display order; `groups` is the order the sections should appear in.',
  })
  @ApiOkResponse({ type: SearchSchemaDto })
  getSchema(): SearchSchema {
    return this.searchSchema.execute();
  }

  @Get('suggest')
  @ApiOperation({
    summary: 'Complete a filter value from a prefix',
    description:
      'For fields no dropdown can hold; skills alone has over 2,000 distinct values. Fields with ' +
      'a closed vocabulary are answered from the registry, everything else from the index. The ' +
      'returned values can be sent straight back as a `f.<key>` filter value.',
  })
  @ApiOkResponse({ type: SuggestResponseDto })
  @ApiBadRequestResponse({ description: 'The field is unknown, or holds numbers rather than text.' })
  async suggest(@Query(BOUND_VALIDATION_PIPE) query: SuggestQueryDto): Promise<SuggestResponseDto> {
    try {
      const values = await this.suggestValues.execute(query.field, query.q ?? '', query.limit);
      return { values: [...values] };
    } catch (error) {
      if (error instanceof UnknownFilterFieldError || error instanceof NotSuggestableFieldError) {
        throw badRequest('field', error.message);
      }
      throw error;
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Search profiles',
    description:
      'Free-text search, filters, sorting, paging and facet counts in one call. With no `q` and ' +
      'no filters it browses the whole corpus, which is what an empty search box should do.\n\n' +
      FILTER_ENCODING,
  })
  @ApiPrimaryFilters()
  @ApiOkResponse({ type: SearchResultDto })
  @ApiBadRequestResponse({
    description: 'A malformed filter, an unknown field, or paging past the result window.',
  })
  async search(
    @Query(BOUND_VALIDATION_PIPE) query: SearchQueryDto,
    @Req() request: Request,
  ): Promise<SearchResult> {
    const criteria = toCriteria(query, rawQueryOf(request));

    try {
      return await this.searchProfiles.execute(criteria);
    } catch (error) {
      if (error instanceof ResultWindowExceededError) throw badRequest('page', error.message);
      throw error;
    }
  }
}

function toCriteria(query: SearchQueryDto, rawQueryString: string): SearchCriteria {
  return SearchCriteria.create({
    keywords: query.q,
    filters: parseFilters(rawQueryString),
    sort: query.sort,
    page: query.page,
    size: query.size,
    facets: query.facets,
  });
}

function parseFilters(rawQueryString: string): Record<string, FilterValue> {
  try {
    return parseFilterQuery(rawQueryString);
  } catch (error) {
    const failure = error as FilterQueryError;
    throw badRequest(failure.parameter, failure.detail);
  }
}

/** Read before the framework decodes: `%2C` and `,` differ here, and decoding destroys that. */
function rawQueryOf(request: Request): string {
  // Express sets originalUrl on every request, and keeps the whole path when a router is mounted.
  const url = request.originalUrl;
  const at = url.indexOf('?');
  return at < 0 ? '' : url.slice(at + 1);
}

/** Field-keyed detail, which the problem-details filter renders as the RFC 7807 `errors` member. */
function badRequest(parameter: string, detail: string): BadRequestException {
  return new BadRequestException({ message: detail, errors: { [parameter]: [detail] } });
}

/** Only the primary filters; listing every one of them would bury the endpoint's own parameters. */
function ApiPrimaryFilters(): MethodDecorator {
  return applyDecorators(
    ...PRIMARY_FIELDS.map((field: SearchField) =>
      ApiQuery({
        name: FILTER_PREFIX + field.key,
        required: false,
        type: String,
        description: `${field.label} (${field.kind}).${field.hint ? ` ${field.hint}.` : ''}`,
        example: FILTER_EXAMPLES[field.key],
      }),
    ),
  );
}
