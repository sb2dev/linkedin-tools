import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { cardClass, buttonClass, focusRing } from './ui';

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

/** Without this, a render error unmounts the tree and leaves a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The stack is the only record of what happened once the tree is gone.
    console.error('Render failed', error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className={`${cardClass} p-6`} role="alert">
          <h1 className="text-lg font-semibold text-ink">This screen could not be displayed</h1>
          <p className="mt-2 text-sm text-muted">
            Something in the page failed while rendering. The data you have already imported is not
            affected.
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-surface p-3 text-xs text-muted">
            {error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={this.reset} className={`${buttonClass} ${focusRing}`}>
              Try again
            </button>
            <a href="/" className={`${buttonClass} ${focusRing}`}>
              Back to search
            </a>
          </div>
        </div>
      </div>
    );
  }
}
