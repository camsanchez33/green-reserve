'use client';
// The course's logo or course photo: uploads straight to the course
// (/api/operator/upload saves it). Shared by Settings → Your course and the
// onboarding page review (Cam 2026-10-27: add a missing photo "now or later").
import { useState } from 'react';
import { downscaleImage } from '@/lib/image-resize';

export function ImageUpload({ label, kind, value, onUploaded, hint }: { label: string; kind: 'logo' | 'hero'; value: string; onUploaded: (url: string) => void; hint: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function handleFile(file: File | null) {
    if (!file) return;
    setBusy(true); setErr('');
    const fd = new FormData();
    fd.append('file', await downscaleImage(file));
    fd.append('kind', kind);
    try {
      const res = await fetch('/api/operator/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) onUploaded(data.url);
      else setErr(data.error || 'Upload failed');
    } catch { setErr('Upload failed — try again.'); }
    setBusy(false);
  }

  async function remove() {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/operator/upload?kind=${kind}`, { method: 'DELETE' });
      if (res.ok) onUploaded('');
      else setErr('Could not remove the image — try again.');
    } catch { setErr('Could not remove the image — try again.'); }
    setBusy(false);
  }

  return (
    <div>
      <label className="block text-[13px] font-semibold text-ink mb-1.5">{label}</label>
      <div className="flex items-center gap-4">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className={kind === 'logo' ? 'h-14 w-14 object-contain bg-paper rounded-md p-1 border border-line' : 'h-14 w-24 object-cover rounded-md border border-line'}/>
        ) : (
          <div className="h-14 w-24 rounded-md bg-paper border border-dashed border-line flex items-center justify-center text-ink-faint">
            
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="cursor-pointer inline-flex px-3 py-1.5 rounded-md bg-paper border border-line hover:border-line-strong text-xs font-medium text-ink-soft w-fit transition-colors">
            {busy ? 'Working…' : value ? 'Replace' : 'Upload image'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy} onChange={e => handleFile(e.target.files?.[0] ?? null)}/>
          </label>
          {value && <button onClick={remove} disabled={busy} className="text-xs text-ink-faint hover:text-bad text-left transition-colors">Remove</button>}
        </div>
      </div>
      <p className="text-xs text-ink-soft mt-1.5">{hint}</p>
      {err && <p className="text-xs text-bad mt-1">{err}</p>}
    </div>
  );
}
