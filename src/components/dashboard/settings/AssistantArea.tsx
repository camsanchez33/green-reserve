'use client';
// ASSIST-1 (Cam 2026-11-24; lanes/build.md "AI assistant overhaul" item 3; mockup lanes/build/ai-assistant-mockup.html,
// "Course settings"). Settings → Assistant: the staff switch, golfer questions (off until the course turns them on),
// tone, what golfers may ask about, the "when it doesn't know" line, the daily golfer limit (at most 300), the
// course's notes, and What it knows with a Refresh button. Everything reads and saves through /api/operator/assistant
// (settings.edit, audited); the limits shown here only mirror the server's (lib/assistant/settings).
import { useCallback, useEffect, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { toast } from '@/components/dashboard/Toast';
import {
  ASSISTANT_TONES, GOLFER_TOPICS, GOLFER_DAILY_MAX, UNKNOWN_LINE_CHARS, NOTE_QUESTION_CHARS, NOTE_ANSWER_CHARS, MAX_NOTES,
  type AssistantSettings, type AssistantTone, type GolferTopic, type NoteAudience,
} from '@/lib/assistant/settings';
import { type Ctx, Group, Row, Muted, EditPopup, Field, SwitchLine, Choices, FIELD, LINK, plural } from './ui';

type Section = { key: string; label: string; count: string };
type Knows = { sections: Section[]; builtAt: string } | null;
type Note = { id: string; question: string; answer: string; audience: NoteAudience };
type Payload = {
  settings: AssistantSettings; unknownLineDefault: string; notes: Note[];
  knows: { staff: Knows; golfer: Knows }; golferToday: number;
};
type Patch = Partial<Pick<AssistantSettings, 'staffOn' | 'golferOn' | 'tone' | 'golferTopics' | 'unknownLine' | 'golferDailyLimit'>>;
type Open = null | 'staff' | 'golfer' | 'tone' | 'topics' | 'unknown' | 'limit' | { note: Note | null };

const AUDIENCES: readonly { key: NoteAudience; label: string; help: string }[] = [
  { key: 'golfers', label: 'Golfers', help: 'Golfers and your staff both hear it.' },
  { key: 'staff', label: 'Staff only', help: 'Only your staff\'s assistant reads it. Golfers never hear it.' },
];

const when = (iso: string | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export function AssistantArea({ ctx }: { ctx: Ctx }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Open>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (): Promise<string | null> => {
    const r = await dfetch<Payload>('/api/operator/assistant');
    if (r.ok && r.data) { setData(r.data); setError(''); return null; }
    if (!r.ok) { setError(r.error); return r.error; }
    return null;
  }, []);
  // After a write the server accepted: a failed re-read must not pass as a fresh list. The popup still closes (the
  // write is done, and Save again would add the note twice); the warning says to reload.
  const reloadAfterWrite = useCallback(async (): Promise<string | null> => {
    const e = await load();
    if (e) toast(`Saved, but the list could not be refreshed. Reload the page. (${e})`, 'warn');
    return null;
  }, [load]);
  useEffect(() => { if (ctx.canEdit) void load(); }, [ctx.canEdit, load]);

  const patch = useCallback(async (p: Patch): Promise<string | null> => {
    const r = await dfetch<Payload>('/api/operator/assistant', { method: 'PATCH', body: JSON.stringify(p) });
    if (!r.ok) return r.error;
    setData(r.data);
    return null;
  }, []);

  const saveNote = useCallback(async (id: string | null, n: Omit<Note, 'id'>): Promise<string | null> => {
    const r = await dfetch(id ? `/api/operator/assistant/notes/${encodeURIComponent(id)}` : '/api/operator/assistant/notes', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(n) });
    if (!r.ok) return r.error;
    return reloadAfterWrite();
  }, [reloadAfterWrite]);

  const removeNote = useCallback(async (id: string): Promise<string | null> => {
    const r = await dfetch(`/api/operator/assistant/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) return r.error;
    return reloadAfterWrite();
  }, [reloadAfterWrite]);

  async function refresh() {
    setRefreshing(true);
    const r = await dfetch<{ knows: Payload['knows'] }>('/api/operator/assistant/refresh', { method: 'POST' });
    setRefreshing(false);
    if (!r.ok) { toast(r.error, 'bad'); return; }
    setData(d => (d ? { ...d, knows: r.data.knows } : d));
    toast('Refreshed.', 'ok');
  }

  if (!ctx.canEdit) {
    return <Group id="staff" title="Assistant"><p className="mx-3 mb-3 text-[13px] text-ink-soft">Only logins that can edit settings see the assistant.</p></Group>;
  }
  if (error && !data) return <LoadError message={`${error} Nothing here is your course’s real assistant settings until this loads.`} onRetry={() => { void load(); }} />;
  if (!data) return <p className="py-16 text-center text-[13px] text-ink-muted">Loading…</p>;

  const s = data.settings;
  const topics = GOLFER_TOPICS.filter(t => s.golferTopics.includes(t.key));
  const tone = ASSISTANT_TONES.find(t => t.key === s.tone);
  const builtAt = [data.knows.staff?.builtAt, data.knows.golfer?.builtAt].filter(Boolean).sort().pop();

  return (
    <>
      <Group id="staff" title="Assistant for your staff" note="Answers questions about your course and the dashboard, and drafts changes for you to save. It never saves anything by itself.">
        <Row id="assistant-staff" label="Assistant for your staff" value={s.staffOn ? 'On' : 'Off'} onOpen={() => setOpen('staff')} />
      </Group>

      <Group id="golfers" title="Golfer questions on your booking page" note="Golfers can ask about your course. It answers only from your own information and never books, cancels or takes payment.">
        <Row id="assistant-golfer" label="Golfer questions" note="Off until you turn it on." value={s.golferOn ? 'On' : 'Off'} onOpen={() => setOpen('golfer')} />
        <Row id="assistant-tone" label="Tone" note="How it talks to golfers." value={tone?.label ?? 'Friendly'} onOpen={() => setOpen('tone')} />
        <Row id="assistant-topics" label="Golfers can ask about" value={topics.length === GOLFER_TOPICS.length ? 'Everything' : topics.map(t => t.label).join(', ')} onOpen={() => setOpen('topics')} />
        <Row id="assistant-unknown" label="When it doesn't know" note="Shown to golfers word for word." stack value={s.unknownLine || <Muted>{data.unknownLineDefault}</Muted>} onOpen={() => setOpen('unknown')} />
        <Row id="assistant-limit" label="Daily limit" note={`Up to ${GOLFER_DAILY_MAX} golfer questions a day.`} value={plural(s.golferDailyLimit, 'question')} onOpen={() => setOpen('limit')} />
        <Row id="assistant-today" label="Golfer questions today" note={`Questions stop for the day at ${s.golferDailyLimit}, and the answer becomes your "when it doesn't know" line.`} value={`${data.golferToday} of ${s.golferDailyLimit}`} />
      </Group>

      <Group id="notes" title="Your notes" note="Questions and answers the assistant can use. It reads them as information, never as instructions.">
        {data.notes.length ? data.notes.map(n => (
          <Row key={n.id} id={`assistant-note-${n.id}`} label={n.question} note={n.answer} stack value={<Muted>{n.audience === 'staff' ? 'Staff only' : 'Golfers'}</Muted>} onOpen={() => setOpen({ note: n })} />
        )) : <p className="mx-3 mb-2 text-[13px] text-ink-soft">No notes yet.</p>}
        <div className="px-3 py-2.5 border-t border-line">
          <button type="button" className={LINK} disabled={data.notes.length >= MAX_NOTES} onClick={() => setOpen({ note: null })}>Add a note</button>
          {data.notes.length >= MAX_NOTES && <span className="ml-2 text-[12.5px] text-ink-soft">{MAX_NOTES} notes is the most it keeps.</span>}
        </div>
      </Group>

      <Group id="knows" title="What it knows" note="It refreshes on its own whenever you change a setting, rate, closed day, event, alert or note.">
        <Row id="assistant-updated" label="Updated" value={when(builtAt) || '—'} />
        {(data.knows.staff?.sections ?? []).map(sec => {
          const golfer = data.knows.golfer?.sections.some(g => g.key === sec.key);
          return <Row key={sec.key} id={`assistant-knows-${sec.key}`} label={sec.label} note={golfer || !s.golferOn ? undefined : 'Staff only'} value={sec.count} />;
        })}
        <Row id="assistant-live" label="Live numbers" note="Staff only" value="read when asked" />
        <div className="px-3 py-2.5 border-t border-line">
          <button type="button" className={LINK} onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh now'}</button>
        </div>
      </Group>

      {open === 'staff' && <SwitchPopup title="Assistant for your staff" help="Your staff's assistant on every dashboard page." on={s.staffOn} onClose={() => setOpen(null)} onSave={on => patch({ staffOn: on })} />}
      {open === 'golfer' && <SwitchPopup title="Golfer questions" help="A Questions box on your booking page. It answers only from your own information." on={s.golferOn} onClose={() => setOpen(null)} onSave={on => patch({ golferOn: on })} />}
      {open === 'tone' && <TonePopup value={s.tone} onClose={() => setOpen(null)} onSave={t => patch({ tone: t })} />}
      {open === 'topics' && <TopicsPopup value={s.golferTopics} onClose={() => setOpen(null)} onSave={t => patch({ golferTopics: t })} />}
      {open === 'unknown' && <UnknownPopup value={s.unknownLine} fallback={data.unknownLineDefault} onClose={() => setOpen(null)} onSave={v => patch({ unknownLine: v })} />}
      {open === 'limit' && <LimitPopup value={s.golferDailyLimit} onClose={() => setOpen(null)} onSave={n => patch({ golferDailyLimit: n })} />}
      {open && typeof open === 'object' && <NotePopup note={open.note} onClose={() => setOpen(null)} onSave={n => saveNote(open.note?.id ?? null, n)} onDelete={open.note ? () => removeNote(open.note!.id) : undefined} />}
    </>
  );
}

function SwitchPopup({ title, help, on, onClose, onSave }: { title: string; help: string; on: boolean; onClose: () => void; onSave: (on: boolean) => Promise<string | null> }) {
  const [v, setV] = useState(on);
  return (
    <EditPopup title={title} onClose={onClose} onSave={() => onSave(v)}>
      <SwitchLine label={title} help={help} on={v} onChange={setV} />
    </EditPopup>
  );
}

function TonePopup({ value, onClose, onSave }: { value: AssistantTone; onClose: () => void; onSave: (t: AssistantTone) => Promise<string | null> }) {
  const [v, setV] = useState<AssistantTone>(value);
  return (
    <EditPopup title="Tone" hint="How it talks to golfers." onClose={onClose} onSave={() => onSave(v)}>
      <Choices name="Tone" value={v} onChange={setV} options={ASSISTANT_TONES.map(t => ({ key: t.key, label: t.label, help: t.prompt }))} />
    </EditPopup>
  );
}

function TopicsPopup({ value, onClose, onSave }: { value: GolferTopic[]; onClose: () => void; onSave: (t: GolferTopic[]) => Promise<string | null> }) {
  const [v, setV] = useState<GolferTopic[]>(value);
  const flip = (k: GolferTopic) => setV(cur => (cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]));
  return (
    <EditPopup title="Golfers can ask about" hint="Anything else gets your “when it doesn't know” line." onClose={onClose} canSave={v.length > 0} onSave={() => onSave(v)}>
      <div className="flex flex-col gap-2">
        {GOLFER_TOPICS.map(t => (
          <label key={t.key} className="flex items-center gap-3 min-h-[40px] text-[14px] text-ink">
            <input type="checkbox" checked={v.includes(t.key)} onChange={() => flip(t.key)} className="w-4 h-4 accent-current" />
            {t.label}
          </label>
        ))}
      </div>
      {!v.length && <p className="text-[12.5px] text-ink-soft">Leave at least one on, or turn golfer questions off.</p>}
    </EditPopup>
  );
}

function UnknownPopup({ value, fallback, onClose, onSave }: { value: string; fallback: string; onClose: () => void; onSave: (v: string) => Promise<string | null> }) {
  const [v, setV] = useState(value);
  return (
    <EditPopup title="When it doesn't know" hint={`Shown to golfers word for word. Leave it empty to use: ${fallback}`} onClose={onClose} onSave={() => onSave(v)}>
      <Field label="When it doesn't know" hint={`${v.length} of ${UNKNOWN_LINE_CHARS}`}>
        <input value={v} onChange={e => setV(e.target.value)} maxLength={UNKNOWN_LINE_CHARS} className={FIELD} autoFocus />
      </Field>
    </EditPopup>
  );
}

function LimitPopup({ value, onClose, onSave }: { value: number; onClose: () => void; onSave: (n: number) => Promise<string | null> }) {
  const [v, setV] = useState(String(value));
  const n = Number(v);
  const valid = /^\d+$/.test(v.trim()) && n >= 1 && n <= GOLFER_DAILY_MAX;
  return (
    <EditPopup title="Daily limit" hint={`Golfer questions a day, 1 to ${GOLFER_DAILY_MAX}. After that, golfers get your “when it doesn't know” line until tomorrow.`} onClose={onClose} canSave={valid} onSave={() => onSave(n)}>
      <Field label="Questions a day" hint={valid ? undefined : `A whole number from 1 to ${GOLFER_DAILY_MAX}.`}>
        <input inputMode="numeric" value={v} onChange={e => setV(e.target.value)} className={FIELD} autoFocus />
      </Field>
    </EditPopup>
  );
}

function NotePopup({ note, onClose, onSave, onDelete }: { note: Note | null; onClose: () => void; onSave: (n: Omit<Note, 'id'>) => Promise<string | null>; onDelete?: () => Promise<string | null> }) {
  const [q, setQ] = useState(note?.question ?? '');
  const [a, setA] = useState(note?.answer ?? '');
  const [aud, setAud] = useState<NoteAudience>(note?.audience ?? 'golfers');
  const [deleting, setDeleting] = useState(false);
  const [delErr, setDelErr] = useState('');
  async function del() {
    if (!onDelete) return;
    setDeleting(true); setDelErr('');
    const e = await onDelete();
    setDeleting(false);
    if (e) { setDelErr(e); return; }
    toast('Note removed.', 'ok');
    onClose();
  }
  return (
    <EditPopup title={note ? 'Edit note' : 'Add a note'} hint="A question golfers or staff ask, and your answer." onClose={onClose} size="lg"
      canSave={!!q.trim() && !!a.trim()} onSave={() => onSave({ question: q, answer: a, audience: aud })}>
      <Field label="Question" hint={`${q.length} of ${NOTE_QUESTION_CHARS}`}>
        <input value={q} onChange={e => setQ(e.target.value)} maxLength={NOTE_QUESTION_CHARS} className={FIELD} autoFocus />
      </Field>
      <Field label="Answer" hint={`${a.length} of ${NOTE_ANSWER_CHARS}`}>
        <textarea value={a} onChange={e => setA(e.target.value)} maxLength={NOTE_ANSWER_CHARS} rows={4} className={FIELD + ' resize-y'} />
      </Field>
      <Choices name="Who it's for" value={aud} onChange={setAud} options={AUDIENCES} />
      {onDelete && (
        <div className="flex items-center gap-3">
          <button type="button" className={LINK} onClick={del} disabled={deleting}>{deleting ? 'Removing…' : 'Remove this note'}</button>
          {delErr && <span role="alert" className="text-[13px] text-bad">{delErr}</span>}
        </div>
      )}
    </EditPopup>
  );
}
