import { useState, type ReactElement, type ReactNode } from 'react';
import clsx from 'clsx';
import { cardClass, focusRing } from '@/components/layout';

interface ProfileSectionProps {
  title: string;
  /** A control belonging to the whole card, drawn under a rule that runs the full width. */
  footer?: ReactNode;
  children: ReactNode;
}

/** One card of the profile: a heading and its content, which is the only shape the page uses. */
export function ProfileSection({ title, footer, children }: ProfileSectionProps): ReactElement {
  return (
    <section className={clsx(cardClass, 'overflow-hidden')}>
      <div className="px-4 py-5 sm:px-6">
        <h2 className="text-xl font-semibold text-ink">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
      {footer === undefined ? null : <div className="border-t border-line">{footer}</div>}
    </section>
  );
}

interface CollapsibleSectionProps<T> {
  title: string;
  items: T[];
  /** How many rows the card shows before the reader asks for the rest. */
  limit: number;
  moreLabel: string;
  children: (shown: T[]) => ReactNode;
}

/** A card that shows the first few rows and keeps the rest behind a control. */
export function CollapsibleSection<T>({
  title,
  items,
  limit,
  moreLabel,
  children,
}: CollapsibleSectionProps<T>): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, limit);
  const hidden = items.length - shown.length;

  return (
    <ProfileSection
      title={title}
      footer={
        expanded || hidden > 0 ? (
          <button
            type="button"
            onClick={() => {
              setExpanded(!expanded);
            }}
            className={clsx(
              'w-full px-4 py-3.5 text-center text-sm font-semibold text-muted transition-colors',
              'hover:bg-black/5 hover:text-ink',
              focusRing,
            )}
          >
            {expanded ? 'Show less' : moreLabel}
            <span aria-hidden="true">{expanded ? ' ↑' : ' →'}</span>
          </button>
        ) : undefined
      }
    >
      {children(shown)}
    </ProfileSection>
  );
}

/** Cuts at the last space before the limit, so the break does not land inside a word. */
function truncate(text: string, limit: number): string {
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return space > 0 ? cut.slice(0, space) : cut;
}

interface ClampedTextProps {
  text: string;
  limit: number;
  className?: string;
}

/** Long prose with its tail behind a control: the About summary and a role description use it. */
export function ClampedText({ text, limit, className }: ClampedTextProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > limit;

  return (
    <p className={clsx('whitespace-pre-line text-sm text-ink', className)}>
      {long && !expanded ? `${truncate(text, limit)}… ` : text}
      {long ? (
        <button
          type="button"
          onClick={() => {
            setExpanded(!expanded);
          }}
          className={clsx('ml-1 font-semibold text-muted hover:text-ink', focusRing)}
        >
          {expanded ? 'less' : 'more'}
        </button>
      ) : null}
    </p>
  );
}
