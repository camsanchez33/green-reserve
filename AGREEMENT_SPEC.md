# Agreement Spec — what a course signs when it joins, and how it is recorded

Source: Cam, 2026-09-14. "We need to really build out what we have the course sign
when joining — a lot of things need to be seen through and recorded and stored."

What exists: a checkbox on the operator's first login that logs one line — version
string + email — into the inquiry's event log (`course-timeline.ts`,
`logAgreementAccepted`, JSON packed into `InquiryStatusEvent.actorName`). No signer
name or title, no authority statement, no IP, no archived copy of the text, no PDF,
no re-acceptance when the version changes. Go-live is gated on that line
(`hasAcceptedAgreement`). The admin Documents tab reads the line back.

This spec is the **record-keeping system**. It does not write the agreement's
content. ⚖️ COUNSEL stays on the Operator Agreement, the brand-license clause and
the re-acceptance policy until an attorney reads them; a session never clears it.

Decisions (Cam, AskUserQuestion 2026-09-14):
1. **Clickwrap with a full record** — no e-sign vendor.
2. **Version change → notice + 30 days, then the dashboard prompt blocks writes.**
   The tee sheet keeps taking bookings; a live course is never taken offline over
   paperwork.
3. **Two extra grants in the same flow:** a brand license (logo, photos, name on
   their booking page; marketing use with an opt-out) and an accuracy attestation
   for the course information and pricing they submitted.

Assumptions (flagged):
- C1. Signer identity is what they type (name, title) plus the session's verified
  email. No ID check — that is what clickwrap is.
- C2. "Blocks writes" = every operator POST/PATCH except accepting the agreement
  and the tee-sheet's own check-in/booking actions. Reads never block.
- C3. Agreement text lives in the repo as versioned Markdown, rendered to the page
  and to the PDF from the same source, so the archive is a git-tracked file plus
  its hash — not a database blob of HTML.
- C4. The 30-day clock starts when the notice email is SENT, not when it is opened.
- C5. Legacy acceptances (the log lines) are migrated into the new table as-is with
  `signerName = ''`, flagged `legacy: true`; they satisfy the go-live gate exactly
  as today until the next version bump, then fall under the re-accept rule.

Constraints: AG-1 is a **schema change** (attended, additive). AG-2/AG-3 none.
Never assert an entity name on any page until the filing is stamped (legal README).

---

## Phase AG-1 — Schema, versioned documents, the record (SCHEMA CHANGE, attended)

### 1. Prisma

```prisma
/// One row per acceptance of one document version by one course. Never
/// updated after insert, never deleted — a course that leaves keeps its history.
model AgreementAcceptance {
  id            String   @id @default(cuid())
  courseId      String
  course        Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  /// 'operator_agreement' | 'brand_license' | 'accuracy_attestation'
  document      String
  version       String
  /// sha256 of the exact Markdown source rendered to the signer (see §2)
  textHash      String
  signerName    String
  signerTitle   String
  signerEmail   String
  /// "I am authorized to enter into this agreement on behalf of <course name>"
  authorityAttested Boolean @default(false)
  /// brand_license only: marketing use opt-out
  marketingOptOut   Boolean @default(false)
  ip            String   @default("")
  userAgent     String   @default("")
  /// URL of the stored PDF (Vercel Blob); set after render, may lag by seconds
  pdfUrl        String?
  /// migrated from the old timeline line — no signer, no hash
  legacy        Boolean  @default(false)
  acceptedAt    DateTime @default(now())

  @@index([courseId, document, acceptedAt])
}

/// Which version of each document is current, and since when. One row per
/// (document, version). The re-acceptance clock reads `effectiveAt`.
model AgreementVersion {
  id           String   @id @default(cuid())
  document     String
  version      String
  textHash     String
  effectiveAt  DateTime
  /// 30-day re-accept deadline for courses on an older version; null = no
  /// re-acceptance required for this bump (attorney-blessed minor edit)
  reacceptBy   DateTime?
  noticeSentAt DateTime?
  createdAt    DateTime @default(now())

  @@unique([document, version])
}
```

On `Course`: `agreements AgreementAcceptance[]`, and `legalName String @default("")`
(the name the signer is binding — collected in the flow, shown on the PDF; NOT the
GreenReserve entity name, which stays a placeholder per legal README).

Migration `agreements`. Additive.

### 2. Versioned document source

`legal/documents/operator-agreement/2026-08.md`, `…/brand-license/2026-09.md`,
`…/accuracy-attestation/2026-09.md`. Front matter: `document`, `version`,
`effectiveAt`, `reacceptRequired: true|false`, `summary` (the "short version"
bullets the page shows). `src/lib/agreements.ts`:
- `loadDocument(document, version)` → `{ markdown, html, hash }` (sha256 of the
  Markdown bytes). Rendered with the same Markdown renderer for the page and the PDF.
- `CURRENT` map read from the front matter at build time — replaces
  `CURRENT_AGREEMENT_VERSION` in `course-timeline.ts` (delete that constant).
- `/operator-agreement` page renders `loadDocument('operator_agreement', current)`;
  the hand-written JSX page goes away. The LQ-2 copy run edits the Markdown, not JSX
  — sequence LQ-2 copy run AFTER AG-1 or accept doing it twice.
- Seed script inserts the `AgreementVersion` rows for whatever is in
  `legal/documents/` and refuses to run if a file's hash differs from a stored row
  with the same version ("versions are immutable — bump instead").

### 3. Migrate the legacy lines

Script `scripts/migrate-agreement-lines.ts`: for every `AGREEMENT_ACCEPTED` timeline
line, insert an `AgreementAcceptance` (document operator_agreement, that version,
signerEmail = acceptedBy, `legacy: true`, hash = the stored 2026-08 file's hash).
Idempotent. `hasAcceptedAgreement()` now reads the table: true when the course has a
row for the CURRENT version, or an older-version row whose `AgreementVersion.reacceptBy`
is null or in the future. The old timeline line is left in place (history) and no
longer written.

### 4. Verify

`prisma validate`, seed + migrate scripts run twice without duplicating, and a
script that prints `hasAcceptedAgreement` for a legacy course before and after a
fake version bump with a 30-day deadline: true → true (inside the window) → false
(after it).

---

## Phase AG-2 — The signing flow + the record the operator gets (no migration)

### 1. Where it happens

Operator onboarding (`dashboard/onboarding`), replacing the single checkbox with a
"Sign" step — the last step, after the course details:
- Course legal name (prefilled from the sheet if present; required).
- Your name · Your title (required).
- The three documents, each in its own scrollable panel with the "short version"
  bullets above the full text; the accept checkbox is disabled until the panel has
  been scrolled to the bottom once (record `scrolledToEnd: true` in the request —
  cheap evidence of presentation).
- Operator Agreement: "I have read the GreenReserve Operator Agreement v<version>
  and agree to it."
- Authority: "I am authorized to enter into this agreement on behalf of
  <legal name>."
- Brand license: "GreenReserve may display <legal name>'s name, logo and photos on
  its booking page." + a second, unchecked-by-default box: "…and may name the course
  in GreenReserve's own marketing." (`marketingOptOut = !checked`).
- Accuracy: "The course information and pricing I have submitted are accurate, and
  I will keep them current."
- One button: **Sign and continue**. Everything posts in one request.

`POST /api/operator/agreement` becomes `POST /api/operator/sign`: validates
name/title/legalName, writes three `AgreementAcceptance` rows in one transaction
with `ip` (`x-forwarded-for` first hop) and `userAgent`, then enqueues PDF render
(§2). Staff sessions are refused as today. Re-signing when already current is a
no-op with a friendly message, never a duplicate row.

### 2. The PDF

`src/lib/agreement-pdf.ts`: render the document Markdown + a signature block
(course legal name, signer name/title/email, accepted at (ET and UTC), IP, version,
text hash, "Signed electronically by clicking 'Sign and continue' on
greenreserve.app") to PDF. Use whatever PDF path the receipt already uses if one
exists; otherwise `@react-pdf/renderer` (server-side, no browser). Store to Vercel
Blob under `agreements/<courseId>/<document>-<version>-<acceptanceId>.pdf`; write
`pdfUrl`. Email the operator (Resend, existing template family): "Your signed
GreenReserve agreements" with the three PDFs attached and a one-line summary. Email
`hello@greenreserve.app` a copy. If the PDF render fails, the acceptance row still
stands (the row IS the record; the PDF is a courtesy copy) — log to Sentry and
retry via the existing cron heartbeat pattern.

### 3. Admin: Documents/Records tab on the course page

Replace the decoded-timeline "agreement" entry with the table: one row per
acceptance — document, version, signer, title, date, IP, `Legacy` pill where
applicable, PDF link. A red "Not signed" state per document when missing. The
Setup checklist item "Accept the Operator Agreement" becomes "Sign the agreements
(3)" and counts signed documents. `send-golive-reminder` nudges for any unsigned
document, not just the agreement.

### 4. Verify

Walk a fake operator through onboarding: cannot check a box before scrolling its
panel; signing writes 3 rows with IP/UA; PDFs arrive by email within a minute;
admin tab shows them; go-live gate passes. A legacy course shows the `Legacy` pill
and passes the gate. Re-opening onboarding does not create duplicates.

---

## Phase AG-3 — Version bumps and re-acceptance (no migration)

1. **Bumping:** add a new Markdown file with a new version + `reacceptRequired`;
   the seed inserts the `AgreementVersion` row with `effectiveAt = now` and
   `reacceptBy = effectiveAt + 30 days` when required, else null. A bump with
   `reacceptRequired: true` refuses to seed unless the front matter carries
   `counselReviewed: <date>` — the ⚖️ flag becomes a mechanical gate.
2. **Notice (day 0):** `noticeSentAt` null → send every live/offline course's
   operator an email: what changed (the front matter's `changeSummary`), the
   deadline, a link to sign. Write `noticeSentAt`. Admin gets one summary email.
3. **Dashboard:** banner on every page from day 0 ("The Operator Agreement changed
   on <date>. Please review and sign by <deadline>." → Sign). After `reacceptBy`:
   the banner becomes a modal on dashboard load with the same sign flow (AG-2's
   step, operator agreement only unless other documents also bumped), and every
   operator write endpoint returns 428 `{ error: 'agreement_required' }` except
   `/api/operator/sign`, check-in, and booking creation/cancellation on the tee
   sheet (C2). The dashboard maps 428 to the modal. The public booking page is
   untouched — bookings keep flowing.
4. **Admin:** courses list Status cell (COURSES_SHEET_SPEC) shows "Agreement due
   <date>" / "Agreement overdue" as a warn/bad chip; Overview action queue gets one
   row per overdue course. `mark_live` refuses on an overdue agreement (it already
   refuses on none).
5. **Golfer terms are separate** — `CURRENT_TERMS_VERSION` and the booking-level
   `termsVersion` stamp stay exactly as they are. This spec is operator-side only.

Verify: seed a bump with a 1-minute deadline in dev; watch the banner → modal →
428 → sign → cleared sequence; confirm a booking on the public page succeeds
throughout.

---

## Not in this spec
- The agreement's wording (⚖️). The brand-license and attestation texts are drafts
  to be written into `legal/documents/` by Cam + counsel before AG-2 ships; AG-1
  can seed placeholders marked `DRAFT — not for signature`, and AG-2's flow must
  refuse to present a version whose front matter is `draft: true`.
- E-signature vendors. Revisit when a private club asks for paper.
- Golfer-side terms (unchanged).
