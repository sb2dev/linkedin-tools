import type { ReactElement } from 'react';
import clsx from 'clsx';
import { initials } from '@/lib/format';

/** 31x + c, kept inside 32 bits so a long name cannot drift out of integer range. */
function hashOf(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

/** Case and surrounding space are not part of who someone is, so they do not move the colour. */
function hueOf(value: string): number {
  return hashOf(value.trim().toLowerCase()) % 360;
}

/** A wash rather than a flat block, because the strip it fills is where a cover photo would be. */
export function bannerBackground(value: string): string {
  const hue = hueOf(value);
  const far = String((hue + 40) % 360);
  return `linear-gradient(120deg, hsl(${String(hue)} 30% 80%), hsl(${far} 36% 52%))`;
}

interface MonogramProps {
  /** The name the letters and the colour are both derived from. */
  name: string;
  /** Overrides the letters when a person's two initials are the wrong shape, as for a company. */
  label?: string;
  className?: string;
}

/** Stands in for a logo. Decorative: the name it is built from is always beside it. */
export function Monogram({ name, label, className }: MonogramProps): ReactElement {
  const hue = String(hueOf(name));
  return (
    <span
      aria-hidden="true"
      style={{ background: `hsl(${hue} 38% 88%)`, color: `hsl(${hue} 44% 26%)` }}
      className={clsx('flex shrink-0 select-none items-center justify-center font-semibold', className)}
    >
      {label ?? initials(name)}
    </span>
  );
}

/** The stand-in a profile shows when a person has no photo, which is every person here. */
export function PersonAvatar({ className }: { className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 128 128" aria-hidden="true" className={clsx('shrink-0 rounded-full', className)}>
      <circle cx="64" cy="64" r="64" fill="#e7e2dc" />
      <circle cx="64" cy="50" r="22" fill="#788a9c" />
      <path d="M64 78c-24 0-40 15-44 34a64 64 0 0 0 88 0c-4-19-20-34-44-34Z" fill="#9db0c2" />
    </svg>
  );
}
