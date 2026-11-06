import type { Metadata } from 'next';
import { previewFor } from '@/lib/seo';
import { SUPPORT_EMAIL } from '@/lib/contact';
import { smsWebConsentText, SMS_CONFIRMATION, SMS_HELP } from '@/lib/sms-consent-copy';
import { CARD } from '@/components/ui/Card';

// SMS-1 (Cam 2026-11-06, Twilio A2P review): Twilio's checker couldn't reach the consent box, because it
// shows on the booking form only after a golfer picks a tee time. This public page shows the same box with
// the same words (from lib/sms-consent-copy, so it can't drift), how it's used, and the screenshot.
export const metadata: Metadata = {
  title: 'Text message consent',
  description: 'How golfers agree to text messages from GreenReserve when they book a tee time.',
  ...previewFor('Text message consent | GreenReserve', 'How golfers agree to text messages from GreenReserve when they book a tee time.'),
};

export default function SmsConsentPage() {
  return (
    <div className="bg-paper min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-16 flex flex-col gap-8">
        <div>
          <h1 className="font-serif text-[34px] leading-tight text-ink">Text message consent</h1>
          <p className="mt-3 text-[15px] text-ink-soft leading-relaxed">
            Golfers agree to text messages from GreenReserve on the booking form when they book a tee time online.
            They type their mobile number and tick this box. It starts unticked, and booking works without it.
          </p>
        </div>

        <section aria-labelledby="box" className={`${CARD} p-6 flex flex-col gap-3`}>
          <h2 id="box" className="text-[15px] font-semibold text-ink">The checkbox on the booking form</h2>
          <label className="flex items-start gap-3 text-[14px] text-ink-soft leading-relaxed">
            <input type="checkbox" disabled aria-label="Agree to text messages (example)" className="mt-1 w-4 h-4 shrink-0" />
            <span>
              {smsWebConsentText('[Course Name]')} <a href="/terms" className="underline">Terms</a> · <a href="/privacy" className="underline">Privacy</a>. Optional — you can book without it.
            </span>
          </label>
        </section>

        <section className="flex flex-col gap-3 text-[14.5px] text-ink-soft leading-relaxed">
          <h2 className="text-[15px] font-semibold text-ink">What golfers receive</h2>
          <p>Texts about their own booking only: a link to check in and pay, a day-of notice from the course (such as a weather delay), and a receipt. Up to 4 messages per booking. No marketing.</p>
          <p><span className="font-medium text-ink">After opting in:</span> “{SMS_CONFIRMATION}”</p>
          <p><span className="font-medium text-ink">Reply HELP:</span> “{SMS_HELP}”</p>
          <p><span className="font-medium text-ink">Reply STOP:</span> the number is unsubscribed at once and gets no more texts. Reply START to opt back in.</p>
          <p>Msg &amp; data rates may apply. Questions: {SUPPORT_EMAIL}. See the <a href="/terms" className="underline text-ink">Terms of Service</a> (SMS Terms) and the <a href="/privacy" className="underline text-ink">Privacy Policy</a>. We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes.</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-ink">Screenshot of the booking form</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sms-opt-in.png" alt="The GreenReserve booking form, with the unticked text message checkbox and its wording" width={488} height={842} loading="lazy" className="w-full max-w-[488px] h-auto rounded-lg shadow-card" />
        </section>
      </div>
    </div>
  );
}
