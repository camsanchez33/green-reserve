'use client';
// Booking page look (Cam 2026-11-18, Settings → Your course → Booking Page): Light or Dark plus one of four
// preset accents. No red (red means a problem) and no free colour. Saves through
// PATCH /api/operator/settings/booking-look (settings.edit, written to the course's settings log).
import { useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { BOOKING_LOOKS, BOOKING_ACCENTS, BOOKING_ACCENT_LABELS, BOOKING_ACCENT_COLOURS, bookingLookOf, type BookingLook, type BookingAccent } from '@/lib/booking-look';
import { type Ctx, type Course, Row, EditPopup, Muted } from './ui';

const LOOK_LABELS: Record<BookingLook, string> = { light: 'Light', dark: 'Dark' };
const TITLE = 'Booking page look';

export function BookingLookRow({ form, onOpen }: { form: Course; onOpen?: () => void }) {
  const bl = bookingLookOf({ bookingLook: form.bookingLook, bookingAccent: form.bookingAccent });
  return (
    <Row id="page-booking-look" label={TITLE} note="Buttons use the colour."
      value={bl.accent ? <span className="inline-flex items-center gap-2">
        <i aria-hidden="true" className="w-4 h-4 rounded-full border border-line" style={{ background: BOOKING_ACCENT_COLOURS[bl.accent][bl.look].acc }} />
        {LOOK_LABELS[bl.look]} · {BOOKING_ACCENT_LABELS[bl.accent]}</span> : <Muted>Not set</Muted>}
      onOpen={onOpen} />
  );
}

/** Booking page look (Cam 2026-11-18): Light or Dark plus one of four preset accents. No red; no free colour. */
export function BookingLookPopup({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const cur = bookingLookOf({ bookingLook: ctx.form.bookingLook, bookingAccent: ctx.form.bookingAccent });
  const [look, setLook] = useState<BookingLook>(cur.look);
  const [accent, setAccent] = useState<BookingAccent | null>(cur.accent);
  const pill = (on: boolean) => `min-h-[44px] px-4 rounded-md border text-[13.5px] font-medium ${on ? 'border-ink text-ink bg-paper' : 'border-line text-ink-soft'}`;
  return (
    <EditPopup title={TITLE} onClose={onClose} canSave={!!accent}
      onSave={async () => {
        if (!accent) return 'Pick a colour.';
        const r = await dfetch<{ bookingLook: string; bookingAccent: string }>('/api/operator/settings/booking-look', { method: 'PATCH', body: JSON.stringify({ look, accent }) });
        if (!r.ok) return r.error;
        ctx.merge({ bookingLook: look, bookingAccent: accent });
        return null;
      }}>
      <fieldset className="flex flex-col gap-1.5 text-[12.5px] text-ink-muted">
        <legend className="mb-1.5">Look</legend>
        <div className="flex gap-2">
          {BOOKING_LOOKS.map(l => (
            <button key={l} type="button" aria-pressed={look === l} onClick={() => setLook(l)} className={pill(look === l)}>{LOOK_LABELS[l]}</button>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1.5 text-[12.5px] text-ink-muted">
        <legend className="mb-1.5">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {BOOKING_ACCENTS.map(a => (
            <button key={a} type="button" aria-pressed={accent === a} onClick={() => setAccent(a)} className={pill(accent === a) + ' inline-flex items-center gap-2'}>
              <i aria-hidden="true" className="w-4 h-4 rounded-full border border-line" style={{ background: BOOKING_ACCENT_COLOURS[a][look].acc }} />
              {BOOKING_ACCENT_LABELS[a]}
            </button>
          ))}
        </div>
      </fieldset>
    </EditPopup>
  );
}
