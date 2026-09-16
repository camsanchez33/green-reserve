// @brain agreement-versions
// AGREEMENT_SPEC AG-1 §2 — versioned agreement documents.
//
// The agreement text lives in the repo as Markdown under legal/documents/
// <document>/<version>.md with a front-matter header. The page and the PDF
// render from the same source, and the archive of "what exactly did the
// course sign" is the file plus its sha256 — never a database blob of HTML.
// Server only (reads the filesystem).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { marked } from 'marked';

export type AgreementDocument = 'operator_agreement' | 'brand_license' | 'accuracy_attestation';

export const DOCUMENT_DIR: Record<AgreementDocument, string> = {
  operator_agreement: 'operator-agreement',
  brand_license: 'brand-license',
  accuracy_attestation: 'accuracy-attestation',
};

export type DocumentMeta = {
  document: AgreementDocument;
  version: string;
  effectiveAt: string;
  reacceptRequired: boolean;
  title: string;
  summary: string[];
  /** AG-2: a draft is never presented for signature. Front matter `draft: true`,
   *  or the COUNSEL "not reviewed" marker in the body (AG-1's drafts carry that
   *  comment rather than a front-matter flag, and their hashes are seeded). */
  draft: boolean;
  /** AG-3: the date counsel reviewed this version, from front matter; '' if absent. */
  counselReviewed: string;
  /** AG-3: what changed in this version, for the day-0 notice; '' if absent. */
  changeSummary: string;
};

export type LoadedDocument = DocumentMeta & {
  /** The Markdown body (front matter stripped). */
  markdown: string;
  /** Rendered HTML of the body. */
  html: string;
  /** sha256 of the ENTIRE file's bytes — front matter included — so a
   *  version bump that only changes metadata still changes the hash. */
  hash: string;
};

const ROOT = path.join(process.cwd(), 'legal', 'documents');

function parseFrontMatter(raw: string): { meta: Record<string, unknown>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, unknown> = {};
  let listKey: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) { (meta[listKey] as string[]).push(item[1].trim()); continue; }
    const kv = line.match(/^([A-Za-z_][\w]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, val] = kv;
    if (val === '') { meta[key] = []; listKey = key; continue; }
    listKey = null;
    meta[key] = val === 'true' ? true : val === 'false' ? false : val.trim();
  }
  return { meta, body: raw.slice(m[0].length) };
}

function filePath(document: AgreementDocument, version: string) {
  return path.join(ROOT, DOCUMENT_DIR[document], `${version}.md`);
}

/** All versions on disk for a document, newest first (versions sort lexically: YYYY-MM). */
export function listVersions(document: AgreementDocument): string[] {
  const dir = path.join(ROOT, DOCUMENT_DIR[document]);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')).sort().reverse();
}

/** The current version of a document = the newest file on disk. */
export function currentVersion(document: AgreementDocument): string {
  const v = listVersions(document)[0];
  if (!v) throw new Error(`No versions on disk for ${document}`);
  return v;
}

export function loadDocument(document: AgreementDocument, version: string = currentVersion(document)): LoadedDocument {
  const p = filePath(document, version);
  const bytes = fs.readFileSync(p);
  const raw = bytes.toString('utf8');
  const { meta, body } = parseFrontMatter(raw);
  const html = marked.parse(body, { async: false }) as string;
  return {
    document,
    version: String(meta.version ?? version),
    effectiveAt: String(meta.effectiveAt ?? ''),
    reacceptRequired: meta.reacceptRequired === true,
    title: String(meta.title ?? document),
    summary: Array.isArray(meta.summary) ? (meta.summary as string[]) : [],
    draft: meta.draft === true || /<!--[^>]*COUNSEL:[^>]*not reviewed/i.test(body),
    counselReviewed: typeof meta.counselReviewed === 'string' ? meta.counselReviewed : '',
    changeSummary: typeof meta.changeSummary === 'string' ? meta.changeSummary : '',
    markdown: body,
    html,
    hash: createHash('sha256').update(bytes).digest('hex'),
  };
}

/** Every document at its current version — what the seed writes and the signing flow shows. */
export function currentDocuments(): LoadedDocument[] {
  return (Object.keys(DOCUMENT_DIR) as AgreementDocument[]).map(d => loadDocument(d));
}

/** AG-2: the documents an operator is asked to sign — every current version that is not a draft. */
export function signableDocuments(): LoadedDocument[] {
  return currentDocuments().filter(d => !d.draft);
}
