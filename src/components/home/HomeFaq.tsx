'use client';
import { useState } from 'react';
import { HOME_FAQ } from '@/lib/faq';
import s from '@/app/home.module.css';

// The FAQ accordion — the homepage's only other piece of state (PERF-1 split).
export default function HomeFaq() {
  const [faqOpen, setFaqOpen] = useState(0);
  return (
    <>
      {HOME_FAQ.map((f, i) => (
        <div key={f.q} className={`${s.q} ${faqOpen === i ? s.open : ''}`}>
          <button type="button" aria-expanded={faqOpen === i} onClick={() => setFaqOpen(faqOpen === i ? -1 : i)}>
            <span>{f.q}</span><span aria-hidden="true">+</span>
          </button>
          <div className={s.a}><div><p>{f.a}</p></div></div>
        </div>
      ))}
    </>
  );
}
