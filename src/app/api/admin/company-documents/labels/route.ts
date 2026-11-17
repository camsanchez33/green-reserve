import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { companyDocsGate, allLabels, cleanName, LABEL_NAME_MAX } from '@/lib/company-documents-data';
import { removeLabel } from '@/lib/company-documents-ops';
import { auditAdmin } from '@/lib/admin-audit';

// Company docs data (Cam 2026-11-17): Cam's own labels. The six built-in
// labels are fixed (no rename, no remove). Owner with 2FA only.
//   GET                       every label (counts come with the documents, GET ..)
//   POST   { name }           add one
//   PATCH  { id, name }       rename one of Cam's
//   DELETE ?id=&moveTo=       remove one of Cam's; one holding documents needs
//                             moveTo (another label) and moves them there first.
// Files from before this change sit in built-in folders, so a label of Cam's
// only ever holds documents with rows.

async function nameTaken(name: string, exceptId?: string) {
  const lower = name.toLowerCase();
  return (await allLabels()).some(l => l.name.toLowerCase() === lower && l.key !== exceptId);
}

export async function GET() {
  const g = await companyDocsGate();
  if ('res' in g) return g.res;
  return NextResponse.json({ labels: await allLabels() });
}

export async function POST(req: NextRequest) {
  const g = await companyDocsGate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => null) as { name?: unknown } | null;
  const name = cleanName(body?.name, LABEL_NAME_MAX);
  if (!name) return NextResponse.json({ error: `Name the label (up to ${LABEL_NAME_MAX} characters).` }, { status: 400 });
  if (await nameTaken(name)) return NextResponse.json({ error: 'There’s already a label with that name.' }, { status: 409 });
  const label = await prisma.companyDocLabel.create({ data: { name }, select: { id: true, name: true } });
  await auditAdmin(g.session, { action: 'company_doc_label_add', targetType: 'company_doc_label', targetId: label.id, after: { name } });
  return NextResponse.json({ label: { key: label.id, name: label.name, builtIn: false, count: 0 } });
}

export async function PATCH(req: NextRequest) {
  const g = await companyDocsGate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => null) as { id?: unknown; name?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const name = cleanName(body?.name, LABEL_NAME_MAX);
  if (!name) return NextResponse.json({ error: `Name the label (up to ${LABEL_NAME_MAX} characters).` }, { status: 400 });
  const before = id ? await prisma.companyDocLabel.findUnique({ where: { id }, select: { name: true } }) : null;
  if (!before) return NextResponse.json({ error: 'Only your own labels can be renamed.' }, { status: 404 });
  if (await nameTaken(name, id)) return NextResponse.json({ error: 'There’s already a label with that name.' }, { status: 409 });
  await prisma.companyDocLabel.update({ where: { id }, data: { name } });
  await auditAdmin(g.session, { action: 'company_doc_label_rename', targetType: 'company_doc_label', targetId: id, before: { name: before.name }, after: { name } });
  return NextResponse.json({ label: { key: id, name, builtIn: false } });
}

export async function DELETE(req: NextRequest) {
  const g = await companyDocsGate();
  if ('res' in g) return g.res;
  const r = await removeLabel(g.session, req.nextUrl.searchParams.get('id') || '', req.nextUrl.searchParams.get('moveTo') || '');
  return NextResponse.json(r.body, { status: r.status });
}
