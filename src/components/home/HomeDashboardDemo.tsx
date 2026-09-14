'use client';
import { useState } from 'react';
import { STAFF_LOOK_CLASS } from '@/lib/staff-fonts';
import s from '@/app/home.module.css';

// H-2b: "What you see" — the operator's tee sheet, in demo mode. Standalone:
// no fetch, no real course, nothing saved. It mirrors the dashboard's shape
// (page sentence, stat tiles, date strip, tee-sheet rows that expand to
// bookings with Check In, Block/Unblock) and wears the STAFF look by mounting
// the same `.staff-look` switch the real dashboard uses — Newsreader / Source
// Sans 3 / square corners, scoped to this laptop screen only. Fonts download
// only once this tab is opened (nothing here renders until then).

type Booking = { id: string; name: string; players: number; paid: boolean; checkedIn: boolean };
type Slot = { id: string; time: string; holes: number; price: number; capacity: number; blocked: boolean; bookings: Booking[] };

const START: Slot[] = [
  { id: 'a', time: '7:10 AM', holes: 18, price: 62, capacity: 4, blocked: false, bookings: [{ id: 'a1', name: 'Whitaker', players: 2, paid: false, checkedIn: true }, { id: 'a2', name: 'Okafor', players: 2, paid: false, checkedIn: false }] },
  { id: 'b', time: '7:20 AM', holes: 18, price: 62, capacity: 4, blocked: false, bookings: [{ id: 'b1', name: 'Reyes', players: 4, paid: true, checkedIn: false }] },
  { id: 'c', time: '7:30 AM', holes: 18, price: 62, capacity: 4, blocked: false, bookings: [] },
  { id: 'd', time: '7:40 AM', holes: 18, price: 62, capacity: 4, blocked: false, bookings: [{ id: 'd1', name: 'Lindqvist', players: 3, paid: false, checkedIn: false }] },
  { id: 'e', time: '7:50 AM', holes: 18, price: 62, capacity: 4, blocked: true, bookings: [] },
  { id: 'f', time: '8:00 AM', holes: 9, price: 38, capacity: 4, blocked: false, bookings: [{ id: 'f1', name: 'Park', players: 1, paid: false, checkedIn: false }] },
];
const DAYS = ['Fri 4', 'Sat 5', 'Sun 6', 'Mon 7', 'Tue 8'];
const HATCH: React.CSSProperties = { backgroundImage: 'repeating-linear-gradient(135deg, #E3E0D5 0 1px, transparent 1px 7px)' };

export default function HomeDashboardDemo({ accent }: { accent: string }) {
  const [slots, setSlots] = useState<Slot[]>(START);
  const [open, setOpen] = useState<string | null>('a');
  const [day, setDay] = useState(0);

  const booked = slots.reduce((n, sl) => n + sl.bookings.reduce((m, b) => m + b.players, 0), 0);
  const forSale = slots.filter(sl => !sl.blocked).reduce((n, sl) => n + sl.capacity, 0);
  const checkedIn = slots.reduce((n, sl) => n + sl.bookings.filter(b => b.checkedIn).reduce((m, b) => m + b.players, 0), 0);
  const collected = slots.reduce((n, sl) => n + sl.bookings.filter(b => b.checkedIn || b.paid).reduce((m, b) => m + b.players * (sl.price + 1.5), 0), 0);

  function checkIn(slotId: string, bookingId: string) {
    setSlots(prev => prev.map(sl => sl.id !== slotId ? sl : { ...sl, bookings: sl.bookings.map(b => b.id === bookingId ? { ...b, checkedIn: true, paid: true } : b) }));
  }
  function toggleBlock(slotId: string) {
    setSlots(prev => prev.map(sl => sl.id !== slotId ? sl : { ...sl, blocked: !sl.blocked }));
  }
  function reset() { setSlots(START); setOpen('a'); setDay(0); }

  const tiles = [
    { label: 'Booked', value: `${booked}`, note: `of ${forSale} spots for sale` },
    { label: 'Checked in', value: `${checkedIn}`, note: 'players on the course' },
    { label: 'Collected', value: `$${collected.toFixed(2)}`, note: 'green fees + booking fee, so far' },
  ];

  return (
    <div className={s.laptop} aria-label="Example operator tee sheet — try it">
      <div className={s.laptopScreen}>
        <div className={STAFF_LOOK_CLASS}>
          <div className={s.dash} style={{ '--course': accent } as React.CSSProperties}>
            <div className={s.dashHead}>
              <div>
                <div className={s.dashTitle}>Friday, September 4</div>
                <div className={s.dashSub}><b>{booked} booked</b> of {forSale} spots for sale · {checkedIn} checked in · <b>${collected.toFixed(2)}</b> collected so far</div>
              </div>
              <button type="button" className={s.dashReset} onClick={reset}>Start over</button>
            </div>

            <div className={s.dashTiles}>
              {tiles.map(t => (
                <div key={t.label} className={s.dashTile}>
                  <div className={s.dashEyebrow}>{t.label}</div>
                  <div className={s.dashNum}>{t.value}</div>
                  <div className={s.dashNote}>{t.note}</div>
                </div>
              ))}
            </div>

            <div className={s.dashDays} role="tablist" aria-label="Day">
              {DAYS.map((d, i) => (
                <button key={d} type="button" role="tab" aria-selected={day === i} className={`${s.dashDay} ${day === i ? s.on : ''}`}
                  style={day === i ? { backgroundColor: accent, borderColor: accent, color: '#fff' } : undefined}
                  onClick={() => setDay(i)}>
                  <span>{d.split(' ')[0]}</span><b>{d.split(' ')[1]}</b>
                </button>
              ))}
            </div>

            <div className={s.dashRows}>
              {slots.map(sl => {
                const players = sl.bookings.reduce((n, b) => n + b.players, 0);
                const isOpen = open === sl.id;
                return (
                  <div key={sl.id} className={`${s.dashRow} ${sl.blocked ? s.blocked : ''}`} style={sl.blocked ? HATCH : undefined}>
                    <button type="button" className={s.dashRowHit} onClick={() => setOpen(isOpen ? null : sl.id)} aria-expanded={isOpen}>
                      <span className={s.dashTime}>{sl.time}</span>
                      <span className={s.dashMeta}>{sl.holes}h</span>
                      <span className={s.dashMeta}>{sl.blocked ? 'Blocked' : `${players}/${sl.capacity}`}</span>
                      <span className={s.dashMeta}>${sl.price}</span>
                      <span className={s.dashChips}>
                        {sl.bookings.map(b => <span key={b.id} className={s.dashChip}>{b.name} · {b.players}</span>)}
                      </span>
                    </button>
                    <button type="button" className={s.dashBlock} onClick={() => toggleBlock(sl.id)}>{sl.blocked ? 'Unblock' : 'Block'}</button>
                    {isOpen && sl.bookings.length > 0 && !sl.blocked && (
                      <div className={s.dashBookings}>
                        {sl.bookings.map(b => (
                          <div key={b.id} className={s.dashBooking}>
                            <span><b>{b.name}</b> <span className={s.dashMeta}>{b.players} player{b.players === 1 ? '' : 's'}</span></span>
                            <span className={s.dashStatus} style={b.checkedIn ? { color: '#3D6B4C' } : undefined}>{b.checkedIn ? 'Checked in' : b.paid ? 'Paid' : 'Card on file'}</span>
                            {!b.checkedIn && (
                              <button type="button" className={s.dashCheckIn} style={{ backgroundColor: accent }} onClick={() => checkIn(sl.id, b.id)}>
                                {b.paid ? 'Check in' : `Check in · $${(b.players * (sl.price + 1.5)).toFixed(2)}`}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className={s.dashFoot}>Example sheet. Your real one shows your times, your prices, your golfers.</div>
          </div>
        </div>
      </div>
      <div className={s.laptopBase} aria-hidden="true" />
    </div>
  );
}
