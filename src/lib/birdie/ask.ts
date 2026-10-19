// AN-3 (Cam 2026-10-19: "so they know they can ask Birdie for explanations and
// help"): a page asks Birdie a question by event; BirdieWidget listens. Client only.
import { useEffect, useState } from 'react';

export const ASK_EVENT = 'birdie:ask';
const READY_EVENT = 'birdie:ready';
let ready = false;

/** Called by BirdieWidget once the assistant is confirmed on for this course. */
export function markBirdieReady() {
  ready = true;
  window.dispatchEvent(new Event(READY_EVENT));
}

/** Open Birdie with `question` typed in (not sent). */
export function askBirdie(question: string) {
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { question } }));
}

/** True once Birdie is on — "Ask Birdie" links render only then, so they never do nothing. */
export function useBirdieReady(): boolean {
  const [on, setOn] = useState(ready);
  useEffect(() => {
    if (ready) { setOn(true); return; }
    const f = () => setOn(true);
    window.addEventListener(READY_EVENT, f);
    return () => window.removeEventListener(READY_EVENT, f);
  }, []);
  return on;
}
