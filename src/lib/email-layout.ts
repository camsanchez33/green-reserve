// Emails and texts redo (Cam 2026-11-19, lanes/build.md "Emails and texts redo — APPROVED";
// mockup lanes/build/emails-texts-mockup.html v17, Look C "Letter"). The ONE email layout:
// every email renders through letterEmail(), which returns the HTML and the plain-text
// version together, so the two can never say different things.
//
//   Course emails (golfers): the course's full name at the top under a thin bar in the
//   course's colour; the footer is the course's name, address and phone, then "Powered by"
//   and the GreenReserve logo.
//   GreenReserve emails (staff, onboarding, admin): the logo at the top; footer greenreserve.app.
//
// Body, in order: one line saying what happened, optional short paragraphs, stacked rows
// (label left, value right), optional labelled notes, one primary button with a text arrow,
// one small text link, then muted lines. Every string is plain text and escaped here, so a
// caller can never inject markup (course names, notes and golfer names are user text).
// Pure and client-safe: no prisma, no env beyond the site URL.

export const EMAIL_SITE_DEFAULT = 'https://greenreserve.app';
export function emailSite(): string {
  return (process.env.NEXT_PUBLIC_URL || EMAIL_SITE_DEFAULT).replace(/\/+$/, '');
}

/** The brand tokens of the Letter look (mockup F). */
export const EMAIL_TOKENS = {
  serif: "'EB Garamond',Georgia,'Times New Roman',serif",
  sans: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
  ink: '#151A16', body: '#3F463F', muted: '#6B726A', line: '#E2E5DD', paper: '#FFFFFF', soft: '#F5F6F2',
  /** GreenReserve's own green: the bar and button on GreenReserve-sent email. */
  pine: '#1F4D34',
} as const;
const T = EMAIL_TOKENS;

/** The course an email comes from: its footer and its colour. */
export type EmailCourse = {
  name: string;
  /** One line: "412 Orchard Lane, Millbrook, NY 12545". Empty = left out. */
  address?: string;
  phone?: string;
  /** The course's colour (hex) for the thin bar and the button. */
  accent?: string;
  /** Text on the button; computed from the accent when missing. */
  onAccent?: string;
};

export type EmailRow = { label: string; value: string };
export type EmailLink = { label: string; url: string };
export type EmailNote = { label?: string; text: string; /** The label links here (admin alerts). */ url?: string };
/** A titled block after the notes: rows and/or notes under a small heading (the morning digest, a setup sheet recap). */
export type EmailSection = { title: string; rows?: EmailRow[]; notes?: EmailNote[] };

export type LetterInput = {
  /** 'course' = from a course to a golfer; 'greenreserve' = from GreenReserve (staff, admin, onboarding). */
  from: 'course' | 'greenreserve';
  /** Required when from = 'course'. */
  course?: EmailCourse;
  /** The inbox preview line (hidden in the body). */
  preheader?: string;
  /** One line saying what happened: the headline. */
  line: string;
  /** Short paragraphs under the headline (plain text; line breaks kept). */
  paragraphs?: string[];
  rows?: EmailRow[];
  /** Labelled notes after the rows (a course's arrival line, a reason, terms). */
  notes?: EmailNote[];
  /** Titled blocks after the notes. */
  sections?: EmailSection[];
  /** A big code (sign-in codes): shown large under the headline. */
  code?: string;
  /** The one primary button. The arrow is added here. */
  button?: EmailLink;
  /** One small text link under the button ("Change or cancel booking"). */
  small?: EmailLink;
  /** Muted lines after the button. */
  after?: string[];
  /** A stop link in the footer (alerts, after-round emails). */
  stop?: EmailLink;
  /** The thin bar above the name or logo. Default on; the monthly review turns it off. */
  topBar?: boolean;
};

export type RenderedEmail = { html: string; text: string };

/** HTML-escape plain text. */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A link target: only http(s) and mailto survive; anything else becomes '#'. */
export function safeUrl(u: string): string {
  const s = String(u ?? '').trim();
  return /^(https?:\/\/|mailto:)/i.test(s) ? s : '#';
}

/** One line for a Subject header: no line breaks, bounded. */
export function subjectLine(s: string): string {
  return String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
}

/**
 * The From display name for a course: the course's full name, quoted, with anything that
 * could break the header taken out: "Maple Run Golf Course" <the noreply address from lib/contact>.
 */
export function courseFrom(courseName: string, address: string): string {
  const name = String(courseName ?? '').replace(/[\u0000-\u001f\u007f"<>\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 78) || 'GreenReserve';
  return `"${name}" <${address}>`;
}

const HEX = /^#[0-9a-f]{6}$/i;
/** White or ink text on a colour, whichever reads (WCAG relative luminance). */
export function textOn(hex: string): string {
  if (!HEX.test(hex)) return '#FFFFFF';
  const ch = (i: number) => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
  // Contrast with white (1.05/(L+.05)) vs with ink (~(L+.05)/.06): pick the larger.
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.06 ? '#FFFFFF' : T.ink;
}

function colours(i: LetterInput): { bar: string; btn: string; btnInk: string } {
  if (i.from === 'course') {
    const acc = i.course?.accent && HEX.test(i.course.accent) ? i.course.accent : '#24563A';
    return { bar: acc, btn: acc, btnInk: i.course?.onAccent && HEX.test(i.course.onAccent) ? i.course.onAccent : textOn(acc) };
  }
  return { bar: T.pine, btn: T.pine, btnInk: '#FFFFFF' };
}

/** "Price", "Paid", "Total" rows carry money: set larger. */
const isMoneyRow = (label: string) => /^(Price|Paid|Total|Refund|Due|Amount|Charged)\b/i.test(label) && !/^(Paid with|Due by|Charged to)/i.test(label);
const br = (s: string) => esc(s).replace(/\r?\n/g, '<br>');

/** The logo image (a 3x PNG: email clients don't show SVG), at `h` px high. 540×101 source. */
export function logoImg(h: number): string {
  const w = Math.round(h * 540 / 101);
  return `<img src="${emailSite()}/brand/email-logo-3x.png" alt="GreenReserve" width="${w}" height="${h}" style="display:inline-block;height:${h}px;width:${w}px;border:0;outline:none;text-decoration:none;vertical-align:middle">`;
}

export function letterEmail(i: LetterInput): RenderedEmail {
  const c = colours(i);
  const course = i.course;
  const isCourse = i.from === 'course';
  const topBar = i.topBar !== false;

  // ---------- HTML ----------
  const p = (t: string, style: string) => `<p style="margin:0;${style}">${br(t)}</p>`;
  const header = `<tr><td align="center" style="padding:24px 24px 6px">`
    + (topBar ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 12px"><tr><td style="width:36px;height:3px;background:${c.bar};font-size:0;line-height:0">&nbsp;</td></tr></table>` : '')
    + (isCourse
      ? `<div style="font:600 19px/1.2 ${T.serif};color:${T.ink}">${esc(course?.name ?? '')}</div>`
      : `<div>${logoImg(26)}</div>`)
    + `</td></tr>`;

  const headline = `<h1 style="margin:6px 0 0;text-align:center;font:600 26px/1.2 ${T.serif};color:${T.ink}">${esc(i.line)}</h1>`;
  const code = i.code ? `<div style="text-align:center;margin:18px 0 4px;font:600 40px/1 ${T.serif};letter-spacing:.08em;color:${T.ink}">${esc(i.code)}</div>` : '';
  const paras = (i.paragraphs ?? []).filter(Boolean).map(t => `<p style="margin:14px 0 0;text-align:center;font:15px/1.6 ${T.sans};color:${T.body}">${br(t)}</p>`).join('');
  const rowsOf = (list: EmailRow[] | undefined) => (list ?? []).filter(r => r && r.value !== '');
  const rowsTable = (list: EmailRow[]) => list.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:18px 0 0">${list.map((r, n) => {
      const money = isMoneyRow(r.label);
      const top = n ? `border-top:1px solid ${T.line};` : '';
      return `<tr><td style="padding:10px 12px 10px 0;${top}font:13px/1.4 ${T.sans};color:${T.muted};vertical-align:baseline">${esc(r.label)}</td>`
        + `<td align="right" style="padding:10px 0;${top}text-align:right;vertical-align:baseline;font:${money ? '600 18px' : '500 15px'}/1.4 ${T.sans};color:${T.ink}">${br(r.value)}</td></tr>`;
    }).join('')}</table>`
    : '';
  const notesHtml = (list: EmailNote[] | undefined) => (list ?? []).filter(n => n && n.text).map(n => {
    const label = !n.label ? '' : n.url
      ? `<a href="${esc(safeUrl(n.url))}" style="color:${T.ink};font-weight:600;text-decoration:underline">${esc(n.label)}</a>. `
      : `<strong style="color:${T.ink}">${esc(n.label)}.</strong> `;
    return `<p style="margin:12px 0 0;font:14px/1.55 ${T.sans};color:${T.body}">${label}${br(n.text)}</p>`;
  }).join('');
  const rows = rowsOf(i.rows);
  const rowsHtml = rowsTable(rows);
  const notes = notesHtml(i.notes);
  const sections = (i.sections ?? []).map(sec => `<p style="margin:24px 0 0;font:600 15px/1.3 ${T.sans};color:${T.ink}">${esc(sec.title)}</p>${rowsTable(rowsOf(sec.rows)).replace('margin:18px 0 0', 'margin:6px 0 0')}${notesHtml(sec.notes)}`).join('');
  const button = i.button
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:24px 0 0"><tr><td align="center" style="background:${c.btn};border-radius:7px"><a href="${esc(safeUrl(i.button.url))}" style="display:block;padding:14px 22px;font:600 15px/1 ${T.sans};color:${c.btnInk};text-decoration:none;text-align:center">${esc(i.button.label)}&nbsp;&rarr;</a></td></tr></table>`
    : '';
  const small = i.small ? `<p style="margin:12px 0 0;text-align:center;font:14px/1.5 ${T.sans}"><a href="${esc(safeUrl(i.small.url))}" style="color:${T.body};text-decoration:underline">${esc(i.small.label)}</a></p>` : '';
  const after = (i.after ?? []).filter(Boolean).map(t => p(t, `margin-top:10px;text-align:center;font:13px/1.5 ${T.sans};color:${T.muted}`)).join('');
  const spacer = !rows.length && !paras && !code && !notes && !sections ? '<div style="height:4px;line-height:4px;font-size:0">&nbsp;</div>' : '';

  const stop = i.stop ? `<br><a href="${esc(safeUrl(i.stop.url))}" style="color:${T.muted};text-decoration:underline">${esc(i.stop.label)}</a>` : '';
  const footer = isCourse
    ? `<p style="margin:0;font:12px/1.6 ${T.sans};color:${T.muted}"><span style="color:${T.ink}">${esc(course?.name ?? '')}</span>`
      + (course?.address ? `<br>${esc(course.address)}` : '')
      + (course?.phone ? `<br>${esc(course.phone)}` : '')
      + stop
      + `<br>Powered by&nbsp;${logoImg(16)}</p>`
    : `<p style="margin:0;font:12px/1.6 ${T.sans};color:${T.muted}">greenreserve.app${stop}</p>`;

  const pre = i.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(i.preheader)}</div>` : '';
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(i.line)}</title></head>
<body style="margin:0;padding:0;background:${T.soft}">${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.soft}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${T.paper};border:1px solid ${T.line};border-radius:10px">
${header}
<tr><td style="padding:8px 28px 26px">${headline}${code}${paras}${rowsHtml}${notes}${sections}${spacer}${button}${small}${after}</td></tr>
<tr><td align="center" style="padding:16px 28px;border-top:1px solid ${T.line};text-align:center">${footer}</td></tr>
</table>
</td></tr></table>
</body>
</html>`;

  // ---------- Plain text ----------
  const t: string[] = [];
  t.push(i.line);
  if (i.code) t.push('', i.code);
  for (const x of i.paragraphs ?? []) if (x) t.push('', x);
  if (rows.length) { t.push(''); for (const r of rows) t.push(`${r.label}: ${r.value.replace(/\r?\n/g, ', ')}`); }
  const noteText = (n: EmailNote) => `${n.label ? `${n.label}. ` : ''}${n.text}${n.url ? ` (${safeUrl(n.url)})` : ''}`;
  for (const n of i.notes ?? []) if (n?.text) t.push('', noteText(n));
  for (const sec of i.sections ?? []) {
    t.push('', sec.title.toUpperCase());
    for (const r of rowsOf(sec.rows)) t.push(`${r.label}: ${r.value.replace(/\r?\n/g, ', ')}`);
    for (const n of sec.notes ?? []) if (n?.text) t.push(noteText(n));
  }
  if (i.button) t.push('', `${i.button.label}: ${safeUrl(i.button.url)}`);
  if (i.small) t.push(`${i.small.label}: ${safeUrl(i.small.url)}`);
  for (const x of i.after ?? []) if (x) t.push('', x);
  t.push('', '--');
  if (isCourse) {
    t.push(course?.name ?? '');
    if (course?.address) t.push(course.address);
    if (course?.phone) t.push(course.phone);
    if (i.stop) t.push(`${i.stop.label}: ${safeUrl(i.stop.url)}`);
    t.push('Powered by GreenReserve');
  } else {
    t.push('greenreserve.app');
    if (i.stop) t.push(`${i.stop.label}: ${safeUrl(i.stop.url)}`);
  }
  return { html, text: t.join('\n') + '\n' };
}

// ---------- Formatting shared by the emails ----------

/** "2026-11-21" → "Sat, Nov 21"; anything else is returned as given. */
export function emailDate(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : String(d ?? '');
}
/** "14:05" → "2:05 PM"; anything else is returned as given. */
export function emailTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? '');
  if (!m) return String(t ?? '');
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}
/** Cents → "$1,234.50". */
export function usd(cents: number): string {
  const n = Math.round(Number(cents) || 0);
  return `${n < 0 ? '-' : ''}$${(Math.abs(n) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
/** Dollars → "$1,234.50". */
export function usdDollars(d: number): string { return usd(Math.round((Number(d) || 0) * 100)); }
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** A Date → "March 31, 2027". */
export function longDate(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
}

// ---------- Plain personal email (Cam's own replies, and outreach) ----------
export type PlainInput = {
  /** Paragraphs, in order: greeting, body, … (plain text; line breaks kept). */
  paragraphs: string[];
  /** The sign-off lines: "Cam Sanchez", "GreenReserve · <address>". */
  signature: string[];
  /** A muted line under the signature (what they asked, quoted back). */
  quote?: string;
  /** Outreach only: the logo and one line (postal address · reply to stop) under the email. */
  footerLine?: string;
};
/** No layout on purpose: it reads like a person wrote it (mockup "Outreach: plain personal email"). */
export function plainEmail(i: PlainInput): RenderedEmail {
  // A bare http(s) link in a paragraph becomes a link (escaped first, so only our own anchor is markup).
  const linkify = (h: string) => h.replace(/https?:\/\/[^\s<]+/g, raw => {
    // Sentence punctuation and an escaped quote or bracket after a link are not part of it.
    const m = /^(.*?)((?:[.,;:!?)\]]|&quot;|&#39;|&gt;)*)$/.exec(raw)!;
    const u = m[1], tail = m[2];
    return u.length > 'https://'.length ? `<a href="${u}" style="color:#1F4D34">${u}</a>${tail}` : raw;
  });
  const p = (t: string) => `<p style="margin:0 0 14px;font:15px/1.6 ${T.sans};color:#1F2420">${linkify(br(t))}</p>`;
  const sig = `<p style="margin:0 0 14px;font:15px/1.6 ${T.sans};color:#1F2420">${i.signature.map(esc).join('<br>')}</p>`;
  const quote = i.quote ? `<p style="margin:22px 0 0;padding-top:14px;border-top:1px solid ${T.line};font:13px/1.55 ${T.sans};color:${T.muted}">${br(i.quote)}</p>` : '';
  const foot = i.footerLine ? `<div style="margin:20px 0 0;text-align:center">${logoImg(20)}<p style="margin:6px 0 0;font:12px/1.5 ${T.sans};color:${T.muted}">${esc(i.footerLine)}</p></div>` : '';
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#FFFFFF">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:22px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td>
${i.paragraphs.filter(Boolean).map(p).join('')}${sig}${quote}${foot}
</td></tr></table>
</td></tr></table>
</body>
</html>`;
  const text = [...i.paragraphs.filter(Boolean).flatMap(x => [x, '']), ...i.signature, ...(i.quote ? ['', i.quote] : []), ...(i.footerLine ? ['', '--', i.footerLine] : [])].join('\n') + '\n';
  return { html, text };
}
