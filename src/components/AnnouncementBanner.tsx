'use client';
import { useState, useEffect } from 'react';
import { X, Megaphone } from 'lucide-react';

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

  async function dismiss() {
    if (!announcement) return;
    setVisible(false);
    fetch('/api/operator/announcements/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ announcementId: announcement.id }),
    }).catch(() => {});
  }

  if (!announcement || !visible) return null;

  const firstLine = announcement.body.split('\n')[0];

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-2.5 flex items-center gap-3 shadow-lg">
      <Megaphone className="w-4 h-4 shrink-0"/>
      <div className="flex-1 min-w-0 flex items-baseline gap-2 overflow-hidden">
        <span className="font-black text-sm whitespace-nowrap">{announcement.title}</span>
        {firstLine && <span className="text-sm opacity-75 truncate">{firstLine}</span>}
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-amber-600/30 transition-colors">
        <X className="w-4 h-4"/>
      </button>
    </div>
  );
}
