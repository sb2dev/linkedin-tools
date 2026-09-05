import { api } from '@/api/client';
import { toQueryString } from '@/lib/query-state';
import type { ProfileDetail, SearchQuery, SearchResult, SearchSchema, SuggestResponse } from '@/types/api';

export function getSchema(signal?: AbortSignal): Promise<SearchSchema> {
  return api.get<SearchSchema>('/search/schema', { signal });
}

export function search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResult> {
  return api.get<SearchResult>('/search', { params: toQueryString(query), signal });
}

export async function suggest(
  field: string,
  prefix: string,
  limit = 10,
  signal?: AbortSignal,
): Promise<string[]> {
  const params = new URLSearchParams({ field, q: prefix, limit: String(limit) });
  const response = await api.get<SuggestResponse>('/search/suggest', { params, signal });
  return response.values;
}

/** Contact details come back only when the caller is authenticated, so the token is sent if held. */
export function getProfile(username: string, signal?: AbortSignal): Promise<ProfileDetail> {
  return api.get<ProfileDetail>(`/profiles/${encodeURIComponent(username)}`, { auth: 'optional', signal });
}
