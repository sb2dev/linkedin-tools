/** The corpus admin endpoints. */

import { api } from '@/api/client';

/** The phrase POST /api/admin/corpus/purge requires, verbatim. The backend, not this file, enforces it. */
export const PURGE_CONFIRMATION = 'DELETE ALL PROFILES';

export interface LastImport {
  importId: string;
  filename: string;
  committedAt: string;
  rowsAccepted: number;
  profilesNew: number;
  profilesUpdated: number;
}

export interface CorpusStatus {
  profiles: number;
  /** Absent until something has been committed. */
  lastImport?: LastImport;
}

export interface PurgeResult {
  profilesDeleted: number;
  indexCleared: boolean;
  /** Why the index was not cleared. The profiles are gone either way. */
  indexError?: string;
  importHistoryRetained: boolean;
}

export function getCorpusStatus(): Promise<CorpusStatus> {
  return api.get<CorpusStatus>('/admin/corpus', { auth: 'required' });
}

/** `confirm` is what the operator typed, sent unchanged: the server decides whether it matches. */
export function purgeCorpus(confirm: string): Promise<PurgeResult> {
  return api.post<PurgeResult>('/admin/corpus/purge', { json: { confirm }, auth: 'required' });
}
