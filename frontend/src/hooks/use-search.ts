import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getProfile, getSchema, search, suggest } from '@/api/search';
import { toSearchParams } from '@/lib/query-state';
import { ApiError, type ProfileDetail, type SearchQuery, type SearchResult, type SearchSchema } from '@/types/api';

const KEYWORD_DEBOUNCE_MS = 300;

export const searchKeys = {
  schema: ['search', 'schema'] as const,
  results: (query: SearchQuery) => ['search', 'results', toSearchParams(query).toString()] as const,
  profile: (username: string) => ['profile', username] as const,
  suggest: (field: string, prefix: string) => ['search', 'suggest', field, prefix] as const,
};

/** A rejected request is the server's answer, not a hiccup; only transport and 5xx failures retry. */
function retryPolicy(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function useSearchSchema(): UseQueryResult<SearchSchema, Error> {
  return useQuery({
    queryKey: searchKeys.schema,
    queryFn: ({ signal }) => getSchema(signal),
    staleTime: Infinity,
    retry: retryPolicy,
  });
}

export function useSearchResults(query: SearchQuery): UseQueryResult<SearchResult, Error> {
  return useQuery({
    queryKey: searchKeys.results(query),
    queryFn: ({ signal }) => search(query, signal),
    // The previous page stays on screen while the next one loads, so paging does not flash empty.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: retryPolicy,
  });
}

const SUGGEST_LIMIT = 12;

export function useSuggestions(field: string, prefix: string): UseQueryResult<string[], Error> {
  return useQuery({
    queryKey: searchKeys.suggest(field, prefix),
    queryFn: ({ signal }) => suggest(field, prefix, SUGGEST_LIMIT, signal),
    enabled: prefix.length > 0,
    staleTime: 60_000,
    retry: retryPolicy,
  });
}

export function useProfile(username: string | undefined): UseQueryResult<ProfileDetail, Error> {
  // A route without the parameter would otherwise ask the API for the empty username.
  const wanted = username ?? '';
  return useQuery({
    queryKey: searchKeys.profile(wanted),
    queryFn: ({ signal }) => getProfile(wanted, signal),
    enabled: wanted.length > 0,
    staleTime: 60_000,
    retry: retryPolicy,
  });
}

export function useDebouncedValue<T>(value: T, delayMs = KEYWORD_DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettled(value);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delayMs]);
  return settled;
}

/** Keeps a text input responsive while the URL trails it by one debounce. */
export function useDebouncedTextField(
  value: string,
  commit: (next: string) => void,
  delayMs = KEYWORD_DEBOUNCE_MS,
): [string, (next: string) => void] {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  // An echo of this field's own commit must not refill it while the reader is still typing.
  useEffect(() => {
    if (value === committed.current || value === committed.current.trim()) return;
    committed.current = value;
    setDraft(value);
  }, [value]);

  const debounced = useDebouncedValue(draft, delayMs);
  useEffect(() => {
    if (debounced === committed.current) return;
    committed.current = debounced;
    commitRef.current(debounced);
  }, [debounced]);

  return [draft, setDraft];
}
