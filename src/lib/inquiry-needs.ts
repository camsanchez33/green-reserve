// @brain still-need-from-them
// INQUIRY_CALL_SPEC IC-1 §3 — "Still need from them", the sheet's column.
import { agendaStatus, type CallLike, type InquiryLike, type NeedsLike, type SheetLike } from './inquiry-call';
import { missingNeedFields } from './call-answers';

export type NeedItem = { key: string; label: string };

type NeedsInquiry = InquiryLike & {
  events?: { toStatus?: string; fromStatus?: string }[] | null;
  builtCourseLogoUrl?: string | null;
};

/** In the spec's order, deduped. Empty + pending-unreviewed means "Not reviewed yet"; empty + details_submitted/building means "ready to build". */
export function stillNeed(inq: NeedsInquiry, sheet: SheetLike, needs: NeedsLike, calls: CallLike[]): NeedItem[] {
  const reviewed = (inq.events ?? []).some(e => e.toStatus && e.toStatus !== 'pending');
  if (inq.status === 'pending' && !reviewed) return [];

  const out: NeedItem[] = [];
  const push = (key: string, label: string) => { if (!out.some(o => o.key === key)) out.push({ key, label }); };

  if (inq.status === 'details_requested') push('sheet', 'Setup sheet');

  for (const row of agendaStatus(inq, sheet, needs, calls)) {
    if (row.key === 'people' || row.key === 'fee_model') continue; // things WE cover, not things they owe us
    if (row.answered === null && row.fromCall === null) { push(row.key, row.short); continue; }
    // IC-5 §6: discussed, but a key field is still missing → name the field, not the topic.
    if (row.answered === null && row.callItem) {
      const missing = missingNeedFields(row.key, row.callItem);
      if (missing.length) push(row.key, `${row.short}: ${missing.join(', ')}`);
    }
  }

  if (sheet && !(Array.isArray(sheet.photos) && (sheet.photos as unknown[]).length)) push('photos', 'Course photos');
  if (inq.status === 'building' && inq.builtCourseLogoUrl !== undefined && !inq.builtCourseLogoUrl) push('logo', 'Logo');

  return out;
}
