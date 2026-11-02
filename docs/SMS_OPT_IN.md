# Text messages — Twilio A2P 10DLC opt-in

Cam 2026-11-02: "make sure to remember this is from twilio." These are Twilio's
requirements for registering GreenReserve's US texting campaign (A2P 10DLC). Carriers
review the campaign's **Message Flow** against them; a campaign whose opt-in doesn't
meet them is rejected, and texts from an unregistered number are blocked. Every
place that collects a phone number we text must meet the matching list below.

## Twilio's requirements (as given)

### Verbal opt-in (staff taking a phone or walk-in booking)
- Clear description of the service and message content
- Frequency of messages (e.g. "two messages per month")
- Standard message and data rates disclaimer
- Instructions for getting help (reply HELP)
- Instructions for opting out (reply STOP to opt out)
- Links to Terms of Service and Privacy Policy
- Clear request for explicit consent ("yes" or "no")
- Confirmation of enrollment

### Web form opt-in (e.g. the booking form)
- Phone number input field
- Checkbox for consent — **must NOT be pre-selected**
- Clear description of what type of messages they'll receive
- Message frequency information
- Standard disclaimers about message and data rates
- HELP and STOP instructions
- Links to Terms of Service and Privacy Policy
- Submit button with clear language (e.g. "Yes, sign me up!")

### Important notes
1. The checkbox must be actively selected by the user, not pre-checked.
2. If the web opt-in is behind a login or not yet published, host a screenshot on a
   publicly accessible website (OneDrive, Google Drive) and give that URL in the
   campaign's **Message Flow** field.

## What we text today (2026-11-02)

All sending goes through `sendSms()` in `src/lib/twilio.ts`. Every text is
transactional (about the golfer's own booking or purchase); none is marketing.

| Text | Sent from | Who gave the number |
|---|---|---|
| Check in & pay link for a tee time | `api/operator/bookings` (`send_pay_link`, `via: 'sms'`) | Golfer online (booking form) or staff (phone/walk-in) |
| Pro shop pay link and receipt | `api/operator/shop-sales` | Staff at the register |
| Event pay link | `api/operator/events/[id]/payments` | Organizer / player sign-up, or staff |
| Course notices to golfers on a day (weather, conditions) | `lib/golfer-messages.ts` | Booking phone numbers |

Every text already ends "Reply STOP to opt out" (golfer messages) or carries the
course name; Terms §6 and Privacy §3 describe texts, frequency ("varies"), rates,
STOP and HELP.

## Gaps against the requirements

1. **Booking form (`src/app/book/BookClient.tsx`, phone field ~line 749):** no consent
   checkbox. Consent is bundled into Terms §6 ("By booking … you agree to receive …
   text messages"), which Twilio does not accept as opt-in. Needs: an unticked
   checkbox beside the phone field, the message types, frequency, rates, HELP/STOP,
   Terms + Privacy links; texts only to bookings that ticked it.
2. **Event sign-up (`src/app/events/[id]/SignupForm.tsx`):** same — phone collected, no
   checkbox.
3. **Counter / phone bookings and the register:** staff type the number in; there's
   no verbal script or a "they said yes" record. Needs: the verbal script shown at the
   phone field, a consent tick staff set only after the golfer says yes, and an
   enrollment confirmation text.
4. **Consent record:** nothing stores who agreed, when, how (web / verbal) and to what
   wording. Needs a per-phone consent row so `sendSms()` refuses a number without one,
   and a STOP reply (Twilio's opt-out webhook) clears it.
5. **Frequency wording:** "varies" — Twilio asks for a figure. Proposed: "up to 4
   messages per booking".
6. **Message Flow screenshot:** the booking form is public once a course is live, so
   its URL can go in the Message Flow field; the staff (verbal) flow is behind a login
   and needs a public screenshot (note 2).

## Decided (Cam 2026-11-02)
- Build the full compliant opt-in next: unticked consent checkbox with the required
  wording on the booking and event sign-up forms; a verbal script plus a "they said
  yes" tick for staff-entered numbers; a per-phone consent record `sendSms()` checks;
  STOP/HELP handling; an enrollment confirmation text.
- Frequency wording: **"up to 4 messages per booking"** (confirmation, pay link, a
  day-of notice, a receipt) — Terms §6 and Privacy §3 change from "varies" to this.

Twilio setup itself (account, number, campaign registration) is still on Cam's list.

## Built (SMS-1, 2026-11-02)
- **Record:** `SmsConsent` (append-only; the latest row per phone decides) — `src/lib/sms-consent.ts`
  (`recordSmsConsent`, `hasSmsConsent`, `consentedPhones`, `optInAndConfirm`). Wording and its version:
  `src/lib/sms-consent-copy.ts` (`SMS_CONSENT_VERSION`; change a sentence → bump it).
- **Gate:** `sendSms()` refuses a number whose latest row isn't `opt_in` (`SmsNoConsentError`, logged as
  skipped). Twilio's 21610 (the number replied STOP) records an opt-out. Sign-in codes (`sendSmsOtp`) are
  not gated — the person asked for the code.
- **Web:** an unticked box under the phone field on the booking form and (for the person signing up only)
  the event sign-up; the routes record `web_booking` / `web_event` only on an explicit `true`.
- **Verbal:** `SmsConsentAsk` shows the script and a "They said yes to texts" tick — walk-in / phone
  booking form, the register's text pay link, event pay links; the tee sheet's Text pay link asks in a
  dialog when the number never agreed. Routes record `verbal` with the staff login (`recordedBy`).
- **Replies:** `/api/twilio/inbound` (Twilio-signed): STOP family → opt-out, START/UNSTOP/YES → opt-in +
  confirmation, HELP/INFO → the help text.
- **Course notices** text only numbers that agreed (preview counts too).
- **Terms §6 / Privacy §3** (v2026-11-02): texts only with that agreement, up to 4 messages per booking.

### Twilio console (Cam)
- Messaging → the number (or Messaging Service) → "A message comes in": `https://greenreserve.app/api/twilio/inbound`, POST.
- Campaign Message Flow: the booking page URL of a live course (the box is visible once a phone number is typed);
  for the staff flow, a public screenshot of the walk-in form with the script showing.
