// Cam 2026-10-19: the 2FA page says where the code already went (it is sent
// automatically at sign-in), offers a NEW code by email or text, and never
// claims a text was sent when the server fell back to email. Source guards. Pure.
// Run: npx tsx scripts/2fa-page-test.ts
import { readFileSync } from 'fs';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const page = readFileSync('src/app/dashboard/2fa/page.tsx', 'utf8');
const status = readFileSync('src/app/api/auth/2fa/status/route.ts', 'utf8');
check('no "Send to my email" button (the code is already sent)', !page.includes('Send to my email'));
check('names where the code went', page.includes('We emailed a 6-digit code to') && page.includes('We texted a 6-digit code to the phone ending in'));
check('resend buttons say they send a NEW code', page.includes('Email me a new code') && page.includes('Text a code to the phone ending in'));
check('an SMS that fell back to email says so', page.includes("target === 'sms' && data.method !== 'sms'"));
check('no phone on file points to where to add one', page.includes('To get codes by text, add your phone'));
check('network failures surface an error, never a stuck spinner', (page.match(/Couldn’t reach GreenReserve/g) || []).length >= 2);
check('status masks the email address', status.includes('maskEmail(operator.email)') && status.includes('•••@'));
check('status route exports only the handler', !/export function maskEmail/.test(status));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
