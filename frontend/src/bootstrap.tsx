/** Everything main.tsx does apart from finding the root element, so it can be tested. */

import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from '@/App';

/** Retries are decided per query in hooks/use-search, where a 4xx is known to be a final answer. */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: false },
    },
  });
}

/** Fails loudly on a missing container: a silent no-op looks like a broken build, not a bad page. */
export function mountApp(container: HTMLElement | null): Root {
  if (container === null) throw new Error('Missing #root element');

  const root = createRoot(container);
  root.render(
    <StrictMode>
      <QueryClientProvider client={createAppQueryClient()}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
  return root;
}
