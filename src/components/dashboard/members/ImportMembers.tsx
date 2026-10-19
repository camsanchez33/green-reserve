'use client';
// Members → Import a list (Cam 2026-10-19). Paste or choose a CSV; the page
// shows what it read before anything is saved; the route reads the file again
// and creates the memberships. Nobody is emailed.
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { INPUT } from '@/components/ui/field';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';
import { readMemberCsv } from '@/lib/member-csv';

type Tier = { id: string; name: string; active: boolean };
type Result = { added: number; skipped: { line: number; email: string; reason: string }[]; problems: { line: number; message: string }[] };
const lbl = 'block text-[13px] font-semibold text-ink mb-1.5';

export function ImportMembers({ tiers, onClose, onImported }: { tiers: Tier[]; onClose: () => void; onImported: () => void }) {
  const active = tiers.filter(t => t.active);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [tierId, setTierId] = useState(active[0]?.id ?? '');
  const [paid, setPaid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const read = useMemo(() => (csv.trim() ? readMemberCsv(csv) : null), [csv]);
  const tierNames = new Set(active.map(t => t.name.trim().toLowerCase()));
  const unknownTiers = read ? [...new Set(read.rows.map(r => r.tier).filter(t => t && !tierNames.has(t.toLowerCase())))] : [];

  async function pickFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 1_000_000) { setError('That file is over 1 MB — split it into smaller files.'); return; }
    setError(''); setResult(null); setFileName(f.name); setCsv(await f.text());
  }

  async function runImport() {
    setSaving(true); setError('');
    const r = await dfetch<Result>('/api/operator/members/import', { method: 'POST', body: JSON.stringify({ csv, defaultTierId: tierId, paidByDefault: paid }) });
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    setResult(r.data);
    onImported();
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-serif font-semibold text-ink text-[20px]">Import a list</h2>
        <button onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink"><X className="w-4 h-4" /></button>
      </div>
      {result ? (
        <div className="space-y-3 text-[13.5px] text-ink">
          <p><span className="font-semibold">{result.added} member{result.added === 1 ? '' : 's'} added.</span> Nobody was emailed — they get member rates as soon as they sign in with the email on the list.</p>
          {(result.skipped.length > 0 || result.problems.length > 0) && (
            <div>
              <p className="font-semibold">{result.skipped.length + result.problems.length} line{result.skipped.length + result.problems.length === 1 ? '' : 's'} not added:</p>
              <ul className="mt-1 max-h-48 overflow-y-auto text-[13px] text-ink-soft space-y-0.5">
                {result.problems.map(p => <li key={`p${p.line}`}>Line {p.line}: {p.message}</li>)}
                {result.skipped.map(s => <li key={`s${s.line}`}>Line {s.line}: {s.email} — {s.reason}</li>)}
              </ul>
            </div>
          )}
          <button onClick={onClose} className="px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium">Done</button>
        </div>
      ) : (
        <>
          <p className="text-[13px] text-ink-soft mb-4">
            A spreadsheet saved as CSV, with a header row. Needed: <b className="font-semibold text-ink">Email</b> and <b className="font-semibold text-ink">Name</b> (or First name and Last name). Optional: Phone, Membership, Expires, Paid. Members already on your list are skipped, never changed. Nobody is emailed.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={lbl} htmlFor="imp-file">Your list</label>
              <input id="imp-file" type="file" accept=".csv,text/csv,text/plain" onChange={e => pickFile(e.target.files?.[0])}
                className="block text-[13px] text-ink file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-line file:bg-white file:text-ink file:text-[13px] file:font-medium" />
              <p className="text-[12.5px] text-ink-muted mt-1.5">{fileName ? `${fileName} — or paste below to replace it.` : 'Or paste it below.'}</p>
              <textarea value={csv} onChange={e => { setCsv(e.target.value); setFileName(''); setResult(null); }} rows={5} aria-label="Paste your list"
                placeholder={'Email,Name,Membership,Expires,Paid\njane@email.com,Jane Smith,Full,2027-03-31,yes'}
                className={INPUT + ' mt-2 w-full font-mono text-[13px] resize-y'} />
            </div>
            <div>
              <label className={lbl} htmlFor="imp-tier">Membership for anyone the list doesn&apos;t give one</label>
              <select id="imp-tier" value={tierId} onChange={e => setTierId(e.target.value)} className={INPUT + ' w-full'}>
                {active.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <fieldset>
              <legend className={lbl}>Dues, when the list doesn&apos;t say</legend>
              <div className="space-y-1.5 text-[13.5px] text-ink">
                <label className="flex items-center gap-2"><input type="radio" name="imp-paid" checked={paid} onChange={() => setPaid(true)} className="accent-pine" />Already paid this season</label>
                <label className="flex items-center gap-2"><input type="radio" name="imp-paid" checked={!paid} onChange={() => setPaid(false)} className="accent-pine" />Not paid yet</label>
              </div>
            </fieldset>
          </div>

          {read && (
            <div className="mt-4 rounded-md bg-paper/70 px-4 py-3 text-[13px] text-ink">
              <p><span className="font-semibold">{read.rows.length} member{read.rows.length === 1 ? '' : 's'} found</span>{read.problems.length > 0 && <span className="text-warn"> · {read.problems.length} line{read.problems.length === 1 ? '' : 's'} won&apos;t be added</span>}</p>
              {unknownTiers.length > 0 && <p className="mt-1 text-ink-soft">No membership called {unknownTiers.map(t => `"${t}"`).join(', ')} — those members go on {active.find(t => t.id === tierId)?.name ?? 'the one picked above'}.</p>}
              {read.rows.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-ink-soft">
                  {read.rows.slice(0, 5).map(r => <li key={r.line} className="truncate">{r.name || '(no name)'} · {r.email}{r.tier ? ` · ${r.tier}` : ''}{r.expires ? ` · until ${r.expires}` : ''}{r.paid != null ? ` · ${r.paid ? 'paid' : 'not paid'}` : ''}</li>)}
                  {read.rows.length > 5 && <li>…and {read.rows.length - 5} more</li>}
                </ul>
              )}
              {read.problems.length > 0 && (
                <ul className="mt-2 max-h-32 overflow-y-auto text-ink-soft space-y-0.5">{read.problems.slice(0, 20).map(p => <li key={p.line}>Line {p.line}: {p.message}</li>)}</ul>
              )}
            </div>
          )}
          {error && <div className="mt-3"><LoadError message={error} onRetry={runImport} /></div>}
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={onClose} className="px-4 py-2 rounded-md text-[13px] text-ink-soft hover:text-ink">Cancel</button>
            <button onClick={runImport} disabled={saving || !read || read.rows.length === 0 || !tierId}
              className="px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50">
              {saving ? 'Importing…' : read && read.rows.length > 0 ? `Import ${read.rows.length} member${read.rows.length === 1 ? '' : 's'}` : 'Import'}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
