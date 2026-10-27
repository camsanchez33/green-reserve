'use client';
// Onboarding step 1 (Cam 2026-10-27): "walked through immediately the process of
// going page by page approving everything and giving feedback if needed". One
// part of the booking page at a time (src/lib/page-review.ts) — Looks right, or
// Change this with a note — then a summary that approves the page or sends every
// note as one change request (part keys are CHANGE_CATEGORIES keys). A missing
// logo or photo can be added right here, or later: whatever is still missing
// shows on Home as "Finish setting up".
import { useEffect, useRef, useState } from 'react';
import { Loader2, ExternalLink } from 'lucide-react';
import { StatusDot } from '@/components/ui/StatusDot';
import { Card } from '@/components/ui/Card';
import { INPUT } from '@/components/ui/field';
import { ImageUpload } from '@/components/dashboard/ImageUpload';
import { downscaleImage } from '@/lib/image-resize';
import type { PageReview } from '@/lib/page-review';

type Verdict = { ok: true } | { ok: false; note: string };
const iCls = `w-full ${INPUT}`;
const primary = 'bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] disabled:opacity-50 transition-colors';
const secondary = 'py-3 rounded-md border border-line text-ink text-[13px] font-medium hover:border-pine/40 disabled:opacity-50 transition-colors';

export function PageReviewStep({ status, onStatus, onAdvance }: {
  status: 'none' | 'approved' | 'changes_requested';
  onStatus: (s: 'approved' | 'changes_requested') => void;
  /** Saves onboarding progress and moves to the next step; throws with a message on failure. */
  onAdvance: () => Promise<void>;
}) {
  const [review, setReview] = useState<PageReview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [at, setAt] = useState(0); // a part index, or parts.length for the summary
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [writing, setWriting] = useState(false);
  const [fromSummary, setFromSummary] = useState(false); // Edit from the summary returns there
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [blockedUrl, setBlockedUrl] = useState('');
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [galleryErr, setGalleryErr] = useState('');
  const top = useRef<HTMLDivElement>(null);

  const load = () => {
    setLoadError('');
    fetch('/api/operator/page-review')
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Couldn’t load your page (${r.status}).`); return d as PageReview; })
      .then(setReview)
      .catch((e: Error) => setLoadError(e.message || 'Couldn’t reach the server — check your connection.'));
  };
  useEffect(load, []);

  const parts = review?.parts ?? [];
  const part = parts[at];
  const go = (i: number) => {
    setAt(i); setWriting(false); setError('');
    const v = parts[i] && verdicts[parts[i].key];
    setNote(v && !v.ok ? v.note : '');
    top.current?.scrollIntoView({ block: 'start' });
  };
  const judge = (v: Verdict) => { setVerdicts(prev => ({ ...prev, [part.key]: v })); go(fromSummary ? parts.length : at + 1); if (fromSummary) setFromSummary(false); };

  // The course's own preview, in a new tab opened inside the click so a pop-up blocker allows it.
  const openPage = async () => {
    setError(''); setBlockedUrl(''); setOpening(true);
    const tab = window.open('', '_blank');
    try {
      const r = await fetch('/api/operator/preview-link');
      const d = await r.json().catch(() => ({} as Record<string, unknown>));
      if (r.ok && typeof d.url === 'string') { if (tab) tab.location.href = d.url; else setBlockedUrl(d.url); return; }
      tab?.close(); setError(String(d.error || `Couldn’t open your page (${r.status}) — try again.`));
    } catch { tab?.close(); setError('Couldn’t reach the server — check your connection and try again.'); }
    finally { setOpening(false); }
  };

  const addGallery = async (file: File | null) => {
    if (!file) return;
    setGalleryBusy(true); setGalleryErr('');
    const fd = new FormData();
    fd.append('file', await downscaleImage(file));
    try {
      const r = await fetch('/api/operator/photos', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) setReview(rv => rv && { ...rv, images: { ...rv.images, gallery: [...rv.images.gallery, d.url] }, missing: rv.missing.filter(m => m.key !== 'gallery') });
      else setGalleryErr(d.error || 'Upload failed — try again.');
    } catch { setGalleryErr('Upload failed — try again.'); }
    setGalleryBusy(false);
  };
  const setImage = (kind: 'logoUrl' | 'heroImageUrl', url: string) => setReview(rv => rv && {
    ...rv, images: { ...rv.images, [kind]: url },
    missing: url ? rv.missing.filter(m => m.key !== (kind === 'logoUrl' ? 'logo' : 'hero')) : rv.missing,
  });

  const changes = parts.filter(p => verdicts[p.key] && !verdicts[p.key].ok);
  const send = async () => {
    setBusy(true); setError('');
    try {
      if (changes.length) {
        const items = changes.map(p => ({ category: p.key, detail: (verdicts[p.key] as { note: string }).note }));
        const r = await fetch('/api/operator/request-changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Couldn’t send your changes (${r.status}).`);
        onStatus('changes_requested');
      } else {
        const r = await fetch('/api/operator/approve-page', { method: 'POST' });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Couldn’t record your approval (${r.status}).`);
        onStatus('approved');
      }
      await onAdvance();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — try again.');
    } finally { setBusy(false); }
  };
  const later = async () => {
    setBusy(true); setError('');
    try { await onAdvance(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong — try again.'); }
    finally { setBusy(false); }
  };

  const seePage = (
    <>
      <button onClick={openPage} disabled={opening} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-pine hover:underline disabled:opacity-50">
        {opening ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <>See it on your page <ExternalLink className="w-3.5 h-3.5" aria-hidden /></>}
      </button>
      {blockedUrl && <p className="text-sm text-ink mt-2">Your browser blocked the new tab. <a href={blockedUrl} target="_blank" rel="noopener noreferrer" className="text-pine underline">Open your page here</a>.</p>}
    </>
  );

  // Already decided (a reload, or a decision made from the dashboard banner).
  if (status !== 'none') return (
    <Card className="p-6">
      <h2 className="text-[24px] font-serif font-semibold leading-none text-ink mb-4">Review your booking page</h2>
      <StatusDot status={status === 'approved' ? 'ok' : 'warn'} label={status === 'approved' ? 'You approved your page.' : 'You asked for changes. We’ll email you when your page is ready to look at again.'} />
      {error && <p role="alert" className="text-sm text-bad mt-4">{error}</p>}
      <button onClick={later} disabled={busy} className={`w-full mt-5 ${primary}`}>{busy ? 'Saving…' : 'Continue'}</button>
    </Card>
  );

  return (
    <Card ref={top} className="p-6 scroll-mt-4">
      <h2 className="text-[24px] font-serif font-semibold leading-none text-ink mb-2">Review your booking page</h2>
      {!review && !loadError && <p className="text-sm text-ink-soft flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading your page…</p>}
      {loadError && (
        <div role="alert" className="text-sm text-bad">{loadError} <button onClick={load} className="underline font-medium">Try again</button></div>
      )}

      {review && part && (
        <>
          <p className="text-sm text-ink mb-4">We built this from your setup sheet. Go through it part by part: tell us what looks right and what needs changing. Golfers can’t book until you go live.</p>
          <div className="flex items-center gap-1.5 mb-4" aria-label={`Part ${at + 1} of ${parts.length}`}>
            {parts.map((p, i) => (
              <span key={p.key} className={'h-1 flex-1 rounded-full ' + (i < at ? 'bg-pine' : i === at ? 'bg-pine/50' : 'bg-line')} />
            ))}
          </div>
          <p className="text-xs text-ink-muted">Part {at + 1} of {parts.length}</p>
          <h3 className="text-[17px] font-semibold text-ink mt-0.5">{part.title}</h3>
          <p className="text-[13.5px] text-ink-soft mb-3">{part.intro}</p>

          {part.rows.length === 0 ? (
            <p className="text-sm text-ink bg-paper/70 rounded-md px-3 py-2.5">Nothing set yet. Tell us what it should be with Change this.</p>
          ) : (
            <dl className="bg-paper/70 rounded-md divide-y divide-line-soft">
              {part.rows.map((r, i) => (
                <div key={i} className="px-3 py-2.5 sm:flex sm:gap-4">
                  <dt className="text-[13px] font-medium text-ink sm:w-40 shrink-0">{r.label}</dt>
                  <dd className="text-[13.5px] text-ink whitespace-pre-wrap">{r.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {part.key === 'photos' && (
            <div className="mt-4 space-y-4">
              <ImageUpload label="Your logo" kind="logo" value={review.images.logoUrl} onUploaded={url => setImage('logoUrl', url)} hint="Square works best. You can add it later from Settings." />
              <ImageUpload label="Course photo" kind="hero" value={review.images.heroImageUrl} onUploaded={url => setImage('heroImageUrl', url)} hint="The wide banner at the top of your page. You can add it later from Settings." />
              <div>
                <p className="text-[13px] font-semibold text-ink mb-1.5">Gallery</p>
                {review.images.gallery.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {review.images.gallery.map(u => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={u} src={u} alt="" loading="lazy" className="h-14 w-20 object-cover rounded-md border border-line" />
                    ))}
                  </div>
                )}
                {review.images.gallery.length < 8 && (
                  <label className="cursor-pointer inline-flex px-3 py-1.5 rounded-md bg-paper border border-line hover:border-line-strong text-xs font-medium text-ink-soft transition-colors">
                    {galleryBusy ? 'Uploading…' : 'Add a photo'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={galleryBusy} onChange={e => { addGallery(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                  </label>
                )}
                {galleryErr && <p className="text-xs text-bad mt-1">{galleryErr}</p>}
              </div>
            </div>
          )}

          <div className="mt-3">{seePage}</div>

          {writing ? (
            <div className="mt-4">
              <label className="block text-[13px] font-semibold text-ink mb-1.5" htmlFor="change-note">What should change in {part.title.toLowerCase()}?</label>
              <textarea id="change-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={2000} autoFocus
                placeholder="For example: weekend green fee should be $55" className={iCls + ' resize-none'} />
              <div className="mt-3 flex gap-2">
                <button onClick={() => setWriting(false)} className={`px-4 ${secondary}`}>Back</button>
                <button onClick={() => judge({ ok: false, note: note.trim() })} disabled={!note.trim()} className={`flex-1 ${primary}`}>Save and continue</button>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={() => setWriting(true)} className={secondary}>Change this</button>
              <button onClick={() => judge({ ok: true })} className={primary}>Looks right</button>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between">
            {at > 0 ? <button onClick={() => go(at - 1)} className="text-[13px] text-ink-soft hover:text-ink">Previous</button> : <span />}
            <button onClick={later} disabled={busy} className="text-[13px] text-ink-soft hover:text-ink">I’ll review it later</button>
          </div>
        </>
      )}

      {review && at >= parts.length && (
        <>
          <p className="text-sm text-ink mb-4">{changes.length
            ? `You asked for ${changes.length === 1 ? 'one change' : `${changes.length} changes`}. We’ll make ${changes.length === 1 ? 'it' : 'them'} and send your page back for one more look.`
            : 'Everything looks right. Approve your page and we’ll get it ready to go live.'}</p>
          <ul className="bg-paper/70 rounded-md divide-y divide-line-soft">
            {parts.map((p, i) => {
              const v = verdicts[p.key];
              return (
                <li key={p.key} className="px-3 py-2.5 flex items-start gap-3">
                  <span className="mt-1.5"><StatusDot status={!v ? 'neutral' : v.ok ? 'ok' : 'warn'} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-medium text-ink">{p.title}</span>
                    <span className="block text-[13px] text-ink-soft whitespace-pre-wrap">{!v ? 'Not looked at' : v.ok ? 'Looks right' : v.note}</span>
                  </span>
                  <button onClick={() => { setFromSummary(true); go(i); }} className="text-[13px] font-medium text-pine hover:underline shrink-0">Edit</button>
                </li>
              );
            })}
          </ul>
          {review.missing.length > 0 && (
            <p className="text-[13px] text-ink-soft mt-3">Still to do later: {review.missing.map(m => m.title.charAt(0).toLowerCase() + m.title.slice(1)).join(', ')}. You’ll find {review.missing.length === 1 ? 'it' : 'them'} on your Home page under Finish setting up.</p>
          )}
          {error && <p role="alert" className="text-sm text-bad mt-4">{error}</p>}
          <button onClick={send} disabled={busy} className={`w-full mt-5 ${primary}`}>
            {busy ? 'Sending…' : changes.length ? 'Send my changes' : 'Approve my page'}
          </button>
          <button onClick={later} disabled={busy} className="w-full mt-3 text-[13px] text-ink-soft hover:text-ink">I’ll review it later</button>
        </>
      )}
      {error && review && at < parts.length && <p role="alert" className="text-sm text-bad mt-4">{error}</p>}
    </Card>
  );
}
