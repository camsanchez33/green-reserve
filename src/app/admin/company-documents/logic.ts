// Settings → Company docs (Cam approved the mockup 2026-11-17, lanes/admin/company-docs-mockup.html; lanes/admin.md
// "Company docs"). What the page reads from /api/admin/company-documents, and how it decides what to show.
//
// Wire what exists, never fake: today's route returns the stored files with a built-in category. Build is adding
// labels, versions, history and a step-up on delete. Each turns on here only when its field arrives:
//   labels (array on the response)   → your own labels, the edit pen, "New label", Change label
//   document.id                      → History (GET .../history?id=), Replace, Change label
//   document.version                 → "Version n" on the line and in the details
// Without them the page is today's: the six built-in groups, upload, open, delete.
import { COMPANY_DOC_CATEGORIES, COMPANY_DOC_MAX_BYTES, COMPANY_DOC_TYPES } from '@/lib/company-documents';

export type Doc = {
  url: string; pathname: string; size: number; uploadedAt: string; category: string; name: string;
  id?: string; label?: string; version?: number;
};
export type Label = { key: string; name: string; builtIn: boolean };
export type HistoryItem = { what: string; who: string; at: string };
export type Listing = { documents: Doc[]; labels?: Label[] };

export const BUILT_IN: Label[] = COMPANY_DOC_CATEGORIES.map(c => ({ key: c.key, name: c.label, builtIn: true }));
const BUILT_IN_KEYS = new Set(BUILT_IN.map(l => l.key));

/** The labels to group by: the route's when it sends them, otherwise the six built-in ones. */
export const labelsOf = (l: Listing | null): Label[] => (l?.labels && l.labels.length ? l.labels : BUILT_IN);
export const hasLabels = (l: Listing | null) => Array.isArray(l?.labels);
export const labelOf = (d: Doc) => d.label || d.category;

/** A document whose label isn't in the list (a label removed elsewhere) still shows, under Other. */
export function groupDocs(docs: Doc[], labels: Label[]): Map<string, Doc[]> {
  const keys = new Set(labels.map(l => l.key));
  const out = new Map<string, Doc[]>(labels.map(l => [l.key, []]));
  for (const d of docs) {
    const k = keys.has(labelOf(d)) ? labelOf(d) : (keys.has('other') ? 'other' : labels[0]?.key);
    if (k) out.get(k)!.push(d);
  }
  return out;
}

/** The folder an upload goes to: a built-in label's own, or other/ for your own labels (the route records the label). */
export const folderFor = (labelKey: string) => (BUILT_IN_KEYS.has(labelKey) ? labelKey : 'other');

export const safeFileName = (name: string) =>
  name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+/, '').slice(0, 120) || 'document';

/** Today's checks, before anything leaves the browser. */
export function fileProblem(f: File): string | null {
  if (!(COMPANY_DOC_TYPES as readonly string[]).includes(f.type)) return 'Only PDF, PNG or JPEG files can be stored here.';
  if (f.size > COMPANY_DOC_MAX_BYTES) return 'That file is over 25 MB. Compress it and try again.';
  return null;
}

export const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const kindOf = (d: Doc) => (/\.pdf$/i.test(d.pathname) ? 'PDF' : /\.png$/i.test(d.pathname) ? 'PNG' : /\.jpe?g$/i.test(d.pathname) ? 'JPEG' : 'File');
export const openHref = (url: string) => `/api/admin/company-documents/download?url=${encodeURIComponent(url)}`;

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const WHEN = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export const day = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : DAY.format(d); };
export const when = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : WHEN.format(d); };

/** Only Insurance's empty line says more: a missing policy matters before launch. */
export const emptyLine = (l: Label) =>
  `Nothing in ${l.name} yet${l.key === 'insurance' ? '. General liability and cyber insurance belong here before launch.' : '.'}`;
