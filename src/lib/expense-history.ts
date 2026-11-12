// ADMIN-REDO Expenses (Cam 2026-11-12): an expense's history from its audit rows. Pure.
// expense_add → 'added'; expense_edit → 'ended' when endedAt went from empty to a date, else
// 'changed' (a scheduled future end set counts as 'ended' too). There is no restart: once its end
// has passed an expense can't be un-ended (the PATCH route refuses; starting again is a new expense).
// Clearing a still-scheduled end, or an old row that cleared endedAt, reads as a change. The fields that changed (other than
// endedAt) ride along as { field, from, to }. An edit that changed nothing is left out.

export type ExpenseHistoryKind = 'added' | 'changed' | 'ended';
export type ExpenseHistoryEntry = { at: string; by: string; kind: ExpenseHistoryKind; changes?: { field: string; from: unknown; to: unknown }[] };
type AuditRow = { action: string; actorName: string; before: unknown; after: unknown; createdAt: Date };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';
const empty = (v: unknown) => v == null || v === '';

export function expenseHistory(rows: AuditRow[]): ExpenseHistoryEntry[] {
  const out: ExpenseHistoryEntry[] = [];
  for (const r of [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    const at = r.createdAt.toISOString(), by = firstName(r.actorName);
    if (r.action === 'expense_add') { out.push({ at, by, kind: 'added' }); continue; }
    if (r.action !== 'expense_edit') continue;
    const before = obj(r.before), after = obj(r.after);
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const changes = fields.filter(f => f !== 'endedAt' && JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null))
      .map(f => ({ field: f, from: before[f] ?? null, to: after[f] ?? null }));
    let kind: ExpenseHistoryKind = 'changed';
    if ('endedAt' in after || 'endedAt' in before) {
      if (empty(before.endedAt) && !empty(after.endedAt)) kind = 'ended';
      else if (JSON.stringify(before.endedAt ?? null) !== JSON.stringify(after.endedAt ?? null)) changes.push({ field: 'endedAt', from: before.endedAt ?? null, to: after.endedAt ?? null });
    }
    if (kind === 'changed' && !changes.length) continue;
    out.push({ at, by, kind, ...(changes.length ? { changes } : {}) });
  }
  return out;
}
