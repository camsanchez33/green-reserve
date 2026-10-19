// Members → Import a list: reading the course's CSV. Pure — the page uses it
// to preview, the import route to read the file for real (lib/member-import.ts).
export const MAX_IMPORT_ROWS = 1000;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** RFC-4180-ish CSV: commas or tabs, quoted fields with "" escapes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  return parseCsvLines(text).map(r => r.cells);
}

/** The same, with each row's line in the file (1-based), so a problem names the
 *  line the course sees in their spreadsheet even after blank lines. */
export function parseCsvLines(text: string): { line: number; cells: string[] }[] {
  const delim = (text.split(/\r?\n/, 1)[0] ?? '').includes('\t') && !(text.split(/\r?\n/, 1)[0] ?? '').includes(',') ? '\t' : ',';
  const rows: { line: number; cells: string[] }[] = [];
  let row: string[] = [], cell = '', quoted = false, lineNo = 1, rowStart = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else { if (ch === '\n') lineNo++; cell += ch; }
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim())) rows.push({ line: rowStart, cells: row });
      row = []; lineNo++; rowStart = lineNo;
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim())) rows.push({ line: rowStart, cells: row });
  return rows;
}

export type ImportRow = { line: number; email: string; name: string; phone: string; tier: string; expires: string; paid: boolean | null };
export type ImportProblem = { line: number; message: string };

const HEADERS: Record<keyof Omit<ImportRow, 'line'>, RegExp> = {
  email: /^e-?mail/i,
  name: /^(full )?name$|^member( name)?$/i,
  phone: /^(phone|mobile|cell)/i,
  tier: /^(membership|tier|type|plan|level)/i,
  expires: /^(expires?|expiry|expiration|renew|good until|end)/i,
  paid: /^(paid|dues)/i,
};
// First/last name columns are joined into one name.
const FIRST = /^first( name)?$/i;
const LAST = /^(last|sur)( name)?$|^surname$/i;

/** "2027-03-31", "3/31/2027" or "3/31/27" → "2027-03-31"; '' if blank; null if unreadable. */
export function toYmd(v: string): string | null {
  const s = v.trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) return ymd(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  return null;
}
function ymd(y: number, mo: number, d: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const yes = (v: string) => /^(y|yes|paid|true|1|x)$/i.test(v.trim());
const no = (v: string) => /^(n|no|unpaid|false|0)$/i.test(v.trim());

/** Rows from the file, with each problem named by its line (1 = the header). */
export function readMemberCsv(text: string): { rows: ImportRow[]; problems: ImportProblem[]; columns: string[] } {
  const lines = parseCsvLines(text);
  const table = lines.map(l => l.cells);
  const problems: ImportProblem[] = [];
  if (table.length < 2) return { rows: [], problems: [{ line: 1, message: 'The file needs a header row and at least one member.' }], columns: [] };
  const header = table[0].map(h => h.trim());
  const col = (re: RegExp) => header.findIndex(h => re.test(h));
  const idx = { email: col(HEADERS.email), name: col(HEADERS.name), first: col(FIRST), last: col(LAST), phone: col(HEADERS.phone), tier: col(HEADERS.tier), expires: col(HEADERS.expires), paid: col(HEADERS.paid) };
  if (idx.email < 0) return { rows: [], problems: [{ line: 1, message: 'No "Email" column. Name the column with the email addresses "Email".' }], columns: header };
  const body = table.slice(1);
  if (body.length > MAX_IMPORT_ROWS) problems.push({ line: 1, message: `Only the first ${MAX_IMPORT_ROWS} members are read — split the file for more.` });
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  body.slice(0, MAX_IMPORT_ROWS).forEach((r, i) => {
    const line = lines[i + 1].line;
    const get = (k: number) => (k >= 0 ? (r[k] ?? '').trim() : '');
    const email = get(idx.email).toLowerCase();
    const name = (get(idx.name) || [get(idx.first), get(idx.last)].filter(Boolean).join(' ')).slice(0, 120);
    if (!email) { problems.push({ line, message: 'No email.' }); return; }
    if (!EMAIL.test(email)) { problems.push({ line, message: `"${email}" isn't an email address.` }); return; }
    if (seen.has(email)) { problems.push({ line, message: `${email} is listed twice; the first is used.` }); return; }
    const expires = toYmd(get(idx.expires));
    if (expires === null) { problems.push({ line, message: `Can't read the date "${get(idx.expires)}". Use 2027-03-31 or 3/31/2027.` }); return; }
    const paidRaw = get(idx.paid);
    seen.add(email);
    rows.push({ line, email: email.slice(0, 200), name, phone: get(idx.phone).slice(0, 40), tier: get(idx.tier).slice(0, 80), expires, paid: paidRaw ? (yes(paidRaw) ? true : no(paidRaw) ? false : null) : null });
  });
  return { rows, problems, columns: header };
}

