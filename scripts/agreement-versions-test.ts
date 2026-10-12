// AG-3: the operator-agreement version on disk and the seed's re-acceptance gate.
import { loadDocument, currentVersion, signableDocuments, seedGateError } from '../src/lib/agreements';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
}

const cur = loadDocument('operator_agreement');
check('current operator agreement is v2026-10', currentVersion('operator_agreement') === '2026-10', currentVersion('operator_agreement'));
check('v2026-10 requires re-acceptance', cur.reacceptRequired === true);
check('v2026-10 is not a draft (signable)', !cur.draft && signableDocuments().some(d => d.document === 'operator_agreement' && d.version === '2026-10'));
check('v2026-10 records the waiver, not a review', cur.counselReviewed === '' && cur.counselWaived.includes('Cam'), JSON.stringify([cur.counselReviewed, cur.counselWaived]));
check('v2026-10 has a change summary', cur.changeSummary.includes('1%'));
check('v2026-10 changelog names itself current', /\*\*v2026-10 \(current\):\*\*/.test(cur.markdown) && !/v2026-08 \(current\)/.test(cur.markdown));
check('v2026-10 never says re-acceptance is not required', !/not required to re-accept/.test(cur.markdown));
check('v2026-10 fee text says 1%, not $0.50', !/\$0\.50 (fee )?on each membership/.test(cur.markdown) && /1% of each membership-dues payment/.test(cur.markdown));
check('v2026-10 passes the seed gate', seedGateError(cur) === null, String(seedGateError(cur)));

const base = { document: 'operator_agreement' as const, version: 'x', reacceptRequired: true, counselReviewed: '', counselWaived: '', draft: false };
check('gate refuses a re-accept bump with neither review nor waiver', seedGateError(base) !== null);
check('gate accepts a counsel review date', seedGateError({ ...base, counselReviewed: '2026-10-01' }) === null);
check('gate accepts a recorded waiver', seedGateError({ ...base, counselWaived: '2026-10-12 by Cam' }) === null);
check('gate refuses a draft even when waived', seedGateError({ ...base, counselWaived: 'x', draft: true }) !== null);
check('no gate when re-acceptance is not required', seedGateError({ ...base, reacceptRequired: false }) === null);
check('v2026-08 still loads (old signers\' PDFs)', loadDocument('operator_agreement', '2026-08').version === '2026-08');

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('agreement-versions: all passed');
