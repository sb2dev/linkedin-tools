/** Focus treatment shared by every interactive element. */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

/** A content card: white on the warm grey page, hairline border. */
export const cardClass = 'rounded-card border border-line bg-card';

/** The neutral control, and the default. */
export const buttonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-card px-4 py-1.5 ' +
  'text-sm font-semibold text-ink transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50';

/** The one affirmative action on a screen: filled, in the platform blue. */
export const primaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold ' +
  'text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50';

/** Outlined in the accent, for a secondary action that still belongs to the primary flow. */
export const secondaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-accent px-4 py-1.5 text-sm ' +
  'font-semibold text-accent transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50';

/** Low emphasis, for a control inside a dense row. */
export const quietButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ' +
  'text-muted transition-colors hover:bg-black/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50';

export const inputClass =
  'w-full rounded border border-line bg-card px-3 py-1.5 text-sm text-ink outline-none ' +
  'focus:border-accent focus:ring-1 focus:ring-accent';

/** A read-only tag: skills, active filters and statuses all read as the same kind of object. */
export const chipClass =
  'inline-flex items-center gap-1 rounded-full border border-line bg-card px-3 py-1 text-xs text-muted';
