'use client';
// W2-9 Events (Cam 2026-10-21/22): outings, tournaments and league nights. The list of the course's events, the guided
// setup, and one event's page (?id=…). Needs "Run events"; the routes refuse everyone else.
// EVENTS-3 (Cam 2026-11-17, "events is good"; lanes/dashboard.md item 3, mockup lanes/dashboard/events-mockup.html):
// the approved page in Charcoal and Light. The list (EventsList), an event's page (EventDetail) and the setup, which
// opens in the dashboard pop-up both to set up an event and for Change details (EventSetup). Wired to what the routes
// return today; what needs Build's new fields stays hidden (see the PR for the agreed shape).
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OperatorSidebar from '@/components/OperatorSidebar';
import { StaffNotice } from '@/components/dashboard/StaffNotice';
import { LoadError } from '@/components/dashboard/LoadError';
import EventSetup, { blankForm, toForm, type Product, type NineOpt } from '@/components/dashboard/events/EventSetup';
import EventDetail, { type EventData } from '@/components/dashboard/events/EventDetail';
import EventsList, { type ListRow } from '@/components/dashboard/events/EventsList';
import { dfetch } from '@/lib/dashboard-fetch';
import { useDashboardAccess } from '@/lib/use-dashboard-access';

type List = { today: string; courseHoles: number; products: Product[]; nines: NineOpt[]; events: ListRow[] };

// Printing the pairings prints only the sheet: the bar, tabs and assistant stay off paper.
const PRINT_CSS = '@media print { header, nav, [data-print-hide] { display: none !important; } body { background: #fff; } }';

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
    if (!r.ok) { setNote(`Saved, but the page couldn’t refresh: ${r.error}`); return; }
    setDetail(r.data); loadList();
  }, [id, loadList]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (id) loadDetail(id); else setDetail(null); }, [id, loadDetail]);

  const canRun = !access.loaded || access.can('events.manage');

  function saved(eventId: string, held: number, booked: number) {
    setMode('view');
    setNote(`Saved. ${held ? `${held} tee time${held === 1 ? '' : 's'} held.` : ''}${booked ? ` ${booked} booked time${booked === 1 ? ' is' : 's are'} in the way: see On your tee sheet.` : ''}`.trim());
    loadList();
    if (eventId === id) loadDetail(eventId); else router.push(`/dashboard/events?id=${eventId}`);
  }

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-page md:overflow-hidden print:h-auto print:overflow-visible">
      <style>{PRINT_CSS}</style>
      <OperatorSidebar active="events" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-8 print:overflow-visible">
        {!canRun ? <StaffNotice what="events" view="events.manage" /> : (
          <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1320px] flex flex-col gap-4">
            {loadError && <div data-print-hide><LoadError message={loadError} onRetry={() => (id ? loadDetail(id) : loadList())} /></div>}
            {note && <p role="status" className="text-[13.5px] text-ink" data-print-hide>{note}</p>}

            {mode !== 'view' && list && (
              <EventSetup
                key={mode + (detail?.event.id ?? '')}
                initial={mode === 'edit' && detail ? toForm(detail) : blankForm(list.today)}
                eventId={mode === 'edit' ? detail?.event.id : undefined}
                products={list.products} nines={list.nines} courseHoles={list.courseHoles} today={list.today}
                onSaved={saved} onCancel={() => setMode('view')} />
            )}

            {id && detail && (
              <EventDetail data={detail} onChange={d => { setDetail(d); loadList(); }} onEdit={() => { setNote(''); setMode('edit'); }}
                onBack={() => { setNote(''); router.push('/dashboard/events'); }}
                canRefund={!access.loaded || access.can('money.refund')} reload={refreshDetail} />
            )}
            {id && !detail && !loadError && <p className="text-sm text-ink-muted">Loading the event…</p>}

            {!id && (list
              ? <EventsList events={list.events} today={list.today} canNew onNew={() => { setNote(''); setMode('new'); }}
                  onOpen={eventId => { setNote(''); router.push(`/dashboard/events?id=${eventId}`); }} />
              : !loadError && <p className="text-sm text-ink-muted">Loading your events…</p>)}
          </div>
        )}
      </main>
    </div>
  );
}

export default function EventsPage() {
  return <Suspense fallback={null}><EventsInner /></Suspense>;
}
