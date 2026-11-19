// Emails and texts redo (Cam 2026-11-19, lanes/build.md "Emails and texts redo — APPROVED"): short links
// for texts, on our own domain — greenreserve.app/b/<code> (booking details), /p/ (pay), /r/ (receipt),
// /a/ (a tee time alert). Each code stands for ONE long link we already send; the route redirects to
// exactly that link, so a short link exposes nothing more than the long one did.
//
//   Unguessable: 10 characters from a 32-letter alphabet (~50 bits, crypto random). The redirect routes
//   are rate limited per connection on top, so walking the space is hopeless.
//   Expiring with it: the page the long link opens still checks its own token, so if that token is
//   replaced or the booking is gone, the short link stops working too; a long link with its own end
//   (an alert's last date) stores it as expiresAt and the short link 404s after it.
//   Own site only: the target is a path on our site, never a full URL, so a code can't send anyone
//   elsewhere.
//
// If a short link can't be made (database trouble), callers get the long link back: the text still goes.
import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import { rateLimit, evidentiaryIp } from './rate-limit';

export const SHORT_KINDS = ['b', 'p', 'r', 'a'] as const;
export type ShortKind = (typeof SHORT_KINDS)[number];
export const isShortKind = (k: unknown): k is ShortKind => typeof k === 'string' && (SHORT_KINDS as readonly string[]).includes(k);

/** Digits and capitals with no 0/O or 1/I, easy to read back from a phone. 32 letters → 5 bits each. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 10;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function newCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[bytes[i] & 31]; // 256 is a multiple of 32: no bias
  return s;
}

function site(): string {
  return (process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app').replace(/\/+$/, '');
}
/** "greenreserve.app" — how the link is printed in a text (phones link it without the https://). */
export function shortHost(): string {
  return site().replace(/^https?:\/\//, '');
}

/** The path and query of a link on our own site, or null when it points anywhere else. */
export function ownPath(longUrl: string): string | null {
  try {
    const base = new URL(site());
    const u = new URL(longUrl, base);
    if (u.origin !== base.origin) return null;
    if (!u.pathname.startsWith('/') || u.pathname.startsWith('//')) return null;
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

/**
 * The short form of a long link we are about to text: "greenreserve.app/p/K7Q2XM4T8Z".
 * The same long link reuses its code. Never throws: on any trouble it returns the long link itself.
 */
export async function shortLink(kind: ShortKind, longUrl: string, opts: { courseId?: string | null; expiresAt?: Date | null } = {}): Promise<string> {
  const target = ownPath(longUrl);
  if (!target) return longUrl;
  try {
    const now = new Date();
    // The same long link with the same end reuses its code (an alert re-sent for the same date).
    const existing = await prisma.shortLink.findFirst({
      where: { kind, target, expiresAt: opts.expiresAt ?? null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { code: true },
    });
    if (existing) return `${shortHost()}/${kind}/${existing.code}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = newCode();
      try {
        await prisma.shortLink.create({ data: { code, kind, target, courseId: opts.courseId ?? null, expiresAt: opts.expiresAt ?? null } });
        return `${shortHost()}/${kind}/${code}`;
      } catch (err) {
        if ((err as { code?: string })?.code !== 'P2002') throw err; // a code collision: draw again
      }
    }
  } catch (err) {
    console.error(JSON.stringify({ ev: 'short_link.create_fail', kind, error: err instanceof Error ? err.message : String(err) }));
  }
  return longUrl;
}

/** The long link a code stands for (path on our site), or null: unknown, wrong kind or expired. */
export async function resolveShortLink(kind: string, code: string, now = new Date()): Promise<string | null> {
  if (!isShortKind(kind) || !CODE_RE.test(code)) return null;
  const row = await prisma.shortLink.findUnique({ where: { code }, select: { kind: true, target: true, expiresAt: true } });
  if (!row || row.kind !== kind) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return null;
  return ownPath(row.target);
}

/** The GET handler behind /b, /p, /r and /a. Public by design: the code is the secret, like the long link's token. */
export function shortLinkRoute(kind: ShortKind) {
  return async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
    const { code } = await params;
    const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' };
    if (!(await rateLimit(`short-link:ip:${evidentiaryIp(req)}`, 60, 600))) {
      return new NextResponse('Too many requests. Try again in a few minutes.', { status: 429, headers });
    }
    const target = await resolveShortLink(kind, code);
    if (!target) return new NextResponse('This link has expired or doesn’t exist.', { status: 404, headers });
    return NextResponse.redirect(`${site()}${target}`, { status: 302, headers });
  };
}
