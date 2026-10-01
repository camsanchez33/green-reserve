import React from 'react';

// MP-9: the staff eyebrow — 11px, uppercase, 0.1em, muted (CLAUDE.md §1b).
// Sites used it on div / span / label / p / h3, so `as` keeps the element (and
// with it htmlFor and the rest); weight and spacing stay in className.
// `tone="public"` is the marketing/golfer 0.06em variant.
// FLOW-1: the homepage eyebrow — Archivo condensed, semibold, 0.08em.
export const EYEBROW = 'text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-muted [font-stretch:87.5%]';
const PUBLIC = 'text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-muted [font-stretch:87.5%]';

type Props = React.AllHTMLAttributes<HTMLElement> & { as?: React.ElementType; tone?: 'staff' | 'public' };

export function Eyebrow({ as: Tag = 'div', tone = 'staff', className = '', ...rest }: Props) {
  const base = tone === 'public' ? PUBLIC : EYEBROW;
  return <Tag className={className ? `${base} ${className}` : base} {...rest}/>;
}
