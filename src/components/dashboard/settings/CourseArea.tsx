'use client';
// SETTINGS-6: Your course — Name and location, Booking Page, Facilities. Every field the old "Your course",
// "Course layout" and "Facilities" sections had is a row here; see the PR for where each went.
import { useEffect, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { downscaleImage } from '@/lib/image-resize';
import { US_TIMEZONES } from '@/lib/course-time';
import { facilityLines, RANGE_TYPES, FOOD_TYPES, TOURNAMENT_FREQ, type FacilityFields } from '@/lib/facilities';
import { askBirdie, useBirdieReady } from '@/lib/birdie/ask';
import { toast } from '@/components/dashboard/Toast';
import { ImageUpload } from '@/components/dashboard/ImageUpload';
import CoursePreview from '@/components/dashboard/CoursePreview';
import CourseLayoutTab from '@/components/dashboard/CourseLayoutTab';
import { RangeBuckets } from './RangeBuckets';
import { BookingLookRow, BookingLookPopup } from './BookingLookSetting';
import { type Ctx, type Course, Group, Row, Muted, EditPopup, Field, FIELD, TextEdit, LINK, plural } from './ui';

type Photo = { id: string; url: string; sortOrder: number };
const s = (v: unknown) => (v == null ? '' : String(v));
/** The brand colour picker's default (the course has none yet). */
const DEFAULT_COLOUR = '#173B2A';
const cents = (v: unknown) => Math.round(Number(v || 0) * 100);
export const facilityPreview = (f: Course) => facilityLines({
  ...(f as FacilityFields),
  clubRentalRateCents: cents(f.clubRentalRate), pushCartRateCents: cents(f.pushCartRate),
  caddieLooperRateCents: cents(f.caddieLooperRate), caddieForeRateCents: cents(f.caddieForeRate),
});

const FACILITY_GROUPS: { title: string; items: { key: string; label: string }[] }[] = [
  { title: 'Practice', items: [
    { key: 'hasDrivingRange', label: 'Driving range' },
    { key: 'hasPuttingGreen', label: 'Putting green' },
    { key: 'hasShortGameArea', label: 'Chipping and short-game area' },
  ] },
  { title: 'Shop, rentals and help', items: [
    { key: 'hasProShop', label: 'Pro shop' },
    { key: 'hasLessons', label: 'Lessons' },
    { key: 'hasClubRental', label: 'Club rental' },
    { key: 'hasPushCartRental', label: 'Push carts' },
    { key: 'hasCaddies', label: 'Caddies' },
  ] },
  { title: 'Clubhouse and carts', items: [
    { key: 'hasGpsCarts', label: 'GPS in the carts' },
    { key: 'hasBagStorage', label: 'Bag storage' },
    { key: 'hasLockerRoom', label: 'Locker room' },
    { key: 'hasTournaments', label: 'Tournaments' },
  ] },
];
export const FACILITY_FIELDS = [
  'hasDrivingRange', 'drivingRangeType', 'rangeBallsFree', 'hasPuttingGreen', 'hasShortGameArea',
  'hasProShop', 'proShopPhone', 'hasLessons', 'hasClubRental', 'clubRentalRate',
  'hasPushCartRental', 'pushCartRate', 'hasBagStorage', 'hasLockerRoom', 'hasGpsCarts',
  'hasTournaments', 'tournamentFrequency', 'restaurantType', 'hasCartGirl',
  'hasCaddies', 'caddieType', 'caddieLooperRate', 'caddieForeRate', 'caddieNote', 'amenities',
];

type Pop = '' | 'ask' | 'tz' | 'phone' | 'look' | 'bookLook' | 'hero' | 'photos' | 'desc' | 'type' | 'year' | 'web' | 'gift' | 'dress' | 'layout' | 'amen';

/** Name and address go through GreenReserve: the existing change-request channel (thread, activity ledger, email). */
function AskPopup({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  return (
    <EditPopup title="Ask GreenReserve for a change" saveLabel="Send" savedText="Sent. We’ll reply on Support." canSave={!!text.trim()} onClose={onClose}
      hint="Your name and address are what golfers search for, so GreenReserve checks them before they change. We reply on Support."
      onSave={async () => {
        const r = await dfetch('/api/operator/request-changes', { method: 'POST', body: JSON.stringify({ items: [{ category: 'course_details', detail: text.trim() }] }) });
        return r.ok ? null : r.error;
      }}>
      <Field label="What should we change?"><textarea value={text} onChange={e => setText(e.target.value)} rows={4} maxLength={2000} className={FIELD + ' resize-y'} autoFocus /></Field>
    </EditPopup>
  );
}

function LookPopup({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const f = ctx.form;
  const [color, setColor] = useState(s(f.brandColor) || DEFAULT_COLOUR);
  return (
    <EditPopup title="Logo and colour" size="lg" onClose={onClose} onSave={() => ctx.save({ brandColor: color })}
      hint="Receipts, emails and your dashboard.">
      <div data-setup="logo"><ImageUpload label="Your logo" kind="logo" value={s(f.logoUrl)} onUploaded={url => ctx.merge({ logoUrl: url })} hint="Square; a transparent PNG is best. Max 8MB. Saves on upload." /></div>
      <Field label="Your colour">
        <span className="flex items-center gap-2">
          <input type="color" value={color} onChange={e => setColor(e.target.value)} aria-label="Pick a colour" className="w-10 h-10 rounded-full border border-line cursor-pointer p-0.5 bg-paper" />
          <input value={color} onChange={e => setColor(e.target.value)} maxLength={7} aria-label="Colour code" className={FIELD + ' !w-32 font-mono'} />
        </span>
      </Field>
      <div>
        <div className="text-[12.5px] text-ink-muted mb-1.5">What golfers see</div>
        <CoursePreview name={s(f.name)} type={s(f.type) || 'public'} city={s(f.city)} state={s(f.state)}
          holes={typeof f.holes === 'number' ? f.holes : null} par={typeof f.par === 'number' ? f.par : null}
          establishedYear={typeof f.establishedYear === 'number' ? f.establishedYear : null}
          accent={color} logoUrl={s(f.logoUrl)} heroImageUrl={s(f.heroImageUrl)} />
        <p className="text-[12px] text-ink-muted mt-2">Sample times and prices; your real page shows yours.</p>
      </div>
    </EditPopup>
  );
}

function PhotosPopup({ photos, setPhotos, onClose }: { photos: Photo[]; setPhotos: (fn: (p: Photo[]) => Photo[]) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function upload(file: File | null) {
    if (!file) return;
    setBusy(true); setErr('');
    const fd = new FormData();
    fd.append('file', await downscaleImage(file));
    try {
      const res = await fetch('/api/operator/photos', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setPhotos(ps => [...ps, data]); else setErr(data.error || 'Upload failed — try again.');
    } catch { setErr('Upload failed — try again.'); }
    setBusy(false);
  }
  async function remove(id: string) {
    setErr('');
    const r = await dfetch(`/api/operator/photos/${id}`, { method: 'DELETE' });
    if (r.ok) setPhotos(ps => ps.filter(p => p.id !== id)); else setErr('Could not remove that photo — try again.');
  }
  return (
    <EditPopup title="Photos" size="lg" onClose={onClose} hint="Up to 8 photos in the Photos part of your booking page. Each saves on upload.">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {photos.map(p => (
          <div key={p.id} className="relative aspect-video rounded-md overflow-hidden border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={() => remove(p.id)} aria-label="Remove this photo" title="Remove this photo"
              className="absolute top-1.5 right-1.5 w-8 h-8 grid place-items-center rounded-md bg-black/60 text-white hover:bg-bad"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
          </div>
        ))}
        {photos.length < 8 && (
          <label className={'aspect-video rounded-md border-2 border-dashed border-line flex items-center justify-center cursor-pointer hover:border-ink-muted ' + (busy ? 'opacity-50 pointer-events-none' : '')}>
            <span className="text-[12.5px] text-ink-muted">{busy ? 'Uploading…' : 'Add photo'}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={e => upload(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </div>
      <p className="text-[12px] text-ink-muted">{photos.length}/8 photos · JPEG, PNG or WebP · large photos are resized</p>
      {err && <p role="alert" className="text-[13px] text-bad">{err}</p>}
    </EditPopup>
  );
}

function DescriptionPopup({ ctx, facilities, onClose }: { ctx: Ctx; facilities: string[]; onClose: () => void }) {
  const f = ctx.form;
  const [v, setV] = useState(s(f.description));
  const birdieOn = useBirdieReady();
  // Cam 2026-10-19: the assistant helps write it. It gets only the course's own facts and drafts; nothing is saved
  // until the owner confirms its card (the page picks the saved text up from APPLIED_EVENT).
  function ask() {
    const facts = [
      `${s(f.name)}${f.city ? `, ${f.city}, ${f.state}` : ''}`,
      `${f.type === 'private' ? 'Private' : 'Public'} course${f.holes ? `, ${f.holes} holes` : ''}${f.par ? `, par ${f.par}` : ''}${f.establishedYear ? `, opened ${f.establishedYear}` : ''}`,
      facilities.length ? `Facilities: ${facilities.join('; ')}` : '',
    ].filter(Boolean).join('\n');
    const intro = 'Draft the description for our booking page — 3 to 5 sentences, friendly and plain. Use only these facts, and ask me for anything else you want to say:\n';
    const cur = v.trim();
    const room = 1500 - intro.length - facts.length - 25;
    const line = cur && room > 80 ? `\nCurrent description: ${cur.length > room ? cur.slice(0, room - 1) + '…' : cur}` : '';
    askBirdie(`${intro}${facts}${line}`.slice(0, 1500));
    onClose();
  }
  return (
    <EditPopup title="Description" hint="The paragraph under your name: history, signature holes, views." onClose={onClose} onSave={() => ctx.save({ description: v })}>
      <Field label="Description"><textarea value={v} onChange={e => setV(e.target.value)} rows={5} className={FIELD + ' resize-y'} autoFocus /></Field>
      {birdieOn && <button type="button" onClick={ask} className={LINK + ' self-start'}>{v.trim() ? 'Ask the assistant to improve it' : 'Ask the assistant to write it'}</button>}
    </EditPopup>
  );
}

function SelectPopup({ ctx, field, title, hint, options, onClose }: { ctx: Ctx; field: string; title: string; hint?: string; options: [string, string][]; onClose: () => void }) {
  const [v, setV] = useState(s(ctx.form[field]) || options[0][0]);
  return (
    <EditPopup title={title} hint={hint} onClose={onClose} onSave={() => ctx.save({ [field]: v })}>
      <Field label={title}><select value={v} onChange={e => setV(e.target.value)} className={FIELD} autoFocus>{options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
    </EditPopup>
  );
}

/** The whole facilities checklist; ticking a line opens its one or two details. Saves the facility fields only. */
function AmenitiesPopup({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const [f, setF] = useState<Course>(() => Object.fromEntries(FACILITY_FIELDS.map(k => [k, ctx.form[k]])));
  const set = (k: string, v: unknown) => setF(x => ({ ...x, [k]: v }));
  const tog = (k: string) => setF(x => ({ ...x, [k]: !x[k] }));
  const money = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-[13px] text-ink-soft whitespace-nowrap">{label} $
      <input inputMode="decimal" value={s(f[k] || '')} onChange={e => set(k, e.target.value === '' ? null : Number(e.target.value))} placeholder="optional" className={FIELD + ' !w-28'} /></label>
  );
  const preview = facilityPreview({ ...ctx.form, ...f });
  return (
    <EditPopup title="Amenities" size="xl" hint="Listed on your booking page so golfers know what to expect. Prices are shown, never charged."
      onClose={onClose} onSave={() => ctx.save({ ...f, amenities: ((f.amenities as string[]) || []).map(l => l.trim()).filter(Boolean) })}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px] md:items-start">
        <div className="flex flex-col gap-3">
          {FACILITY_GROUPS.map(g => (
            <fieldset key={g.title} className="border-t border-line pt-3 first:border-0 first:pt-0">
              <legend className="text-[13px] font-semibold text-ink mb-1">{g.title}</legend>
              {g.items.map(it => (
                <div key={it.key} className="py-1.5">
                  <label className="flex items-center gap-2.5 text-[14px] text-ink cursor-pointer min-h-[32px]">
                    <input type="checkbox" checked={!!f[it.key]} onChange={() => tog(it.key)} className="accent-pine w-4 h-4" />{it.label}
                  </label>
                  {!!f[it.key] && it.key === 'hasDrivingRange' && (
                    <div className="pl-[26px] mt-2 flex flex-wrap items-center gap-3">
                      <select value={s(f.drivingRangeType)} onChange={e => set('drivingRangeType', e.target.value)} className={FIELD + ' !w-auto'} aria-label="Type of range">
                        <option value="">Type of range…</option>
                        {Object.entries(RANGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
                      </select>
                      <label className="flex items-center gap-2 text-[13px] text-ink-soft"><input type="checkbox" checked={f.rangeBallsFree !== false} onChange={() => set('rangeBallsFree', f.rangeBallsFree === false)} className="accent-pine" />Balls included with a round</label>
                    </div>
                  )}
                  {/* RANGE-1: the bucket list and the online switch (Dashboard lane: move into the rebuilt Settings / Pro shop). */}
                  {!!f[it.key] && it.key === 'hasDrivingRange' && <div className="pl-[26px]"><RangeBuckets /></div>}
                  {!!f[it.key] && it.key === 'hasProShop' && <div className="pl-[26px] mt-2 max-w-xs"><input type="tel" value={s(f.proShopPhone)} onChange={e => set('proShopPhone', e.target.value)} aria-label="Pro shop phone (optional)" className={FIELD} /></div>}
                  {!!f[it.key] && it.key === 'hasClubRental' && <div className="pl-[26px] mt-2">{money('clubRentalRate', 'Price')}</div>}
                  {!!f[it.key] && it.key === 'hasPushCartRental' && <div className="pl-[26px] mt-2">{money('pushCartRate', 'Price')}</div>}
                  {!!f[it.key] && it.key === 'hasCaddies' && (
                    <div className="pl-[26px] mt-2 flex flex-col gap-2">
                      <select value={s(f.caddieType) || 'looper'} onChange={e => set('caddieType', e.target.value)} className={FIELD + ' !w-auto'} aria-label="Caddie type">
                        <option value="looper">Caddies carry the bag</option><option value="fore_caddie">Fore caddies</option><option value="both">Both</option>
                      </select>
                      <div className="flex flex-wrap gap-3">
                        {f.caddieType !== 'fore_caddie' && money('caddieLooperRate', 'Per bag')}
                        {(f.caddieType === 'fore_caddie' || f.caddieType === 'both') && money('caddieForeRate', 'Fore caddie')}
                      </div>
                      <input value={s(f.caddieNote)} onChange={e => set('caddieNote', e.target.value)} aria-label="Caddie note (optional)" className={FIELD} />
                    </div>
                  )}
                  {!!f[it.key] && it.key === 'hasTournaments' && (
                    <div className="pl-[26px] mt-2 max-w-xs">
                      <select value={s(f.tournamentFrequency)} onChange={e => set('tournamentFrequency', e.target.value)} className={FIELD} aria-label="How often">
                        <option value="">How often? (optional)</option>
                        {Object.entries(TOURNAMENT_FREQ).map(([k, v]) => <option key={k} value={k}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </fieldset>
          ))}
          <fieldset className="border-t border-line pt-3">
            <legend className="text-[13px] font-semibold text-ink mb-1">Food and drink</legend>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {Object.entries(FOOD_TYPES).map(([k, v]) => (
                <label key={k} className="flex items-center gap-2.5 text-[14px] text-ink cursor-pointer min-h-[32px]">
                  <input type="radio" name="food" checked={(f.restaurantType || 'none') === k} onChange={() => set('restaurantType', k)} className="accent-pine" />{v}
                </label>
              ))}
            </div>
            {['snack_bar', 'bar', 'full'].includes(s(f.restaurantType)) && (
              <label className="flex items-center gap-2.5 text-[14px] text-ink cursor-pointer min-h-[32px] mt-1">
                <input type="checkbox" checked={!!f.hasCartGirl} onChange={() => tog('hasCartGirl')} className="accent-pine w-4 h-4" />A beverage cart on the course as well
              </label>
            )}
          </fieldset>
          <div className="border-t border-line pt-3">
            <Field label="Anything else" hint="One per line, e.g. Dog-friendly or Simulator bay.">
              <textarea value={((f.amenities as string[]) || []).join('\n')} onChange={e => set('amenities', e.target.value.split('\n'))} rows={3} className={FIELD + ' resize-y'} />
            </Field>
          </div>
        </div>
        <div className="md:sticky md:top-0">
          <div className="text-[12.5px] text-ink-muted mb-1.5">On your booking page</div>
          <div className="rounded-[10px] border border-line p-3 text-[13px]">
            {preview.length ? <ul className="list-disc pl-5 space-y-0.5 text-ink">{preview.map((l, i) => <li key={i}>{l}</li>)}</ul>
              : <p className="text-ink-soft">Nothing ticked yet, so golfers see no Facilities part.</p>}
          </div>
        </div>
      </div>
    </EditPopup>
  );
}

export function CourseArea({ ctx }: { ctx: Ctx }) {
  const f = ctx.form;
  const [pop, setPop] = useState<Pop>('');
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [tees, setTees] = useState<{ name: string; yardage?: number | null }[] | null>(null);
  const close = () => setPop('');
  const edit = ctx.canEdit ? (p: Pop) => () => setPop(p) : () => undefined;
  const ownerEdit = ctx.owner ? (p: Pop) => () => setPop(p) : () => undefined;

  useEffect(() => {
    dfetch<Photo[]>('/api/operator/photos').then(r => { if (r.ok && Array.isArray(r.data)) setPhotos(r.data); else if (!r.ok) toast('Could not load your photos — reload to try again.'); });
  }, []);
  // Re-read the tees when the layout popup closes, so the row says what was just added.
  useEffect(() => {
    if (pop === 'layout') return;
    dfetch<{ name: string; yardage?: number | null }[]>('/api/operator/tee-sets').then(r => { if (r.ok && Array.isArray(r.data)) setTees(r.data); });
  }, [pop]);

  const address = [s(f.address), [s(f.city), [s(f.state), s(f.zipCode)].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  const tz = US_TIMEZONES.find(z => z.id === (s(f.timezone) || 'America/New_York'));
  const facilities = facilityPreview(f);
  const dress = ((f.dresscode as string[]) || []).map(l => l.trim()).filter(Boolean);
  const types: [string, string][] = (s(f.type) && !['public', 'private'].includes(s(f.type)) ? ['public', 'private', s(f.type)] : ['public', 'private']).map(t => [t, t.charAt(0).toUpperCase() + t.slice(1)]);
  const notSet = <Muted>Not set</Muted>;
  const ownerNote = (n: string) => (ctx.owner ? n : `${n} Only the course owner can change this.`);

  return (
    <>
      <Group id="identity" title="Name and location" note="GreenReserve checks the name and address before they change, because golfers search by them.">
        <Row id="identity-name" label="Name" note="On your booking page, receipts and every email." value={s(f.name) || notSet} onOpen={edit('ask')} />
        <Row id="identity-address" label="Address" note="Used for directions and to find courses near a golfer." value={address || notSet} onOpen={edit('ask')} />
        <Row id="identity-status" label="Status" note="GreenReserve puts your page live once it's approved and payments are connected." value={s(f.liveStatus) === 'live' ? 'Live to golfers' : 'Not live yet'} />
        <Row id="identity-tz" label="Time zone" note={ownerNote('Every tee time, report and email uses this clock.')} value={tz ? tz.label : s(f.timezone)} onOpen={ownerEdit('tz')} />
        <Row id="identity-phone" setup="phone" label="Phone" note="Shown to golfers who need to call you." value={s(f.phone) || notSet} onOpen={edit('phone')} />
      </Group>

      <Group id="page" title="Booking Page">
        <Row id="page-look" setup="logo" label="Logo and colour" note="Receipts, emails and your dashboard."
          value={<span className="inline-flex items-center gap-2">
            {f.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={s(f.logoUrl)} alt="" className="w-6 h-6 rounded-[7px] object-cover" /> : <Muted>No logo</Muted>}
            <i aria-hidden="true" className="w-4 h-4 rounded-full border border-line" style={{ background: s(f.brandColor) || DEFAULT_COLOUR }} />
            <span className="font-mono text-[12.5px]">{s(f.brandColor) || DEFAULT_COLOUR}</span></span>}
          onOpen={edit('look')} />
        <BookingLookRow form={f} onOpen={edit('bookLook')} />
        <Row id="page-hero" setup="hero" label="Banner photo" note="The wide photo behind your name." value={f.heroImageUrl ? 'Added' : notSet} onOpen={edit('hero')} />
        <Row id="page-photos" setup="gallery" label="Photos" note="Up to 8, in the Photos part of your booking page." value={photos ? plural(photos.length, 'photo') : '…'} onOpen={edit('photos')} />
        <Row id="page-desc" setup="description" label="Description" note="The paragraph under your name." value={s(f.description).trim() ? <span className="line-clamp-2 font-normal">{s(f.description)}</span> : notSet} onOpen={edit('desc')} />
        <Row id="page-type" label="Course type" note={ownerNote('Shown under your name. Private turns off online booking.')} value={types.find(t => t[0] === (s(f.type) || 'public'))?.[1] ?? s(f.type)} onOpen={ownerEdit('type')} />
        <Row id="page-year" label="Year opened" note="Optional; shown under your name." value={s(f.establishedYear) || notSet} onOpen={edit('year')} />
        <Row id="page-web" label="Website" note="Linked from your booking page." value={s(f.website) || notSet} onOpen={edit('web')} />
        <Row id="page-gift" label="Gift cards" note="Adds a Gift cards link to your booking page." value={s(f.giftCardUrl) || notSet} onOpen={edit('gift')} />
        <Row id="page-dress" label="Dress code" note="One rule per line, listed on your booking page." value={dress.length ? dress.join(', ') : <Muted>None</Muted>} onOpen={edit('dress')} />
      </Group>

      <Group id="facilities" title="Facilities">
        <Row id="fac-nines" setup="holes" label="Holes and nines" note={ownerNote('Decides which rounds you can sell on Schedule and where groups start.')}
          value={f.holes ? `${f.holes} holes${f.par ? ` · par ${f.par}` : ''}` : notSet} onOpen={() => setPop('layout')} />
        <Row id="fac-tees" setup="teesets" label="Tees" note="Listed on your booking page with yardage, rating and slope."
          value={tees === null ? '…' : tees.length ? tees.map(t => t.yardage ? `${t.name} ${t.yardage.toLocaleString('en-US')}` : t.name).join(' · ') : notSet} onOpen={() => setPop('layout')} />
        <Row id="fac-amen" label="Amenities" note="Listed on your booking page so golfers know what to expect." value={facilities.length ? facilities.join(' · ') : <Muted>None ticked</Muted>} onOpen={edit('amen')} />
      </Group>

      {pop === 'ask' && <AskPopup onClose={close} />}
      {pop === 'tz' && <SelectPopup ctx={ctx} field="timezone" title="Time zone" hint="Your tee sheet's today, and the check-in and cancellation clocks, all run on this." options={US_TIMEZONES.map(z => [z.id, `${z.label} — ${z.id}`])} onClose={close} />}
      {pop === 'phone' && <TextEdit ctx={ctx} field="phone" title="Phone" type="tel" onClose={close} />}
      {pop === 'look' && <LookPopup ctx={ctx} onClose={close} />}
      {pop === 'bookLook' && <BookingLookPopup ctx={ctx} onClose={close} />}
      {pop === 'hero' && (
        <EditPopup title="Banner photo" onClose={close}>
          <ImageUpload label="Your course photo" kind="hero" value={s(f.heroImageUrl)} onUploaded={url => ctx.merge({ heroImageUrl: url })} hint="Wide landscape, behind your course name. Max 8MB. Saves on upload." />
        </EditPopup>
      )}
      {pop === 'photos' && <PhotosPopup photos={photos ?? []} setPhotos={fn => setPhotos(p => fn(p ?? []))} onClose={close} />}
      {pop === 'desc' && <DescriptionPopup ctx={ctx} facilities={facilities} onClose={close} />}
      {pop === 'type' && <SelectPopup ctx={ctx} field="type" title="Course type" hint="Private turns off online booking." options={types} onClose={close} />}
      {pop === 'year' && <TextEdit ctx={ctx} field="establishedYear" title="Year opened" type="number" onClose={close} />}
      {pop === 'web' && <TextEdit ctx={ctx} field="website" title="Website" type="url" onClose={close} />}
      {pop === 'gift' && <TextEdit ctx={ctx} field="giftCardUrl" title="Gift cards" type="url" hint="The page where golfers buy your gift cards." onClose={close} />}
      {pop === 'dress' && <TextEdit ctx={ctx} field="dresscode" title="Dress code" lines={4} hint="One rule per line. Leave it empty if you don't have one." toValue={v => v.split('\n').map(l => l.trim()).filter(Boolean)} onClose={close} />}
      {pop === 'layout' && (
        <EditPopup title="Holes, nines and tees" size="xl" onClose={close} hint="Each step saves itself.">
          <CourseLayoutTab holes={typeof f.holes === 'number' ? f.holes : null} par={typeof f.par === 'number' ? f.par : null} readOnly={!ctx.owner} onCourseSaved={p => ctx.merge(p)} />
        </EditPopup>
      )}
      {pop === 'amen' && <AmenitiesPopup ctx={ctx} onClose={close} />}
    </>
  );
}

