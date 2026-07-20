'use client';
import { HelpCircle, X } from 'lucide-react';

// Small persistent "?" — put next to a page's <h1>. Always visible so the
// operator can reopen the explanation anytime, even after dismissing it.
export function TabIntroButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="What is this page?"
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-ink-faint hover:text-ink hover:bg-line-soft transition-colors shrink-0"
    >
      <HelpCircle className="w-4 h-4"/>
    </button>
  );
}

// The dismissible explanation card itself — 3-5 plain-English bullets,
// written for an operator who has never used software like this.
export function TabIntroCard({ open, onDismiss, title, bullets }: {
  open: boolean; onDismiss: () => void; title: string; bullets: string[];
}) {
  if (!open) return null;
  return (
    <div className="bg-pine/5 border border-pine/20 rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="text-sm font-medium text-ink">{title}</div>
        <button onClick={onDismiss} className="text-ink-faint hover:text-ink shrink-0"><X className="w-4 h-4"/></button>
      </div>
      <ul className="space-y-1 text-sm text-ink-soft list-disc list-inside">
        {bullets.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
    </div>
  );
}
