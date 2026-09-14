'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import HomeDemo from './HomeDemo';
// The dashboard demo (and the staff fonts it mounts) load only when the tab
// is opened — the homepage is a golfer page under a perf budget.
const HomeDashboardDemo = dynamic(() => import('./HomeDashboardDemo'), { ssr: false, loading: () => <div style={{ minHeight: 420 }} /> });
import s from '@/app/home.module.css';

// H-2b: "See it work" has two tabs — what golfers see (the booking page demo)
// and what the course sees (the tee sheet demo). One accent swatch drives
// both; the photo toggle only means something on the golfer side.

const SWATCHES = [
  { c: '#24513B', label: 'Pine' },
  { c: '#1F3A5F', label: 'Navy' },
  { c: '#8A3B1F', label: 'Rust' },
  { c: '#5B2A86', label: 'Plum' },
];

export default function SeeItWork() {
  const [tab, setTab] = useState<'golfer' | 'course'>('golfer');
  const [accent, setAccent] = useState(SWATCHES[0].c);
  const [photo, setPhoto] = useState(true);

  return (
    <div className={s.stage}>
      <div className={`${s.seg} ${s.fade}`} role="tablist" aria-label="Which side to see">
        <button type="button" role="tab" aria-selected={tab === 'golfer'} aria-pressed={tab === 'golfer'} onClick={() => setTab('golfer')}>What golfers see</button>
        <button type="button" role="tab" aria-selected={tab === 'course'} aria-pressed={tab === 'course'} onClick={() => setTab('course')}>What you see</button>
      </div>

      <div className={s.fade}>
        {tab === 'golfer' ? <HomeDemo accent={accent} photo={photo} /> : <HomeDashboardDemo accent={accent} />}
      </div>

      <div className={`${s.knobs} ${s.fade}`}>
        <span>Your color</span>
        <div className={s.sws} role="group" aria-label="Course accent color">
          {SWATCHES.map(sw => (
            <button key={sw.c} type="button" className={s.sw} style={{ background: sw.c }}
              aria-pressed={accent === sw.c} aria-label={sw.label} onClick={() => setAccent(sw.c)} />
          ))}
        </div>
        {tab === 'golfer' && (
          <div className={s.seg} role="group" aria-label="Course photo">
            <button type="button" aria-pressed={photo} onClick={() => setPhoto(true)}>Your photo</button>
            <button type="button" aria-pressed={!photo} onClick={() => setPhoto(false)}>No photo</button>
          </div>
        )}
      </div>
    </div>
  );
}
