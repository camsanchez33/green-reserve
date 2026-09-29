import React from 'react';

// MP-9 (ADMIN_V4 V4-6 §1): the white card on paper. 100 admin sites hand-typed
// `bg-white border border-line rounded-lg`; they are all this now, so the card
// is changed here or nowhere (scripts/design-guard.mjs keeps it that way).
// Padding, overflow and layout stay at the site, in className — cards differ
// there on purpose. Any other attribute (id, onClick, style, ref) passes through.
export const CARD = 'bg-white border border-line rounded-lg';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Card({ className = '', ...rest }, ref) {
    return <div ref={ref} className={className ? `${CARD} ${className}` : CARD} {...rest}/>;
  },
);
