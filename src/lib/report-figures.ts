// The monthly report's "By area" figures as they print (lib/monthly-report-pdf, and the page if it wants the
// same words). Pure, and apart from the PDF module so it loads without @react-pdf.
import type { AreaRow } from './monthly-review';

/** Pure: one figure as the report prints it ("—" when there's none). */
export function areaValue(unit: AreaRow['unit'], v: number | null): string {
  if (v == null) return '—';
  if (unit === 'cents') return `$${Math.round(v / 100).toLocaleString('en-US')}`;
  if (unit === 'pct') return `${v}%`;
  return v.toLocaleString('en-US');
}

/** Pure: the change column. Points for a rate, a percent for counts and money. */
export function areaChange(r: AreaRow): string {
  if (r.thisMonth == null || r.lastMonth == null) return '—';
  const sign = (d: number) => (d > 0 ? '+' : d < 0 ? '−' : '');
  if (r.unit === 'pct') { const d = Math.round((r.thisMonth - r.lastMonth) * 10) / 10; return `${sign(d)}${Math.abs(d)} pts`; }
  if (r.lastMonth === 0) return '—';
  const p = Math.round(((r.thisMonth - r.lastMonth) / r.lastMonth) * 100);
  return `${sign(p)}${Math.abs(p)}%`;
}

/**
 * Pure: text the PDF's built-in Helvetica can draw. It has no glyph for the true minus (U+2212) and other
 * signs outside its Latin set, and drops them silently, so "−10%" printed as "10%" (a fall read as nothing).
 */
export function pdfText(s: string): string {
  return s.replace(/[\u2212\u2012\u2010\u2011]/g, '-').replace(/[\u2009\u202f\u00a0]/g, ' ').replace(/[\u2264]/g, '<=').replace(/[\u2265]/g, '>=');
}
