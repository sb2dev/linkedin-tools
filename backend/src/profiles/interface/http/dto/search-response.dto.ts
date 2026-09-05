/** OpenAPI shapes for what a search returns. */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Facet, FacetBucket, ProfileSummary, SearchResult } from '../../../domain/search/search-result';

export class FacetBucketDto implements FacetBucket {
  @ApiProperty({ description: 'The value as it is indexed, always lower case.', example: 'leadership' })
  readonly value!: string;

  @ApiProperty({ description: 'Profiles carrying this value under the current criteria.', example: 42 })
  readonly count!: number;
}

export class FacetDto implements Facet {
  @ApiProperty({ description: 'Registry key of the field these buckets belong to.', example: 'skills' })
  readonly key!: string;

  @ApiProperty({
    type: [FacetBucketDto],
    description:
      'Buckets, most populous first; for `ordered_terms` fields, in the vocabulary order given ' +
      'by `options`.',
  })
  readonly buckets!: FacetBucketDto[];

  @ApiProperty({
    description:
      'Values beyond the returned buckets, so the UI can say "and N more"; entries rather than ' +
      'people on a nested field.',
    example: 118,
  })
  readonly otherCount!: number;
}

export class ProfileSummaryDto implements ProfileSummary {
  @ApiProperty({ description: 'Business key; the slug of the linkedin.com/in/ URL.', example: 'jane-doe-1a2b3c' })
  readonly linkedinUsername!: string;

  @ApiProperty({ example: 'jane doe' })
  readonly fullName!: string;

  @ApiPropertyOptional({ example: 'head of growth' })
  readonly jobTitle?: string;

  @ApiPropertyOptional({ example: 'northwind trading' })
  readonly companyName?: string;

  @ApiPropertyOptional({ example: 'marketing and advertising' })
  readonly industry?: string;

  @ApiPropertyOptional({ description: 'Human-readable place, already assembled.', example: 'austin, texas, united states' })
  readonly location?: string;

  @ApiPropertyOptional({ example: 11 })
  readonly yearsExperience?: number;

  @ApiProperty({
    type: [String],
    description: 'The first few skills only; `totalSkills` says how many there are.',
    example: ['leadership', 'b2b marketing', 'salesforce'],
  })
  readonly skills!: string[];

  @ApiProperty({ example: 27 })
  readonly totalSkills!: number;

  @ApiProperty({
    description: 'Share of the fields this row supplied that survived validation, 0 to 1.',
    example: 0.94,
  })
  readonly qualityScore!: number;

  @ApiProperty({ description: 'True when the source row needed structural repair to be read.', example: false })
  readonly repaired!: boolean;

  @ApiPropertyOptional({
    description: 'Matched fragments per field, marked with <em>, when the query produced any.',
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
    example: { jobTitle: ['head of <em>growth</em>'] },
  })
  readonly highlights?: Record<string, string[]>;

  @ApiPropertyOptional({ description: 'Relevance score; absent when the sort is not by relevance.', example: 8.42 })
  readonly score?: number;
}

export class SearchResultDto implements SearchResult {
  @ApiProperty({ type: [ProfileSummaryDto] })
  readonly items!: ProfileSummaryDto[];

  @ApiProperty({ description: 'Profiles matching the criteria, not just the ones on this page.', example: 265 })
  readonly total!: number;

  @ApiProperty({ example: 1 })
  readonly page!: number;

  @ApiProperty({ example: 20 })
  readonly size!: number;

  @ApiProperty({
    type: [FacetDto],
    description: 'Bucket counts for the requested facets, or for every facetable field by default.',
  })
  readonly facets!: FacetDto[];

  @ApiProperty({ description: 'Time the search engine spent on the query.', example: 7 })
  readonly tookMs!: number;
}
