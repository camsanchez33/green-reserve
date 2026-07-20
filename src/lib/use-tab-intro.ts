import { useEffect, useState } from 'react';
import { isIntroSeen, markIntroSeen } from './dashboard-visits';

// Drives the first-visit "what is this page" intro card (V13 item 2) —
// shown once per tab per device, reopenable anytime via the header's "?".
export function useTabIntro(tabKey: string) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { setOpen(!isIntroSeen(tabKey)); setReady(true); }, [tabKey]);

  return {
    open: ready && open,
    show: () => setOpen(true),
    dismiss: () => { markIntroSeen(tabKey); setOpen(false); },
  };
}
