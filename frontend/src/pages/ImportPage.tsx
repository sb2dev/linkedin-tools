import type { JSX } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { CorpusAdmin, ImportPanel } from '@/components/import';
import { PageContainer, focusRing } from '@/components/layout';

export function ImportPage(): JSX.Element {
  return (
    <PageContainer>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-ink">Import profiles</h1>
          <p className="text-sm text-muted">
            Upload a dataset export to see exactly what it would change. Nothing is written until you
            confirm.
          </p>
        </div>
        <Link to="/" className={clsx('rounded text-sm text-accent hover:underline', focusRing)}>
          Back to search
        </Link>
      </header>
      <ImportPanel />
      <CorpusAdmin />
    </PageContainer>
  );
}
