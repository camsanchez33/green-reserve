'use client';
// AGREEMENT_SPEC AG-2 §1 — the "Sign" step. Used by onboarding (as its own
// step) and by /dashboard/sign (legacy courses, and AG-3 re-acceptance).
//
// Each document sits in its own scrollable panel with the short version
// above the full text; its checkbox is disabled until the panel has been
// scrolled to the bottom once (sent as `scrolledToEnd` — cheap evidence of
// presentation). One button posts everything in one request.
import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Loader2, AlertCircle, ChevronRight } from 'lucide-react';

type DocDto = {
  document: 'operator_agreement' | 'brand_license' | 'accuracy_attestation';
  version: string; title: string; effectiveAt: string; summary: string[]; html: string; hash: string;
  signed: boolean; acceptedAt: string | null; acceptedVersion: string | null;
};
type SignDto = {
  courseName: string; legalName: string; signerName: string; signerEmail: string; isStaff: boolean;
  status: { signed: number; total: number; missing: string[] };
  documents: DocDto[];
};

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';
const lbl = 'block text-[11px] uppercase tracking-[0.1em] text-ink-muted mb-1.5';

function DocPanel({ doc, legalName, checked, onCheck, scrolled, onScrolled, extra }: {
  doc: DocDto; legalName: string; checked: boolean; onCheck: (v: boolean) => void;
  scrolled: boolean; onScrolled: () => void; extra?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // A short document may not need scrolling at all — count that as read.
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight <= el.clientHeight + 4) onScrolled();
  }, [onScrolled]);
  const onScroll = () => {
    const el = ref.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) onScrolled();
  };
  const statement = doc.document === 'operator_agreement'
    ? <>I have read the GreenReserve Operator Agreement v{doc.version} and agree to it.</>
    : doc.document === 'brand_license'
      ? <>GreenReserve may display {legalName || 'the course'}&rsquo;s name, logo and photos on its booking page.</>
      : <>The course information and pricing I have submitted are accurate, and I will keep them current.</>;
  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-paper border-b border-line flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">{doc.title}</div>
          <div className="text-[11px] text-ink-faint">Version {doc.version} · effective {doc.effectiveAt}</div>
        </div>
        {doc.signed && (
          <span className="flex items-center gap-1 text-xs text-ok font-medium"><CheckCircle className="w-3.5 h-3.5" />Signed{doc.acceptedVersion && doc.acceptedVersion !== doc.version ? ` (v${doc.acceptedVersion})` : ''}</span>
        )}
      </div>
      {!doc.signed && (
        <>
          {doc.summary.length > 0 && (
            <div className="px-4 py-3 border-b border-line-soft">
              <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted mb-1.5">The short version</div>
              <ul className="space-y-1 text-[13px] text-ink-soft leading-relaxed">
                {doc.summary.map((s, i) => <li key={i} className="flex gap-2"><span className="text-ink-faint" aria-hidden="true">—</span><span>{s}</span></li>)}
              </ul>
            </div>
          )}
          <div
            ref={ref}
            onScroll={onScroll}
            className="max-h-64 overflow-y-auto px-4 py-3 text-[13px] text-ink-soft leading-relaxed [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:text-sm [&_h2]:mt-4 [&_h2]:mb-1 [&_h3]:font-semibold [&_h3]:text-ink [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_strong]:text-ink"
            dangerouslySetInnerHTML={{ __html: doc.html }}
          />
          <div className="px-4 py-3 border-t border-line bg-white">
            {!scrolled && <p className="text-[11px] text-ink-faint mb-2">Scroll to the end of the document to enable the checkbox.</p>}
            <label className={'flex items-start gap-2.5 text-sm select-none ' + (scrolled ? 'text-ink cursor-pointer' : 'text-ink-faint cursor-not-allowed')}>
              <input type="checkbox" checked={checked} disabled={!scrolled} onChange={e => onCheck(e.target.checked)} className="w-4 h-4 mt-0.5 accent-pine rounded shrink-0" />
              <span>{statement}</span>
            </label>
            {extra}
            <p className="mt-2 text-[10px] text-ink-faint">Document hash {doc.hash.slice(0, 16)}…</p>
          </div>
        </>
      )}
    </div>
  );
}

export default function SignAgreements({ onSigned, continueLabel = 'Sign and continue' }: { onSigned: () => void; continueLabel?: string }) {
  const [data, setData] = useState<SignDto | null>(null);
  const [loadError, setLoadError] = useState('');
  const [legalName, setLegalName] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [accept, setAccept] = useState<Record<string, boolean>>({});
  const [scrolled, setScrolled] = useState<Record<string, boolean>>({});
  const [authority, setAuthority] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoadError('');
    fetch('/api/operator/sign')
      .then(async r => { if (!r.ok) throw new Error(`Could not load the agreements (${r.status}).`); return r.json() as Promise<SignDto>; })
      .then(d => { setData(d); setLegalName(d.legalName || d.courseName); setSignerName(d.signerName || ''); })
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Could not load the agreements.'));
  };
  useEffect(load, []);

  if (loadError) {
    return (
      <div className="bg-bad/5 border border-bad/20 rounded-md p-4 text-sm text-bad flex items-center justify-between gap-3">
        <span>{loadError}</span>
        <button onClick={load} className="text-xs font-medium underline">Retry</button>
      </div>
    );
  }
  if (!data) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 text-pine animate-spin" /></div>;

  if (data.isStaff) {
    return <p className="text-sm text-ink-soft">Only the course owner can sign the agreements. Ask them to log in and complete this step.</p>;
  }
  const toSign = data.documents.filter(d => !d.signed);
  if (data.documents.length === 0) {
    return <p className="text-sm text-ink-soft">No agreements are ready to sign right now — contact hello@greenreserve.app.</p>;
  }
  if (toSign.length === 0) {
    return (
      <div>
        <div className="bg-ok/5 border border-ok/20 rounded-md p-4 flex items-start gap-3 mb-4">
          <CheckCircle className="w-5 h-5 text-ok mt-0.5 shrink-0" />
          <div>
            <div className="font-medium text-ok">Everything is signed</div>
            <div className="text-sm text-ink-soft mt-0.5">{data.status.signed} of {data.status.total} on file for {data.courseName}.</div>
          </div>
        </div>
        <button onClick={onSigned} className="w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] transition-colors flex items-center justify-center gap-2">
          Continue<ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const needsOa = toSign.some(d => d.document === 'operator_agreement');
  const ready = legalName.trim().length >= 2 && signerName.trim().length >= 2 && signerTitle.trim().length >= 2
    && toSign.every(d => accept[d.document] && scrolled[d.document]) && (!needsOa || authority);

  const submit = async () => {
    setSaving(true); setError('');
    try {
      const r = await fetch('/api/operator/sign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legalName, signerName, signerTitle, accept, scrolledToEnd: scrolled, authorityAttested: authority, marketingOptOut: !marketing }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || `Could not sign (${r.status}) — nothing was recorded, try again.`); return; }
      onSigned();
    } catch {
      setError('Network error — nothing was recorded. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-3">
          <label className={lbl}>Course legal name</label>
          <input value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="e.g. Hollow Creek Golf Club LLC" className={iCls} />
          <p className="text-[11px] text-ink-faint mt-1">The entity that runs {data.courseName} — as it appears on your bank account or business registration.</p>
        </div>
        <div className="sm:col-span-2">
          <label className={lbl}>Your name</label>
          <input value={signerName} onChange={e => setSignerName(e.target.value)} className={iCls} />
        </div>
        <div>
          <label className={lbl}>Your title</label>
          <input value={signerTitle} onChange={e => setSignerTitle(e.target.value)} placeholder="General Manager" className={iCls} />
        </div>
      </div>

      {data.documents.map(doc => (
        <DocPanel
          key={doc.document}
          doc={doc}
          legalName={legalName}
          checked={!!accept[doc.document]}
          onCheck={v => setAccept(a => ({ ...a, [doc.document]: v }))}
          scrolled={!!scrolled[doc.document]}
          onScrolled={() => setScrolled(s => (s[doc.document] ? s : { ...s, [doc.document]: true }))}
          extra={
            doc.document === 'operator_agreement' ? (
              <label className={'flex items-start gap-2.5 text-sm select-none mt-2 ' + (scrolled[doc.document] ? 'text-ink cursor-pointer' : 'text-ink-faint cursor-not-allowed')}>
                <input type="checkbox" checked={authority} disabled={!scrolled[doc.document]} onChange={e => setAuthority(e.target.checked)} className="w-4 h-4 mt-0.5 accent-pine rounded shrink-0" />
                <span>I am authorized to enter into this agreement on behalf of {legalName || 'the course'}.</span>
              </label>
            ) : doc.document === 'brand_license' ? (
              <label className={'flex items-start gap-2.5 text-sm select-none mt-2 ' + (scrolled[doc.document] ? 'text-ink cursor-pointer' : 'text-ink-faint cursor-not-allowed')}>
                <input type="checkbox" checked={marketing} disabled={!scrolled[doc.document]} onChange={e => setMarketing(e.target.checked)} className="w-4 h-4 mt-0.5 accent-pine rounded shrink-0" />
                <span>…and may name the course in GreenReserve&rsquo;s own marketing. <span className="text-ink-faint">(optional)</span></span>
              </label>
            ) : undefined
          }
        />
      ))}

      {error && (
        <div className="bg-bad/5 border border-bad/20 rounded-md p-3 flex items-start gap-2 text-sm text-bad">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
        </div>
      )}
      <button onClick={submit} disabled={saving || !ready}
        className="w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] disabled:opacity-50 disabled:bg-line-strong transition-colors flex items-center justify-center gap-2">
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Signing…</> : <>{continueLabel}<ChevronRight className="w-4 h-4" /></>}
      </button>
      <p className="text-[11px] text-ink-faint text-center">Signed copies are emailed to {data.signerEmail}. Signing records your IP address and the time.</p>
    </div>
  );
}
