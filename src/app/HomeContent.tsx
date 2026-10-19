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
  'Your own booking page, with your course’s name, colors and photos',
  'Online, phone and walk-in bookings on one tee sheet',
  'Check-in and payment at the counter, or on the golfer’s own phone',
  'Member rates, your cancellation policy and staff permissions, all set by you',
];

const HIGHLIGHTS = [
  { h: 'Free for your course', p: 'No setup fee, no monthly fee, no commission on your green fees. Golfers pay $1.50 per player on each online booking, added to your price.' },
  { h: 'Your AI assistant', p: 'Ask how today looks, find a golfer’s booking or draft a change to the sheet. Nothing changes until you confirm it.' },
  { h: 'A monthly review of your course', p: 'Analytics for every day, and at the end of each month a written review of how the course did and what to look at next.' },
  { h: 'Payments, anywhere', p: 'Golfers pay at the counter or on their own phone, including Apple Pay and Google Pay, and you can text them a pay link. A card on file covers late-cancel and no-show fees. The money goes to your course’s own Stripe account.' },
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
        <h2 className={s.display}>A free tee sheet built for how your course really runs.</h2>
        <div className={s.aboutGrid}>
          <div>
            <p className={s.lead}>
              GreenReserve gives your course its own online booking page and the tee sheet your staff run the day from.
              Golfers book from a button on your website, on a page with your course&apos;s name, colors and photos.
              Every booking, whether it came in online, by phone or at the counter, lands on the same sheet, so nothing
              is double-booked. Green fees are paid into your course&apos;s own Stripe account, and GreenReserve charges your course nothing.
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
            <Link className={s.quiet} href="/for-courses#ask">Not ready for a call? Send us a note</Link>
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
