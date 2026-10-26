// SEC-3: Admin → Security's checklist — each protection GreenReserve relies on,
// checked live, in plain words. 'bad' means a protection is off; 'warn' means
// it works but is weaker than it should be. Never reveals a secret's value.
import { prisma } from './prisma';

export type Check = { key: string; label: string; status: 'ok' | 'warn' | 'bad' | 'neutral'; text: string };

/** The live site's own headers (SEC-1), fetched the way a browser would. */
async function headerCheck(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<Check> {
  const label = 'Security headers on the live site';
  const base = env.NEXT_PUBLIC_URL;
  if (!base) return { key: 'headers', label, status: 'neutral', text: 'NEXT_PUBLIC_URL isn’t set here, so the live site can’t be checked.' };
  try {
    const res = await fetchImpl(`${base.replace(/\/+$/, '')}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const h = (k: string) => res.headers.get(k) ?? '';
    const missing = [
      !/max-age=\d{7,}/.test(h('strict-transport-security')) && 'HTTPS-only',
      h('x-frame-options').toUpperCase() !== 'DENY' && 'no framing',
      h('x-content-type-options') !== 'nosniff' && 'no sniffing',
      !/frame-ancestors 'none'/.test(h('content-security-policy')) && 'content policy',
    ].filter(Boolean);
    return missing.length
      ? { key: 'headers', label, status: 'bad', text: `Missing: ${missing.join(', ')}. Check next.config.ts was deployed.` }
      : { key: 'headers', label, status: 'ok', text: 'HTTPS-only, no framing, no sniffing and the content policy are all being sent.' };
  } catch {
    return { key: 'headers', label, status: 'warn', text: 'Couldn’t reach the live site to check — try again in a minute.' };
  }
}

export async function securityChecklist(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<Check[]> {
  const owner = await prisma.adminUser.findFirst({ where: { role: 'owner', active: true }, select: { id: true, twoFactorSecret: true, twoFactorRecoveryCodes: true } });
  const [passkeys, devices, employees, headers] = await Promise.all([
    owner ? prisma.ownerPasskey.count({ where: { adminId: owner.id } }) : Promise.resolve(0),
    owner ? prisma.ownerDevice.count({ where: { adminId: owner.id, approvedAt: { not: null }, revokedAt: null } }) : Promise.resolve(0),
    prisma.adminUser.count({ where: { active: true, role: { not: 'owner' } } }),
    headerCheck(env, fetchImpl),
  ]);
  const codesLeft = owner?.twoFactorRecoveryCodes.length ?? 0;
  const jwtLen = (env.JWT_SECRET ?? '').length;

  return [
    headers,
    { key: 'sentry', label: 'Error reporting (Sentry)', ...(env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN
      ? { status: 'ok' as const, text: 'Errors on the site and in the API are reported, with nothing personal attached (sentry.privacy.ts).' }
      : { status: 'bad' as const, text: 'No Sentry DSN — errors happen silently. Add SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN in Vercel.' }) },
    { key: 'sentry-read', label: 'Sentry errors shown here', ...(env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT
      ? { status: 'ok' as const, text: 'A read-only token is set; the open errors are listed below.' }
      : { status: 'warn' as const, text: 'Add a read-only SENTRY_AUTH_TOKEN (event:read, project:read) plus SENTRY_ORG and SENTRY_PROJECT in Vercel.' }) },
    { key: 'owner-passkey', label: 'Owner sign-in: passkey', ...(passkeys > 0
      ? { status: 'ok' as const, text: `${passkeys} passkey${passkeys === 1 ? '' : 's'} registered — the strongest second factor.` }
      : { status: 'warn' as const, text: 'No passkey yet. Add one on My profile — it can’t be phished like a code.' }) },
    { key: 'owner-app', label: 'Owner sign-in: authenticator backup', ...(owner?.twoFactorSecret
      ? codesLeft >= 3
        ? { status: 'ok' as const, text: `Authenticator app set up; ${codesLeft} recovery codes left.` }
        : { status: 'warn' as const, text: `Only ${codesLeft} recovery code${codesLeft === 1 ? '' : 's'} left — make new ones on My profile.` }
      : { status: 'warn' as const, text: 'No authenticator app — the owner falls back to emailed codes. Set one up on My profile.' }) },
    { key: 'owner-devices', label: 'Owner devices allowed to sign in', status: devices > 0 ? 'neutral' : 'warn', text: devices > 0 ? `${devices} approved device${devices === 1 ? '' : 's'}. Remove any you don’t recognise on My profile.` : 'No approved devices.' },
    { key: 'employees', label: 'Employee sign-in', status: employees > 0 ? 'warn' : 'ok', text: employees > 0
      ? `${employees} employee login${employees === 1 ? '' : 's'} sign in with a password only — no second factor yet. Five wrong passwords lock the account for 15 minutes.`
      : 'No employee logins.' },
    { key: 'jwt', label: 'Session signing key', status: jwtLen >= 32 ? 'ok' : 'bad', text: jwtLen >= 32 ? 'Long enough to resist guessing.' : 'JWT_SECRET is missing or shorter than 32 characters — every session could be forged. Set a long random value in Vercel.' },
    { key: 'cron', label: 'Scheduled jobs locked', status: env.CRON_SECRET ? 'ok' : 'bad', text: env.CRON_SECRET ? 'Only Vercel’s scheduler can run them (CRON_SECRET).' : 'CRON_SECRET is not set — the charging, reminder and check jobs refuse to run until it is.' },
    { key: 'stripe-webhook', label: 'Stripe events verified', status: env.STRIPE_WEBHOOK_SECRET ? 'ok' : 'bad', text: env.STRIPE_WEBHOOK_SECRET ? 'Every Stripe event is checked against its signature.' : 'STRIPE_WEBHOOK_SECRET is not set — Stripe events can’t be verified.' },
    { key: 'packages', label: 'Known flaws in packages', status: 'neutral', text: 'Checked by GitHub every morning and on every change (Security workflow); a high or critical flaw blocks the change.' },
  ];
}
