'use client';
// DASH-D: the look switch — CHARCOAL-1 (Cam 2026-11-12): Charcoal (the default) / Light — at the foot of the dashboard menu (and in the
// phone's More menu). Two buttons, the current one raised.
import { useEffect, useState } from 'react';
import { currentOpTheme, setOpTheme, type OpTheme } from '@/lib/op-theme';

export default function ThemeSwitch() {
  const [theme, setTheme] = useState<OpTheme>('dark');
  useEffect(() => { setTheme(currentOpTheme()); }, []);
  const pick = (t: OpTheme) => { setOpTheme(t); setTheme(t); };
  return (
    <div role="group" aria-label="Look" className="grid grid-cols-2 gap-1 rounded-md bg-paper p-1 border border-rail-line">
      {(['dark', 'light'] as OpTheme[]).map(t => (
        <button key={t} type="button" onClick={() => pick(t)} aria-pressed={theme === t}
          className={'rounded-[5px] py-1.5 text-[12.5px] font-medium transition-colors ' + (theme === t ? 'bg-white text-ink shadow-card' : 'text-ink-muted hover:text-ink')}>
          {t === 'light' ? 'Light' : 'Charcoal'}
        </button>
      ))}
    </div>
  );
}
