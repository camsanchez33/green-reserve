// Tee Sheet rework, batch 2 (Cam 2026-10-19, OPERATOR_REWORK_SPEC §3–4): the
// top-left logo box is gone; Weather and Message golfers are renamed and say
// what they do; the course alert explains itself and can also email today's
// golfers. Source-level guards. Pure. Run: npx tsx scripts/teesheet-2-test.ts
import { readFileSync } from 'fs';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const src = (p: string) => readFileSync(p, 'utf8');
const bar = src('src/components/OperatorSidebar.tsx');
check('no course logo box in the top bar', !/<img src=\{logoUrl\}/.test(bar));
const page = src('src/app/dashboard/page.tsx');
check('the weather button says what it is', page.includes('Weather delay / cancel'));
check('the weather window offers two explained choices', page.includes("'Cancel for weather'") && page.includes("'Delay the start'") && page.includes('role="radiogroup"'));
check('message golfers names whose day it is', page.includes('Message today’s golfers'));
check('the course alert explains where it shows', page.includes('A short notice at the top of your booking page'));
check('the course alert can email today’s golfers, behind the message permission', page.includes("access.can('sheet.message_golfers') && (") && page.includes('Also email everyone booked today') && page.includes("body: `Course notice: ${conditionsInput.trim()}`"));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
