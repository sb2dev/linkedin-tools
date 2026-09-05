import { Injectable } from '@nestjs/common';
import {
  SEARCH_FIELDS,
  SORT_OPTIONS,
  SearchField,
  SortKey,
} from '../domain/search/field-registry';

/** The registry minus `esField`, which is index detail no client needs and nothing reads. */
export type PublishedField = Omit<SearchField, 'esField'>;

export interface SearchSchema {
  readonly fields: readonly PublishedField[];
  readonly sorts: readonly { key: SortKey; label: string }[];
  /** Group names in the order the registry first mentions them, so the panel keeps a stable shape. */
  readonly groups: readonly string[];
}

@Injectable()
export class GetSearchSchemaUseCase {
  private readonly schema: SearchSchema = {
    fields: SEARCH_FIELDS.map(({ esField: _esField, ...published }) => published),
    sorts: SORT_OPTIONS,
    groups: [...new Set(SEARCH_FIELDS.map((field) => field.group))],
  };

  execute(): SearchSchema {
    return this.schema;
  }
}
