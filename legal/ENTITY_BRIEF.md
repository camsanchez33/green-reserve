# Entity Formation Brief

Status as of 2026-09-02: **no entity exists.** This is the gating item.
Not legal advice — a decision brief to take to a filing service or an attorney.

## What "no entity" actually costs you right now

Every Operator Agreement is a contract between a golf course and **Cam Sanchez,
individually**. Every late-cancellation fee charged to a golfer's card is
charged under your personal authority. The §4 indemnity in the Operator
Agreement — where GreenReserve indemnifies the course for platform defects — is
a personal promise backed by personal assets. There is no cap on that other
than the liability clause, which a court may or may not enforce.

That risk is small today because no course is live. It becomes real the day one
is. **Form before the first live course, not after.**

## Where to form

**New Jersey** is the answer unless something changes.

- Your `/terms` and Operator Agreement already name New Jersey governing law
  and venue. Forming elsewhere creates a mismatch you would have to explain.
- You are a New Jersey resident. Home-state formation avoids paying twice —
  formation in state X plus foreign qualification in your home state.
- Registered agent must be a real address in the formation state. A South
  Carolina dorm does not work, and does not persist past graduation.

**Not Delaware.** Delaware is for companies raising priced venture rounds with
institutional investors who expect DGCL. You would pay Delaware franchise tax
*and* NJ foreign qualification for benefits you cannot use. Revisit only if you
take outside investment.

**South Carolina** only if you intend to base the business there after school.
Given the platform's origins in NYC-metro courses, that seems unlikely — but
you know your plans better than this file does. If courses end up concentrated
in the Southeast, this is worth a second look before you file, not after.

⚖️/CPA: attending school in SC while operating a NJ LLC can raise a nexus
question. Ask a CPA once, cheaply, rather than guessing.

## The sequence

1. **Name check** — NJ Division of Revenue business name search. "TheGreenReserve
   LLC" is the working name in `RUN_QUEUE.md:951`; confirm availability and that
   it does not collide with IP-1's trademark search results. Do the USPTO
   clearance (LQ-11) *before* filing, not after — it is cheaper to change a name
   you have not filed.
2. **File the Certificate of Formation** — NJ, online. Public-record filing.
3. **Registered agent** — you, at a New Jersey address you will still have in
   three years. Not a dorm.
4. **EIN** — IRS online, free, issued immediately. Never pay a service for this.
5. **Operating agreement** — single-member. Not filed with the state; the bank
   will ask for it and it reinforces that the entity is separate from you.
6. **Business bank account** — separate from personal, always. Commingling funds
   is the most common way a single-member LLC's liability shield gets pierced,
   and it is entirely self-inflicted.
7. **Move Stripe to the entity** — update the account's legal entity, EIN, and
   payout bank. Do this before real volume; changing it mid-stream is friction.
8. **Update the public pages** — swap the LQ-1 sole-proprietor language for the
   real entity name and formation state. Bump `CURRENT_TERMS_VERSION`.
9. **Calendar the annual report** — NJ requires one every year. Missing it
   administratively dissolves the LLC, which quietly removes the protection you
   just paid for.

## Flagged assumptions

These are inferred, not confirmed by Cam. Correct any that are wrong before
acting:

- Cam is a New Jersey resident, attending school in South Carolina.
- Target courses are NJ / NYC-metro first.
- No outside investment is planned in the next 12 months.
- No employees or contractors are being paid today.
- The working name is "TheGreenReserve LLC."

## The fee question (decide alongside formation)

`FINDINGS_2026-09-02.md` L-1 is the decision that shapes the contracts more
than formation does: does GreenReserve's $1.50 ride on the course's charge as
an application fee (what the code does now), or become a separate charge on the
platform account (what every document says)?

The honest framing: **(A) is cheaper and truthful; (B) is a better sales pitch
and costs a second Stripe fixed fee on a $6 charge.** Do not leave it
undecided — the current state is neither, and the gap between the words and the
code is the single largest legal exposure in the product today.
