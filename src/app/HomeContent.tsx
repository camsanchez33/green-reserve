import Link from 'next/link';
import Image from 'next/image';
import { LaptopDemo } from '@/components/home/TeeSheetDemo';
import s from './home.module.css';

// HOME-2 (HOMEPAGE_SPEC.md, Cam 2026-10-07): Cam's own layout. One idea per
// scroll — the logo over the coast photo, what GreenReserve is, what a course
// gets, the working demo with Book a demo, the logo again. The detail lives on
// /teesheet ("Learn more about the tee sheet"). Copy rules still hold: NO
// durations, NO contract terms, fee sentences only from legal/LQ-2_FEE_COPY.md
// (never "keep 100%" or that the course nets its green fee to the cent), and
// only features that exist today (pro-shop access waits until it's built).
//
// A server component; the only client JS is the demo island (TeeSheetDemo).

const DEMO = '/demo';
const INQUIRY = '/for-courses';
const DETAIL = '/teesheet';

const Arrow = () => <span aria-hidden="true">→</span>;

const DOES = [
  'A booking page with your course’s name, colors and photos, linked from your own website',
  'Online, phone and walk-in bookings on one sheet, with your public, resident and member rates',
  'Payments at the counter or on the golfer’s own phone, with a card on file for late-cancel and no-show fees',
  'Staff logins, with permissions you set for each person',
  'An AI assistant that answers questions about your day and drafts changes for you to confirm',
];

const HIGHLIGHTS = [
  { h: 'Free for your course', p: 'No setup fee, no monthly fee, no commission on your green fees. Golfers pay $1.50 per player on each online booking, added to your price.' },
  { h: 'Birdie, your assistant', p: 'Ask how today looks, find a golfer’s booking or draft a change to the sheet. Birdie never changes anything until you confirm it.' },
  { h: 'Analytics', p: 'Revenue collected and still owed, how full each day ran, no-shows, and the tee times that went unsold.' },
  { h: 'Your money, your account', p: 'Golfers pay with one card payment to your course’s own Stripe account, and it lands on Stripe’s normal schedule.' },
];

export default function HomeContent() {
  return (
    <div data-home-root="" className={s.root}>
      {/* HERO — the logo over the photo, the line, what it is and why it's free, Book a demo (Cam 2026-10-19). */}
      <section className={s.hero}>
        <Image src="/home/hero-coast.jpg" alt="" fill priority sizes="(max-width: 768px) 250vw, 100vw" quality={50} className={s.heroImg} />
        <div className={s.heroIn}>
          <h1 className={s.heroLogo}>
            <Image src="/brand/logo-cream.svg" unoptimized alt="GreenReserve" width={1530} height={286} priority className={s.heroLogoImg} />
          </h1>
          <p className={`${s.display} ${s.heroLine}`}>The tee sheet your course deserves.</p>
          <p className={s.heroSub}>Online booking, payments and an AI assistant that knows your course. GreenReserve charges your course nothing: golfers pay a small booking fee instead.</p>
          <a className={`${s.btn} ${s.heroBtn}`} href={DEMO}>Book a demo <Arrow /></a>
        </div>
        <a href="#about" className={s.heroNext}>What it does <span aria-hidden="true">↓</span></a>
      </section>

      {/* WHAT IT IS — the headline, the paragraph, the list, then the way on. */}
      <section className={`${s.col} ${s.about}`} id="about">
        <h2 className={s.display}>Everything your course needs, in one tee sheet.</h2>
        <div className={s.aboutGrid}>
          <div>
            <p className={s.lead}>
              GreenReserve brings your tee sheet and online booking into one system that your staff run.
              During setup, we build your course&apos;s booking page from your schedule, rates, photos and colors,
              and you can change any of it whenever you like. We bring your members over and train your staff,
              so your counter is ready before you go live. GreenReserve charges your course nothing.
            </p>
            <ul className={s.does}>
              {DOES.map(d => <li key={d}>{d}</li>)}
            </ul>
          </div>
          <div className={s.cards}>
            <a href="#see" className={s.card}>
              <b className={s.display}>See how it works</b>
              <span>Book a time as a golfer and watch it land on the tee sheet.</span>
              <em>Try the demo <Arrow /></em>
            </a>
            <Link href={DETAIL} className={s.card}>
              <b className={s.display}>Learn more about the tee sheet</b>
              <span>Everything your course gets, in detail.</span>
              <em>Read the overview <Arrow /></em>
            </Link>
          </div>
        </div>
      </section>

      {/* WHAT YOU GET — only what exists today. */}
      <section className={s.why} id="why">
        <div className={s.col}>
          <h2 className={s.display}>What your course gets.</h2>
          <div className={s.whyGrid}>
            {HIGHLIGHTS.map(h => <div key={h.h}><h3 className={s.display}>{h.h}</h3><p>{h.p}</p></div>)}
          </div>
          <Link href={DETAIL} className={s.quiet}>Learn more about the tee sheet</Link>
        </div>
      </section>

      {/* SEE HOW IT WORKS — the working demo on a laptop, then Book a demo. */}
      <section className={s.see} id="see">
        <div className={s.col}>
          <h2 className={s.display}>See how it works.</h2>
          <p className={s.lead}>Book a time on the golfer&apos;s phone, then check the group in on the tee sheet. Try your course&apos;s color.</p>
          <LaptopDemo />
          <div className={s.seeCta} id="demo">
            <a className={s.btn} href={DEMO}>Book a demo <Arrow /></a>
            <span>We&apos;ll show it with your own course&apos;s times and prices.</span>
            <Link className={s.quiet} href={INQUIRY}>Or ask a question</Link>
          </div>
        </div>
      </section>

      {/* END — the logo again, with the line. */}
      <section className={s.end}>
        <Image src="/brand/logo.svg" unoptimized alt="GreenReserve" width={1530} height={286} loading="lazy" className={s.endLogo} />
        <p className={s.display}>Ready when your course is.</p>
      </section>
    </div>
  );
}
