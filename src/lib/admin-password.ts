// Cam 2026-11-16 (PR #415): every write of an admin's or the owner's password is
// a security event, so it shows in Admin → Security's history (who, when, from
// where, how), and an owner password change emails the owner at once. Called by
// every route that writes AdminUser.passwordHash, right after the write.
// Never records or sends the password. Both steps are awaited; neither can undo
// or fail a change that has already been saved (securityEvent swallows and logs
// its own errors; the email's failure is logged here).
import { securityEvent } from './security-events';
import { sendOwnerPasswordChanged } from './email';
import { requestContext, deviceLabel, alertTime } from './owner-session';

export async function passwordChanged(
  req: Request | null,
  admin: { id: string; email: string; name: string; role: string },
  how: string,
): Promise<void> {
  const owner = admin.role === 'owner';
  await securityEvent(req, { kind: 'password_changed', surface: owner ? 'owner' : 'admin', email: admin.email, accountId: admin.id, detail: how });
  if (!owner) return;
  try {
    const ctx = await requestContext();
    await sendOwnerPasswordChanged({ email: admin.email, name: admin.name, how, device: deviceLabel(ctx.userAgent), place: ctx.place, when: alertTime() });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'owner.password_alert.fail', adminId: admin.id, error: err instanceof Error ? err.message : String(err) }));
  }
}
