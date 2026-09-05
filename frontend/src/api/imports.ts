/** Import endpoints, plus login: importing is the only authenticated flow in the app. */

import { api } from '@/api/client';
import type { ImportCommitResult, ImportRowSource, LoginResponse } from '@/types/api';

export function login(username: string, password: string): Promise<LoginResponse> {
  return api.post<LoginResponse>('/auth/login', { json: { username, password } });
}

/**
 * Second half of the upload; the first half needs progress events, so ImportPanel uses XHR.
 * `repair` is the choice the reader made in the preview: it realigns the rows whose column block
 * has a provable shift, and is off unless they turned it on.
 */
export function commitImport(importId: string, repair: boolean): Promise<ImportCommitResult> {
  return api.post<ImportCommitResult>(`/imports/${encodeURIComponent(importId)}/commit`, {
    json: { repair },
    auth: 'required',
  });
}

/** The raw line behind one row of the preview. */
export function getRowSource(
  importId: string,
  lineNumber: number,
  signal?: AbortSignal,
): Promise<ImportRowSource> {
  return api.get<ImportRowSource>(
    `/imports/${encodeURIComponent(importId)}/rows/${String(lineNumber)}`,
    { auth: 'required', signal },
  );
}
