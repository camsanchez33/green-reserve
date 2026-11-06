// OWNER TOTP 2FA — the lib, checked without a database.
// Run: JWT_SECRET=x npx tsx scripts/owner-totp-test.ts
import { authenticator } from 'otplib';
import {
  generateTotpSecret, totpUri, totpMatchStep, generateRecoveryCodes, matchRecoveryCode,
  normalizeRecoveryCode, looksLikeRecoveryCode, signEnrolToken, verifyEnrolToken, TOTP_STEP_SECONDS,
} from '../src/lib/owner-totp';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function main() {
  const secret = generateTotpSecret();
  check('secret is base32, 32 chars', /^[A-Z2-7]{32}$/.test(secret), secret.length + '');
  check('uri names the issuer and account', /otpauth:\/\/totp\/GreenReserve:owner%40example.com\?/.test(totpUri('owner@example.com', secret)) || totpUri('owner@example.com', secret).includes('GreenReserve'));

  const now = Date.now();
  // The code for the same instant `now` (a fresh generate() reads the clock again and can land in the next
  // 30-second step — CI 2026-11-06 failed exactly so).
  const cur = authenticator.clone({ epoch: now }).generate(secret);
  check('current code matches the current step', totpMatchStep(cur, secret, now) === Math.floor(now / 1000 / TOTP_STEP_SECONDS));

  // One step back is accepted (clock skew); two steps back is not. otplib v12:
  // a clone with a fixed epoch generates the code for that moment.
  const prev = authenticator.clone({ epoch: now - TOTP_STEP_SECONDS * 1000 }).generate(secret);
  const stale = authenticator.clone({ epoch: now - 2 * TOTP_STEP_SECONDS * 1000 }).generate(secret);
  check('previous step (30s ago) is accepted', totpMatchStep(prev, secret, now) !== null);
  check('two steps ago (60s) is rejected', stale === cur || stale === prev ? true : totpMatchStep(stale, secret, now) === null);
  // `now` is the one clock (review 2026-11-06): a code from 10 minutes ago, checked AT that moment, is that
  // moment's step — before the fix the match read the real clock and this was null.
  { const past = now - 600_000;
    const old = authenticator.clone({ epoch: past }).generate(secret);
    check('the match and its step use the same clock (`now`)', totpMatchStep(old, secret, past) === Math.floor(past / 1000 / TOTP_STEP_SECONDS) && (old === cur || old === prev || totpMatchStep(old, secret, now) === null)); }
  check('garbage is rejected', totpMatchStep('12345', secret, now) === null && totpMatchStep('abcdef', secret, now) === null);

  const codes = await generateRecoveryCodes();
  check('ten recovery codes, xxxx-xxxx', codes.plain.length === 10 && codes.plain.every(c => /^[a-z0-9]{4}-[a-z0-9]{4}$/.test(c)), codes.plain[0]);
  check('normalize strips spaces/case', normalizeRecoveryCode(' ' + codes.plain[3].toUpperCase().replace('-', ' ') + ' ') === codes.plain[3]);
  check('looksLikeRecoveryCode', looksLikeRecoveryCode(codes.plain[0]) && !looksLikeRecoveryCode('123456'));
  const idx = await matchRecoveryCode(codes.plain[5], codes.hashes);
  check('a recovery code matches its hash', idx === 5, String(idx));
  const remaining = codes.hashes.filter((_, i) => i !== idx);
  check('the same code fails once removed (single use)', (await matchRecoveryCode(codes.plain[5], remaining)) === -1);
  check('a wrong code fails', (await matchRecoveryCode('zzzz-zzzz', codes.hashes)) === -1);

  const tok = await signEnrolToken({ adminId: 'a1', secret });
  const back = await verifyEnrolToken(tok);
  check('enrol token round-trips', !!back && back.adminId === 'a1' && back.secret === secret);
  check('tampered enrol token fails', (await verifyEnrolToken(tok.slice(0, -2) + 'xx')) === null);

  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
