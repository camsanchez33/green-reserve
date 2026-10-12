'use client';
// AG-3 — Admin → System → Agreement versions (Cam 2026-10-12: "build the admin
// button"). Lists every agreement version on this deployment and publishes the
// ones that are not yet — the same step as scripts/seed-agreement-versions.ts,
// without needing database access from a laptop. Owner with 2FA only (the route
// enforces it; the System page only renders this for owners).
import { useCallback, useEffect, useState } from 'react';
import { adminFetch, type AdminFetchFailure } from '@/lib/admin-fetch';
import { ErrorBanner, LoadFailure } from '@/components/ui/ErrorState';
import { StatusDot } from '@/components/ui/StatusDot';
import { Card } from '@/components/ui/Card';
import { Modal, ModalActions } from '@/components/ui/Modal';
import { formatDate, formatDateTime } from '@/lib/format';
import type { VersionRow } from '@/lib/agreement-publish';

export default function AgreementVersionsCard() {
  const [rows, setRows] = useState<VersionRow[] | null>(null);
  const [loadError, setLoadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [confirm, setConfirm] = useState<VersionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [done, setDone] = useState('');

  const load = useCallback(async () => {
    const res = await adminFetch<{ versions: VersionRow[] }>('/api/admin/agreement-versions', { subject: 'agreement versions' });
    if (!res.ok) { setLoadError({ msg: res.message, kind: res.kind }); return; }
    setLoadError(null); setRows(res.data.versions);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function publish(v: VersionRow) {
    setBusy(true); setError(null); setDone('');
    const res = await adminFetch<{ reacceptBy: string | null }>('/api/admin/agreement-versions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: v.document, version: v.version }),
      subject: `${v.title} ${v.version}`, action: 'save',
    });
    setBusy(false);
    if (!res.ok) { setError({ msg: res.message, kind: res.kind }); return; }
    setConfirm(null);
    await load();
    setDone(res.data.reacceptBy
      ? `${v.title} ${v.version} is published. Courses on an older version have until ${formatDate(res.data.reacceptBy)} to re-sign; the email goes out with the next hourly run.`
      : `${v.title} ${v.version} is published.`);
  }

  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold text-ink mb-1">Agreement versions</h2>
      <p className="text-sm text-ink-soft mb-3">
        Each version of the agreements courses sign. A new version is signed by new courses as soon as it deploys; publishing it starts the re-sign window for courses already on an older one.
      </p>
      {done && <p className="mb-3 text-sm text-ok">{done}</p>}
      {loadError && <LoadFailure compact message={loadError.msg} kind={loadError.kind} onRetry={load} />}
      {!loadError && !rows && <p className="text-xs text-ink-muted">Loading…</p>}
      {rows && (
        <ul className="divide-y divide-line">
          {rows.map(v => (
            <li key={v.document + v.version} className="py-2.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  <span className="font-medium">{v.title} {v.version}</span>
                  {v.current && <span className="text-ink-muted"> · current</span>}
                </p>
                <div className="mt-0.5 text-[13px] text-ink-soft space-y-0.5">
                  {v.published && !v.published.hashMatches && (
                    <StatusDot status="bad" label="The file changed after it was published. Versions cannot be edited — add a new version instead." />
                  )}
                  {v.published && v.published.hashMatches && (
                    <StatusDot status="ok" label={`Published ${formatDate(v.published.effectiveAt)}`} />
                  )}
                  {!v.published && <StatusDot status="warn" label={v.blocked ? 'Cannot be published yet' : 'Not published'} />}
                  {v.published?.reacceptBy && (
                    <p>
                      Courses re-sign by {formatDate(v.published.reacceptBy)}.{' '}
                      {v.published.noticeSentAt ? `Email sent ${formatDateTime(v.published.noticeSentAt)}.` : 'Email goes out with the next hourly run.'}
                    </p>
                  )}
                  {v.reacceptRequired && !v.published && <p>Publishing asks every course on an older version to re-sign within 30 days.</p>}
                  {v.reacceptRequired && (v.counselReviewed
                    ? <p>Reviewed by counsel {v.counselReviewed}.</p>
                    : v.counselWaived ? <p>Counsel review waived: {v.counselWaived}</p> : null)}
                  {!v.published && v.blocked && <p className="text-bad">{v.blocked}</p>}
                </div>
              </div>
              {!v.published && !v.blocked && (
                <button type="button" onClick={() => { setError(null); setDone(''); setConfirm(v); }}
                  className="shrink-0 bg-pine hover:bg-pine-hover text-white text-xs font-medium rounded-md px-3 py-1.5 transition-colors">
                  Publish {v.version}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {confirm && (
        <Modal title={`Publish ${confirm.title} ${confirm.version}?`} onClose={() => { if (!busy) setConfirm(null); }} dismissable={!busy}>
          {confirm.reacceptRequired ? (
            <div className="text-sm text-ink space-y-2">
              <p>Every course still on an older version gets an email with the next hourly run and has 30 days to re-sign.</p>
              <p>After the 30 days, a course that has not re-signed cannot change anything in its dashboard until it signs. Golfers can still book the whole time.</p>
              {confirm.changeSummary && <p className="text-ink-soft">What changed: {confirm.changeSummary}</p>}
              {!confirm.counselReviewed && confirm.counselWaived && <p className="text-ink-soft">Counsel review waived: {confirm.counselWaived}</p>}
              <p>This cannot be undone.</p>
            </div>
          ) : (
            <p className="text-sm text-ink">This records the version as published. No emails are sent and no one is asked to re-sign.</p>
          )}
          {error && <ErrorBanner className="mt-3 mb-0" message={error.msg} kind={error.kind} onRetry={() => publish(confirm)} />}
          <ModalActions onCancel={() => setConfirm(null)} onConfirm={() => publish(confirm)} confirmLabel={`Publish ${confirm.version}`} working={busy} />
        </Modal>
      )}
    </Card>
  );
}
