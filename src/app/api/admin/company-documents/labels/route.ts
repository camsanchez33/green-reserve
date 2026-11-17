import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { companyDocsGate, allLabels, labelExists, cleanName, LABEL_NAME_MAX } from '@/lib/company-documents-data';
import { auditAdmin } from '@/lib/admin-audit';

// Company docs data (Cam 2026-11-17): Cam's own labels. The six built-in
// labels are fixed (no rename, no remove). Owner with 2FA only.
//   GET                       every label with how many documents it holds
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
  const [labels, counts] = await Promise.all([allLabels(), prisma.companyDocument.groupBy({ by: ['label'], _count: { _all: true } })]);
  const n = new Map(counts.map(c => [c.label, c._count._all]));
  return NextResponse.json({ labels: labels.map(l => ({ ...l, count: n.get(l.key) ?? 0 })) });
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
  const id = req.nextUrl.searchParams.get('id') || '';
  const moveTo = req.nextUrl.searchParams.get('moveTo') || '';
  const label = id ? await prisma.companyDocLabel.findUnique({ where: { id }, select: { name: true } }) : null;
  if (!label) return NextResponse.json({ error: 'Only your own labels can be removed.' }, { status: 404 });
  if (moveTo && (moveTo === id || !(await labelExists(moveTo)))) return NextResponse.json({ error: 'Pick another label to move its documents to.' }, { status: 400 });
  const r = await prisma.$transaction(async tx => {
    const held = await tx.companyDocument.count({ where: { label: id } });
    if (held && !moveTo) return { held, moved: -1 };
    const moved = held ? (await tx.companyDocument.updateMany({ where: { label: id }, data: { label: moveTo } })).count : 0;
    await tx.companyDocLabel.delete({ where: { id } });
    return { held, moved };
  });
  if (r.moved < 0) return NextResponse.json({ error: `This label holds ${r.held} document${r.held === 1 ? '' : 's'}. Pick where to move ${r.held === 1 ? 'it' : 'them'} first.`, code: 'move_required', count: r.held }, { status: 409 });
  await auditAdmin(g.session, { action: 'company_doc_label_remove', targetType: 'company_doc_label', targetId: id, before: { name: label.name }, after: r.moved ? { movedTo: moveTo, documents: r.moved } : undefined });
  return NextResponse.json({ success: true, moved: r.moved });
}
