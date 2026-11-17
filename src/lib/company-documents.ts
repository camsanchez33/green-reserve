// CO-DOCS (Cam 2026-10-01): the company's own paperwork — LLC filing, EIN
// letter, bank and insurance documents, signed contracts — kept in the PRIVATE
// Blob store under company/<category>/. The store's own listing is the record
// (no table): what is in the folder is what the page shows. Owner-only, because
// these carry the founder's home address, tax IDs and bank details.
//
// The repo is PUBLIC, so documents like these must never be committed; this is
// where they go instead.

import { isBlobStoreUrl } from '@/lib/private-blob';

export const COMPANY_DOC_PREFIX = 'company/';

export const COMPANY_DOC_CATEGORIES = [
  { key: 'formation', label: 'Formation' },
  { key: 'tax', label: 'Tax' },
  { key: 'banking', label: 'Banking' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'other', label: 'Other' },
] as const;

export type CompanyDocCategory = typeof COMPANY_DOC_CATEGORIES[number]['key'];

export const COMPANY_DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
export const COMPANY_DOC_MAX_BYTES = 25 * 1024 * 1024;

const CATEGORY_KEYS = new Set<string>(COMPANY_DOC_CATEGORIES.map(c => c.key));
export const isCompanyDocCategory = (v: string): v is CompanyDocCategory => CATEGORY_KEYS.has(v);

/** company/<category>/<file> with a sane file name — the only shape an upload may take. */
export function isAllowedCompanyPath(pathname: string): boolean {
  const m = /^company\/([a-z]+)\/[^/]{1,180}$/.exec(pathname);
  if (!m || !isCompanyDocCategory(m[1]) || pathname.includes('..')) return false;
  return /\.(pdf|png|jpe?g)$/i.test(pathname);
}

/** The category and display name of a stored path (the random suffix Blob adds is dropped). */
export function describeCompanyPath(pathname: string): { category: CompanyDocCategory | 'other'; name: string } {
  const parts = pathname.replace(/^\/+/, '').split('/');
  const category = parts[1] && isCompanyDocCategory(parts[1]) ? parts[1] : 'other';
  let file = parts.slice(2).join('/') || 'document';
  try { file = decodeURIComponent(file); } catch { /* keep it encoded */ }
  // addRandomSuffix turns "llc-filing.pdf" into "llc-filing-AbC123xyz.pdf".
  const name = file.replace(/-[A-Za-z0-9]{20,40}(\.[a-z0-9]+)$/i, '$1');
  return { category, name };
}

/**
 * The path of a company document URL, or null when it is not one. The HOST is
 * checked as well as the path: the Blob SDK sends the store token to whatever
 * URL it is given, so a look-alike path on another host must never reach it.
 */
export function companyDocPathOf(url: string): string | null {
  if (!isBlobStoreUrl(url)) return null;
  const u = new URL(url);
  let pathname: string;
  try { pathname = decodeURIComponent(u.pathname).replace(/^\/+/, ''); } catch { return null; }
  return isAllowedCompanyPath(pathname) ? pathname : null;
}
