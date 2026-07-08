// Generates ARCHITECTURE.md — walks all route.ts and page.tsx files,
// reads leading comments for purpose descriptions, emits API route table,
// page surface table, money-flow section, session policy, model summary.
// Run: npx tsx scripts/route-inventory.ts  |  Output: ARCHITECTURE.md

import fs from 'fs';
import path from 'path';

const SRC = path.resolve('src/app');
const OUT = path.resolve('ARCHITECTURE.md');

type RouteEntry = {
  route: string;
  methods: string[];
  surface: string;
  purpose: string;
  file: string;
};

// ── Walk helpers ──────────────────────────────────────────────────────────────

function walkFiles(dir: string, pattern: RegExp, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, pattern, results);
    else if (pattern.test(entry.name)) results.push(full);
  }
  return results;
}

function relRoute(filePath: string, fromDir: string): string {
  const rel = path.relative(fromDir, filePath);
  // src/app/api/bookings/route.ts → /api/bookings
  // src/app/api/admin/course-detail/route.ts → /api/admin/course-detail
  return '/' + rel.replace(/\\/g, '/').replace(/\/route\.ts$/, '').replace(/^app\//, '');
}

function relPage(filePath: string, fromDir: string): string {
  const rel = path.relative(fromDir, filePath);
  return '/' + rel.replace(/\\/g, '/').replace(/\/page\.tsx$/, '').replace(/^app\//, '') || '/';
}

// ── Surface classification ───────────────────────────────────────────────────

function surfaceOf(route: string): string {
  if (route.startsWith('/api/admin')) return 'admin';
  if (route.startsWith('/api/operator')) return 'operator';
  if (route.startsWith('/api/golfer')) return 'golfer';
  if (route.startsWith('/api/member')) return 'member';
  if (route.startsWith('/api/auth')) return 'operator-auth';
  if (route.startsWith('/api/checkin')) return 'token-gated';
  if (route.startsWith('/api/cron')) return 'cron';
  if (route.startsWith('/api/stripe')) return 'stripe-webhook';
  if (route.startsWith('/api/bookings')) return 'golfer';
  if (route.startsWith('/api/courses')) return 'public';
  if (route.startsWith('/api/inquiries')) return 'public';
  if (route.startsWith('/api/waitlist')) return 'public';
  if (route.startsWith('/api/membership')) return 'token-gated';
  return 'public';
}

// ── Extract purpose from leading comment ─────────────────────────────────────

function purposeOf(filePath: string): string {
  const src = fs.readFileSync(filePath, 'utf8');
  // Try // single-line comment at top (after imports)
  const singleMatch = src.match(/^\/\/ (.+)$/m);
  // Try /** block comment */
  const blockMatch = src.match(/\/\*\*\s*\n\s*\*\s*(.+)/);
  // Fallback: filename
  const raw = (blockMatch?.[1] || singleMatch?.[1] || '').trim();
  return raw.replace(/\s+/g, ' ').slice(0, 80) || '—';
}

function methodsOf(filePath: string): string[] {
  const src = fs.readFileSync(filePath, 'utf8');
  const found: string[] = [];
  for (const m of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
    if (new RegExp(`export async function ${m}\\b`).test(src)) found.push(m);
  }
  return found;
}

// ── Page surface classification ───────────────────────────────────────────────

function pageSurfaceOf(route: string): string {
  if (route.startsWith('/admin')) return 'admin';
  if (route.startsWith('/dashboard')) return 'operator';
  if (route.startsWith('/account')) return 'golfer';
  if (route.startsWith('/checkin')) return 'token-gated';
  if (route.startsWith('/book')) return 'golfer';
  if (route.startsWith('/courses/[slug]/member')) return 'member';
  return 'public';
}

const PUBLIC_PAGES = new Set(['/', '/for-courses', '/for-courses/details', '/courses', '/courses/[slug]', '/contact', '/privacy', '/terms']);
const AUTH_PAGES = ['/admin', '/dashboard', '/account', '/book', '/checkin'];

// ── Build tables ──────────────────────────────────────────────────────────────

const apiFiles = walkFiles(path.join(SRC, 'api'), /^route\.ts$/);
const pageFiles = walkFiles(SRC, /^page\.tsx$/).filter(f => !f.includes('/api/'));

const apiRoutes: RouteEntry[] = apiFiles.map(f => ({
  route: relRoute(f, SRC),
  methods: methodsOf(f),
  surface: surfaceOf(relRoute(f, SRC)),
  purpose: purposeOf(f),
  file: path.relative(process.cwd(), f),
})).sort((a, b) => a.route.localeCompare(b.route));

const pages: RouteEntry[] = pageFiles.map(f => ({
  route: relPage(f, SRC) || '/',
  methods: [],
  surface: pageSurfaceOf(relPage(f, SRC) || '/'),
  purpose: '—',
  file: path.relative(process.cwd(), f),
})).sort((a, b) => a.route.localeCompare(b.route));

// ── Lib file index ────────────────────────────────────────────────────────────

const libFiles = fs.readdirSync('src/lib').filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
const libLines = libFiles.sort().map(f => {
  const src = fs.readFileSync(path.join('src/lib', f), 'utf8');
  const comment = src.match(/^\/\/ (.+)$/m)?.[1] ||
                  src.match(/\/\*\*[\s\S]*?\*\s(.+?)\n/)?.[1] ||
                  '—';
  return `| \`src/lib/${f}\` | ${comment.trim().slice(0, 70)} |`;
});

// ── Render ────────────────────────────────────────────────────────────────────

function col(s: string, w: number) { return s.slice(0, w).padEnd(w); }

const apiTable = [
  '| Route | Methods | Surface | Purpose |',
  '|-------|---------|---------|---------|',
  ...apiRoutes.map(r =>
    `| \`${r.route}\` | ${r.methods.join(', ')} | ${r.surface} | ${r.purpose} |`
  ),
].join('\n');

const pageTable = [
  '| Page | Surface | Authed? |',
  '|------|---------|---------|',
  ...pages.map(r => {
    const isPublic = PUBLIC_PAGES.has(r.route);
    return `| \`${r.route}\` | ${r.surface} | ${isPublic ? 'no' : 'yes'} |`;
  }),
].join('\n');

const md = `# GreenReserve — Architecture Reference

> **Auto-generated** by \`scripts/route-inventory.ts\`. Re-run after adding routes.
> Last generated: ${new Date().toISOString().split('T')[0]}

---

## API Routes

${apiTable}

---

## Pages

${pageTable}

**Public pages** (no auth required):
\`/\`, \`/for-courses\`, \`/for-courses/details\` (token-gated), \`/courses\`, \`/courses/[slug]\`, \`/contact\`, \`/privacy\`, \`/terms\`, login pages (\`/account/login\`, \`/account/register\`, \`/api/auth/login\`)

**Auth-protected pages** — middleware redirects unauthenticated hits:
- \`/admin/*\` → redirects to \`/admin/login\`
- \`/dashboard/*\` → redirects to \`/login\`
- \`/account/*\` → redirects to \`/account/login\`

---

## Money Flow

\`\`\`
1. BOOKING
   Golfer → POST /api/bookings
   → Stripe SetupIntent (card saved, nothing charged)
   → Booking.paymentStatus = 'card_on_file'

2. CANCELLATION FEE (late cancel — cron)
   Vercel cron → GET /api/cron/cancellation-cutoff
   → chargeOnConnectedAccount() (idempotencyKey: cancelfee-{id}-{pmId})
   → Booking.paymentStatus = 'cancellation_fee_charged'

3. CHECK-IN CHARGE
   Staff/Golfer → POST /api/checkin/[bookingId]
   → performCheckIn() in src/lib/checkin-booking.ts
   → Stripe charge on connected account + application fee ($1.50/player)
   → Cancellation fee refunded if previously charged
   → Booking.status = 'completed'

4. STRIPE WEBHOOKS  (src/app/api/stripe/webhook)
   account.updated → sync Course.stripeAccountActive
   (idempotent: updateMany with same value is safe to replay)
\`\`\`

---

## Session Policy

| Surface | Cookie | TTL | Renewal |
|---------|--------|-----|---------|
| Admin employees | \`admin_session\` | 12h | Absolute |
| Admin owner | \`admin_session\` | 12h | Absolute (2FA at login) |
| Operator / staff | \`gr_operator\` | 7 days | Sliding — reissued at >50% elapsed |
| Golfer | \`gr_golfer\` | 90 days | Sliding — reissued at >50% elapsed |
| Member | \`gr_member\` | 90 days | Absolute |

Sliding renewal implemented in \`src/lib/auth.ts\`.

---

## Model Relationships (summary)

\`\`\`
CourseOperator ──< Course ──< TeeTime ──< Booking >── GolferAccount
                          └──< TeeTimeSchedule
                          └──< MembershipTier ──< CourseMembership >── GolferAccount
                          └──< TeeSet
                          └──< CourseStaff
\`\`\`

Key models:
- **Course** — slug, operator, pricing, policies, Stripe account, liveStatus
- **TeeTime** — generated slot; playersBooked/playersAvailable for capacity guard
- **Booking** — links GolferAccount + TeeTime; holds paymentMethodId; status flow: confirmed → completed/cancelled
- **CourseOperator** — operator login (2FA, hashed code), Stripe accountId
- **GolferAccount** — golfer login (bcrypt password, email-based auth)
- **CourseMembership / MembershipTier** — per-course membership with tier pricing
- **AdminUser** — admin console login (owner/manager/support/viewer roles)
- **RateLimit** — DB-backed rate limiter (per-key, window counts)

---

## src/lib Index

| File | Purpose |
|------|---------|
${libLines.join('\n')}
`;

fs.writeFileSync(OUT, md, 'utf8');
console.log(`✅ ARCHITECTURE.md written (${apiRoutes.length} API routes, ${pages.length} pages)`);
