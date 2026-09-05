/**
 * The dialog's data. A line already read must come back without a spinner, a line abandoned
 * mid-flight must not overwrite the one now on screen, and a failure has to be retryable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ImportRowSource } from '@/types/api';
import { setAccessToken } from '@/api/client';
import { fakeFetch, jsonResponse, problemResponse } from '@/test';
import { useRowSource } from './use-row-source';

/** The row endpoint needs a token, so the client must hold one before anything is opened. */
beforeEach(() => {
  setAccessToken('a-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

function install(reply: Parameters<typeof fakeFetch>[0]): ReturnType<typeof fakeFetch> {
  const fake = fakeFetch(reply);
  vi.stubGlobal('fetch', fake.fetch);
  return fake;
}

function sourceFor(lineNumber: number): ImportRowSource {
  return {
    importId: 'run-1',
    filename: 'export.csv',
    line: {
      lineNumber,
      raw: `line ${String(lineNumber)}`,
      rawTruncated: false,
      fieldCount: 77,
      expectedFieldCount: 77,
      recovered: false,
      droppedFields: [],
      accepted: true,
      scrambled: false,
      columns: [],
    },
  };
}

/** Answers every row request from the line number in the path. */
function serveRows(): { calls: () => number } {
  const fake = install((request) => {
    const line = Number(/\/rows\/(\d+)/.exec(request.url)?.[1] ?? 0);
    return jsonResponse(sourceFor(line));
  });
  return { calls: () => fake.callCount };
}

describe('useRowSource', () => {
  it('starts closed, with nothing loaded', () => {
    serveRows();
    const { result } = renderHook(() => useRowSource('run-1'));

    expect(result.current.lineNumber).toBeNull();
    expect(result.current.state.status).toBe('loading');
  });

  it('reads a line when one is opened', async () => {
    serveRows();
    const { result } = renderHook(() => useRowSource('run-1'));

    act(() => {
      result.current.open(12);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(result.current.lineNumber).toBe(12);
    expect(result.current.state).toMatchObject({ source: { line: { lineNumber: 12 } } });
  });

  it('serves a line it has already read from cache, without a second request', async () => {
    const served = serveRows();
    const { result } = renderHook(() => useRowSource('run-1'));

    act(() => {
      result.current.open(12);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    act(() => {
      result.current.close();
    });
    act(() => {
      result.current.open(12);
    });

    // Ready on the same tick, and no spinner in between.
    expect(result.current.state.status).toBe('ready');
    expect(served.calls()).toBe(1);
  });

  it('shows a spinner for a line it has not read before', async () => {
    serveRows();
    const { result } = renderHook(() => useRowSource('run-1'));

    act(() => {
      result.current.open(12);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    act(() => {
      result.current.open(13);
    });
    expect(result.current.state.status).toBe('loading');

    await waitFor(() => {
      expect(result.current.state).toMatchObject({ source: { line: { lineNumber: 13 } } });
    });
  });

  it('reports a failure and reads again when asked to retry', async () => {
    let attempt = 0;
    install(() => {
      attempt += 1;
      return attempt === 1
        ? problemResponse(500, { title: 'Internal server error', status: 500 })
        : jsonResponse(sourceFor(4));
    });
    const { result } = renderHook(() => useRowSource('run-1'));

    act(() => {
      result.current.open(4);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(attempt).toBe(2);
  });

  it('asks for nothing while it is closed', () => {
    const served = serveRows();
    const { result } = renderHook(() => useRowSource('run-1'));

    act(() => {
      result.current.close();
    });

    expect(served.calls()).toBe(0);
  });

  it('drops a failure that arrived after the reader moved away', async () => {
    const rejections: ((reason: Error) => void)[] = [];
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejections.push(reject);
        }),
    );
    const { result } = renderHook(() => useRowSource('run-1'));

    act(() => {
      result.current.open(1);
    });
    act(() => {
      result.current.close();
    });
    act(() => {
      rejections[0]?.(new Error('aborted'));
    });

    await waitFor(() => {
      expect(result.current.state.status).not.toBe('error');
    });
  });

  it('drops the answer to a line the reader has already moved away from', async () => {
    const replies: ((value: Response) => void)[] = [];
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((resolve) => {
          replies.push(resolve);
        }),
    );
    const { result } = renderHook(() => useRowSource('run-1'));

    act(() => {
      result.current.open(1);
    });
    act(() => {
      result.current.close();
    });

    // The first request lands after the dialog closed; it must not be shown.
    act(() => {
      replies[0]?.(jsonResponse(sourceFor(1)));
    });

    await waitFor(() => {
      expect(result.current.lineNumber).toBeNull();
    });
  });
});
