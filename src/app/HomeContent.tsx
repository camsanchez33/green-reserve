import Link from 'next/link';
import Image from 'next/image';
import { LaptopDemo } from '@/components/home/TeeSheetDemo';
import ProductShot from '@/components/home/ProductShot';
import s from './home.module.css';

// HOME-2 (HOMEPAGE_SPEC.md, Cam 2026-10-07): Cam's own layout. One idea per
// scroll — the logo over the coast photo, what GreenReserve is and what a course
// gets, then the working demo with Book a demo. W2-H2/H3 (Cam 2026-10-19): the
// separate "What your course gets" block repeated the list and is merged into
// it; the closing logo + "Ready when your course is." is gone. The detail lives on
// /teesheet ("Learn more about the tee sheet"). Copy rules still hold: NO
// durations, NO contract terms, fee sentences only from legal/LQ-2_FEE_COPY.md
// (never "keep 100%" or that the course nets its green fee to the cent), and
// only features that exist today (pro-shop access waits until it's built).
//
// A server component; the only client JS is the demo island (TeeSheetDemo).

const DEMO = '/demo';
const DETAIL = '/teesheet';

const Arrow = () => <span aria-hidden="true">→</span>;

const DOES = [
  'A booking page with your course’s name, colors and photos, linked from your own website',
  'Online, phone and walk-in bookings on one sheet, with your public, resident and member rates',
  'Payments at the counter or on the golfer’s own phone, with a card on file for late-cancel and no-show fees',
  'Staff logins, with permissions you set for each person',
  'An AI assistant that answers questions about your day and drafts changes for you to confirm',
  'Analytics for every day, and at the end of each month a written review of how the course did',
];

const FEATURES: { h: string; p: string; shot: string; device: 'laptop' | 'phone'; alt: string }[] = [
  {
    h: 'An assistant that knows your course.',
    p: 'Ask who hasn’t paid, how last week went or which hours sit empty, and it answers from your own tee sheet. It can draft a change for you, like a pay link, a blocked time or a moved group, and nothing happens until you confirm it.',
    shot: 'assistant', device: 'laptop',
    alt: 'The tee sheet with the AI assistant open, listing this afternoon’s unpaid groups and offering to text one of them a pay link',
  },
  {
    h: 'Know how your course is doing.',
    p: 'Revenue, how full the sheet was and what each round brought in, against the week before, in plain words. At the start of every month you get a written review of the month before, built only from your own numbers.',
    shot: 'analytics', device: 'laptop',
    alt: 'The analytics page: revenue, tee sheet filled, rounds played and average per round, what to look at, and September’s monthly review',
  },
  {
    h: 'Paid at the counter or on their phone.',
    p: 'Text a group a pay link and they pay on their own phone, with Apple Pay, Google Pay or a card. When your policy has late-cancel or no-show fees, golfers save a card when they book, so the fee is covered.',
    shot: 'pay', device: 'phone',
    alt: 'A golfer’s phone showing their tee time, the total and a card field to check in and pay',
  },
];

export default function HomeContent() {
  return (
    <div data-home-root="" className={s.root}>
      {/* HERO — the logo over the photo, the line, what it is and why it's free, Learn more (Cam 2026-10-19:
          a first visit isn't ready for a call; Book a demo stays top right and with the demo below). */}
      <section className={s.hero}>
        <Image src="/home/hero-coast.jpg" alt="" fill priority sizes="(max-width: 768px) 250vw, 100vw" quality={50} className={s.heroImg} />
        <div className={s.heroIn}>
          <h1 className={s.heroLogo}>
            <Image src="/brand/logo-cream.svg" unoptimized alt="GreenReserve" width={1530} height={286} priority className={s.heroLogoImg} />
          </h1>
          <p className={`${s.display} ${s.heroLine}`}>The tee sheet your course deserves.</p>
          <p className={s.heroSub}>Online booking, payments and an AI assistant that knows your course. Free for your course.</p>
          <a className={`${s.btn} ${s.heroBtn}`} href="#about">Learn more <span aria-hidden="true">↓</span></a>
        </div>
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
              so your counter is ready before you go live.
            </p>
            <ul className={s.does}>
              {DOES.map(d => <li key={d}>{d}</li>)}
            </ul>
            {/* W2-H1 (Cam 2026-10-19): the hero only says free; the golfer fee is disclosed here, once (LQ-2 wording). */}
            <p className={s.fee}><b>Free for your course.</b> No setup fee, no monthly fee, no commission on your green fees. Golfers pay $1.50 per player on each online booking, added to your price.</p>
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

      {/* WHAT IT DOES (Cam 2026-10-19 picks; rows 2026-10-23) — the assistant, analytics and the monthly
          review, payments: each beside a real screenshot. Marketing copy says "an AI assistant", never "Birdie". */}
      <section className={`${s.col} ${s.features}`} id="features">
        {FEATURES.map(f => (
          <div key={f.shot} className={s.feat}>
            <div>
              <h2 className={s.display}>{f.h}</h2>
              <p>{f.p}</p>
            </div>
            <div className={s.featMedia}><ProductShot shot={f.shot} device={f.device} alt={f.alt} /></div>
          </div>
        ))}
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
    </div>
  );
}
