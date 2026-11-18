// Inquiries data (Cam 2026-11-17): the people at a course in outreach.
//   POST   { name, role?, email?, phone?, decisionMaker?, preferredChannel?, bestTime? }  add one
//   PATCH  { contactId, ...fields }  edit (only the keys sent change)
//   DELETE ?contactId=               remove
// Business contact details from the course or its public listing only. Pipeline area, manager+, audited
// (the audit row records which fields changed, never the email or phone values).
import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, areaGate } from '@/lib/admin-session';
import { addContact, updateContact, deleteContact } from '@/lib/outreach-server';
import { auditAdmin } from '@/lib/admin-audit';
import { signedOut, outreachRole, viewerOf, failRes, readJson } from '../../gate';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await resolveAdminSession();
  if (!session) return signedOut();
  const noArea = areaGate(session, 'pipeline');
  if (noArea) return noArea;
  const denied = outreachRole(session, true);
  if (denied) return denied;
  const g = { session, viewer: viewerOf(session) };
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: 'Send the contact.' }, { status: 400 });
  const r = await addContact(id, body);
  if (!r.ok) return failRes(r);
  await auditAdmin(g.session, r.replaced
    ? { action: 'outreach_contact_replace', targetType: 'inquiry', targetId: id, after: { contactId: r.contact.id, replacedInquiryContact: true, changed: ['contactName', 'contactTitle', 'email', 'phone'] } }
    : { action: 'outreach_contact_add', targetType: 'inquiry', targetId: id, after: { contactId: r.contact.id, role: r.contact.role, decisionMaker: r.contact.decisionMaker } });
  return NextResponse.json({ success: true, contact: r.contact });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await resolveAdminSession();
  if (!session) return signedOut();
  const noArea = areaGate(session, 'pipeline');
  if (noArea) return noArea;
  const denied = outreachRole(session, true);
  if (denied) return denied;
  const g = { session, viewer: viewerOf(session) };
  const { id } = await params;
  const body = await readJson(req);
  const contactId = String(body?.contactId ?? '');
  if (!body || !contactId) return NextResponse.json({ error: 'Which contact?' }, { status: 400 });
  const { contactId: _c, ...fields } = body;
  const r = await updateContact(id, contactId, fields);
  if (!r.ok) return failRes(r);
  await auditAdmin(g.session, { action: 'outreach_contact_edit', targetType: 'inquiry', targetId: id, after: { contactId, changed: Object.keys(fields) } });
  return NextResponse.json({ success: true, contact: r.contact });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await resolveAdminSession();
  if (!session) return signedOut();
  const noArea = areaGate(session, 'pipeline');
  if (noArea) return noArea;
  const denied = outreachRole(session, true);
  if (denied) return denied;
  const g = { session, viewer: viewerOf(session) };
  const { id } = await params;
  const contactId = req.nextUrl.searchParams.get('contactId') ?? '';
  if (!contactId) return NextResponse.json({ error: 'Which contact?' }, { status: 400 });
  const r = await deleteContact(id, contactId);
  if (!r.ok) return failRes(r);
  await auditAdmin(g.session, { action: 'outreach_contact_delete', targetType: 'inquiry', targetId: id, after: { contactId } });
  return NextResponse.json({ success: true });
}
