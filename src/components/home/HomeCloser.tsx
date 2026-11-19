import Link from 'next/link';
import s from '@/app/home.module.css';

// The shared bottom block (homepage mockup "Book a call" / "Contact us"), on Home and every feature page.
// This first cut links out: Book a call opens the existing /demo redirect (Cal.com, tagged source=homepage,
// or the inquiry form when Cal.com is off) and Contact us goes to /contact. The inline Cal.com calendar and
// the Contact us pop-up replace those two links in their own PRs.
export default function HomeCloser() {
  return (
    <section className={s.closer} id="demo" aria-labelledby="closerH">
      <div className={`${s.wrap} ${s.closerIn}`}>
        <div>
          <h2 id="closerH" className={s.display}>Book a call.</h2>
          <p>Pick a time and we&apos;ll walk through GreenReserve with your own times, rates and members.</p>
        </div>
        <div>
          <a className={s.btn} href="/demo">Book a call</a>
          <div className={s.contactRow}>
            <span>Have a question first?</span>
            <Link className={`${s.btn} ${s.ghost}`} href="/contact">Contact us</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
