// ALERTS-2: every alert email's stop link. GET shows the button; POST stops (also the RFC 8058
// one-click POST mail apps send from the List-Unsubscribe header). Idempotent.
import { NextRequest } from 'next/server';
import { alertByToken, stopAlertByToken } from '@/lib/tee-time-alerts';
import { alertPage, htmlResponse } from '@/lib/alert-pages';
import { rateLimit, clientIp } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const alert = await alertByToken(token);
  if (!alert) return htmlResponse(alertPage({ title: 'Already removed', body: 'This alert link has already been used or does not exist.' }), 404);
  if (alert.status !== 'pending' && alert.status !== 'active') return htmlResponse(alertPage({ title: 'Alert stopped', body: 'You won’t get any more emails or texts for this alert.', course: alert.course }));
  return htmlResponse(alertPage({
    title: 'Stop this alert?',
    body: `You won’t get any more emails or texts for this tee time alert at ${alert.course.name}.`,
    course: alert.course,
    action: { url: `/api/alerts/stop/${encodeURIComponent(token)}`, label: 'Stop alert' },
  }));
}

export async function POST(req: NextRequest, { params }: Ctx) {
  if (!(await rateLimit('alert:stop:' + clientIp(req), 30, 300))) return htmlResponse(alertPage({ title: 'Too many tries', body: 'Wait a minute and try again.' }), 429);
  const { token } = await params;
  const r = await stopAlertByToken(token);
  if (r.result === 'missing') return htmlResponse(alertPage({ title: 'Already removed', body: 'This alert link has already been used or does not exist.' }), 404);
  return htmlResponse(alertPage({ title: 'Alert stopped', body: 'You won’t get any more emails or texts for this alert.', course: r.alert?.course }));
}
