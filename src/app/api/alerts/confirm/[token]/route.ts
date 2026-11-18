// ALERTS-2: a guest turns their alert on from the emailed link. GET shows the button; POST confirms.
import { NextRequest } from 'next/server';
import { alertByToken, confirmAlert } from '@/lib/tee-time-alerts';
import { alertPage, htmlResponse } from '@/lib/alert-pages';
import { rateLimit, clientIp } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const alert = await alertByToken(token);
  if (!alert) return htmlResponse(alertPage({ title: 'Link not found', body: 'This alert link is no longer valid. You can set a new alert from the course’s booking page.' }), 404);
  if (alert.status === 'active') return htmlResponse(alertPage({ title: 'Alert on', body: 'This alert is already on. We’ll email you when a time opens. First to book gets it.', course: alert.course }));
  if (alert.status !== 'pending') return htmlResponse(alertPage({ title: 'Alert ended', body: 'This alert has ended or was stopped. You can set a new one from the booking page.', course: alert.course }));
  return htmlResponse(alertPage({
    title: 'Turn on your alert',
    body: `We’ll email you${alert.phone ? ` and text the number ending ${alert.phone.slice(-4)}` : ''} when a tee time opens at ${alert.course.name} for ${alert.players} player${alert.players === 1 ? '' : 's'}. First to book gets it; nothing is held.`,
    course: alert.course,
    action: { url: `/api/alerts/confirm/${encodeURIComponent(token)}`, label: 'Turn on alert' },
  }));
}

export async function POST(req: NextRequest, { params }: Ctx) {
  // Per link, not per IP (mail apps send one-click stops from shared addresses), and only for a
  // link that exists, so made-up tokens write nothing. Confirm, which mail apps never POST, keeps an IP limit too.
  const { token } = await params;
  if (!(await rateLimit('alert:confirm:ip:' + clientIp(req), 30, 300))) return htmlResponse(alertPage({ title: 'Too many tries', body: 'Wait a minute and try again.' }), 429);
  if (!(await alertByToken(token))) return htmlResponse(alertPage({ title: 'Link not found', body: 'This alert link is no longer valid. You can set a new alert from the course’s booking page.' }), 404);
  if (!(await rateLimit('alert:confirm:' + String(token).slice(0, 64), 20, 300))) return htmlResponse(alertPage({ title: 'Too many tries', body: 'Wait a minute and try again.' }), 429);
  const r = await confirmAlert(token);
  if (r.result === 'missing') return htmlResponse(alertPage({ title: 'Link not found', body: 'This alert link is no longer valid. You can set a new alert from the course’s booking page.' }), 404);
  if (r.result === 'ended') return htmlResponse(alertPage({ title: 'Alert ended', body: 'The last date on this alert has passed. You can set a new one from the booking page.', course: r.alert?.course }));
  if (r.result === 'off') return htmlResponse(alertPage({ title: 'Alerts are off', body: 'This course isn’t taking tee time alerts right now, so nothing was turned on.', course: r.alert?.course }));
  if (r.result === 'stopped') return htmlResponse(alertPage({ title: 'Alert stopped', body: 'This alert was stopped. You can set a new one from the booking page.', course: r.alert?.course }));
  return htmlResponse(alertPage({ title: 'Alert on', body: 'We’ll email you when a time opens. First to book gets it. Every alert email has a link to stop alerts.', course: r.alert?.course }));
}
