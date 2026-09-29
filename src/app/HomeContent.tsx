import Link from 'next/link';
import Image from 'next/image';
import { DEMO_COURSE_SLUGS } from '@/lib/demo-courses';
import SeeItWork from '@/components/home/SeeItWork';
import HomeDemo from '@/components/home/HomeDemo';
import HomeMotion from '@/components/home/HomeMotion';
import StoryMedia from '@/components/home/StoryMedia';
import HomeFaq from '@/components/home/HomeFaq';
import MountNearView from '@/components/home/MountNearView';
import s from './home.module.css';

// H-1 (UI_REVISE_SPEC §5): the homepage from the approved prototype
// (docs/design/homepage-prototype.html). Sections in the spec's order:
// hero → pinned story → live demo → course cards → four steps →
// pricing on pine → FAQ → final CTA. Nav and Footer live in the root layout.
//
// Fee copy follows legal/LQ-2_FEE_COPY.md (decided 2026-09-14): the golfer
// pays $1.50 per player on top of the course's price, collected in the same
// card payment to the course's Stripe account; Stripe's fee applies to the
// whole payment. Never "keep 100%", never "never touches your Stripe account".

const DEMO_SLUG = DEMO_COURSE_SLUGS[0] ?? null;

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
const Down = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
);

const BEATS = [
  { eyebrow: 'Your page', h: 'Golfers book on a page that looks like your course.', p: 'Your logo, your color, your photo. Our name is one small line at the bottom. Nobody feels like they left your website.' },
  { eyebrow: 'Your money', h: 'Green fees are paid straight to your own account.', p: 'A card holds the time. Golfers pay when they check in, and it lands in your own Stripe account on its normal schedule.' },
  { eyebrow: 'Your rules', h: 'Members keep their rules.', p: 'Member rates, booking windows, guest pricing per tier. Members sign in on the same page with a code — no app, no password.' },
];

// Example pages. Real courses replace these as they go live (§0.4).
const CARDS = [
  { img: '/home/aerial.jpg', name: 'Hollow Creek Golf Club', where: 'Suffern, New York · Public · 18 holes', from: 'From $54 / player' },
  { img: '/home/bunker-card.jpg', name: 'Sandpiper Links', where: 'Montauk, New York · Public · 18 holes', from: 'From $88 / player' },
  { img: '/home/iron.jpg', name: 'Stony Hollow Country Club', where: 'Mahwah, New Jersey · Semi-private · 18 holes', from: 'Members & guests' },
];

const STEPS = [
  { n: '1', h: 'Tell us about your course', p: 'Two minutes. Name, town, holes, rates, and anything we should know.' },
  { n: '2', h: 'We build your sheet', p: 'You get a private preview of your page to approve or mark up.' },
  { n: '3', h: 'Connect your bank', p: 'Stripe, ten minutes, in your own name. Payouts go straight to you.' },
  { n: '4', h: 'Go live', p: 'Put the link on your website and Google listing. Golfers start booking.' },
];

// PERF-1 (Cam 2026-09-29, keep the speed check strict): a SERVER component
// now. As one 'use client' tree the whole page hydrated on load — the longest
// task in Home's trace. The only interactive parts are islands: HomeMotion
// (reveals + story scroll), StoryMedia (story photo/clip), HomeFaq, and the
// demos, which were already their own client components.
export default function HomeContent() {
  return (
    <div data-home-root="" className={s.root}>
      <HomeMotion />
      {/* 2. HERO — H-2d direction A: paper + the product. No photo; the
          booking page itself is the picture, live (the same HomeDemo the
          "See it work" section runs, its own instance). */}
      <section className={s.hero} id="top">
        <div className={s.inWrap}>
          <div className={s.heroGrid}>
            <div className={s.heroText}>
              <div className={s.heroEyebrow}>Free online tee sheet for golf courses</div>
              <h1>The tee sheet your course deserves.</h1>
              <p>Golfers book on a page that looks like your course. You run the sheet, take check-ins and payments, and keep your members&apos; rules. Live in days.</p>
              <div className={s.cta}>
                <Link className={s.btn} href="/for-courses">List your course <Arrow /></Link>
                <a className={`${s.btn} ${s.btnOutline}`} href="#how">See how it works <Down /></a>
              </div>
              <div className={s.fine}>Free for courses. $0/month, no contract. We reply within one business day.</div>
            </div>
            <div className={s.heroStage}>
              <div className={s.heroDevice}>
                <HomeDemo accent="#24513B" photo compact />
              </div>
              <div className={s.heroSheet} aria-hidden="true">
                <div className={s.hsHead}><span>Your tee sheet</span><b>Sat · 7 AM</b></div>
                <div className={s.hsRow}><span className={s.hsT}>7:10</span><span className={s.hsWho}>Marino · 4 players</span><span className={`${s.hsSt} ${s.hsOk}`}>Checked in</span></div>
                <div className={s.hsRow}><span className={s.hsT}>7:20</span><span className={s.hsWho}>Okafor · 2 players</span><span className={`${s.hsSt} ${s.hsDue}`}>Due $124</span></div>
                <div className={s.hsRow}><span className={s.hsT}>7:30</span><span className={s.hsWho}>Open</span><span className={`${s.hsSt} ${s.hsOpen}`}>4 spots</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. STORY — pinned photo, three beats */}
      <section data-story="" className={s.story} id="how">
        <div className={s.pin}>
          <StoryMedia />
          <div className={`${s.shade} ${s.storyShade}`} />
          <div data-story-beats="" className={s.beats}>
            {BEATS.map((b, i) => (
              <div key={b.eyebrow} className={`${s.beat} ${i === 0 ? s.on : ''}`}>
                <div className={s.eyebrow}>{b.eyebrow}</div>
                <h2>{b.h}</h2>
                <p>{b.p}</p>
              </div>
            ))}
          </div>
          <div data-story-prog="" className={s.prog} aria-hidden="true"><i className={s.on} /><i /><i /></div>
        </div>
      </section>

      {/* 4. SEE IT WORK — the live demo */}
      <section className={s.product} id="see">
        <div className={s.wrap}>
          <h2 className={`${s.h2} ${s.fade}`}>See it work.</h2>
          <p className={`${s.sub} ${s.fade}`}>This is how it works, not a picture of it. Tap a time. Reserve it. Then flip to the sheet your shop runs.</p>
          <MountNearView minHeight={720}><SeeItWork /></MountNearView>
        </div>
      </section>

      {/* 5. COURSE CARDS */}
      <section className={s.courses}>
        <div className={s.wrap}>
          <div className={s.head}>
            <div>
              <h2 className={`${s.h2} ${s.fade}`}>Every course gets its own page.</h2>
              <p className={`${s.sub} ${s.fade}`}>Not a listing on ours. A booking page under your name, on your link, with your photography. These are example pages — real courses take their place as they go live.</p>
            </div>
            <Link className={`${s.link} ${s.fade}`} href="/for-courses" style={{ color: 'var(--pine)' }}>List your course <Arrow /></Link>
          </div>
          <div className={s.cards}>
            {CARDS.map((c, i) => (
              <Link key={c.name} className={`${s.card} ${s.fade}`} href={DEMO_SLUG ? `/courses/${DEMO_SLUG}` : '/for-courses'} style={{ transitionDelay: `${i * 0.1}s` }}>
                <div className={s.img}><Image src={c.img} alt="" fill sizes="(max-width: 960px) 100vw, 33vw" loading="lazy" /></div>
                <div className={s.body}>
                  <div className={s.name}>{c.name}</div>
                  <div className={s.where}>{c.where}</div>
                  <div className={s.row2}><b>{c.from}</b><span>{DEMO_SLUG ? 'See tee times →' : 'Get a page like this →'}</span></div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* H-2c: the photo band that sat here is gone — every photo section is
          now followed by a quiet one. Its line lives under the steps title. */}

      {/* 6. FOUR STEPS */}
      <section className={s.steps} id="list">
        <div className={s.wrap}>
          <h2 className={`${s.h2} ${s.fade}`}>Live in four steps.</h2>
          <p className={`${s.sub} ${s.fade}`}>We set it up. You run it. Tell us about your course and we build the sheet with you; you approve a private preview, connect your bank, and go live. Days, not months.</p>
          <div className={s.stepsRow}>
            {STEPS.map((st, i) => (
              <div key={st.n} className={`${s.s} ${s.fade}`} style={{ transitionDelay: `${i * 0.08}s` }}>
                <div className={s.n}>{st.n}</div>
                <h3>{st.h}</h3>
                <p>{st.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. PRICING on pine */}
      <section className={s.price} id="pricing">
        <div className={`${s.wrap} ${s.priceWrap}`}>
          <div>
            <h2 className={`${s.h2} ${s.fade}`}>Free for courses.</h2>
            <p className={s.fade}>No setup fee, no monthly fee, no contract. Golfers pay $1.50 per player on each online booking, added to your price — they see it before they book. Stripe&apos;s card-processing fee applies to the payment, the same as any card you take today.</p>
          </div>
          <div className={`${s.tile} ${s.fade}`}>
            <div className={s.eyebrow}>Per online booking</div>
            <div className={s.amt}><span className={s.n}>$1.50</span><span className={s.u}>per player</span></div>
            <ul>
              <li>Bookings your staff enter by hand: $0</li>
              <li>Setup, onboarding, your preview page: $0</li>
              <li>Monthly: $0. Contract: none.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 9. FAQ — the six questions in lib/faq.ts, same array as the JSON-LD */}
      <section className={s.faq} id="faq">
        <div className={`${s.wrap} ${s.faqGrid}`}>
          <div><h2 className={`${s.h2} ${s.fade}`}>Questions courses ask.</h2></div>
          <div className={s.fade}>
            <HomeFaq />
          </div>
        </div>
      </section>

      {/* 10. FINAL CTA */}
      <section className={s.final}>
        <div className={s.wrap}>
          <h2 className={`${s.h2} ${s.fade}`}>Put your course online this week.</h2>
          <div className={`${s.cta} ${s.fade}`}>
            <Link className={s.btn} href="/for-courses">List your course <Arrow /></Link>
            <a className={s.link} href="mailto:thegreenreserve@outlook.com" style={{ color: 'var(--pine)' }}>Or email thegreenreserve@outlook.com</a>
          </div>
        </div>
      </section>
    </div>
  );
}
