// SC-2 §3 — a minimal iCalendar file so a booked call lands in the course's
// own calendar with no integration on their side.

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function buildIcs(opts: {
  uid: string; start: Date; durationMin: number; summary: string; description?: string; url?: string;
  /** 'REQUEST' for new/moved, 'CANCEL' for cancelled */
  method?: 'REQUEST' | 'CANCEL'; sequence?: number;
}): string {
  const end = new Date(opts.start.getTime() + opts.durationMin * 60_000);
  const method = opts.method ?? 'REQUEST';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GreenReserve//Call//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${esc(opts.uid)}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(opts.start)}`,
    `DTEND:${stamp(end)}`,
    `SEQUENCE:${opts.sequence ?? 0}`,
    `SUMMARY:${esc(opts.summary)}`,
    ...(opts.description ? [`DESCRIPTION:${esc(opts.description)}`] : []),
    ...(opts.url ? [`URL:${opts.url}`] : []),
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  // RFC 5545: CRLF line endings, lines folded at 75 octets.
  return lines.map(l => fold(l)).join('\r\n') + '\r\n';
}

function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) { out.push(rest.slice(0, 75)); rest = ' ' + rest.slice(75); }
  out.push(rest);
  return out.join('\r\n');
}
