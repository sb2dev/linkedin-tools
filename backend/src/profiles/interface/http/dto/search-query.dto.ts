/** The search options half of the query string. */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { Allow, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  FACETABLE_FIELDS,
  SEARCH_FIELDS,
  SORT_OPTIONS,
  SortKey,
} from '../../../domain/search/field-registry';
import { FILTER_PREFIX } from '../filter-query.parser';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../domain/search/search-criteria';
import {
  DEFAULT_SUGGESTION_LIMIT,
  MAX_SUGGESTION_LIMIT,
} from '../../../application/suggest-values.use-case';

const SORT_KEYS: readonly SortKey[] = SORT_OPTIONS.map((option) => option.key);
const FACET_KEYS: readonly string[] = FACETABLE_FIELDS.map((field) => field.key);

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const commaSeparated = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
};

export class SearchQueryDto {
  @ApiPropertyOptional({
    description:
      'Free text, matched across names, titles, companies, skills, schools and bios with the ' +
      'weights the field registry declares. Omit it to browse the whole corpus.',
    example: 'growth marketing',
    maxLength: 200,
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  readonly q?: string;

  @ApiPropertyOptional({
    description: 'Ordering of the result page.',
    enum: SORT_KEYS as string[],
    default: 'relevance',
  })
  @IsOptional()
  @IsIn(SORT_KEYS)
  readonly sort?: SortKey;

  @ApiPropertyOptional({ description: 'One-based page number.', minimum: 1, default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page?: number;

  @ApiPropertyOptional({
    description: 'Results per page.',
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  readonly size?: number;

  @ApiPropertyOptional({
    description:
      'Comma-separated registry keys to return bucket counts for. Omit for every facetable field.',
    example: 'skills,industry,country',
  })
  @IsOptional()
  @Transform(commaSeparated)
  @IsIn(FACET_KEYS, { each: true })
  readonly facets?: string[];
}

for (const field of SEARCH_FIELDS) {
  Allow()(SearchQueryDto.prototype, FILTER_PREFIX + field.key);
}

export class SuggestQueryDto {
  @ApiProperty({
    description: 'Registry key of the field to complete. Must be a field that holds text values.',
    example: 'skills',
  })
  @Transform(trimmed)
  @IsString()
  @MaxLength(60)
  readonly field!: string;

  @ApiPropertyOptional({
    description: 'The prefix typed so far. Empty returns the most common values.',
    example: 'lead',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(100)
  readonly q?: string;

  @ApiPropertyOptional({
    description: 'How many completions to return.',
    minimum: 1,
    maximum: MAX_SUGGESTION_LIMIT,
    default: DEFAULT_SUGGESTION_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SUGGESTION_LIMIT)
  readonly limit?: number;
}
