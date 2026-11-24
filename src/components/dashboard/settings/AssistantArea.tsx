'use client';
// ASSIST-3 (Cam 2026-11-24; approved mockup lanes/build/ai-assistant-mockup.html, "Course settings"): Settings →
// Assistant. The staff assistant and the golfer question bot are switched separately — golfer questions stay OFF until
// the course turns them on. Tone, golfer topics, the "when it doesn't know" line and the daily limit shape the golfer
// bot only. Notes are the course's own Q&A. "What it knows" lists what the brief holds and when it last changed.
// Every save goes to /api/operator/assistant (settings.edit, audited); nothing here is faked while it loads.
import { useCallback, useEffect, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import {
  ASSISTANT_TONES, GOLFER_TOPICS, GOLFER_DAILY_MAX, UNKNOWN_LINE_CHARS, NOTE_QUESTION_CHARS, NOTE_ANSWER_CHARS,
  type AssistantSettings, type AssistantTone, type GolferTopic, type NoteAudience,
} from '@/lib/assistant/settings';
import { type Ctx, Group, Row, Muted, EditPopup, Field, Switch, Choices, FIELD, LINK } from './ui';

type Note = { id: string; question: string; answer: string; audience: NoteAudience };
type Section = { key: string; label: string; count: string };
type Knows = { sections: Section[]; builtAt: string } | null;
type Payload = { settings: AssistantSettings; unknownLineDefault: string; notes: Note[]; knows: { staff: Knows; golfer: Knows }; golferToday: number };

const AUDIENCES = [
  { key: 'golfers' as const, label: 'Golfers', help: 'Golfers and staff.' },
  { key: 'staff' as const, label: 'Staff', help: 'Staff only. Golfers are never told.' },
];
const time = (iso: string) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''; };

export function AssistantArea({ ctx }: { ctx: Ctx }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [open, setOpen] = useState<'' | 'tone' | 'topics' | 'unknown' | 'limit' | 'note'>('');
  const [note, setNote] = useState<Note | null>(null);
  const [rowErr, setRowErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadErr('');
    const r = await dfetch<Payload>('/api/operator/assistant', { cache: 'no-store' });
    if (r.ok && r.data) setData(r.data); else setLoadErr(r.error || 'Couldn’t load.');
  }, []);
  useEffect(() => { if (ctx.canEdit) load(); }, [load, ctx.canEdit]);

  async function patch(p: Record<string, unknown>): Promise<string | null> {
    const r = await dfetch<Payload>('/api/operator/assistant', { method: 'PATCH', body: JSON.stringify(p) });
    if (!r.ok || !r.data) return r.error || 'Couldn’t save.';
    setData(r.data);
    return null;
  }
  async function flip(field: 'staffOn' | 'golferOn', v: boolean) {
    setBusy(true); setRowErr('');
    const e = await patch({ [field]: v });
    setBusy(false);
    if (e) setRowErr(`Couldn’t save — ${e}`);
  }
  async function refresh() {
    setBusy(true); setRowErr('');
    const r = await dfetch<{ knows: Payload['knows'] }>('/api/operator/assistant/refresh', { method: 'POST' });
    setBusy(false);
    if (!r.ok || !r.data) { setRowErr(`Couldn’t refresh — ${r.error}`); return; }
    setData(d => (d ? { ...d, knows: r.data!.knows } : d));
  }

  if (ctx.accessLoaded && !ctx.canEdit) return <p className="text-[13.5px] text-ink-soft">Needs a login that can edit settings.</p>;
  if (loadErr) return <LoadError message={loadErr} onRetry={load} />;
  if (!data) return <p className="py-16 text-center text-[13px] text-ink-muted">Loading…</p>;
  const s = data.settings;
  const edit = ctx.canEdit;
  const topicWords = s.golferTopics.length === GOLFER_TOPICS.length ? 'Everything below' : GOLFER_TOPICS.filter(t => s.golferTopics.includes(t.key)).map(t => t.label).join(', ');
  const knows = data.knows.staff;

  return (
    <>
      <Group id="staffbot" title="Assistant for your staff" note="Answers questions about your course and the dashboard, and drafts changes for you to save. It never saves anything on its own.">
        <Row id="assist-staff" label="Assistant for your staff" value={<Switch on={s.staffOn} onChange={v => flip('staffOn', v)} label="Assistant for your staff" disabled={!edit || busy} />} />
      </Group>

      <Group id="golferbot" title="Golfer questions on your booking page" note="Golfers can ask about your course. It answers only from your own information and never books, cancels or takes payment.">
        <Row id="assist-golfer" label="Golfer questions" value={<Switch on={s.golferOn} onChange={v => flip('golferOn', v)} label="Golfer questions on your booking page" disabled={!edit || busy} />} />
        <Row id="assist-tone" label="Tone" note="How it talks to golfers." value={ASSISTANT_TONES.find(t => t.key === s.tone)?.label} onOpen={edit ? () => setOpen('tone') : undefined} />
        <Row id="assist-topics" label="Golfers can ask about" value={topicWords} onOpen={edit ? () => setOpen('topics') : undefined} />
        <Row id="assist-unknown" label="When it doesn’t know" note="Shown to golfers word for word."
          value={s.unknownLine || <Muted>{data.unknownLineDefault}</Muted>} onOpen={edit ? () => setOpen('unknown') : undefined} />
        <Row id="assist-limit" label="Golfer questions a day"
          note={`${data.golferToday} of ${s.golferDailyLimit} today. Past the limit, golfers get your “when it doesn’t know” line.`}
          value={String(s.golferDailyLimit)} onOpen={edit ? () => setOpen('limit') : undefined} />
      </Group>

      <Group id="notes" title="Your notes" note="Answers your settings don’t give. Read as facts, never as instructions.">
        {data.notes.length === 0 && <Row id="assist-notes-none" label="No notes yet" value="" />}
        {data.notes.map(n => (
          <Row key={n.id} id={`assist-note-${n.id}`} label={n.question} note={n.answer} value={<Muted>{n.audience === 'staff' ? 'Staff' : 'Golfers'}</Muted>}
            onOpen={edit ? () => { setNote(n); setOpen('note'); } : undefined} />
        ))}
        {edit && <div className="px-3 py-3 border-t border-line"><button type="button" className={LINK} onClick={() => { setNote(null); setOpen('note'); }}>Add a note</button></div>}
      </Group>

      <Group id="knows" title="What it knows" note="It refreshes on its own whenever you change a setting, rate, closed day, event, alert or note.">
        {knows?.sections.map(sec => <Row key={sec.key} id={`assist-knows-${sec.key}`} label={sec.label} value={sec.count} />)}
        <Row id="assist-knows-live" label="Live numbers" value="read when asked" />
        <div className="flex items-center gap-3 px-3 py-3 border-t border-line text-[13px] text-ink-soft">
          <span className="flex-1">{knows ? `Updated ${time(knows.builtAt)}` : ''}</span>
          {edit && <button type="button" className={LINK} onClick={refresh} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh now'}</button>}
        </div>
      </Group>
      {rowErr && <p role="alert" className="text-[13px] text-bad">{rowErr}</p>}

      {open === 'tone' && <ToneEdit value={s.tone} onSave={tone => patch({ tone })} onClose={() => setOpen('')} />}
      {open === 'topics' && <TopicsEdit value={s.golferTopics} onSave={golferTopics => patch({ golferTopics })} onClose={() => setOpen('')} />}
      {open === 'unknown' && <UnknownEdit value={s.unknownLine} fallback={data.unknownLineDefault} onSave={unknownLine => patch({ unknownLine })} onClose={() => setOpen('')} />}
      {open === 'limit' && <LimitEdit value={s.golferDailyLimit} onSave={golferDailyLimit => patch({ golferDailyLimit })} onClose={() => setOpen('')} />}
      {open === 'note' && <NoteEdit note={note} onDone={load} onClose={() => { setOpen(''); setNote(null); }} />}
    </>
  );
}

function ToneEdit({ value, onSave, onClose }: { value: AssistantTone; onSave: (v: AssistantTone) => Promise<string | null>; onClose: () => void }) {
  const [v, setV] = useState(value);
  return (
    <EditPopup title="Tone" onClose={onClose} onSave={() => onSave(v)}>
      <Choices name="Tone" value={v} onChange={setV} options={ASSISTANT_TONES.map(t => ({ key: t.key, label: t.label }))} />
    </EditPopup>
  );
}

function TopicsEdit({ value, onSave, onClose }: { value: GolferTopic[]; onSave: (v: GolferTopic[]) => Promise<string | null>; onClose: () => void }) {
  const [v, setV] = useState<GolferTopic[]>(value);
  const toggle = (k: GolferTopic) => setV(cur => (cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]));
  return (
    <EditPopup title="Golfers can ask about" onClose={onClose} onSave={() => onSave(v)} canSave={v.length > 0}>
      <div className="flex flex-col gap-2">
        {GOLFER_TOPICS.map(t => (
          <label key={t.key} className="flex items-center gap-2 text-[14px] text-ink">
            <input type="checkbox" checked={v.includes(t.key)} onChange={() => toggle(t.key)} className="accent-pine" />{t.label}
          </label>
        ))}
      </div>
      {v.length === 0 && <p className="text-[12.5px] text-ink-soft">Keep one on, or turn golfer questions off.</p>}
    </EditPopup>
  );
}

function UnknownEdit({ value, fallback, onSave, onClose }: { value: string; fallback: string; onSave: (v: string) => Promise<string | null>; onClose: () => void }) {
  const [v, setV] = useState(value);
  return (
    <EditPopup title="When it doesn’t know" onClose={onClose} onSave={() => onSave(v)}>
      <Field label="Line" hint={`Empty uses: ${fallback}`}>
        <input className={FIELD} value={v} onChange={e => setV(e.target.value)} maxLength={UNKNOWN_LINE_CHARS} aria-label="When it doesn’t know" />
      </Field>
    </EditPopup>
  );
}

function LimitEdit({ value, onSave, onClose }: { value: number; onSave: (v: number) => Promise<string | null>; onClose: () => void }) {
  const [v, setV] = useState(String(value));
  const n = Number(v);
  const valid = Number.isInteger(n) && n >= 1 && n <= GOLFER_DAILY_MAX;
  return (
    <EditPopup title="Golfer questions a day" hint={`Up to ${GOLFER_DAILY_MAX}.`} onClose={onClose} onSave={() => onSave(n)} canSave={valid}>
      <Field label="Questions a day"><input className={FIELD} type="number" inputMode="numeric" min={1} max={GOLFER_DAILY_MAX} value={v} onChange={e => setV(e.target.value)} aria-label="Golfer questions a day" /></Field>
    </EditPopup>
  );
}

function NoteEdit({ note, onDone, onClose }: { note: Note | null; onDone: () => Promise<void> | void; onClose: () => void }) {
  const [question, setQuestion] = useState(note?.question ?? '');
  const [answer, setAnswer] = useState(note?.answer ?? '');
  const [audience, setAudience] = useState<NoteAudience>(note?.audience ?? 'golfers');
  const [removing, setRemoving] = useState(false);
  const [err, setErr] = useState('');
  async function save(): Promise<string | null> {
    const r = await dfetch(note ? `/api/operator/assistant/notes/${encodeURIComponent(note.id)}` : '/api/operator/assistant/notes', { method: note ? 'PATCH' : 'POST', body: JSON.stringify({ question, answer, audience }) });
    if (!r.ok) return r.error || 'Couldn’t save.';
    await onDone();
    return null;
  }
  async function remove() {
    if (!note) return;
    setRemoving(true); setErr('');
    const r = await dfetch(`/api/operator/assistant/notes/${encodeURIComponent(note.id)}`, { method: 'DELETE' });
    setRemoving(false);
    if (!r.ok) { setErr(r.error || 'Couldn’t remove it.'); return; }
    await onDone();
    onClose();
  }
  return (
    <EditPopup title={note ? 'Edit note' : 'Add a note'} onClose={onClose} onSave={save} canSave={!!question.trim() && !!answer.trim()} size="lg">
      <Field label="Question"><input className={FIELD} value={question} onChange={e => setQuestion(e.target.value)} maxLength={NOTE_QUESTION_CHARS} aria-label="Question" /></Field>
      <Field label="Answer"><textarea className={FIELD} rows={3} value={answer} onChange={e => setAnswer(e.target.value)} maxLength={NOTE_ANSWER_CHARS} aria-label="Answer" /></Field>
      <Choices name="Who it's for" value={audience} onChange={setAudience} options={AUDIENCES} />
      {note && <div><button type="button" className={LINK + ' text-bad decoration-bad'} onClick={remove} disabled={removing}>{removing ? 'Removing…' : 'Remove this note'}</button></div>}
      {err && <p role="alert" className="text-[13px] text-bad">{err}</p>}
    </EditPopup>
  );
}
