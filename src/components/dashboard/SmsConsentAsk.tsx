'use client';
// SMS-1 (Cam 2026-11-02, Twilio A2P 10DLC — docs/SMS_OPT_IN.md): the verbal opt-in at
// the counter. Staff read the script out loud; only after the golfer says yes do they
// tick the box. Unticked by default, every time. The route records the yes against
// the staff login (SmsConsent, method "verbal") before any text goes.
import { smsVerbalScript } from '@/lib/sms-consent-copy';
import { Card } from '@/components/ui/Card';

export default function SmsConsentAsk({ courseName, checked, onChange }: { courseName: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="rounded-md bg-paper/70 px-3 py-2.5 space-y-2">
      <p className="text-[12.5px] text-ink-soft leading-snug"><span className="font-medium text-ink">Before texting them, read this out loud:</span> {smsVerbalScript(courseName)}</p>
      <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer select-none">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4" />
        They said yes to texts
      </label>
    </div>
  );
}

/** The tee sheet's "Text pay link" to a number that never agreed: read the script, tick, then send (or email instead). */
export function SmsConsentDialog({ courseName, name, busy, yes, onYes, onSend, onEmail, onClose }: {
  courseName: string; name: string; busy: boolean; yes: boolean; onYes: (v: boolean) => void; onSend: () => void; onEmail?: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" role="dialog" aria-modal="true" aria-label="Text pay link">
      <Card className="w-full max-w-md p-5 space-y-3">
        <h3 className="text-[16px] font-semibold text-ink">Text {name} the pay link</h3>
        <SmsConsentAsk courseName={courseName} checked={yes} onChange={onYes} />
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3.5 min-h-[40px] rounded-md bg-white border border-line text-ink text-[13px] font-medium">Back</button>
          {onEmail && <button onClick={onEmail} className="px-3.5 min-h-[40px] rounded-md bg-white border border-line text-ink text-[13px] font-medium">Email</button>}
          <button disabled={!yes || busy} onClick={onSend} className="px-3.5 min-h-[40px] rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50">{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </Card>
    </div>
  );
}
