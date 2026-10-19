'use client';
// Settings rework (Cam 2026-10-19: the strip "Test Course 3 · live to golfers ·
// Stripe connected · 0 accounts · 0 photos" meant nothing to a course). What is
// actually missing from the course's page, each with a button to the section
// that fixes it. Every item is read off real data; the card is gone once
// nothing is missing.
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';

export type SetupItem = { key: string; title: string; why: string; action: string; onClick: () => void };

// Three rows at most until asked — the list sits above every section, so a
// long one would push the section someone opened below the fold.
const SHOWN = 3;

export function FinishSetup({ items }: { items: SetupItem[] }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <Card className="mb-5 border-l-[3px] border-l-warn">
      <div className="px-5 pt-4 pb-2">
        <h2 className="text-[15px] font-semibold text-ink">Finish setting up</h2>
        <p className="text-[13.5px] text-ink-soft mt-0.5">
          {items.length === 1 ? 'One thing is' : `${items.length} things are`} still missing from your course page.
        </p>
      </div>
      <ul className="divide-y divide-line-soft">
        {shown.map(i => (
          <li key={i.key} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <span className="min-w-0 flex items-start gap-2.5">
              <span className="mt-[7px]"><StatusDot status="warn" /></span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-ink">{i.title}</span>
                <span className="block text-[12.5px] text-ink-muted">{i.why}</span>
              </span>
            </span>
            <button onClick={i.onClick}
              className="shrink-0 text-[12.5px] font-medium text-pine border border-pine/30 hover:bg-pine/5 rounded-md px-3 py-1.5 transition-colors">
              {i.action}
            </button>
          </li>
        ))}
      </ul>
      {items.length > SHOWN && (
        <button onClick={() => setAll(a => !a)} className="w-full border-t border-line-soft px-5 py-2.5 text-left text-[12.5px] font-medium text-pine hover:underline">
          {all ? 'Show fewer' : `Show ${items.length - SHOWN} more`}
        </button>
      )}
    </Card>
  );
}
