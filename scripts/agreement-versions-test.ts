// AG-3: the operator-agreement version on disk and the seed's re-acceptance gate.
import { loadDocument, currentVersion, signableDocuments, seedGateError } from '../src/lib/agreements';
import { publishDates, REACCEPT_WINDOW_DAYS, reacceptPublishError } from '../src/lib/agreement-publish';
import { readFileSync } from 'fs';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
}

const cur = loadDocument('operator_agreement');
check('current operator agreement is v2026-11', currentVersion('operator_agreement') === '2026-11', currentVersion('operator_agreement'));
check('v2026-11 requires re-acceptance', cur.reacceptRequired === true);
check('v2026-11 is not a draft (signable)', !cur.draft && signableDocuments().some(d => d.document === 'operator_agreement' && d.version === '2026-11'));
check('v2026-11 records the waiver, not a review', cur.counselReviewed === '' && cur.counselWaived.includes('Cam'), JSON.stringify([cur.counselReviewed, cur.counselWaived]));
check('v2026-11 has a change summary', cur.changeSummary.includes('New York') && cur.changeSummary.includes('initiation'));
check('v2026-11 changelog names itself current', /\*\*v2026-11 \(current\):\*\*/.test(cur.markdown) && !/v2026-10 \(current\)/.test(cur.markdown));
check('v2026-11 never says re-acceptance is not required', !/not required to re-accept/.test(cur.markdown));
check('v2026-11: 1% covers dues and initiation fees', /1% of membership dues and of any initiation fee/.test(cur.markdown));
check('v2026-11: GreenReserve LLC under New York law, no placeholder or New Jersey', /GreenReserve LLC/.test(cur.markdown) && /laws of the State of New York/.test(cur.markdown) && !/New Jersey|\{\{/.test(cur.markdown));
check('v2026-11: cash at the counter carries no fee', /No GreenReserve fee is charged when a golfer pays for the round in cash/.test(cur.markdown));
check('v2026-11: signed, not "connected"', /By signing it/.test(cur.markdown) && !/By connecting/.test(cur.markdown));
check('v2026-10 still loads (signers of the 1% version)', loadDocument('operator_agreement', '2026-10').version === '2026-10');
const bl = loadDocument('brand_license');
check('the Brand License the agreement points to is signable alongside it', currentVersion('brand_license') === '2026-11' && !bl.draft && signableDocuments().some(d => d.document === 'brand_license'));
check('the Brand License names GreenReserve LLC and offers no settings opt-out that does not exist', /GreenReserve LLC/.test(bl.markdown) && !/dashboard settings/.test(bl.markdown));
check('v2026-11: a no-show fee can also be charged on cancel', /or when the booking is cancelled if that is sooner/.test(cur.markdown));
check('v2026-11 passes the seed gate', seedGateError(cur) === null, String(seedGateError(cur)));

const base = { document: 'operator_agreement' as const, version: 'x', reacceptRequired: true, counselReviewed: '', counselWaived: '', draft: false };
check('gate refuses a re-accept bump with neither review nor waiver', seedGateError(base) !== null);
check('gate accepts a counsel review date', seedGateError({ ...base, counselReviewed: '2026-10-01' }) === null);
check('gate accepts a recorded waiver', seedGateError({ ...base, counselWaived: '2026-10-12 by Cam' }) === null);
check('gate refuses a draft even when waived', seedGateError({ ...base, counselWaived: 'x', draft: true }) !== null);
check('no gate when re-acceptance is not required', seedGateError({ ...base, reacceptRequired: false }) === null);
check('v2026-08 still loads (old signers\' PDFs)', loadDocument('operator_agreement', '2026-08').version === '2026-08');

const now = new Date('2026-10-12T15:00:00.000Z');
const bump = publishDates({ reacceptRequired: true, effectiveAt: '2026-10-01' }, now);
check('a re-accept bump takes effect at publish time, not the file date', bump.effectiveAt.getTime() === now.getTime());
check('a re-accept bump gets a 30-day window', REACCEPT_WINDOW_DAYS === 30 && bump.reacceptBy?.toISOString() === '2026-11-11T15:00:00.000Z', String(bump.reacceptBy?.toISOString()));
const minor = publishDates({ reacceptRequired: false, effectiveAt: '2026-09-01' }, now);
check('a minor version keeps its file date and has no window', minor.effectiveAt.toISOString() === '2026-09-01T00:00:00.000Z' && minor.reacceptBy === null);

check('re-accept: current operator agreement may publish', reacceptPublishError('operator_agreement', '2026-11', true, '2026-11') === null);
check('re-accept: an older operator agreement may not', reacceptPublishError('operator_agreement', '2026-10', true, '2026-11') !== null);
check('re-accept: other documents may not', reacceptPublishError('brand_license', '2026-09', true, '2026-09') !== null);
check('no re-accept: any version may publish', reacceptPublishError('brand_license', '2026-01', false, '2026-09') === null);

const chase = readFileSync('src/app/api/cron/chase-onboarding/route.ts', 'utf8');
check('a live course missing only the Brand License is not chased as "still waiting to go live"', chase.includes("const oa = agreements.documents.find(d => d.document === 'operator_agreement');") && chase.includes('if (!oa || oa.signed) continue;') && !chase.includes('if (agreements.missing.length === 0) continue;'));

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('agreement-versions: all passed');
