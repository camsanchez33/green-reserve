// R-AUTH-001 — the golfer sign-in challenge must carry nothing an attacker can
// crack offline. It used to hold bcrypt(code): a JWT is signed, not encrypted,
// so the requester held a verifier for a 10^6 keyspace. Pure, no database.
// Run: JWT_SECRET=x npx tsx scripts/golfer-otp-test.ts
import { decodeJwt } from 'jose';
import { signOtpChallenge, verifyOtpChallenge, otpCodeMatches } from '../src/lib/golfer-otp';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function main() {
  const code = '482913';
  const token = await signOtpChallenge('golfer@test.local', 'email', code);
  const payload = decodeJwt(token) as Record<string, unknown>;
  const raw = JSON.stringify(payload);
  check('the token carries no code hash', !('codeHash' in payload), raw);
  check('the token carries no bcrypt string', !/\$2[aby]\$/.test(raw));
  check('the token does not contain the code', !raw.includes(code));

  const c = await verifyOtpChallenge(token);
  check('a fresh challenge verifies', !!c);
  check('the right code matches', !!c && otpCodeMatches(c, code));
  check('a wrong code does not match', !!c && !otpCodeMatches(c, '000000'));

  // The MAC is bound to its own challenge id: a MAC lifted from one challenge
  // (for a code the attacker knows) cannot be presented with another.
  const other = await verifyOtpChallenge(await signOtpChallenge('golfer@test.local', 'email', code));
  check('two challenges for the same code have different MACs', !!c && !!other && c.codeMac !== other.codeMac);
  check('a MAC does not verify under another challenge id', !!c && !!other && !otpCodeMatches({ ...other, codeMac: c.codeMac }, '000000') && !otpCodeMatches({ ...c, cid: other.cid }, code));
  check('a MAC does not verify for another identifier', !!c && !otpCodeMatches({ ...c, identifier: 'someone-else@test.local' }, code));

  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
