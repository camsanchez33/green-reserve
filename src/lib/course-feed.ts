// MP-5e part 3 — the course's relationship feed: everything that happened
// between GreenReserve and this course, in one chronological list. The pieces
// all existed (timeline markers, the message thread, pipeline moves, calls) but
// lived on four different tabs, so "when did we last actually talk to them?"
// meant opening all four. Pure, so it can be tested without a database.
import type { TimelineEvent } from './course-timeline';
import { STATUS_LABEL } from './inquiry-status';

export type FeedKind = 'note' | 'message' | 'status' | 'call' | 'settings' | 'agreement' | 'document' | 'reminder';
export type FeedItem = { at: string; kind: FeedKind; text: string; by?: string };

type Msg = { createdAt: Date | string; senderType: string; senderName: string; body: string; isBroadcast: boolean };
type StatusEv = { createdAt: Date | string; fromStatus: string | null; toStatus: string };
type CallRow = { scheduledAt: Date | string; completedAt: Date | string | null; kind: string; outcome: string; durationMin: number };

const iso = (d: Date | string) => new Date(d).toISOString();
const clip = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const label = (s: string) => STATUS_LABEL[s] ?? s;

export function buildRelationshipFeed(src: {
  timeline: TimelineEvent[] | null;
  messages: Msg[];
  statusEvents: StatusEv[];
  calls: CallRow[];
}, limit = 40): FeedItem[] {
  const out: FeedItem[] = [];

  for (const e of src.timeline ?? []) {
    switch (e.type) {
      case 'note_added': out.push({ at: e.at, kind: 'note', text: clip(e.data.text), by: e.data.by }); break;
      case 'checkin_call': out.push({ at: e.at, kind: 'call', text: clip(e.data.text), by: e.data.by }); break;
      case 'settings_changed': {
        const fields = e.data.changes.map(c => c.field);
        out.push({ at: e.at, kind: 'settings', text: `Changed ${fields.slice(0, 4).join(', ')}${fields.length > 4 ? ` +${fields.length - 4} more` : ''}`, by: e.data.by });
        break;
      }
      case 'agreement_accepted': out.push({ at: e.at, kind: 'agreement', text: `Accepted the operator agreement (${e.data.version})`, by: e.data.acceptedBy }); break;
      case 'document_uploaded': out.push({ at: e.at, kind: 'document', text: `Uploaded ${e.data.name}`, by: e.data.by }); break;
      case 'reminder_sent': out.push({ at: e.at, kind: 'reminder', text: `Onboarding reminder sent (${e.data.step})` }); break;
      case 'reminders_paused': out.push({ at: e.at, kind: 'reminder', text: 'Onboarding reminders paused', by: e.data.by }); break;
      case 'reminders_resumed': out.push({ at: e.at, kind: 'reminder', text: 'Onboarding reminders resumed', by: e.data.by }); break;
    }
  }

  for (const m of src.messages) {
    const who = m.senderType === 'operator' ? 'Course' : 'GreenReserve';
    out.push({ at: iso(m.createdAt), kind: 'message', text: `${m.isBroadcast ? 'Announcement' : `${who} wrote`}: ${clip(m.body.replace(/\s+/g, ' ').trim())}`, by: m.senderName });
  }

  // Only real pipeline moves — self-loops are the log markers decoded above.
  for (const s of src.statusEvents) {
    if (!s.fromStatus || s.fromStatus === s.toStatus) continue;
    out.push({ at: iso(s.createdAt), kind: 'status', text: `Moved ${label(s.fromStatus)} → ${label(s.toStatus)}` });
  }

  for (const c of src.calls) {
    const what = c.kind === 'checkin' ? 'Check-in call' : 'Discovery call';
    if (c.outcome === 'scheduled') out.push({ at: iso(c.scheduledAt), kind: 'call', text: `${what} scheduled (${c.durationMin} min)` });
    else out.push({ at: iso(c.completedAt ?? c.scheduledAt), kind: 'call', text: `${what} — ${c.outcome.replace(/_/g, ' ')}` });
  }

  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
