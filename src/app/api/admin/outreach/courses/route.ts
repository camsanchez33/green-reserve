// Inquiries data (Cam 2026-11-17): "Add to Targets". Body: { facts: { courseName, city, ...optional facts },
// contact?: { name, role, email, phone, ... }, notes?, source?, confirmDuplicate? }. Only name and town are
// required. A likely duplicate (same map listing, website, phone, or name and town — across every inquiry
// and every real course) answers 409 { code: 'duplicate', duplicates } unless confirmDuplicate is true.
// Pipeline area, manager+, audited.
import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, areaGate } from '@/lib/admin-session';
import { addCourse } from '@/lib/outreach-server';
import { auditAdmin } from '@/lib/admin-audit';
import { signedOut, outreachRole, viewerOf, failRes, readJson } from '../gate';

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return signedOut();
  const noArea = areaGate(session, 'pipeline');
  if (noArea) return noArea;
  const denied = outreachRole(session, true);
  if (denied) return denied;
  const g = { session, viewer: viewerOf(session) };
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: 'Send the course.' }, { status: 400 });
  const r = await addCourse(body, g.session.name || 'Admin');
  if (!r.ok) return failRes(r);
  await auditAdmin(g.session, { action: 'outreach_course_add', targetType: 'inquiry', targetId: r.id, after: { duplicateConfirmed: r.duplicates.length > 0 } });
  return NextResponse.json({ success: true, id: r.id });
}
