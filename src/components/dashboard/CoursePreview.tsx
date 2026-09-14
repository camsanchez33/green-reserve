'use client';
import { MapPin, Bell } from 'lucide-react';

// B-6 (UI_REVISE_SPEC §4): a read-only, 380px-wide picture of the course's
// own booking page, fed from the Settings form state so it changes as the
// operator types. It mirrors the public page's hero (photo or flat accent
// tint, crest, serif name, meta line) and the first two slot rows (Select in
// the accent). Nothing here fetches or saves — it is the form, drawn.

export type CoursePreviewProps = {
  name: string;
  type: string;
  city: string;
  state: string;
  holes: number | null;
  par: number | null;
  establishedYear: number | null;
  accent: string;
  logoUrl: string;
  heroImageUrl: string;
};

const HEX = /^#[0-9a-f]{6}$/i;

export default function CoursePreview(p: CoursePreviewProps) {
  const accent = HEX.test(p.accent) ? p.accent : '#24513B';
  const name = p.name.trim() || 'Your course';
  const typeLabel = p.type === 'semi-private' ? 'Semi-Private' : p.type === 'municipal' ? 'Municipal' : p.type === 'resort' ? 'Resort' : p.type === 'private' ? 'Private Club' : 'Public Course';
  const meta = [[p.city, p.state].filter(Boolean).join(', '), p.holes ? `${p.holes} holes` : null, p.par ? `Par ${p.par}` : null].filter(Boolean).join(' · ');
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'GC';
  const slots = [{ time: '7:10 AM', open: 4, fee: 62 }, { time: '7:40 AM', open: 2, fee: 62 }];

  return (
    <div className="w-full max-w-[380px] bg-paper border border-line overflow-hidden text-ink" aria-label="Live preview of your booking page" style={{ borderRadius: 14 }}>
      <div className="relative h-44 flex flex-col justify-end px-5 pb-4 text-white overflow-hidden"
        style={p.heroImageUrl ? { backgroundImage: `url(${p.heroImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { backgroundColor: accent }}>
        {p.heroImageUrl
          ? <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/5" />
          : <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,.3) 0,rgba(255,255,255,.3) 1px,transparent 0,transparent 50%)', backgroundSize: '14px 14px' }} />}
        <div className="absolute top-3 left-5 text-[10px] uppercase tracking-[0.12em] text-white/85">{p.establishedYear ? `Est. ${p.establishedYear} · ` : ''}{typeLabel}</div>
        <div className="relative flex items-end gap-3">
          <div className="w-11 h-11 shrink-0 rounded-md bg-white flex items-center justify-center overflow-hidden text-[13px] font-semibold" style={{ color: accent }}>
            {p.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={p.logoUrl} alt="" className="w-full h-full object-contain p-1" />
              : initials}
          </div>
          <div className="min-w-0">
            <div className="font-serif font-medium text-[24px] leading-[1.05] truncate">{name}</div>
            {meta && <div className="flex items-center gap-1 text-[12px] text-white/80 mt-1 truncate"><MapPin size={11} className="shrink-0" />{meta}</div>}
          </div>
        </div>
      </div>
      <div className="px-5 pt-3 pb-1 text-[12px] leading-snug text-ink-soft"><b className="text-ink font-semibold">Nothing charged today.</b> Cancel free until 24 hours before your tee time. $1.50/player booking fee.</div>
      <div className="mx-5 mt-1">
        {slots.map((s, i) => (
          <div key={s.time} className="border-t border-line py-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-serif font-medium text-[22px] leading-none">{s.time}</div>
              <div className="text-[11.5px] text-ink-muted mt-1">{s.open} spots open</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[14px] font-medium">${s.fee}<span className="text-ink-muted font-normal"> / player</span></div>
              <span className="text-[11.5px] font-medium px-3 py-1.5 rounded-md" style={i === 0 ? { backgroundColor: accent, color: '#fff' } : { border: `1px solid ${accent}`, color: accent }}>{i === 0 ? 'Selected' : 'Select'}</span>
            </div>
          </div>
        ))}
        <div className="border-t border-line py-3 flex items-center justify-between gap-3 opacity-60">
          <div>
            <div className="font-serif font-medium text-[22px] leading-none line-through">8:40 AM</div>
            <div className="text-[11.5px] text-ink-muted mt-1">Full</div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-soft"><Bell size={11} /> Tell me if it opens</span>
        </div>
      </div>
      <div className="px-5 py-3 text-[10.5px] text-ink-faint">Booking by GreenReserve</div>
    </div>
  );
}
