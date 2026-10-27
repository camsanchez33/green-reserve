import { prisma } from '@/lib/prisma';
import { sendTwoFactorCodeEmail } from '@/lib/email';
import { sendSmsOtp } from '@/lib/twilio';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import type { CourseOperator } from '@prisma/client';

// The stored code carries the channel it actually went out on ('email:<hash>' /
// 'sms:<hash>'), so the verify step knows whether a right code also proves the
// inbox (Cam 2026-10-27: an owner who signs in with an emailed code is not sent
// back to "confirm your email"). A stored value with neither prefix is unknown.
export type CodeChannel = 'email' | 'sms' | null;
export function readStoredCode(stored: string): { channel: CodeChannel; hash: string } {
  if (stored.startsWith('email:')) return { channel: 'email', hash: stored.slice(6) };
  if (stored.startsWith('sms:')) return { channel: 'sms', hash: stored.slice(4) };
  return { channel: null, hash: stored };
}

// Generates a fresh 6-digit code, stores its hash on the operator, and sends it
// via the requested channel — falling back to email if SMS was requested but no
// phone number is on file. Shared by login (initial send) and the resend endpoint.
export async function issueTwoFactorCode(operator: CourseOperator, methodOverride?: string) {
  const requested = methodOverride || operator.twoFactorMethod;
  const method = requested === 'sms' && operator.phone ? 'sms' : 'email';
  console.log('[2fa] issueTwoFactorCode — operatorId:', operator.id, '| requested:', requested, '| resolved:', method, '| hasPhone:', !!operator.phone);

  const code = randomInt(100000, 1000000).toString();
  const hashedCode = await bcrypt.hash(code, 10);
  await prisma.courseOperator.update({
    where: { id: operator.id },
    data: { twoFactorCode: `${method}:${hashedCode}`, twoFactorCodeExpiry: new Date(Date.now() + 10 * 60 * 1000) },
  });

  let actualMethod = method;

  if (method === 'sms') {
    console.log('[2fa] sending via SMS');
    try {
      await sendSmsOtp(operator.phone, code);
    } catch (smsErr) {
      console.error('[2fa] SMS failed, falling back to email:', smsErr);
      actualMethod = 'email';
      // A fresh code for the email: the SMS may have landed despite the error, and a
      // code that also sits on the phone must not count as proof of the inbox.
      const emailCode = randomInt(100000, 1000000).toString();
      await prisma.courseOperator.update({ where: { id: operator.id }, data: { twoFactorCode: `email:${await bcrypt.hash(emailCode, 10)}` } });
      await sendTwoFactorCodeEmail({ operatorName: operator.name, operatorEmail: operator.email, code: emailCode });
    }
  } else {
    console.log('[2fa] sending via email to:', operator.email);
    await sendTwoFactorCodeEmail({ operatorName: operator.name, operatorEmail: operator.email, code });
  }

  return { method: actualMethod, phoneLast4: operator.phone ? operator.phone.slice(-4) : null };
}
