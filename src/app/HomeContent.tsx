import Link from 'next/link';
import Image from 'next/image';
import { HeroDemo, SeeItWorkDemo } from '@/components/home/TeeSheetDemo';
import { HOME_FAQ } from '@/lib/faq';
import s from './home.module.css';

// UI-H-1 (HOMEPAGE_SPEC.md, Cam 2026-10-01): the homepage from the approved
// plain-background mockup (docs/design/home/index.html). Rejected and never to
// return: Direction B, the printed scorecard, every golf-hole / aerial-course
// background, and the stock photo "your course, not ours" section. Copy rules:
// NO durations and NO contract terms; CTAs are Book a demo + Send an inquiry.
// Fee copy stays behind LQ-2: "a small booking fee", never "keep 100%".
//
// A server component; the only client JS is the demo island (TeeSheetDemo).

const DEMO = '/demo';
const INQUIRY = '/for-courses';

const Arrow = () => <span aria-hidden="true">→</span>;

const COURSES = [
  { name: 'Hollow Creek', where: 'Suffern, NY', crest: 'HC', color: '#2B4A38', photo: '/home/course-hollow-creek.jpg', t: '7:32', meta: '4 spots · $52' },
  { name: 'Stonebridge', where: 'Hudson, OH', crest: 'SB', color: '#7A2E2E', photo: '/home/course-stonebridge.jpg', t: '8:10', meta: '2 spots · $48' },
  { name: 'Lake Wren', where: 'Traverse City, MI', crest: 'LW', color: '#23395B', photo: '/home/course-lake-wren.jpg', t: '9:20', meta: '3 spots · $64' },
];

const STEPS = [
  { h: 'Tell us about your course', p: 'A short call about your tee sheet and how you take bookings today.' },
  { h: 'We build it', p: 'Your booking page and tee sheet, set up with your times and prices.' },
  { h: 'Go live', p: 'Add the button to your website. Golfers start booking.' },
];

export default function HomeContent() {
  return (
    <div data-home-root="" className={s.root}>
      {/* HERO — text left, the working demo right, on the plain ground. */}
      <section className={s.hero}>
        <div className={s.heroText}>
          <h1 className={s.display}><span className={s.l}>The tee sheet</span> <span className={s.l}>your course deserves.</span></h1>
          <p>GreenReserve gives your course an online booking page with your name and colors, and one tee sheet your staff run the day from.</p>
          <div className={s.cta}>
            <a className={s.btn} href={DEMO}>Book a demo <Arrow /></a>
            <Link className={s.quiet} href={INQUIRY}>Send an inquiry</Link>
          </div>
          <div className={s.trust}>Free for courses.</div>
        </div>
        <HeroDemo />
      </section>

      {/* BUILT FOR THE COURSE — three staggered rows, each with its proof. */}
      <section className={`${s.built} ${s.col}`}>
        <div className={s.builtGrid}>
          <h2 className={s.display}>Your course, your sheet, your golfers.</h2>
          <div className={s.rows}>
            <div className={s.row}>
              <div><h3>Fill the tee sheet</h3><p>Golfers book from a “Book a tee time” button on your own website.</p></div>
              <div className={s.frag} aria-hidden="true">
                <div className={s.site}><div className={s.siteBar}><b>Hollow Creek</b><span>Course</span><span>Events</span><span className={s.siteBtn}>Book a tee time</span></div><div className={s.siteBody}>Established 1962</div></div>
              </div>
            </div>
            <div className={s.row}>
              <div><h3>Run the day</h3><p>Online, phone and walk-in bookings on one sheet, so nothing is double-booked.</p></div>
              <div className={s.frag} aria-hidden="true">
                <div className={s.walk}>
                  <div><span className={s.t}>7:40</span><span>Pratt · 1</span><span className={s.tag}>Walk-up</span></div>
                  <div className={s.added}><span className={s.t}>7:40</span><span>+ Kowalski · 1</span><span className={s.tag}>Added at counter</span></div>
                  <div><span className={s.t}>7:48</span><span className={s.dim}>Open</span><span className={s.tag}>4 spots</span></div>
                </div>
              </div>
            </div>
            <div className={s.row}>
              <div><h3>Keep your brand</h3><p>Your course&apos;s name, colors and photos. Not a discount marketplace.</p></div>
              <div className={s.frag} aria-hidden="true">
                <div className={s.brands}>
                  {COURSES.map(c => (
                    <div key={c.name} className={s.bp}>
                      <div className={s.bpHead}>
                        <Image src={c.photo} alt="" fill sizes="170px" className={s.phImg} />
                        <span className={s.bpCrest} style={{ color: c.color }}>{c.crest}</span>
                        <div><b>{c.name}</b><small>{c.where}</small></div>
                      </div>
                      <div className={s.bpRow}><b>{c.t}</b><span>{c.meta}</span></div>
                      <div className={s.bpBtn} style={{ background: c.color }}>Reserve</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — on the forest band, three steps, no durations. */}
      <section className={s.setup} id="how">
        <div className={`${s.col} ${s.setupGrid}`}>
          <div>
            <h2 className={s.display}>From first call<br />to first tee time.</h2>
            <p className={s.lead}>We set it up with you, around how your course already runs.</p>
          </div>
          <ol className={s.steps}>
            {STEPS.map(st => (
              <li key={st.h}><h3>{st.h}</h3><p>{st.p}</p></li>
            ))}
          </ol>
        </div>
      </section>

      {/* PRICE — one line; the details are for the call (LQ-2). */}
      <section className={`${s.col} ${s.priceLine}`} id="pricing">
        <h2 className={s.display}>Free for courses.</h2>
        <p>No setup fee and no monthly fee. Golfers pay a small booking fee when they book online. We&apos;ll walk you through the details on a call.</p>
      </section>

      {/* SEE IT WORK — the preview before booking a demo (Cam 2026-10-01). */}
      <section className={s.see} id="see">
        <div className={s.col}>
          <h2 className={s.display}>Book a time. Watch it land on the sheet.</h2>
          <p className={s.lead}>This is how it works, not a picture of it. Pick a time as a golfer, then flip to the sheet your shop runs. Try your course&apos;s color.</p>
          <SeeItWorkDemo />
          <div className={s.seeCta}>
            <a className={s.btn} href={DEMO}>Book a demo <Arrow /></a>
            <span>We&apos;ll show it with your own course&apos;s times and prices.</span>
          </div>
        </div>
      </section>

      {/* FAQ — the same array as the FAQPage JSON-LD in page.tsx; every answer printed. Last before the end band (Cam 2026-10-01). */}
      <section className={`${s.col} ${s.faqWrap}`} id="faq">
        <h2 className={s.display}>What courses ask us.</h2>
        <div className={s.faq}>
          {HOME_FAQ.map(f => <div key={f.q}><h3>{f.q}</h3><p>{f.a}</p></div>)}
        </div>
      </section>

      {/* END */}
      <section className={s.end}>
        <div className={`${s.col} ${s.endIn}`}>
          <div><h2 className={s.display}>See it with your course&apos;s tee sheet.</h2><span className={s.mail}>Or email thegreenreserve@outlook.com</span></div>
          <div className={s.cta}>
            <a className={`${s.btn} ${s.light}`} href={DEMO}>Book a demo <Arrow /></a>
            <Link className={`${s.quiet} ${s.onDark}`} href={INQUIRY}>Send an inquiry</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
