// Inquiries data (Cam 2026-11-17): the outreach rules in lib/outreach.ts and the public-listing parser in
// lib/course-lookup.ts — stage, next step from the plan.md cadence, validation, duplicate check, CSV import.
// Pure: no database. Run: npx tsx scripts/outreach-test.ts
import {
  outreachStage, outreachNext, lastTouchLabel, emailRows, courseKind, validateFacts, validateContact, nameKey, findDuplicates,
  parseCsv, importRows, endOfEasternDay, OUTREACH_START, type DupPoolRow,
} from '../src/lib/outreach';
import { readFileSync } from 'fs';
import { toResult } from '../src/lib/course-lookup';
import { LEAD_ACTIONS, CALL_STATUSES } from '../src/lib/inquiry-status';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); if (!ok) failed++; };

const DAY = 86_400_000;
const now = new Date('2026-12-08T15:00:00Z'); // Tue Dec 8, 10 AM Eastern
const ago = (d: number) => new Date(now.getTime() - d * DAY);
const out = (d: number, channel = 'email') => ({ at: ago(d), channel, direction: 'out' });
const inn = (d: number) => ({ at: ago(d), channel: 'email', direction: 'in' });

// ── Stage ──
check('nothing logged → target', outreachStage({ touches: [], calls: [] }, now) === 'target');
check('an out email → contacted', outreachStage({ touches: [out(2)], calls: [] }, now) === 'contacted');
check('a logged no-answer call alone → contacted', outreachStage({ touches: [], calls: [{ scheduledAt: ago(3), outcome: 'no_answer' }] }, now) === 'contacted');
check('a cancelled call alone → still target', outreachStage({ touches: [], calls: [{ scheduledAt: ago(3), outcome: 'cancelled' }] }, now) === 'target');
check('a reply → replied', outreachStage({ touches: [out(5), inn(1)], calls: [] }, now) === 'replied');
check('a scheduled call → call (wins over a reply)', outreachStage({ touches: [out(5), inn(1)], calls: [{ scheduledAt: new Date(now.getTime() + 2 * DAY), outcome: 'scheduled' }] }, now) === 'call');
check('an unlogged call 3 days ago → still call', outreachStage({ touches: [], calls: [{ scheduledAt: ago(3), outcome: 'scheduled' }] }, now) === 'call');

// ── Next step (company/outreach/plan.md: email 1 day 0, call day 1, email 2 day 4, email 3 day 11) ──
const before = new Date('2026-11-20T15:00:00Z');
const n0 = outreachNext({ touches: [], calls: [] }, before);
check('target before Dec 1: Email 1, due Dec 1, not due today', n0.key === 'email1' && n0.dueAt === OUTREACH_START.toISOString() && !n0.due, n0);
const n0b = outreachNext({ touches: [], calls: [] }, now);
check('target after Dec 1: Email 1 due now', n0b.key === 'email1' && n0b.due, n0b);
const n1 = outreachNext({ touches: [out(0.1)], calls: [] }, now);
check('after Email 1: Call them the next day, not due today', n1.key === 'call_them' && !n1.due && new Date(n1.dueAt).getTime() === ago(0.1).getTime() + DAY, n1);
const n2 = outreachNext({ touches: [out(5), out(4, 'call')], calls: [] }, now);
check('after Email 1 + a call: Email 2 at day 4, due', n2.key === 'email2' && n2.due && new Date(n2.dueAt).getTime() === ago(5).getTime() + 4 * DAY, n2);
const n2b = outreachNext({ touches: [out(5)], calls: [{ scheduledAt: ago(4), outcome: 'no_answer' }] }, now);
check('a logged no-answer call counts as the day-1 call', n2b.key === 'email2', n2b);
const n3 = outreachNext({ touches: [out(6), out(5, 'call'), out(2)], calls: [] }, now);
check('two emails: Email 3 at day 11, not due', n3.key === 'email3' && !n3.due && new Date(n3.dueAt).getTime() === ago(6).getTime() + 11 * DAY, n3);
const n4 = outreachNext({ touches: [out(20), out(19, 'call'), out(16), out(9)], calls: [] }, now);
check('three emails, no reply: close as no reply', n4.key === 'close_no_reply' && n4.due, n4);
const n5 = outreachNext({ touches: [out(5), inn(1)], calls: [] }, now);
check('they replied last: Answer their reply, due', n5.key === 'answer_reply' && n5.due, n5);
const n6 = outreachNext({ touches: [out(5), inn(3), out(2)], calls: [] }, now);
check('we answered their reply: Follow up a week later', n6.key === 'follow_up' && !n6.due && new Date(n6.dueAt).getTime() === ago(2).getTime() + 7 * DAY, n6);
const fu = new Date(now.getTime() + 30 * DAY);
const n7 = outreachNext({ touches: [out(5)], calls: [], nextFollowUpAt: fu }, now);
check('a follow-up date set by hand moves the date', n7.key === 'call_them' && n7.dueAt === fu.toISOString() && !n7.due, n7);
const n8 = outreachNext({ touches: [], calls: [], nextFollowUpAt: new Date('2026-11-25T15:00:00Z') }, before);
check('Email 1 never before Dec 1, even with an earlier follow-up date', n8.dueAt === OUTREACH_START.toISOString(), n8);
const sn = new Date(now.getTime() + 10 * DAY);
const n9 = outreachNext({ touches: [out(5), inn(1)], calls: [], snoozeUntil: sn }, now);
check('snoozed: the date moves to the snooze and it is not due', n9.dueAt === sn.toISOString() && !n9.due, n9);
const callAt = new Date(now.getTime() + 2 * 3600_000);
const n10 = outreachNext({ touches: [out(5)], calls: [{ scheduledAt: callAt, outcome: 'scheduled' }] }, now);
check('a call today: Discovery call, due', n10.key === 'discovery_call' && n10.due, n10);
const n11 = outreachNext({ touches: [], calls: [{ scheduledAt: ago(2), outcome: 'scheduled' }] }, now);
check('a call that went off unlogged: Log the call, due', n11.key === 'log_call' && n11.due, n11);
const eod = endOfEasternDay(now);
check('end of the Eastern day is midnight Eastern (05:00Z in December)', eod.toISOString() === '2026-12-09T05:00:00.000Z', eod.toISOString());
check('end of the Eastern day in July is 04:00Z', endOfEasternDay(new Date('2026-07-01T15:00:00Z')).toISOString() === '2026-07-02T04:00:00.000Z');

// ── Labels ──
check('last touch: second email', lastTouchLabel({ touches: [out(5), out(1)], calls: [] }) === 'Email 2 · Dec 7', lastTouchLabel({ touches: [out(5), out(1)], calls: [] }));
check('last touch: a reply', lastTouchLabel({ touches: [out(5), inn(1)], calls: [] }).startsWith('Replied · '));
check('last touch: a booked call', lastTouchLabel({ touches: [out(5)], calls: [{ scheduledAt: new Date(now.getTime() + DAY), outcome: 'scheduled', createdAt: ago(1) }] }).startsWith('Booked a call · '));
check('last touch: nothing', lastTouchLabel({ touches: [], calls: [] }) === '');
const er = emailRows([out(5)], n2);
check('email rows: 1 sent, 2 due, 3 not sent', !!er[0].sentAt && er[1].dueAt === n2.dueAt && !er[2].sentAt && !er[2].dueAt, er);
check('course kind', courseKind('town', 18) === 'Town course · 18 holes' && courseKind('independent', null) === 'Independent' && courseKind(null, 9) === '9 holes');

// ── Facts ──
const nf = validateFacts({ courseName: '  ', city: 'Riverton' }, { requireNameAndTown: true });
check('facts: name is required', 'error' in nf);
const nt = validateFacts({ courseName: 'Maple Run', city: '' }, { requireNameAndTown: true });
check('facts: town is required', 'error' in nt);
const ok = validateFacts({ courseName: 'Maple Run\nGolf', city: 'Riverton', website: 'HTTPS://www.MapleRun.example.com/', holes: '18', ownerType: 'Town or village', roundsPerYear: '24,000', hasProShop: 'yes', hasRange: '', fitTags: ['Phone-only booking', 'Phone-only booking', ''], osmRef: 'osm:way/123' }, { requireNameAndTown: true });
check('facts: cleaned', 'facts' in ok && ok.facts.courseName === 'Maple Run Golf' && ok.facts.website === 'maplerun.example.com' && ok.facts.holes === 18 && ok.facts.ownerType === 'town' && ok.facts.roundsPerYear === 24000 && ok.facts.hasProShop === true && ok.facts.hasRange === null && ok.facts.fitTags?.length === 1, ok);
check('facts: a PATCH only returns the keys sent', (() => { const p = validateFacts({ season: 'Apr – Nov' }); return 'facts' in p && Object.keys(p.facts).join() === 'season'; })());
check('facts: a bad website is refused', 'error' in validateFacts({ website: 'javascript:alert(1)' }));
check('facts: holes 0 refused', 'error' in validateFacts({ holes: 0 }));
check('facts: unknown owner type refused', 'error' in validateFacts({ ownerType: 'Martian' }));
check('facts: a bad map reference refused', 'error' in validateFacts({ osmRef: 'osm:way/1; drop' }));
check('facts: half a location refused', 'error' in validateFacts({ latitude: 40 }));
check('facts: too many tags refused', 'error' in validateFacts({ fitTags: Array.from({ length: 9 }, (_, i) => `t${i}`) }));

// ── Contacts ──
check('contact: a name is required', 'error' in validateContact({ name: '' }));
check('contact: a bad email is refused', 'error' in validateContact({ name: 'Dana', email: 'dana@' }));
check('contact: an unknown channel is refused', 'error' in validateContact({ name: 'Dana', preferredChannel: 'pigeon' }));
const vc = validateContact({ name: ' Dana  Whitfield ', email: 'Dana@Example.com', phone: '(555) 010-2201<script>', decisionMaker: true, preferredChannel: 'Phone', bestTime: 'Weekdays 2–4 PM' });
check('contact: cleaned', 'contact' in vc && vc.contact.name === 'Dana Whitfield' && vc.contact.email === 'dana@example.com' && vc.contact.phone === '(555) 010-2201' && vc.contact.decisionMaker === true && vc.contact.preferredChannel === 'phone', vc);
const vp = validateContact({ bestTime: 'Mornings' }, true);
check('contact: a partial edit only returns the keys sent', 'contact' in vp && Object.keys(vp.contact).join() === 'bestTime', vp);

// ── Duplicates ──
check('name key drops generic words', nameKey('The Maple Run Golf Course') === 'maple run' && nameKey('Maple Run GC') === 'maple run' && nameKey('Pine & Oak C.C.') === 'pine oak c c', [nameKey('The Maple Run Golf Course'), nameKey('Maple Run GC'), nameKey('Pine & Oak C.C.')]);
check('name key of only generic words keeps them', nameKey('The Golf Club') === 'the golf club');
const pool: DupPoolRow[] = [
  { id: 'i1', kind: 'inquiry', courseName: 'Maple Run Golf Course', city: 'Riverton', state: 'NY', status: 'Lead' },
  { id: 'i2', kind: 'inquiry', courseName: 'Birch Hollow', city: 'Eastfield', state: 'NY', website: 'birchhollow.example.com' },
  { id: 'c1', kind: 'course', courseName: 'Stone Bridge Links', city: 'Millbrook', state: 'NJ', coursePhone: '+1 (555) 010-3302' },
  { id: 'i3', kind: 'inquiry', courseName: 'Oak Valley', city: 'Hilltown', state: 'CT', osmRef: 'osm:way/42' },
];
check('dup: same name, other spelling, same town', findDuplicates({ courseName: 'Maple Run GC', city: 'riverton', state: 'NY' }, pool)[0]?.id === 'i1');
check('dup: same name, other state → not a duplicate', findDuplicates({ courseName: 'Maple Run', city: 'Riverton', state: 'PA' }, pool).length === 0);
check('dup: a shared host with different pages is not a duplicate', findDuplicates({ courseName: 'Pine Ridge', city: 'Pinefield', website: 'facebook.com/pineridgegc' }, [{ id: 'f', kind: 'inquiry', courseName: 'Oak Hollow', city: 'Oakton', website: 'https://www.facebook.com/oakhollowgolf' }]).length === 0);
check('dup: the same page on a shared host is', findDuplicates({ courseName: 'X', city: 'Y', website: 'facebook.com/oakhollowgolf/' }, [{ id: 'f', kind: 'inquiry', courseName: 'Oak Hollow', city: 'Oakton', website: 'facebook.com/oakhollowgolf' }]).length === 1);
check('lead actions include calcom_link (Send Cal.com link on a course in outreach)', (LEAD_ACTIONS as readonly string[]).includes('calcom_link') && (CALL_STATUSES as readonly string[]).includes('lead'));
check('dup: same website', findDuplicates({ courseName: 'Something Else', city: 'X', website: 'https://www.birchhollow.example.com/tee-times' }, pool)[0]?.why === 'same website');
check('dup: same phone, any format', findDuplicates({ courseName: 'Other', city: 'Y', coursePhone: '555.010.3302' }, pool)[0]?.kind === 'course');
check('dup: same map listing', findDuplicates({ courseName: 'Renamed', city: 'Z', osmRef: 'osm:way/42' }, pool)[0]?.why === 'same map listing');
check('dup: a different course in the same town is not', findDuplicates({ courseName: 'Pine Hollow', city: 'Riverton', state: 'NY' }, pool).length === 0);

// ── CSV ──
const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\n\n"multi\nline",z');
check('csv: quotes, commas, doubled quotes, blank lines, newlines in quotes', rows.length === 3 && rows[1][0] === 'x, y' && rows[1][1] === 'he said "hi"' && rows[2][0] === 'multi\nline', rows);
const csv = [
  'name,town,address,website,phone,holes,owned by,books today by,software,season,contact name,role,email,phone',
  'Ashgrove Links,"Ashgrove, NY",1 Main St,ashgrove.example.com,(555) 010-1111,18,County,Phone only,,Apr – Oct,Pat Lee,Head pro,pat@example.com,(555) 010-2222',
  'Kingsbury Muni,Kingsbury,,,,9,Town or village,,,,,,,',
  ',Nowhere,,,,,,,,,,,,',
  'Bad Owner,Somewhere,,,,,Martian,,,,,,,',
].join('\n');
const imp = importRows(csv);
check('import: four rows', !imp.error && imp.rows.length === 4, imp);
const r0 = imp.rows[0];
check('import: town "Ashgrove, NY" splits into town and state', r0.facts.city === 'Ashgrove' && r0.facts.state === 'NY', r0.facts);
check('import: first phone is the course, second the contact', r0.facts.coursePhone === '(555) 010-1111' && r0.contact?.phone === '(555) 010-2222', r0);
check('import: owner, holes, contact', r0.facts.ownerType === 'county' && r0.facts.holes === 18 && r0.contact?.name === 'Pat Lee' && r0.contact?.email === 'pat@example.com', r0);
check('import: a row with no contact has none', imp.rows[1].contact === null && !imp.rows[1].error);
check('import: a row without a name is invalid', !!imp.rows[2].error && imp.rows[2].row === 4);
check('import: a bad owner type is invalid', !!imp.rows[3].error);
check('import: no name column → error', !!importRows('town\nX').error);
check('import: header only → error', !!importRows('name,town\n').error);
check('import: more than 500 rows → error', !!importRows('name,town\n' + Array.from({ length: 501 }, (_, i) => `C${i},T`).join('\n')).error);

// ── Public listing parser ──
const hit = toResult({
  osm_type: 'way', osm_id: 385713776, lat: '40.92', lon: '-72.63', category: 'leisure', type: 'golf_course', name: 'Indian Island Golf Course',
  display_name: 'Indian Island Golf Course, Cross River Drive, Riverhead, NY',
  address: { road: 'Cross River Drive', town: 'Riverhead', state: 'New York', 'ISO3166-2-lvl4': 'US-NY', postcode: '11901' },
  extratags: { website: 'https://www.example.com/golf', phone: '+1 631-555-0100' },
});
check('listing: facts from a Nominatim hit', !!hit && hit.courseName === 'Indian Island Golf Course' && hit.city === 'Riverhead' && hit.state === 'NY' && hit.address === 'Cross River Drive' && hit.osmRef === 'osm:way/385713776' && hit.website === 'example.com/golf' && hit.coursePhone === '+1 631-555-0100' && hit.latitude === 40.92, hit);
check('listing: no name → skipped', toResult({ osm_type: 'way', osm_id: 1 }) === null);
check('listing: a bad osm type → skipped', toResult({ osm_type: 'area', osm_id: 1, name: 'X Golf' }) === null);

// ── Every palette page link is area-filtered (the Pipeline entry moved to /admin/inquiries/all) ──
{
  const src = readFileSync('src/app/api/admin/search/route.ts', 'utf8');
  const navHrefs = [...src.matchAll(/id: 'nav:[^']+',\s*label: '[^']*',\s*href: '([^']+)'/g)].map(m => m[1]);
  const areaBlock = src.slice(src.indexOf('const NAV_AREA'), src.indexOf('const TYPE_AREA'));
  const OPEN = ['/admin', '/admin/profile'];
  const missing = navHrefs.filter(h => !OPEN.includes(h) && !areaBlock.includes(`'${h}':`));
  check(`palette: every page link has an area (${navHrefs.length} links)`, navHrefs.length > 5 && missing.length === 0, missing);
  check('palette: Pipeline opens the full board', navHrefs.includes('/admin/inquiries/all'));
}

console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
process.exit(failed ? 1 : 0);
