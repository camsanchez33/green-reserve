// ALERTS-2 (Cam 2026-11-18, lanes/golfer.md item 7): set a tee time alert from the booking page.
// No log-in needed. A logged-in member of this course (gr_member) turns it on in one tap with the
// log-in email; a guest gets a confirm link and nothing is sent until they use it. The answer
// is the same whatever email was typed (no hint whether it has alerts or an account).
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { getMemberSession } from '@/lib/member-session';
import { createAlert, sendAlertTextEnrollment } from '@/lib/tee-time-alerts';
import { sendAlertConfirmEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!(await rateLimit('alert:ip:' + ip, 10, 300))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const session = await getMemberSession();
  const keyEmail = session?.email ?? (typeof body.email === 'string' ? body.email.trim().toLowerCase() : '');
  if (keyEmail && !(await rateLimit('alert:email:' + keyEmail, 20, 3600))) {
    return NextResponse.json({ error: 'Too many alerts from this email' }, { status: 429 });
  }

  const r = await createAlert(body, session ? { membershipId: session.membershipId, courseId: session.courseId, email: session.email } : null);
  if (!r.ok) return NextResponse.json(r.body, { status: r.status });

  if (r.status === 'pending') {
    if (r.skipEmail) return NextResponse.json({ status: 'pending', endsOn: r.endsOn });
    try {
      await sendAlertConfirmEmail({
        email: r.alert.email, courseName: r.course.name, courseSlug: r.course.slug, courseId: r.course.id,
        token: r.alert.token, dates: r.alert.dates, players: r.players,
      });
    } catch (err) {
      console.error(JSON.stringify({ ev: 'alerts.confirm_email.fail', error: err instanceof Error ? err.message : String(err) }));
      return NextResponse.json({ error: 'We couldn’t send the email. Try again in a minute.' }, { status: 502 });
    }
    return NextResponse.json({ status: 'pending', endsOn: r.endsOn });
  }

  // A member's alert is on now; a phone new to alert texts gets the one enrollment text.
  if (r.textNew && r.phone) await sendAlertTextEnrollment(r.phone, r.course.id);
  return NextResponse.json({ status: 'active', id: r.alert.id, maskedEmail: r.maskedEmail, endsOn: r.endsOn });
}
