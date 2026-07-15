import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { classifyIdentifier, generateOtpCode, hashOtpCode, signOtpChallenge } from '@/lib/golfer-otp';
import { sendGolferOtpEmail } from '@/lib/email';
import { sendSmsOtp } from '@/lib/twilio';

// Always returns the same generic response whether or not the identifier
// matches an existing GolferAccount — no account enumeration.
export async function POST(req: NextRequest) {
  const { identifier: raw, courseName } = await req.json().catch(() => ({}));
  const parsed = classifyIdentifier(String(raw || ''));
  if (!parsed) {
    return NextResponse.json({ error: 'Enter a valid email or phone number.' }, { status: 400 });
  }
  const { identifier, type } = parsed;

  const ip = clientIp(req);
  const perIdOk = await rateLimit(`golfer-otp-req:${identifier}`, 3, 600);
  const perIpOk = await rateLimit(`golfer-otp-req-ip:${ip}`, 10, 600);
  if (!perIdOk || !perIpOk) {
    return NextResponse.json({ error: 'Too many attempts — try again in a few minutes.' }, { status: 429 });
  }

  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code);
  const challengeToken = await signOtpChallenge(identifier, type, codeHash);

  try {
    if (type === 'email') {
      await sendGolferOtpEmail({ email: identifier, code, courseName: String(courseName || 'GreenReserve') });
    } else {
      await sendSmsOtp(identifier, code);
    }
  } catch (err) {
    console.error('golfer OTP send failed:', err);
    return NextResponse.json({ error: 'Could not send your code. Try again shortly.' }, { status: 502 });
  }

  return NextResponse.json({ challengeToken, type });
}
