// Server only: the database half of Company docs (company-documents.ts stays client-safe).
// ── Company docs data (Cam 2026-11-17) ─────────────────────────────────────
// Labels: the six built-ins in company-documents.ts (fixed) plus Cam's own (CompanyDocLabel).
// Documents: a CompanyDocument row with its versions (Replace keeps the old
// file). A file already in storage with no row is a "legacy" document, shown
// as before (label from its folder) under the id `legacy:<pathname>`; it gets
// a row the first time it is relabelled, renamed or replaced. No backfill.
// What the routes do is in company-documents-ops.ts.
// History comes from the audit log (targetType 'company_document').

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, OWNER_ONLY, ownerGateError, areaGate, type AdminSession } from '@/lib/admin-session';
import { privateBlobToken, PRIVATE_STORAGE_MISSING } from '@/lib/private-blob';
import { COMPANY_DOC_CATEGORIES, isCompanyDocCategory, isAllowedCompanyPath, describeCompanyPath } from '@/lib/company-documents';

export const LEGACY_PREFIX = 'legacy:';
export const LABEL_NAME_MAX = 40;
export const DOC_NAME_MAX = 120;

export type LabelView = { key: string; name: string; builtIn: boolean };

/** Every label, built-ins first in their fixed order, then Cam's by name. */
export async function allLabels(): Promise<LabelView[]> {
  const own = await prisma.companyDocLabel.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
  return [
    ...COMPANY_DOC_CATEGORIES.map(c => ({ key: c.key as string, name: c.label as string, builtIn: true })),
    ...own.map(l => ({ key: l.id, name: l.name, builtIn: false })),
  ];
}

/** A label key that exists right now (built-in, or one of Cam's). */
export async function labelExists(key: unknown): Promise<boolean> {
  if (typeof key !== 'string' || !key) return false;
  if (isCompanyDocCategory(key)) return true;
  return !!(await prisma.companyDocLabel.findUnique({ where: { id: key }, select: { id: true } }));
}

/** A trimmed, single-line name within `max`, or null. */
export function cleanName(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s && s.length <= max ? s : null;
}

/** The document name a stored file gets by default: its file name without the extension. */
export function defaultDocName(pathname: string): string {
  const { name } = describeCompanyPath(pathname);
  return (name.replace(/\.(pdf|png|jpe?g)$/i, '') || 'Document').slice(0, DOC_NAME_MAX);
}

export type StoredFile = { url: string; pathname: string; size: number; contentType?: string; uploadedAt: Date };

/** The legacy id of a stored file, and back. */
export const legacyId = (pathname: string) => LEGACY_PREFIX + pathname;
export function legacyPathOf(id: string): string | null {
  if (!id.startsWith(LEGACY_PREFIX)) return null;
  const p = id.slice(LEGACY_PREFIX.length);
  return isAllowedCompanyPath(p) ? p : null;
}

/**
 * Give a legacy file its row (version 1, label from its folder), inside `tx`.
 * The file must be in storage now (`file` is what the caller just read from
 * it) and not already a version of some document.
 */
export async function adoptLegacy(tx: Prisma.TransactionClient, file: StoredFile, by: { adminId: string; name: string } | null) {
  const taken = await tx.companyDocumentVersion.findUnique({ where: { pathname: file.pathname }, select: { documentId: true } });
  if (taken) return taken.documentId;
  const doc = await tx.companyDocument.create({
    data: {
      name: defaultDocName(file.pathname), label: describeCompanyPath(file.pathname).category,
      createdAt: file.uploadedAt,
      versions: { create: { version: 1, url: file.url, pathname: file.pathname, size: file.size, contentType: file.contentType ?? '', uploadedById: by?.adminId ?? '', uploadedByName: '', createdAt: file.uploadedAt } },
    },
    select: { id: true },
  });
  return doc.id;
}

/** Audit actions that make up a document's history, in plain words. */
export const HISTORY_WORDS: Record<string, string> = {
  company_document_add: 'Uploaded',
  company_document_replace: 'Replaced',
  company_document_open: 'Opened',
  company_document_relabel: 'Label changed',
  company_document_rename: 'Renamed',
  company_document_delete: 'Deleted',
};

/**
 * A document's history from the audit log: entries naming the document's id or
 * any of its files' paths (entries from before this change name the path).
 */
export async function documentHistory(documentId: string, pathnames: string[]) {
  const rows = await prisma.adminAuditLog.findMany({
    where: { targetType: 'company_document', targetId: { in: [documentId, ...pathnames] }, action: { in: Object.keys(HISTORY_WORDS) } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { action: true, actorName: true, detail: true, after: true, createdAt: true, admin: { select: { name: true } } },
  });
  const labelName = new Map((await allLabels()).map(l => [l.key, l.name]));
  const words = (r: (typeof rows)[number]): string => {
    const after = (r.after ?? {}) as { version?: unknown; label?: unknown };
    // "Replaced (version 1 kept)": the version the replace pushed back.
    if (r.action === 'company_document_replace' && typeof after.version === 'number') return `Replaced (version ${after.version - 1} kept)`;
    if (r.action === 'company_document_relabel' && typeof after.label === 'string') return `Moved to ${labelName.get(after.label) ?? 'a removed label'}`;
    return HISTORY_WORDS[r.action] ?? r.action;
  };
  return rows.map(r => ({ action: r.action, what: words(r), who: r.actorName || r.admin.name, detail: r.detail, at: r.createdAt.toISOString() }));
}

/** The gate every Company docs route uses: owner with 2FA, the 'company' area, and private storage. */
export async function companyDocsGate(): Promise<{ res: NextResponse } | { session: AdminSession; token: string }> {
  const session = await resolveAdminSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const noArea = areaGate(session, 'company');
  if (noArea) return { res: noArea };
  if (!requireRole(session, OWNER_ONLY)) return { res: NextResponse.json({ error: ownerGateError(session) }, { status: 403 }) };
  const token = privateBlobToken();
  if (!token) return { res: NextResponse.json({ error: PRIVATE_STORAGE_MISSING }, { status: 503 }) };
  return { session, token };
}
