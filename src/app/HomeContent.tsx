'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { HOME_FAQ } from '@/lib/faq';
import { DEMO_COURSE_SLUGS } from '@/lib/demo-courses';
import SeeItWork from '@/components/home/SeeItWork';
import HomeDemo from '@/components/home/HomeDemo';
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

export default function HomeContent() {
  const rootRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLElement>(null);
  const storyPhRef = useRef<HTMLDivElement>(null);
  const beatsRef = useRef<HTMLDivElement>(null);
  const progRef = useRef<HTMLDivElement>(null);
  const [faqOpen, setFaqOpen] = useState(0);
  // H-2a: the story clip is mounted only when the page is wide enough (phones
  // never download it) and the user has not asked for reduced motion or data.
  const [storyVideo, setStoryVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (!reduce && !saveData && window.matchMedia('(min-width: 960px)').matches) setStoryVideo(true);

    // Reveals. Everything already in the viewport is marked before the
    // `js` class hides the rest, so the first paint never flashes.
    const els = Array.from(root.querySelectorAll<HTMLElement>(`.${s.fade}`));
    const vh = window.innerHeight;
    els.forEach(el => { if (el.getBoundingClientRect().top < vh * 0.92) el.classList.add(s.in); });
    root.classList.add(s.js);
    let io: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window && !reduce) {
      io = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add(s.in); io?.unobserve(e.target); } });
      }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
      els.forEach(el => { if (!el.classList.contains(s.in)) io?.observe(el); });
    } else {
      els.forEach(el => el.classList.add(s.in));
    }

    // Scroll-driven motion: transform-only, one rAF per frame.
    let cur = 0, ticking = false;
    const beats = beatsRef.current ? Array.from(beatsRef.current.children) : [];
    const prog = progRef.current ? Array.from(progRef.current.children) : [];
    function frame() {
      ticking = false;
      if (reduce) return;
      const y = window.scrollY || window.pageYOffset;
      const h = window.innerHeight;
      const story = storyRef.current;
      if (story && storyPhRef.current) {
        const r = story.getBoundingClientRect();
        const total = story.offsetHeight - h;
        const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
        // H-2d §2: the still gets the slow push; the clip already moves, and a
        // second stepped zoom on top of it was the shimmer.
        if (!storyPhRef.current.classList.contains(s.hasVideo)) storyPhRef.current.style.setProperty('--z', (1 + p * 0.14).toFixed(4));
        const i = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
        if (i !== cur) {
          cur = i;
          beats.forEach((b, k) => b.classList.toggle(s.on, k === i));
          prog.forEach((b, k) => b.classList.toggle(s.on, k === i));
        }
      }
    }
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', frame);
    frame();
    return () => {
      io?.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', frame);
    };
  }, []);

  // H-2a: play only while the pinned story is on screen; pause the moment it
  // leaves. A clip that fails to load simply stays hidden behind the poster.
  useEffect(() => {
    const v = videoRef.current;
    const story = storyRef.current;
    if (!storyVideo || !v || !story) return;
    let timer: number | null = null;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          v.play().catch(() => {});
          // A clip that cannot play within 4s of being asked stays hidden
          // behind the poster (slow network, unsupported codec, blocked autoplay).
          if (timer === null) timer = window.setTimeout(() => { if (v.readyState < 3 || v.paused) setStoryVideo(false); }, 4000);
        } else {
          v.pause();
        }
      });
    }, { threshold: 0.1 });
    io.observe(story);
    return () => { io.disconnect(); if (timer !== null) window.clearTimeout(timer); };
  }, [storyVideo]);

  return (
    <div ref={rootRef} className={s.root}>
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
      <section ref={storyRef} className={s.story} id="how">
        <div className={s.pin}>
          <div ref={storyPhRef} className={`${s.storyPh} ${storyVideo ? s.hasVideo : ''}`}>
            <Image src="/home/bunker.jpg" alt="" fill sizes="100vw" loading="lazy" className={storyVideo ? undefined : s.drift} />
            {storyVideo && (
              <video
                ref={videoRef}
                muted
                loop
                playsInline
                preload="none"
                poster="/home/story-poster.jpg"
                aria-hidden="true"
                onError={() => setStoryVideo(false)}
              >
                {/* H-2d-R2: mp4 first — the v2 webm is the larger file, and browsers take the first source they can play. */}
                <source src="/home/story.mp4" type="video/mp4" />
                <source src="/home/story.webm" type="video/webm" />
              </video>
            )}
          </div>
          <div className={`${s.shade} ${s.storyShade}`} />
          {/* H-2d §3: the cream hero dissolves into the moving green — no seam. */}
          <div className={s.storyTop} aria-hidden="true" />
          {/* H-2e §5: and fades back into cream at the bottom. */}
          <div className={s.storyBottom} aria-hidden="true" />
          <div ref={beatsRef} className={s.beats}>
            {BEATS.map((b, i) => (
              <div key={b.eyebrow} className={`${s.beat} ${i === 0 ? s.on : ''}`}>
                <div className={s.eyebrow}>{b.eyebrow}</div>
                <h2>{b.h}</h2>
                <p>{b.p}</p>
              </div>
            ))}
          </div>
          <div ref={progRef} className={s.prog} aria-hidden="true"><i className={s.on} /><i /><i /></div>
        </div>
      </section>

      {/* 4. SEE IT WORK — the live demo */}
      <section className={s.product} id="see">
        <div className={s.wrap}>
          <h2 className={`${s.h2} ${s.fade}`}>See it work.</h2>
          <p className={`${s.sub} ${s.fade}`}>This is how it works, not a picture of it. Tap a time. Reserve it. Then flip to the sheet your shop runs.</p>
          <SeeItWork />
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
            {HOME_FAQ.map((f, i) => (
              <div key={f.q} className={`${s.q} ${faqOpen === i ? s.open : ''}`}>
                <button type="button" aria-expanded={faqOpen === i} onClick={() => setFaqOpen(faqOpen === i ? -1 : i)}>
                  <span>{f.q}</span><span aria-hidden="true">+</span>
                </button>
                <div className={s.a}><div><p>{f.a}</p></div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 10. FINAL CTA */}
      <section className={s.final}>
        <div className={s.wrap}>
          <h2 className={`${s.h2} ${s.fade}`}>Put your course online this week.</h2>
          <div className={`${s.cta} ${s.fade}`}>
            <Link className={s.btn} href="/for-courses">List your course <Arrow /></Link>
            <a className={s.link} href="mailto:hello@greenreserve.app" style={{ color: 'var(--pine)' }}>Or email hello@greenreserve.app</a>
          </div>
        </div>
      </section>
    </div>
  );
}
