import type { ReactElement } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import clsx from 'clsx';
import { AppShell, ErrorBoundary, PageContainer, focusRing } from '@/components/layout';
import { ImportPage } from '@/pages/ImportPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { SearchPage } from '@/pages/SearchPage';

function NotFoundRoute(): ReactElement {
  return (
    <PageContainer>
      <div className="rounded-lg border border-dashed border-line bg-card p-8 text-center">
        <p className="text-base font-medium text-ink">Page not found</p>
        <p className="mt-2 text-sm text-muted">
          <Link to="/" className={clsx('text-accent hover:underline', focusRing)}>
            Go to search
          </Link>
        </p>
      </div>
    </PageContainer>
  );
}

export function App(): ReactElement {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Per route, so a failure on one screen leaves the header and the other routes reachable. */}
        <Route index element={<ErrorBoundary><SearchPage /></ErrorBoundary>} />
        <Route path="profiles/:username" element={<ErrorBoundary><ProfilePage /></ErrorBoundary>} />
        <Route path="import" element={<ErrorBoundary><ImportPage /></ErrorBoundary>} />
        <Route path="*" element={<NotFoundRoute />} />
      </Route>
    </Routes>
  );
}
