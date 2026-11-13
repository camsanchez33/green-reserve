'use client';
// Pro shop (Cam 2026-11-12, approved mockups): one button that opens a short menu — the Register's and Stock's
// "Filter", the Sales tab's "Filter", Stock's "+ Add". Solid (never frosted), closes on a pick, a click outside or Esc.
import { useEffect, useRef, useState } from 'react';

export type MenuItem = { key: string; label: string; sub?: string; count?: number; on?: boolean };

export function ShopMenu({ label, sections, onPick, primary = false, align = 'left', ariaLabel }: {
  label: string;
  /** Groups of choices; a hairline between groups. */
  sections: MenuItem[][];
  onPick: (key: string) => void;
  primary?: boolean;
  align?: 'left' | 'right';
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const groups = sections.filter(s => s.length > 0);
  return (
    <div ref={box} className="relative shrink-0">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={ariaLabel}
        className={'min-h-[38px] px-3.5 rounded-[10px] text-[13px] font-semibold whitespace-nowrap ' + (primary ? 'bg-pine hover:bg-pine-hover text-white' : 'bg-white border border-line text-ink hover:border-line-strong')}>
        {label}
      </button>
      {open && (
        <div role="menu" className={'absolute top-full mt-1.5 z-30 min-w-[180px] max-h-[60vh] overflow-y-auto bg-white border border-line rounded-[10px] p-1.5 ' + (align === 'right' ? 'right-0' : 'left-0')}>
          {groups.map((g, i) => (
            <div key={i} className={i ? 'mt-1 pt-1 border-t border-line-soft' : ''}>
              {g.map(m => (
                <button key={m.key} type="button" role="menuitemradio" aria-checked={!!m.on} onClick={() => { setOpen(false); onPick(m.key); }}
                  className={'w-full text-left rounded-[7px] px-2.5 py-2 flex flex-col hover:bg-page ' + (m.on ? 'bg-page' : '')}>
                  <span className={'flex items-center justify-between gap-3 text-[13.5px] ' + (m.on ? 'text-ink font-semibold' : 'text-ink')}>
                    <span>{m.label}</span>
                    {m.count !== undefined && <span className="text-[12px] text-ink-muted tabular-nums">{m.count}</span>}
                  </span>
                  {m.sub && <span className="text-[12px] text-ink-muted">{m.sub}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
