/** OpenAPI shapes for the filter registry the client renders from. */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FilterKind, SortKey } from '../../../domain/search/field-registry';
import { PublishedField, SearchSchema } from '../../../application/get-search-schema.use-case';

const FILTER_KINDS: FilterKind[] = ['terms', 'range', 'ordered_terms', 'date_range', 'exists'];

export class SearchFieldDto implements PublishedField {
  @ApiProperty({ description: 'Stable key used in `f.<key>` and in the URL.', example: 'skills' })
  readonly key!: string;

  @ApiProperty({ example: 'Skills' })
  readonly label!: string;

  @ApiProperty({ description: 'Section of the "Add filter" panel.', example: 'Expertise' })
  readonly group!: string;

  @ApiProperty({
    enum: FILTER_KINDS,
    description:
      'How the value is written and drawn. terms: `a,b`. ordered_terms: `a,b` from `options`. ' +
      'range: `5..15`. date_range: `2000..2010`. exists: `true` or `false`.',
  })
  readonly kind!: FilterKind;

  @ApiProperty({ description: 'Whether bucket counts for this field are meaningful.', example: true })
  readonly facetable!: boolean;

  @ApiPropertyOptional({
    description: 'Too many distinct values to list; complete it through /api/search/suggest.',
    example: true,
  })
  readonly typeahead?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'For `ordered_terms`: the whole vocabulary, in its natural order.',
    example: ['1-10', '11-50', '51-200'],
  })
  readonly options?: string[];

  @ApiPropertyOptional({ description: 'Shown in the always-visible filter bar.', example: true })
  readonly primary?: boolean;

  @ApiPropertyOptional({ example: 'Inferred by the source; a band, not a figure' })
  readonly hint?: string;
}

export class SortOptionDto {
  @ApiProperty({ example: 'relevance' })
  readonly key!: SortKey;

  @ApiProperty({ example: 'Best match' })
  readonly label!: string;
}

export class SearchSchemaDto implements SearchSchema {
  @ApiProperty({ type: [SearchFieldDto], description: 'Every filterable field, in display order.' })
  readonly fields!: SearchFieldDto[];

  @ApiProperty({ type: [SortOptionDto] })
  readonly sorts!: SortOptionDto[];

  @ApiProperty({
    type: [String],
    description: 'Group names in the order the fields first mention them.',
    example: ['Expertise', 'Career', 'Company'],
  })
  readonly groups!: string[];
}

export class SuggestResponseDto {
  @ApiProperty({
    type: [String],
    description: 'Matching values, ready to be sent straight back as a filter value.',
    example: ['leadership', 'lead generation', 'leadership development'],
  })
  readonly values!: string[];
}
