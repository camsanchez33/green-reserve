// Memberships (was Members) — Cam 2026-11-16, lanes/dashboard/members-mockup.html and lanes/dashboard.md "Next" 2.
// Source guards on the page, a membership's page, the member card, Add a member and the setup.
// (Replaces the Members rework guards of 2026-10-19 / DENSE-5: the list-first table is gone by Cam's approval.)
// Run: npx tsx scripts/members-rework-test.ts
import { readFileSync } from 'fs';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const read = (f: string) => readFileSync(f, 'utf8');
const p = read('src/app/dashboard/members/page.tsx');
const card = read('src/components/dashboard/members/MemberCard.tsx');
const add = read('src/components/dashboard/members/AddMember.tsx');
const setup = read('src/components/dashboard/members/MembershipSetup.tsx');
const shared = read('src/components/dashboard/members/shared.tsx');
const rail = read('src/components/OperatorSidebar.tsx');

check('the rail says Memberships', rail.includes("label: 'Memberships'") && !rail.includes("label: 'Members',"));
check('the page title is Memberships', p.includes('>Memberships</h1>'));
check('top numbers: Memberships offered, and Dues collected this year only once the data carries it', p.includes('label="Memberships offered"') && p.includes('{hasDues && <Tile label="Dues collected this year"'));
check('no season passes shown until their data lands (never faked)', !p.includes('Season passes offered') && !/SEAS|holders:/.test(p));
check('memberships sorted most members first, each with colour, name, price and count', p.includes('count(b) - count(a)') && p.includes('<Dot color={t.color} />') && p.includes('priceLine(t)') && p.includes('</b> members'));
check('a bare plus adds a membership (aria-label, no word button)', p.includes("label: 'Add a membership'") && shared.includes('aria-label={plus.label}'));
check('Dues this year breaks down by membership with a total and the Revenue line', p.includes('>Dues this year</h2>') && p.includes('<KV total k="Total"') && p.includes('Shows in Revenue as Membership dues.'));
check('a row opens that membership\'s own page (?m=)', p.includes("`/dashboard/members?m=${id}`") && p.includes("searchParams.get('m')"));
check('a membership\'s page: Members, Dues this year (with data), Overdue renewals', p.includes('label="Members"') && p.includes("typeof open.duesThisYearCents === 'number' && <Tile label=\"Dues this year\"") && p.includes('label="Overdue renewals"'));
check('the member list: Member, Dues, Rounds this year, Since', p.includes('<span>Member</span><span>Dues</span>') && p.includes('Rounds this year</span>') && p.includes('>Since</span>'));
check('Details: price, lasts, joining, renews itself, books online, what members pay', ['k="Price"', 'k="Lasts"', 'k="Joining"', 'k="Renews itself"', 'k="Books online"', '<SubHead>What members pay</SubHead>'].every(s => p.includes(s)));
check('joining requests, import and reminders sit on a membership\'s page', p.indexOf('<JoinRequests') > p.indexOf('/* ── A membership') && p.indexOf('<ImportMembers') > p.indexOf('/* ── A membership') && p.indexOf('remindOverdue}') > p.indexOf('/* ── A membership') && p.indexOf('<JoinRequests') < p.indexOf('/* ── The list'));
check('residents stay on the list page until the post-launch switch', p.indexOf('<ResidentsCard') > p.indexOf('/* ── The list'));
check('dues status uses the same overdue rule as Remind (unpaid, or expired and not comped)', p.includes("m.paymentStatus === 'comped'") && p.includes("m.paymentStatus === 'unpaid'") && p.includes("m.expiresAt.slice(0, 10) < now.toLocaleDateString('en-CA')"));
check('a free membership never reads as dues unpaid (owed is checked first)', p.indexOf('owed <= 0') > -1 && p.indexOf('owed <= 0') < p.indexOf("m.paymentStatus === 'unpaid'"));
check('the member card: membership, dues, since, rounds, payments; number and photo only with data', card.includes('k="Membership"') && card.includes('k="Dues"') && card.includes('k="Member since"') && card.includes('k="Rounds this year"') && card.includes('>Payments</div>') && card.includes('{m.memberNumber && ') && card.includes('m.photoUrl'));
check('the card keeps every action: dues at the shop, dues link, change, edit, auto-renew, account, end', ["action: 'mark_paid'", "action: 'send_pay_link'", 'Change membership', 'Edit details', '<AutoRenewStop', '<MemberAccount', 'End membership'].every(s => card.includes(s)));
check('edit actions only for members.edit', p.includes("const canEdit = access.can('members.edit');") && card.includes('{can.edit && <>') && p.includes('plus={canEdit && open.active'));
check('Add a member: name, email and phone; no faked number, photo or payment', add.includes('Full name') && add.includes('Phone (optional)') && !/PH-|Card reader|Type a card/.test(add));
check('the setup runs Name → Joining → Payment → Booking and rates', setup.includes("const STEPS = ['Name', 'Joining', 'Payment', 'Booking and rates'];"));
check('the setup: Cancel and Back are plain links, tiles for choices', setup.includes('className={LINK} onClick={onClose}>Cancel') && setup.includes('>Back</button>') && setup.includes('<Tiles labelledBy="ms-join"'));
check('the 1% dues fee is stated plainly', setup.includes('members pay a 1% fee on top') && p.includes('a 1% fee'));
check('no decorative icons', !/from 'lucide-react'/.test(p + card + add + setup + shared));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
