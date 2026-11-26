import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS, areaGate } from '@/lib/admin-session';
import { sendStaffLoginLinkEmail } from '@/lib/email';
import { withAudit } from '@/lib/admin-audit';

async function resendStaffSetup(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const noArea = areaGate(session, 'courses');
  if (noArea) return noArea;
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { staffId } = ((await req.json().catch(() => null)) ?? {}) as { staffId?: unknown };
  if (typeof staffId !== 'string' || !staffId) return NextResponse.json({ error: 'Missing staffId' }, { status: 400 });

  const staff = await prisma.courseStaff.findUnique({
    where: { id: staffId },
    include: { course: { select: { name: true } } },
  });
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 });

  // Audit 2026-11-24 L7: through getResend() and letterEmail() (every string escaped; the send is logged
  // by getResend and throws on a Resend error). It was hand-built HTML from the unescaped name, on its own client.
  try {
    await sendStaffLoginLinkEmail({ to: staff.email, personName: staff.name, courseName: staff.course?.name ?? '', courseId: staff.courseId });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'staff_setup_email.fail', staffId: staff.id, error: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: `The login email did not send (${err instanceof Error ? err.message : 'email error'}). Check the address and try again.` }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}

// BRAIN-1a: recorded.
export const POST = withAudit(resendStaffSetup, body => ({ action: 'resend_staff_setup', targetType: 'staff', targetId: String(body.staffId ?? '') }));
