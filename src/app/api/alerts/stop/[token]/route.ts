// ALERTS-2: every alert email's stop link. GET shows the button; POST stops (also the RFC 8058
// one-click POST mail apps send from the List-Unsubscribe header). Idempotent.
import { NextRequest } from 'next/server';
import { alertByToken, stopAlertByToken } from '@/lib/tee-time-alerts';
import { alertPage, htmlResponse } from '@/lib/alert-pages';
import { rateLimit } from '@/lib/rate-limit';

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
  // Per link, not per IP (mail apps send one-click stops from shared addresses), and only for a
  // link that exists, so made-up tokens write nothing.
  const { token } = await params;
  if (!(await alertByToken(token))) return htmlResponse(alertPage({ title: 'Link not found', body: 'This alert link is no longer valid. You can set a new alert from the course’s booking page.' }), 404);
  if (!(await rateLimit('alert:stop:' + String(token).slice(0, 64), 20, 300))) return htmlResponse(alertPage({ title: 'Too many tries', body: 'Wait a minute and try again.' }), 429);
  const r = await stopAlertByToken(token);
  if (r.result === 'missing') return htmlResponse(alertPage({ title: 'Already removed', body: 'This alert link has already been used or does not exist.' }), 404);
  return htmlResponse(alertPage({ title: 'Alert stopped', body: 'You won’t get any more emails or texts for this alert.', course: r.alert?.course }));
}
