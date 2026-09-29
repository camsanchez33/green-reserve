import Link from 'next/link';
import SeeItWork from '@/components/home/SeeItWork';
import HomeDemo from '@/components/home/HomeDemo';
import HomeMotion from '@/components/home/HomeMotion';
import StoryMedia from '@/components/home/StoryMedia';
import HomeFaq from '@/components/home/HomeFaq';
import MountNearView from '@/components/home/MountNearView';
import s from './home.module.css';

// H-1 (UI_REVISE_SPEC §5): the homepage from the approved prototype
// (docs/design/homepage-prototype.html). Sections in the spec's order:
// hero → pinned story → live demo → steps → pricing on pine → FAQ →
// final CTA. Nav and Footer live in the root layout. FB-2 (Cam approved
// FB2_COPY_SPEC.md 2026-09-29): the course-cards section is gone, the steps are
// the real five-step process, and "no contract" became "no long-term commitment"
// (the operator agreement IS a contract).
//
// Fee copy follows legal/LQ-2_FEE_COPY.md (decided 2026-09-14): the golfer
// pays $1.50 per player on top of the course's price, collected in the same
// card payment to the course's Stripe account; Stripe's fee applies to the
// whole payment. Never "keep 100%", never "never touches your Stripe account".

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
const Down = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
);

const BEATS: { eyebrow: string; h: string; p: string; fine?: string }[] = [
  { eyebrow: 'Your page', h: 'It works with the website you already have.', p: 'Your booking page gets its own secure link. Put it behind a “Book a tee time” button on your site, your Google listing and your social pages. It carries your logo, colors and photos, so golfers never feel they left you.', fine: 'Every page is served over HTTPS, and card details go straight to Stripe. They never touch your computer or ours.' },
  { eyebrow: 'Your money', h: 'Green fees go to your own Stripe account.', p: 'A card holds the time; the golfer is charged when they check in, and Stripe pays you out on its normal schedule.' },
  { eyebrow: 'Your rules', h: 'Members keep their rules.', p: 'Member rates, booking windows and guest pricing, set by tier. Members sign in with a code — no app, no password.' },
];

const STEPS = [
  { n: '1', h: 'Tell us about your course', p: 'A two-minute form, then a 20-minute call about your green fees, tee sheet and how you take bookings today.' },
  { n: '2', h: 'Fill in your setup sheet', p: 'Most of it is already filled in from the call. Check your tee times, prices and cancellation policy (about five minutes); the rest can wait.' },
  { n: '3', h: 'Approve your page', p: 'We build your booking page and tee sheet and send you a private preview to approve or mark up.' },
  { n: '4', h: 'Sign and connect Stripe', p: 'The operator agreement and Stripe, about ten minutes, in your course’s name. Payouts go straight to your bank.' },
  { n: '5', h: 'Go live', p: 'Add the link to your website and Google listing. Your staff log in to the tee sheet; golfers start booking.' },
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
              <p>Golfers book your tee times online, on a page with your course&apos;s name, colors and photos. Link it from your website with a “Book a tee time” button, and your staff run the whole day from one tee sheet.</p>
              <div className={s.cta}>
                <Link className={s.btn} href="/for-courses">List your course <Arrow /></Link>
                <a className={`${s.btn} ${s.btnOutline}`} href="#list">See how it works <Down /></a>
              </div>
              <div className={s.fine}>Free for courses. $0/month, no long-term commitment. We reply within one business day.</div>
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
                {b.fine && <p className={s.beatFine}>{b.fine}</p>}
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

      {/* H-2c: the photo band that sat here is gone — every photo section is
          now followed by a quiet one. Its line lives under the steps title. */}

      {/* 6. STEPS — the real process, first call to first booking */}
      <section className={s.steps} id="list">
        <div className={s.wrap}>
          <h2 className={`${s.h2} ${s.fade}`}>From first call to first booking.</h2>
          <p className={`${s.sub} ${s.fade}`}>We set it up with you. Most courses are live in about a week.</p>
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
            <p className={s.fade}>No setup fee. No monthly fee. No long-term commitment — leave with 30 days&apos; notice. Golfers pay a $1.50 per player booking fee on each online booking, shown to them before they book and added to your price, never taken out of it. Stripe&apos;s card-processing fee applies to the payment, the same as any card you take today.</p>
            <p className={`${s.priceNote} ${s.fade}`}><b>Taxes.</b> Your prices are shown to golfers exactly as you set them. GreenReserve doesn&apos;t add or collect sales tax on green fees — if tax applies at your course, include it in your price.</p>
          </div>
          <div className={`${s.tile} ${s.fade}`}>
            <div className={s.eyebrow}>Per online booking</div>
            <div className={s.amt}><span className={s.n}>$1.50</span><span className={s.u}>per player</span></div>
            <ul>
              <li>Bookings your staff enter: $0</li>
              <li>Setup and your preview page: $0</li>
              <li>Monthly: $0</li>
              <li>Leave anytime with 30 days&apos; notice</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 9. FAQ — the questions in lib/faq.ts, same array as the JSON-LD */}
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
