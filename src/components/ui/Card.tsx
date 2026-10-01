import React from 'react';

// MP-9 (ADMIN_V4 V4-6 §1): the white card on paper. 100 admin sites hand-typed
// `bg-white border border-line rounded-lg`; they are all this now, so the card
// is changed here or nowhere (scripts/design-guard.mjs keeps it that way).
// Padding, overflow and layout stay at the site, in className — cards differ
// there on purpose. Any other attribute (id, onClick, style, ref) passes through.
// FLOW-1 (Cam 2026-10-01): a soft sheet (shadow-card = 1px ring at 6% + a
// 0 1px 2px lift), not a ruled box — boxes-in-boxes read as "clunky".
export const CARD = 'bg-white rounded-lg shadow-card';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Card({ className = '', ...rest }, ref) {
    return <div ref={ref} className={className ? `${CARD} ${className}` : CARD} {...rest}/>;
  },
);
