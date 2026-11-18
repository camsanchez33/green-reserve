# GreenReserve — how the company is organized

Started 2026-11-18 at Cam's request ("reorganize everything that is part of GreenReserve into a very organized
system: files, accounts on the admin@greenreserve.app mailbox, expenses tracked, taxes"). This file holds NO secrets,
passwords, keys or account numbers, only names, purposes and where things live. Secret values stay in Vercel,
GitHub Actions secrets and Cam's password manager (see `docs/RUNBOOK.md` → "Secrets Inventory").

Anything marked **Ask your accountant** or **Ask your attorney** is a judgement this file does not make.

---

## 1. Outside services (inventory from the repo, 2026-11-18)

Rule: every service is owned by **admin@greenreserve.app** (Google Workspace), with Cam's personal login added as a
second owner or admin where the service allows it, so no account is locked behind one inbox. Bills go to the
**business card** once the business bank account exists (E-3 in `legal/LEGAL_REGISTER.md`). Until then, note in
admin → Expenses which card pays each one.

| Service | Used for | Env var names (values never here) | Owner email should be | Bill goes to | Cam to check |
|---|---|---|---|---|---|
| Vercel | Hosting, production and preview deploys, the 6 crons in `vercel.json`, Blob file storage | `NEXT_PUBLIC_URL`, `VERCEL_ENV`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, `BLOB_PRIVATE_READ_WRITE_TOKEN` | admin@ | Business card | [ ] Owner email · [ ] plan · [ ] **Preview deploys failing since Nov 17, check the build log** |
| Neon | Postgres database (production, plus branches for staging and dev) | `DATABASE_URL`, `DIRECT_URL`, `SHADOW_DATABASE_URL` (local), `BACKUP_DATABASE_URL` (GitHub secret) | admin@ | Business card | [ ] Owner email · [ ] plan and storage limit · [ ] point-in-time restore on |
| Stripe | Payments and Connect (courses' Express accounts, direct charges), Apple Pay and Google Pay | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | admin@ | Fees are netted from charges, so there's no bill | [ ] **Account is in Cam's personal name; move to the entity (E-6)** · [ ] payout bank account · [ ] Apple Pay domain greenreserve.app verified |
| Resend | Transactional email (confirmations, receipts, codes, reminders) | `RESEND_API_KEY` | admin@ | Business card | [ ] Owner email · [ ] domain greenreserve.app verified (SPF, DKIM, DMARC) |
| Twilio | SMS: staff second factor, golfer texts (only to numbers that agreed), A2P 10DLC registration | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | admin@ | Business card | [ ] Owner email · [ ] A2P brand and campaign approved · [ ] brand registered to the entity once formed |
| Google Workspace | admin@greenreserve.app mailbox, outreach Gmail (`lanes/outreach.md`), Drive, Calendar | (none in the app yet; outreach links Gmail later) | admin@ is the account | Business card | [ ] Every alias you use · [ ] 2-step verification on · [ ] recovery email and phone |
| Cal.com | Demo and onboarding call booking, read by admin → Inquiries | `CALCOM_BOOKING_URL`, `CALCOM_WEBHOOK_SECRET` | admin@ | Business card (if paid) | [ ] Owner email · [ ] calendar connected to admin@ |
| Anthropic API | Birdie (the AI assistant), the AI monthly review, the security checker, the morning digest | `ANTHROPIC_API_KEY`, `BIRDIE_ENABLED` | admin@ | Business card | [ ] **Key set in Vercel production** · [ ] spend limit set |
| Sentry | Error reporting and uptime | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_READ_TOKEN` | admin@ | Business card (if paid) | [ ] Owner email · [ ] uptime monitor on /api/health |
| GitHub | Code (`camsanchez33/green-reserve`), CI, nightly database backups (Actions artifacts) | `GITHUB_STATUS_TOKEN`, Actions secrets `BACKUP_DATABASE_URL`, `BACKUP_PASSPHRASE` | Cam's GitHub, with admin@ as its email | Business card (if paid) | [ ] 2-factor on · [ ] consider a GitHub organization owned by the entity later |
| Domain registrar and DNS | greenreserve.app (web, email records for Resend and Workspace) | (none) | admin@ | Business card (annual renewal) | [ ] **Which registrar? Write it here** · [ ] auto-renew on · [ ] registrar lock on |
| Anthropic Claude (the build sessions) | Building the product | (none) | Cam's account | Business card | [ ] Note the plan in Expenses |
| Password manager | Holds every login, recovery code and `BACKUP_PASSPHRASE` | (none) | admin@ (or Cam's personal, with emergency access) | Business card | [ ] **Which one? Write it here** · [ ] emergency access for a trusted person |

Admin-only app settings that aren't outside services but are listed in the runbook: `JWT_SECRET`, `ADMIN_SECRET`
and `ADMIN_TOKEN`. They're generated values, not accounts.

**Moving a service onto admin@greenreserve.app:** sign in with the current owner, add admin@ as owner or admin,
confirm the invite from admin@, then remove or demote the personal email. Do one service at a time and tick it off
above. Never paste a key into chat or email while doing it.

---

## 2. Where files live

### 2a. The repo (code and product documents)

| Folder | What goes there |
|---|---|
| `CLAUDE.md`, `LANES.md` | Rules every session reads. Keep them short. |
| `lanes/` | One file per lane (build, dashboard, admin, golfer, homepage, outreach, security, testing), each with its approved mockups in `lanes/<lane>/`. This is the current work. |
| `docs/DECISIONS.md` | Every product decision, by ID and date, verbatim. The history of record. |
| `docs/RUNBOOK.md`, `docs/SHIPPING.md`, `docs/RESTORE.md`, `docs/RELEASES.md` (coming) | How to run, ship, restore and release. |
| `legal/` | The legal register, queue, fee wording (`LQ-2_FEE_COPY.md`) and published agreements under `legal/documents/`. **Never edit a published agreement file; add a new version.** |
| `company/` | Company operations: this file, `company/outreach/` (emails, scripts, course list). Add `company/finance/` for non-secret finance notes only. |
| `AUDIT_MASTER.md` | Private and gitignored. Never committed. |

**Archive proposal.** The repo root has about 50 old `*_SPEC.md` files and a few stray files from earlier phases.
Many are superseded by `lanes/` and `docs/DECISIONS.md`, but CLAUDE.md, lane files and DECISIONS entries cite some
of them (for example `HOMEPAGE_SPEC.md`, `LAUNCH_PLAN_SPEC.md`, `ADMIN_REDO_SPEC.md`). Move only the ones nothing
cites into `docs/archive/`, in one PR after launch, with a grep check that no file links to a moved path. The stray
files to remove or move are two `.whl` files, logo PNGs at the root (they belong in `public/` or Drive → Brand),
`test-email.js` and `start.bat`. Nothing is moved by this PR.

### 2b. Cam's Google Drive (on admin@greenreserve.app)

```
GreenReserve/
  01 Company/        formation papers, EIN letter, operating agreement, registered agent, annual reports
  02 Legal/          signed course agreements (exported), terms and privacy versions, attorney letters, trademark
  03 Finance/
     Bank statements/ YYYY/
     Receipts/        YYYY/YYYY-MM/   (one PDF per expense, named YYYY-MM-DD vendor amount.pdf)
     Stripe reports/  YYYY/           (monthly balance and payout reports, Connect fee reports)
  04 Taxes/          YYYY/  (return, 1099s received and sent, sales tax filings if any, accountant notes)
  05 Insurance/      policies, certificates of insurance sent to courses
  06 Courses/        one folder per signed course: onboarding notes, their signed agreement copy, contacts
  07 Outreach/       course lists, call notes exports (the pipeline itself lives in admin → Inquiries)
  08 Product/        screenshots, demo recordings, release notes per GRV version
  09 Brand/          logos (all sizes), fonts licences, colours, photos with licences
```

**Mapping to admin → Company docs** (owner only, private storage). Drive is the working archive; admin Company
docs holds the few documents you need to pull up fast. Use the six built-in labels like this:

| Company docs label | Drive folder | What to upload there |
|---|---|---|
| Formation | 01 Company | Certificate of formation, EIN letter, operating agreement |
| Tax | 04 Taxes | The current year's filed returns and the accountant's letter |
| Banking | 03 Finance | The bank account letter and Stripe verification documents |
| Insurance | 05 Insurance | Current policies |
| Contracts | 02 Legal | Signed vendor contracts. Course agreements are in Platform activity → Agreement versions, not here. |
| Other | — | Anything that doesn't fit; make a custom label once three things share a theme |

---

## 3. Expenses and taxes

### 3a. Admin → Expenses, every month

1. **First business day of the month:** open admin → Expenses. Every recurring service from §1 should be a row with
   its cadence (monthly, annual, one-time) and category. Today's categories are infra, tools, legal and other: Vercel,
   Neon, Resend, Twilio and Sentry are infra; Anthropic, Cal.com, Workspace, GitHub and the password manager are tools;
   attorney, filing and registered agent are legal; domain and insurance are other.
2. **Check each against the card statement.** A price change is a new amount from that month, not an edit to the old
   one, so history stays true. A cancelled service gets an end date, not a delete.
3. **Check the pace line.** Red means known costs are already over the monthly budget; decide there and then.
4. **Receipts rule:** every charge has a PDF in Drive → 03 Finance → Receipts → YYYY → YYYY-MM within 7 days, named
   `YYYY-MM-DD vendor amount.pdf`. Most services email receipts to admin@, so one Gmail filter that labels them
   "Receipts" makes this a 5-minute job.
5. **Revenue side:** download Stripe's monthly balance and payout reports into Drive → 03 Finance → Stripe reports.
   Admin → Revenue and Financial analytics are for running the business; Stripe's reports are what the accountant uses.

### 3b. Checklist to take to the accountant (all **Ask your accountant**)

- [ ] **Entity.** No entity exists yet (E-1 OPEN, `legal/ENTITY_BRIEF.md` recommends a New Jersey LLC). Confirm the
      entity type, the tax election (default single-member LLC vs S-corp later), and the date to form, before the
      first live course. **Also Ask your attorney.**
- [ ] **EIN** right after formation (E-2), then the **business bank account** (E-3) and **business card**, and move
      Stripe to the entity (E-6).
- [ ] **Nexus.** Operating from school in South Carolina with a New Jersey entity: which states can tax the income.
- [ ] **Sales tax on GreenReserve's own fees.** The $1.50 per player booking fee, the 1% membership fee and the 1%
      pro-shop fee (from Agreement v2026-12): are they taxable services in the states where courses and golfers are?
      Courses' own sales tax on green fees and shop items is the course's, collected on their Stripe account.
- [ ] **Stripe Connect reporting.** Courses are the merchants of record on their own Express accounts. Confirm who
      receives which 1099-K, and that GreenReserve's income is the application fees only.
- [ ] **1099-NEC** for any contractor paid $600 or more in a year (designers, developers, sales help).
- [ ] **Deductible costs.** Hosting, software, AI usage, legal, filing fees, equipment, home office, mileage to
      course visits: what records each needs.
- [ ] **Estimated taxes.** Whether to pay quarterly once revenue starts, and how much to set aside each month.
- [ ] **Books.** Whether admin → Expenses plus Drive receipts is enough at the start, or a bookkeeping tool
      (QuickBooks, Wave or similar) linked to the business bank from day one.
- [ ] **Year-end package.** What the accountant wants each January: Stripe annual reports, bank statements, the
      Expenses export, 1099s.

---

## 4. Order to do it in

1. Form the entity, get the EIN, open the business bank account and card (before the first live course).
2. Write the registrar and password manager names into §1, and move every service onto admin@ one at a time.
3. Set up the Drive folders in §2b and the Gmail "Receipts" filter.
4. Put every service in §1 into admin → Expenses with its real amount and cadence.
5. Book one call with an accountant using §3b.
