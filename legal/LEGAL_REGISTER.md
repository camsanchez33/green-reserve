# GreenReserve — Legal Obligation Register

Last reviewed: 2026-09-02. Owner: Cam (sole).
`⚖️` = needs a licensed attorney before it can be closed.

Status: **OPEN** (obligation exists, unmet) · **MET** · **N/A NOW** (threshold
not reached — carries a revisit trigger) · **WATCH** (no action, monitor)

---

## 1 — Entity & corporate

| # | Obligation | Status | Trigger / note |
|---|---|---|---|
| E-1 | Form the operating entity | **OPEN** | Gates everything below. See `ENTITY_BRIEF.md`. Until formed, Cam is personally the counterparty on every contract |
| E-2 | EIN from IRS | **OPEN** | Free, same-day online, after formation. Needed for the business bank account |
| E-3 | Dedicated business bank account | **OPEN** | Commingling personal and business funds is the most common way an LLC's liability shield is pierced |
| E-4 | Registered agent | **OPEN** | Can be Cam at a NJ address; cannot be a dorm in another state |
| E-5 | Single-member operating agreement | **OPEN** | Not filed with the state, but banks ask for it and it reinforces separateness |
| E-6 | Move Stripe account to the entity | **OPEN** | Stripe account is currently in a person's name. Update after E-1/E-2 |
| E-7 | Annual report / franchise filings | **N/A NOW** | Starts the year after formation. Calendar it at formation |
| E-8 | Foreign qualification in states where courses operate | **WATCH** | ⚖️ Merely having customers is usually not enough; having staff or an office is. Revisit at first out-of-state course |
| E-9 | General liability + tech E&O insurance | **OPEN** | The Operator Agreement at §4 has GreenReserve indemnifying courses for platform defects. That promise is uninsured today |

## 2 — Intellectual property

| # | Obligation | Status | Trigger / note |
|---|---|---|---|
| IP-1 | USPTO clearance search on "GreenReserve" | **OPEN** | Do this *before* spending more on brand. Class 042 (SaaS) and 043 (reservation services) |
| IP-2 | Trademark application | **N/A NOW** | ⚖️ Sequence after IP-1 and E-1 — file in the entity's name, not Cam's |
| IP-3 | greenreserve.app registration + lock | **MET?** | Verify auto-renew, registrar lock, and that it is not registered to a school email |
| IP-4 | Course logos and photos — right to display | **OPEN** | Operator Agreement grants a white-label promise but does not contain an express license *from* the course to display their marks. Add one clause |
| IP-5 | Third-party OSS license compliance | **WATCH** | Next.js/Prisma/Stripe stack is permissive. Re-check if anything AGPL enters `package.json` |

## 3 — Platform documents

| # | Obligation | Status | Trigger / note |
|---|---|---|---|
| PD-1 | Terms of Service | **OPEN** | Exists, v2026-08. Defects L-1, L-2, L-6 in `FINDINGS_2026-09-02.md` (L-6 downgraded on verification) |
| PD-2 | Privacy Policy | **OPEN** | Exists, v2026-08. Defects L-2, L-5 |
| PD-3 | Operator Agreement | **OPEN** | Exists, v2026-08. Defects L-1, L-2, L-3, L-4, L-7 |
| PD-4 | Marketing copy consistent with contracts | **OPEN** | `HomeContent.tsx`, `ForCoursesContent.tsx`, `Footer.tsx` all make fee claims. Audited on the same pass as PD-1..3 |
| PD-5 | Attorney review of all three before scale | **OPEN** | ⚖️ Trigger: 10 live courses or $250k annual routed volume |
| PD-6 | Cookie policy / consent banner | **N/A NOW** | No third-party tracking exists. Becomes required the day GA, a pixel, or session replay is added |
| PD-7 | DMCA agent registration | **N/A NOW** | Only if golfers or courses can post free-text content publicly |

## 4 — Payments & money

| # | Obligation | Status | Trigger / note |
|---|---|---|---|
| PM-1 | Stay out of money transmission | **MET** | Direct charges, connected account is merchant of record, no custody of course funds. **Protect this** — see `README.md` escalation #5 |
| PM-2 | PCI DSS scope | **MET** | SAQ-A posture: Stripe Elements, tokens only, no PAN touches GreenReserve |
| PM-3 | Off-session (card-on-file) mandate disclosure | **MET** | `usage: 'off_session'` + matching `/terms` authorization language |
| PM-4 | Fee disclosure matches actual money flow | **OPEN** | 🔴 L-1 and 🟠 L-4. Highest-value item in this register |
| PM-5 | Refund mechanics match the contract | **OPEN** | 🔴 L-3 — `refund_application_fee` not set |
| PM-6 | Sales / amusement tax on the service fee | **OPEN** | ⚖️ Unexamined. Some states tax "admissions and amusements," some tax SaaS. NJ and SC both need a read before volume builds |
| PM-7 | Income tax + Schedule C / entity return | **WATCH** | Cam works at a financial advising firm — this is the one area with in-house intuition. Still a CPA question at first real revenue |
| PM-8 | 1099-K awareness for courses | **MET** | Stripe issues these to connected accounts directly. Nothing for GreenReserve to do |

## 5 — Communications & consumer protection

| # | Obligation | Status | Trigger / note |
|---|---|---|---|
| CC-1 | TCPA consent capture with an audit trail | **OPEN** | 🟠 L-5. Consent is currently implied by a policy page |
| CC-2 | TCPA revocation honored by any reasonable means ≤10 business days | **OPEN** | 🟠 L-5. No revocation field in the schema; Twilio keyword handling only |
| CC-3 | `STOP` / `HELP` handling under GreenReserve's own control | **OPEN** | Do not rely solely on carrier/Twilio defaults |
| CC-4 | No marketing SMS without separate express opt-in | **MET (policy)** | Written commitment in all three documents. Keep it — it is the thing keeping CC-1 defensible |
| CC-5 | CAN-SPAM: unsubscribe in commercial email | **PARTIAL** | Tee-time alert emails have an unsubscribe token (`api/alerts/unsubscribe`). Transactional email is exempt. Verify no email sits in between |
| CC-6 | Truth in advertising (FTC Act §5, NJ CFA) | **OPEN** | 🔴 L-1 — "keeps 100%" / "never touches your Stripe account" are the exposed claims |
| CC-7 | Automatic-renewal disclosure laws | **N/A NOW** | Applies if course subscriptions or golfer memberships ever auto-renew on a card |

## 6 — Privacy & data

| # | Obligation | Status | Trigger / note |
|---|---|---|---|
| DP-1 | State comprehensive privacy laws (CA, VA, CO, TX, NE, NJ, +14) | **N/A NOW** | Thresholds ~100k consumers or ~$25M revenue; TX/NE have no volume threshold but exempt SBA small businesses. **Revisit at 50k golfer records or $10M revenue** |
| DP-2 | Honor access/deletion requests as promised | **OPEN** | `/privacy` promises both. No implementation found — it is a manual email process with no runbook |
| DP-3 | Written data-retention schedule | **OPEN** | `/privacy` and the Operator Agreement both promise deletion within 30 days of request. Nothing enforces or logs it |
| DP-4 | Breach notification readiness | **OPEN** | All 50 states have breach laws with no size threshold. Needs a one-page runbook, not a program |
| DP-5 | Sub-processor list kept current | **PARTIAL** | Stripe, Resend, Twilio, Neon, Vercel, Sentry named across docs. Sentry is **not** disclosed in `/privacy` and it captures request data |
| DP-6 | GDPR / UK | **N/A NOW** | US-only courses, US-only golfers. Revisit only if a non-US course onboards |
| DP-7 | Member data scoped per course | **MET** | Per-course OTP against `CourseMembership`, never `GolferAccount`. Matches what `/privacy` promises |

## 7 — Accessibility

| # | Obligation | Status | Trigger / note |
|---|---|---|---|
| AX-1 | WCAG 2.1 AA on golfer-facing pages | **OPEN** | ⚖️ ADA Title III web claims are a high-volume plaintiff area and a public booking site is squarely in it. `ADMIN_V4_SPEC.md:329-333` already documents missing accessible names and focus-visible gaps |
| AX-2 | Accessibility statement page | **N/A NOW** | Sequence after AX-1; a statement without the work is an admission |

## 8 — Inbound contracts

| # | Obligation | Status | Trigger / note |
|---|---|---|---|
| IC-1 | Never sign a counterparty's paper without review | **OPEN** | ⚖️ README escalation #3. This is a rule, not a task |
| IC-2 | Vendor terms actually accepted | **WATCH** | Stripe, Twilio, Resend, Vercel, Neon, Sentry ToS all bind GreenReserve today. Know what they say about liability caps and data |
| IC-3 | Course-specific side agreements | **N/A NOW** | The moment a course asks to change the Operator Agreement, it stops being a form and starts being negotiation |
