'use client';
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';

interface Announcement { id: string; title: string; body: string; createdAt: string; }

export default function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    fetch('/api/operator/announcements')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.id) { setAnnouncement(d); setVisible(true); } })
      .catch(() => {});
  }, []);

  // Review 2026-10-04: a failed dismiss used to vanish silently and the banner
  // came back on the next page. It now comes back right away and says why.
  async function dismiss() {
    if (!announcement) return;
    setVisible(false);
    const r = await dfetch('/api/operator/announcements/dismiss', { method: 'POST', body: JSON.stringify({ announcementId: announcement.id }) });
    if (!r.ok) { setVisible(true); toast(`Couldn’t dismiss that announcement — ${r.error}`); }
  }

  if (!announcement || !visible) return null;

  const firstLine = announcement.body.split('\n')[0];

  // MP-7b: was an amber bar in font-black (both banned); now the one look —
  // white, a hairline, pine accent. The full text lives on Messages.
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-line px-4 py-2.5 flex items-center gap-3 text-ink">
      
      <div className="flex-1 min-w-0 flex items-baseline gap-2 overflow-hidden">
        <span className="font-semibold text-[13.5px] whitespace-nowrap">{announcement.title}</span>
        {firstLine && <span className="text-[13px] text-ink-soft truncate">{firstLine}</span>}
      </div>
      <a href="/dashboard/messages#announcements" className="shrink-0 text-[12.5px] font-semibold text-pine hover:underline underline-offset-4">Read</a>
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-paper transition-colors">
        <X className="w-4 h-4"/>
      </button>
    </div>
  );
}
