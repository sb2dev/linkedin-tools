/** The render helpers shared by the component tests. The network fakes are in fake-fetch.ts. */

import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

export interface HarnessOptions {
  client?: QueryClient;
  route?: string;
}

export interface Rendered extends RenderResult {
  client: QueryClient;
}

/** Everything a component of this app can ask for: a router and a query client. */
export function renderApp(ui: ReactElement, options: HarnessOptions = {}): Rendered {
  const client = options.client ?? createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[options.route ?? '/']}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }
  // Object.assign rather than a spread: the bound queries live on the result object itself.
  return Object.assign(render(ui, { wrapper: Wrapper }), { client });
}
