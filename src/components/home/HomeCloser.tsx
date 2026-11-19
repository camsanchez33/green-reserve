import CalEmbed from './CalEmbed';
import ContactDialog from './ContactDialog';
import { calcomBookingUrl } from '@/lib/calcom';
import s from '@/app/home.module.css';

// The shared bottom block (homepage mockup "Book a call" / "Contact us"), on Home and every feature page.
// Book a call is Cal.com's inline calendar (CalEmbed) when CALCOM_BOOKING_URL is set; with it off or unusable,
// a Book a call button to /demo, which sends the course to the inquiry form. Contact us opens the question
// form as a pop-up (ContactDialog), which lands in admin Inquiries.
export default function HomeCloser() {
  const bookingUrl = calcomBookingUrl();
  return (
    <section className={s.closer} id="demo" aria-labelledby="closerH">
      <div className={bookingUrl ? `${s.wrap} ${s.closerIn} ${s.closerCal}` : `${s.wrap} ${s.closerIn}`}>
        <div>
          <h2 id="closerH" className={s.display}>Book a call.</h2>
          <p>Pick a time and we&apos;ll walk through GreenReserve with your own times, rates and members.</p>
        </div>
        <div>
          {bookingUrl ? <CalEmbed bookingUrl={bookingUrl} /> : <a className={s.btn} href="/demo">Book a call</a>}
          <div className={s.contactRow}>
            <span>Have a question first?</span>
            <ContactDialog />
          </div>
        </div>
      </div>
    </section>
  );
}
