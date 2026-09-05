import type { ReactElement, ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { useIsAuthenticated } from '@/hooks/use-auth';
import { focusRing } from '@/components/layout/ui';

const NAV = [
  { to: '/', label: 'Search', end: true },
  { to: '/import', label: 'Import', end: false },
];

export function Header(): ReactElement {
  // Read-only: signing in and out belongs to the import flow.
  const isAuthenticated = useIsAuthenticated();

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <NavLink to="/" className={clsx('text-base font-semibold tracking-tight text-ink', focusRing)}>
          Profile Search
        </NavLink>

        <nav aria-label="Main" className="flex items-center gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  focusRing,
                  isActive ? 'bg-accent/10 font-medium text-accent' : 'text-muted hover:text-ink',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {isAuthenticated ? (
          <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-xs text-muted">Signed in</span>
        ) : null}
      </div>
    </header>
  );
}

export function AppShell(): ReactElement {
  return (
    <div className="flex min-h-full flex-col bg-surface">
      <a
        href="#content"
        className={clsx(
          'sr-only rounded-md bg-white px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-10 focus:border focus:border-line',
          focusRing,
        )}
      >
        Skip to content
      </a>
      <Header />
      <main id="content" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line py-4 text-center text-xs text-muted">
        LinkedIn profile dataset search
      </footer>
    </div>
  );
}

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  /** A profile is read like a document, so it holds a narrower measure than a results table. */
  narrow?: boolean;
}

export function PageContainer({ children, className, narrow = false }: PageContainerProps): ReactElement {
  return (
    <div
      className={clsx('mx-auto w-full px-4 py-6 sm:px-6', narrow ? 'max-w-[52.5rem]' : 'max-w-5xl', className)}
    >
      {children}
    </div>
  );
}
