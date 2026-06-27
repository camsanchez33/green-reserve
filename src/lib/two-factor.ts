import { prisma } from '@/lib/prisma';
import { sendTwoFactorCodeEmail } from '@/lib/email';
import { sendSmsOtp } from '@/lib/twilio';
import bcrypt from 'bcryptjs';
import type { CourseOperator } from '@prisma/client';

// Generates a fresh 6-digit code, stores its hash on the operator, and sends it
// via the requested channel — falling back to email if SMS was requested but no
// phone number is on file. Shared by login (initial send) and the resend endpoint.
export async function issueTwoFactorCode(operator: CourseOperator, methodOverride?: string) {
  const requested = methodOverride || operator.twoFactorMethod;
  const method = requested === 'sms' && operator.phone ? 'sms' : 'email';
  console.log('[2fa] issueTwoFactorCode — operatorId:', operator.id, '| requested:', requested, '| resolved:', method, '| hasPhone:', !!operator.phone);

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedCode = await bcrypt.hash(code, 10);
  await prisma.courseOperator.update({
    where: { id: operator.id },
    data: { twoFactorCode: hashedCode, twoFactorCodeExpiry: new Date(Date.now() + 10 * 60 * 1000) },
  });

  let actualMethod = method;

  if (method === 'sms') {
    console.log('[2fa] sending via SMS');
    try {
      await sendSmsOtp(operator.phone, code);
    } catch (smsErr) {
      console.error('[2fa] SMS failed, falling back to email:', smsErr);
      actualMethod = 'email';
      await sendTwoFactorCodeEmail({ operatorName: operator.name, operatorEmail: operator.email, code });
    }
  } else {
    console.log('[2fa] sending via email to:', operator.email);
    await sendTwoFactorCodeEmail({ operatorName: operator.name, operatorEmail: operator.email, code });
  }

  return { method: actualMethod, phoneLast4: operator.phone ? operator.phone.slice(-4) : null };
}
