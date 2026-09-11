'use client';
// SD-10. Rendered ABOVE a list when its load failed, so failure and
// emptiness stop looking identical ("No tee times for this date" after a 500).
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mb-4 bg-bad/5 border border-bad/20 rounded-lg px-4 py-3 text-sm text-bad flex items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md border border-bad/30 hover:bg-bad/10 transition-colors">
          Retry
        </button>
      )}
    </div>
  );
}
