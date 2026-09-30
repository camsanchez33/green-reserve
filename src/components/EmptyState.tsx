import Image from 'next/image';

// Admin/marketing-only empty-state illustration — never use on course-world
// pages (course page, portal, booking, member pages). White-label rule.
export function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="text-center py-16">
      <Image
        src="/brand/golfer.svg"
        unoptimized
        alt=""
        width={52}
        height={64}
        loading="lazy"
        className="mx-auto mb-4 opacity-80"
      />
      <div className="text-sm text-ink-muted">{message}</div>
      {sub && <div className="text-xs text-ink-faint mt-1">{sub}</div>}
    </div>
  );
}
