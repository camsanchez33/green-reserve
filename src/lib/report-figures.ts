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
