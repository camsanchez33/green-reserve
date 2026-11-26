'use client';
// PWA install (Cam 2026-11-24): the "Install app" state. Chrome and Edge fire beforeinstallprompt once the app is
// installable; we keep that event (PwaRegister catches it, early) and the button replays it. Safari never fires it,
// so on an iPhone or iPad and on Mac Safari the button is replaced by the one-line instruction. Hidden whenever the
// page is already running as the installed app.
import { useCallback, useEffect, useState } from 'react';

type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
declare global { interface Window { __grInstall?: InstallPromptEvent | null } }

const CHANGE = 'gr-install-change';
let hooked = false;

/** Listens for the install events (idempotent; PwaRegister's inline listener may already have caught one). */
export function captureInstallPrompt(): void {
  if (hooked || typeof window === 'undefined') return;
  hooked = true;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    window.__grInstall = e as InstallPromptEvent;
    window.dispatchEvent(new Event(CHANGE));
  });
  window.addEventListener('appinstalled', () => {
    window.__grInstall = null;
    window.dispatchEvent(new Event(CHANGE));
  });
}

/** 'prompt': show the button. 'ios' / 'mac-safari': show that browser's instruction. null: show nothing. */
export type InstallState = 'prompt' | 'ios' | 'mac-safari' | null;

export const SAFARI_INSTALL_TEXT = {
  ios: 'To install, tap Share, then Add to Home Screen.',
  'mac-safari': 'To install, choose File, then Add to Dock.',
} as const;

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Which Safari instruction fits this browser, if any. Exported for the unit test. */
export function safariKind(ua: string, maxTouchPoints: number): 'ios' | 'mac-safari' | null {
  // iPadOS asks for the desktop site and says "Macintosh"; a touch screen gives it away.
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return 'ios';
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua)) return 'mac-safari';
  return null;
}

function readState(): InstallState {
  if (isStandalone()) return null;
  if (window.__grInstall) return 'prompt';
  return safariKind(navigator.userAgent, navigator.maxTouchPoints || 0);
}

export function useInstallApp(): { state: InstallState; install: () => Promise<void> } {
  // null on the server and the first client render, so both agree; the real state comes after mount.
  const [state, setState] = useState<InstallState>(null);
  useEffect(() => {
    captureInstallPrompt();
    const update = () => setState(readState());
    update();
    const mq = window.matchMedia('(display-mode: standalone)');
    window.addEventListener(CHANGE, update);
    mq.addEventListener?.('change', update);
    return () => { window.removeEventListener(CHANGE, update); mq.removeEventListener?.('change', update); };
  }, []);
  const install = useCallback(async () => {
    const e = window.__grInstall;
    if (!e) return;
    // The event can be shown only once; whatever the answer, the button goes until Chrome offers it again.
    window.__grInstall = null;
    try { await e.prompt(); await e.userChoice; }
    catch (err) { console.error(JSON.stringify({ ev: 'pwa.install_prompt_failed', error: err instanceof Error ? err.message : String(err) })); }
    finally { window.dispatchEvent(new Event(CHANGE)); }
  }, []);
  return { state, install };
}
