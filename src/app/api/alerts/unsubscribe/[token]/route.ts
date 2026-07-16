import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const alert = await prisma.teeTimeAlert.findUnique({
    where: { token },
    select: { id: true, course: { select: { name: true, slug: true } } },
  });

  if (alert) {
    await prisma.teeTimeAlert.delete({ where: { token } });
  }

  const base = process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
  // No golfer screen is a dead end — offer the portal and the course page,
  // not a generic marketplace link, even when the alert's own course can't
  // be resolved (e.g. link already used and the alert row is gone).
  const courseSlug = alert?.course.slug;
  const courseName = alert?.course.name || 'GreenReserve';
  const courseLink = courseSlug ? `${base}/courses/${courseSlug}` : `${base}/courses`;
  const portalLink = courseSlug ? `${base}/courses/${courseSlug}/account` : base;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Unsubscribed — GreenReserve</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:48px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;color:#111827;text-align:center;}
h1{font-size:22px;font-weight:700;margin:0 0 12px;}
p{color:#6b7280;font-size:15px;margin:0 0 24px;}
a.primary{display:block;background:#1b4332;color:#fff;text-decoration:none;padding:12px 24px;border-radius:4px;font-weight:600;font-size:14px;margin-bottom:12px;}
a.secondary{display:block;color:#1b4332;text-decoration:none;padding:8px;font-weight:600;font-size:13px;}
.card{max-width:360px;margin:0 auto;}</style>
</head>
<body>
<div class="card">
<h1>${alert ? 'You\'ve been unsubscribed' : 'Already removed'}</h1>
<p>${alert ? 'You won\'t receive any more tee time alerts for this entry.' : 'This alert link has already been used or does not exist.'}</p>
<a class="primary" href="${portalLink}">View my bookings</a>
<a class="secondary" href="${courseLink}">Back to ${courseName}</a>
</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
