// Cam 2026-10-19: Birdie can be tucked away (remembered) and sits clear of the
// phone tab bar; Messages says when to expect a reply and offers email.
// Source guards. Run: npx tsx scripts/birdie-messages-test.ts
import { readFileSync } from 'fs';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const w = readFileSync('src/components/birdie/BirdieWidget.tsx', 'utf8');
check('Birdie can be tucked into an edge tab', w.includes('aria-label="Tuck Birdie away"') && w.includes('aria-label="Open Birdie"'));
check('…and stays tucked until opened', w.includes("localStorage.setItem(TUCK_KEY, '1')") && w.includes("localStorage.getItem(TUCK_KEY) === '1'"));
check('an Ask Birdie link untucks it', /onAsk[\s\S]{0,300}setTucked\(false\)/.test(w));
check('on phones it sits above the bottom tab bar', w.includes('bottom-20 md:bottom-5'));
const m = readFileSync('src/app/dashboard/messages/page.tsx', 'utf8');
check('Messages says when to expect a reply', m.includes('We reply within one business day.'));
check('…and offers email', m.includes('mailto:thegreenreserve@outlook.com'));
check('no eyebrow label', !m.includes('<Eyebrow'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
