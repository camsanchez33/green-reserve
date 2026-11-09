// Cam 2026-11-09 (Money notes): "'Open Stripe dashboard' should look cleaner — maybe the Stripe logo as the button".
// Stripe's own purple (the `stripe` colour token) and wordmark style — the one place the dashboard wears another company's colour, because the
// button IS Stripe's dashboard. Opens in a new tab (the link is minted per click by /api/operator/stripe/dashboard-link).
export function StripeButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} aria-label="Open your Stripe dashboard (new tab)" title="Open your Stripe dashboard"
      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[7px] bg-stripe text-white text-[15px] font-bold tracking-[-0.02em] hover:opacity-90 disabled:opacity-60">
      {busy ? 'Opening…' : <>stripe <span aria-hidden="true" className="text-[12px] font-medium opacity-80">↗</span></>}
    </button>
  );
}
