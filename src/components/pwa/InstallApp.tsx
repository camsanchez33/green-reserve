'use client';
// PWA install (Cam 2026-11-24): "Install app" — a text button when the browser offers installing, Safari's one-line
// instruction where it never does, nothing when the page is already the installed app or the browser can't install.
// Styling comes from where it sits (the dashboard rail, the phone More sheet, admin My profile).
import { SAFARI_INSTALL_TEXT, useInstallApp } from './install-store';

export default function InstallApp({ buttonClassName, textClassName }: { buttonClassName: string; textClassName: string }) {
  const { state, install } = useInstallApp();
  if (state === 'prompt') return <button type="button" onClick={install} className={buttonClassName}>Install app</button>;
  if (state === 'ios' || state === 'mac-safari') return <p className={textClassName}>{SAFARI_INSTALL_TEXT[state]}</p>;
  return null;
}
