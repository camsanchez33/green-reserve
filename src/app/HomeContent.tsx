import Link from 'next/link';
import Image from 'next/image';
import HomeCloser from '@/components/home/HomeCloser';
import StickyDemoBar from '@/components/home/StickyDemoBar';
import ScoreCard from '@/components/home/ScoreCard';
import { FEATURE_GROUPS, featureHref } from '@/components/home/features';
import s from './home.module.css';

// Homepage redo (Cam 2026-11-18, lanes/homepage.md "Homepage redo — APPROVED"; the mockup
// lanes/homepage/homepage-mockup.html is the spec). Home is an overview: Hero A (the photo, tightened,
// with a down arrow and no top-bar buttons), "What GreenReserve does" with a Learn more link to each
// feature's own page, one compact Free block (no fee list on Home), then the shared bottom block.
// Copy rules still hold: NO durations, NO contract terms, fee sentences only from legal/LQ-2_FEE_COPY.md.
// A server component; the only client JS is the shared bottom block's Cal.com calendar (CalEmbed) and Contact us pop-up
// (ContactDialog), and the phone's sticky Book a demo bar (StickyDemoBar).

export default function HomeContent() {
  return (
    <div data-home-root="" className={s.root}>
      <section className={s.heroA} aria-label="Introduction">
        <Image src="/home/hero-coast.jpg" alt="" fill priority sizes="100vw" quality={50} className={s.heroAImg} />
        <div className={s.heroAIn}>
          <h1 className={s.heroLogo}>
            <Image src="/brand/logo-cream.svg" unoptimized alt="GreenReserve" width={1530} height={286} priority className={s.heroALogo} />
          </h1>
          <p className={`${s.display} ${s.heroALine}`}>The tee sheet your course deserves.</p>
          <a className={`${s.btn} ${s.cream}`} href="#demo" id="hero-demo">Book a demo</a>
          <a className={s.down} href="#about" aria-label="See what's included">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </a>
        </div>
      </section>

      <section className={`${s.wrap} ${s.what}`} id="about">
        <h2 className={`${s.display} ${s.h2}`}>What GreenReserve does.</h2>
        <div className={s.groups}>
          {FEATURE_GROUPS.map(g => (
            <div key={g.label}>
              <h3 className={s.groupLabel}>{g.label}</h3>
              <div className={g.items.length === 3 ? s.fgrid : `${s.fgrid} ${s.fgrid2}`}>
                {g.items.map(f => (
                  <div key={f.slug} className={s.fcard}>
                    <b className={s.display}>{f.title}</b>
                    <p>{f.line}</p>
                    <Link href={featureHref(f.slug)}>Learn more<span className={s.sr}> about {f.title.toLowerCase()}</span></Link>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={`${s.wrap} ${s.freeline}`} id="free">
        <div>
          <h2 className={`${s.display} ${s.h2s}`}>Free for your course.</h2>
          <p>
            No setup fee, no monthly fee, no commission on your green fees. Stripe&apos;s standard card-processing fee
            applies to the payment, the same as any card you take today. GreenReserve charges you nothing on top of it.
          </p>
          <p><Link className={s.quietLink} href={featureHref('payments')}>How golfers pay</Link></p>
        </div>
        <ScoreCard />
      </section>

      <HomeCloser />
      <StickyDemoBar />
    </div>
  );
}
