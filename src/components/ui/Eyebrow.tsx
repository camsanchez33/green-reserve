import React from 'react';

// TYPE-2 (Cam 2026-10-05, "the small sub headings above the main heading is
// such an ai thing"): this is no longer an uppercase eyebrow. It renders a
// plain sentence-case label — 13px semibold, ink — for the places a label is
// genuinely needed (a field, a group of values, a table caption). Never put
// one directly above a heading: the heading says it. Do not add new uses for
// section titles; write the heading instead. Both tones are the same now; the
// prop stays so existing call sites need no edit.
export const EYEBROW = 'text-[13px] font-semibold text-ink';
const PUBLIC = EYEBROW;

type Props = React.AllHTMLAttributes<HTMLElement> & { as?: React.ElementType; tone?: 'staff' | 'public' };

export function Eyebrow({ as: Tag = 'div', tone = 'staff', className = '', ...rest }: Props) {
  const base = tone === 'public' ? PUBLIC : EYEBROW;
  return <Tag className={className ? `${base} ${className}` : base} {...rest}/>;
}
