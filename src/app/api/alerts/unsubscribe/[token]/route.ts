import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const alert = await prisma.teeTimeAlert.findUnique({ where: { token } });

  if (alert) {
    await prisma.teeTimeAlert.delete({ where: { token } });
  }

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Unsubscribed — GreenReserve</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:48px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;color:#111827;text-align:center;}
h1{font-size:22px;font-weight:700;margin:0 0 12px;}
p{color:#6b7280;font-size:15px;margin:0 0 24px;}
a{display:inline-block;background:#1b4332;color:#fff;text-decoration:none;padding:12px 24px;border-radius:4px;font-weight:600;font-size:14px;}</style>
</head>
<body>
<h1>${alert ? 'You\'ve been unsubscribed' : 'Already removed'}</h1>
<p>${alert ? 'You won\'t receive any more tee time alerts for this entry.' : 'This alert link has already been used or does not exist.'}</p>
<a href="https://greenreserve.app/courses">Browse tee times</a>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
