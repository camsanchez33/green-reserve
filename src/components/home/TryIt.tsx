'use client';
import { useState } from 'react';
import Image from 'next/image';
import s from '@/app/home.module.css';

// The Tee sheet page's "Try it" (homepage mockup): press Book and the real tee sheet is shown with the
// golfer's group on it. Both pictures are screenshots of the seeded test course (scripts/screenshots/capture.ts).
export default function TryIt({ flip }: { flip: boolean }) {
  const [booked, setBooked] = useState(false);
  return (
    <div className={flip ? `${s.fsec} ${s.fsecFlip}` : s.fsec} id="try">
      <div className={s.fsecTxt}>
        <h2 className={s.display}>Try it.</h2>
        <p>A golfer books 1:10 PM for two players on your booking page. Press Book and watch the group land on the real tee sheet.</p>
        <div className={s.demoCtl}>
          <div><b>1:10 PM · 18 holes · 2 players</b><span>Online booking, pay at the course</span></div>
          <button className={s.btn} type="button" disabled={booked} onClick={() => setBooked(true)}>{booked ? 'Booked' : 'Book'}</button>
        </div>
        <p className={s.demoMsg} aria-live="polite">
          {booked ? 'Booked. Dana Ruiz, 2 players, is on the tee sheet at 1:10 PM, due at check-in.' : 'Not booked yet. The 1:10 PM row is open.'}
        </p>
      </div>
      <div className={s.fsecMedia}>
        <div className={s.shot}>
          <div className={s.laptopScreen}>
            <Image src={booked ? '/home/shots/features/try-after.png' : '/home/shots/features/try-before.png'} width={2160} height={1350}
              sizes="(max-width: 1000px) 100vw, 680px"
              alt={booked ? 'The tee sheet with Dana Ruiz and one more booked at 1:10 PM' : 'The tee sheet with 1:10 PM open'} />
          </div>
          <div className={s.laptopBase} />
        </div>
      </div>
    </div>
  );
}
