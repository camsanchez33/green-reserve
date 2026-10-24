'use client';
// W2-9 Events (Cam 2026-10-21/22): outings, tournaments and league nights. The
// list of the course's events, the guided setup, and one event's page
// (?id=…). Needs "Run events"; the routes refuse everyone else.
import { Suspense, useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import OperatorSidebar from '@/components/OperatorSidebar';
import { StaffNotice } from '@/components/dashboard/StaffNotice';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import EventSetup, { blankForm, KINDS, type EventForm, type Product, type NineOpt } from '@/components/dashboard/events/EventSetup';
import EventDetail, { type EventData } from '@/components/dashboard/events/EventDetail';
import { dfetch } from '@/lib/dashboard-fetch';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { formatTeeDay, formatTeeTime } from '@/lib/format';

type Row = {
  id: string; name: string; kind: string; date: string; format: string; startTime: string; holes: number; status: string;
  players: number; entrantCount: number; heldCount: number; tasksOpen: number; tasksOverdue: number;
};
type List = { today: string; courseHoles: number; products: Product[]; nines: NineOpt[]; events: Row[] };

// Printing the pairings prints only the sheet: the bar, tabs and assistant stay off paper.
const PRINT_CSS = '@media print { header, nav, [data-print-hide] { display: none !important; } body { background: #fff; } }';

function toForm(d: EventData): EventForm {
  const e = d.event;
  return {
    name: e.name, kind: e.kind, date: e.date, format: e.format === 'tee_times' ? 'tee_times' : 'shotgun', startTime: e.startTime, holes: e.holes,
    groups: e.groups ? String(e.groups) : '', players: e.players ? String(e.players) : '', productId: e.productId ?? '',
    // Keep a hold end the course set by hand; an automatic one is worked out again.
    holdTo: e.holdToCustom ? e.holdTo : '',
    shareCourse: e.shareCourse, holdNineIds: e.holdNineIds, keepOpen: e.keepOpen,
    organizerName: e.organizerName, organizerEmail: e.organizerEmail, organizerPhone: e.organizerPhone,
    pricePerPlayer: e.pricePerPlayerCents ? (e.pricePerPlayerCents / 100).toFixed(2) : '', includes: e.includes, terms: e.terms, notes: e.notes,
    payer: e.payer === 'organizer' || e.payer === 'players' ? e.payer : '',
  };
}

function EventsInner() {
  const access = useDashboardAccess();
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id');
  const [list, setList] = useState<List | null>(null);
  const [detail, setDetail] = useState<EventData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<'view' | 'new' | 'edit'>('view');
  const [note, setNote] = useState('');

  const loadList = useCallback(async () => {
    setLoadError('');
    const r = await dfetch<List>('/api/operator/events');
    if (!r.ok) { setLoadError(r.error); return; }
    setList(r.data);
  }, []);
  const loadDetail = useCallback(async (eventId: string) => {
    setLoadError(''); setDetail(null);
    const r = await dfetch<EventData>(`/api/operator/events/${eventId}`);
    if (!r.ok) { setLoadError(r.error); return; }
    setDetail(r.data);
  }, []);
  // After a payment action: refresh in place (the event stays on screen).
  const refreshDetail = useCallback(async () => {
    if (!id) return;
    const r = await dfetch<EventData>(`/api/operator/events/${id}`);
    if (!r.ok) { setNote(`Saved, but the page couldn\u2019t refresh: ${r.error}`); return; }
    setDetail(r.data); loadList();
  }, [id, loadList]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (id) loadDetail(id); else setDetail(null); }, [id, loadDetail]);

  const canRun = !access.loaded || access.can('events.manage');
  const upcoming = (list?.events ?? []).filter(e => e.status === 'planned' && e.date >= list!.today);
  const past = (list?.events ?? []).filter(e => !(e.status === 'planned' && e.date >= list!.today)).reverse();

  function saved(eventId: string, held: number, booked: number) {
    setMode('view');
    setNote(`Saved. ${held ? `${held} tee time${held === 1 ? '' : 's'} held.` : ''}${booked ? ` ${booked} booked time${booked === 1 ? ' is' : 's are'} in the way — see below.` : ''}`.trim());
    loadList();
    if (eventId === id) loadDetail(eventId); else router.push(`/dashboard/events?id=${eventId}`);
  }

  const row = (e: Row) => (
    <button key={e.id} onClick={() => { setNote(''); router.push(`/dashboard/events?id=${e.id}`); }}
      className="w-full text-left flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-paper/70 transition-colors">
      <div className="flex-1 min-w-[200px]">
        <div className="text-[14px] font-medium text-ink">{e.name}</div>
        <div className="text-[12.5px] text-ink-muted">
          {KINDS.find(k => k.key === e.kind)?.label ?? 'Event'} · {formatTeeDay(e.date)} · {e.format === 'shotgun' ? `shotgun ${formatTeeTime(e.startTime)}` : `from ${formatTeeTime(e.startTime)}`}
        </div>
      </div>
      <div className="text-[13px] text-ink-soft tabular-nums">{e.entrantCount && e.players ? `${e.entrantCount} of ${e.players} players` : e.entrantCount || e.players ? `${e.entrantCount || e.players} players` : ''}</div>
      <div className="w-[170px]">
        {e.status === 'cancelled' ? <StatusDot status="neutral" label="Cancelled" />
          : e.tasksOverdue ? <StatusDot status="bad" label={`${e.tasksOverdue} overdue`} />
          : e.tasksOpen ? <StatusDot status="warn" label={`${e.tasksOpen} to do`} />
          : <StatusDot status="ok" label="Ready" />}
      </div>
    </button>
  );

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <style>{PRINT_CSS}</style>
      <OperatorSidebar active="events" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-8">
        {!canRun ? <StaffNotice what="events" view="events.manage" /> : (
          <div className="px-4 sm:px-10 py-7 space-y-5">
            {loadError && (
              <div role="alert" className="bg-bad/5 border border-bad/20 rounded-md px-4 py-3 text-[13.5px] text-ink flex items-center justify-between gap-3" data-print-hide>
                <span>{loadError}</span>
                <button onClick={() => (id ? loadDetail(id) : loadList())} className="text-[13px] font-medium underline">Try again</button>
              </div>
            )}
            {note && <p role="status" className="text-[13.5px] text-ink" data-print-hide>{note}</p>}

            {mode !== 'view' && list && (
              <EventSetup
                key={mode + (detail?.event.id ?? '')}
                initial={mode === 'edit' && detail ? toForm(detail) : blankForm(list.today)}
                eventId={mode === 'edit' ? detail?.event.id : undefined}
                products={list.products} nines={list.nines} courseHoles={list.courseHoles}
                onSaved={saved} onCancel={() => setMode('view')} />
            )}

            {mode === 'view' && id && detail && (
              <EventDetail data={detail} onChange={d => { setDetail(d); loadList(); }} onEdit={() => { setNote(''); setMode('edit'); }}
                onBack={() => { setNote(''); router.push('/dashboard/events'); }}
                canRefund={!access.loaded || access.can('money.refund')} reload={refreshDetail} />
            )}
            {mode === 'view' && id && !detail && !loadError && <p className="text-sm text-ink-muted">Loading the event…</p>}

            {mode === 'view' && !id && (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h1 className="font-serif text-[32px] leading-none text-ink">Events</h1>
                  <button onClick={() => { setNote(''); setMode('new'); }} disabled={!list}
                    className="px-4 py-2.5 rounded-md text-[13.5px] font-medium bg-pine hover:bg-pine-hover text-white disabled:opacity-50">Set up an event</button>
                </div>
                {!list && !loadError && <p className="text-sm text-ink-muted">Loading your events…</p>}
                {list && list.events.length === 0 && (
                  <Card className="px-6 py-10 text-center">
                    <Image src="/brand/golfer.svg" unoptimized alt="" width={40} height={49} className="mx-auto mb-3" />
                    <p className="text-[14px] text-ink">No events yet.</p>
                    <p className="text-[13.5px] text-ink-soft mt-1 max-w-md mx-auto">Set up an outing, tournament or league night. Saving holds its tee times so golfers can&apos;t book them, and builds a checklist to get ready.</p>
                  </Card>
                )}
                {upcoming.length > 0 && (
                  <section>
                    <h2 className="text-[15px] font-semibold text-ink mb-2">Coming up</h2>
                    <Card className="divide-y divide-line-soft overflow-hidden">{upcoming.map(row)}</Card>
                  </section>
                )}
                {past.length > 0 && (
                  <section>
                    <h2 className="text-[15px] font-semibold text-ink mb-2">Past and cancelled</h2>
                    <Card className="divide-y divide-line-soft overflow-hidden">{past.map(row)}</Card>
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function EventsPage() {
  return <Suspense fallback={null}><EventsInner /></Suspense>;
}
