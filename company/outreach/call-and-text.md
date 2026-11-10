# Phone opener, voicemail — and why there is no cold text

## Cold outreach is email and phone only. Never text.

GreenReserve texts a number **only after that person said yes to texts** — an unticked box they ticked
on a booking or event form, or a spoken yes that staff recorded after reading the consent script
(`docs/SMS_OPT_IN.md`; `sendSms()` refuses anyone else). That rule is the basis of our Twilio A2P 10DLC
registration: carriers check it, and a business number caught sending unsolicited texts can be
blocked — which would break pay links and receipts for every course on the platform.

A course manager has said yes to nothing. So:

- **No texts to a course** in the cold sequence, from any phone — not the GreenReserve number, not
  Cam's own. A cell number on a course's website is not consent.
- If a manager **asks** to be texted ("text me a time"), that is a yes for that one conversation. Note
  who asked and when; stop the moment they say stop.
- The pay-link texts shown in the demo go to golfers who opted in on the booking form — say so if asked.

## The 60-second opener

Call the pro shop line the day after email 1, mid-morning. Ask for the person who runs the tee sheet
(manager, head pro, or golf director). Say it standing up; read it until it sounds like you.

> Hi, is this {name / "the person who runs the tee sheet"}? This is Cam — I'm the founder of
> GreenReserve. I sent you an email yesterday; I'll be quick.
>
> We built an online booking page and tee sheet for public courses. Your course gets its own booking
> page in its own name and colors, and one sheet at the counter for online, phone and walk-ins. Golfers
> pay with one card payment straight to your course's own Stripe account.
>
> No setup fee, no monthly fee, no commission on your green fees. Golfers pay $1.50 per player on each
> online booking, added to your price.
>
> I'm setting up a few courses in the Hudson Valley first, and I do the setup myself.
>
> Can I ask — how do golfers book with you today?
>
> *(Listen. Then:)* Would it be worth a short demo, so you can see it on a real tee sheet? I can send a
> link to pick a time, or we can pick one now.

Why it ends on a question: the opener earns ~30 seconds; the question ("how do golfers book today")
is where the call actually starts. Their answer tells you which objection is coming
(see `objections.md`).

If the answer is "we're closed for the season" — that's the opening: "That's exactly why I'm calling
now — winter is when it's easy to set up, so you open in the spring on it."

If they ask you to call back: get a day and a name, write it down, and call exactly then.

## Voicemail (about 20 seconds)

> Hi, this is Cam from GreenReserve, for whoever runs the tee sheet at {Course}. We make an
> online booking page and tee sheet for public courses — no setup fee, no monthly fee, no commission on
> your green fees. I sent an email with the details. You can reach me at 845-499-3515, or at
> admin@greenreserve.app. Again, Cam, 845-499-3515. Thanks.

One voicemail per course. If there is no callback, email 2 does the rest.
