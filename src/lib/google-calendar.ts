// CALL_SCHEDULING_SPEC SC-1 §2 — Google Calendar, the smallest honest version.
//
// A service account (GOOGLE_SERVICE_ACCOUNT_JSON) that Cam has shared his
// calendar (GOOGLE_CALENDAR_ID) with, "Make changes to events". No googleapis
// dependency: the JWT is signed with jose (already a dependency) and the REST
// calls are plain fetch.
//
//   busyBlocks(from, to)   — freebusy.query, cached 5 minutes. THROWS on any
//                            failure; the caller decides, nobody swallows it.
//   createCallEvent(...)   — returns the event id, or null on failure. Never
//                            throws into the booking path: a failed calendar
//                            write must not lose the course's booking.
//   moveCallEvent / deleteCallEvent — same contract as create: boolean, logged.
import { SignJWT, importPKCS8 } from 'jose';
import * as Sentry from '@sentry/nextjs';

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

// Events read/write + free/busy read — not full calendar admin.
const SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
const TZ = 'America/New_York';
const BUSY_TTL_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const BUSY_CACHE_MAX = 50;

export function calendarConfigured(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_CALENDAR_ID);
}

function loadServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON'); }
  const sa = parsed as Partial<ServiceAccount>;
  if (!sa.client_email || !sa.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key');
  return { client_email: sa.client_email, private_key: sa.private_key.replace(/\\n/g, '\n'), token_uri: sa.token_uri };
}

function calendarId(): string {
  const id = process.env.GOOGLE_CALENDAR_ID;
  if (!id) throw new Error('GOOGLE_CALENDAR_ID is not set');
  return id;
}

// ── access token (service-account JWT bearer grant) ──────────────────
let tokenCache: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - 60_000 > Date.now()) return tokenCache.token;
  const sa = loadServiceAccount();
  const key = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience(sa.token_uri || TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch(sa.token_uri || TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Google token exchange returned no access_token');
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

// `op` is what gets into error strings — never the path, which carries the calendar id.
async function gapi<T>(method: string, path: string, op: string, body?: unknown): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw new Error(`Google Calendar ${op} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return await res.json() as T;
}

// ── free/busy ─────────────────────────────────────────────────────────
export type BusyBlock = { start: Date; end: Date };
const busyCache = new Map<string, { at: number; blocks: BusyBlock[] }>();

/** One freebusy.query for GOOGLE_CALENDAR_ID, cached 5 minutes. Throws on failure. */
export async function busyBlocks(from: Date, to: Date): Promise<BusyBlock[]> {
  // Bucket the window to 5 minutes so a live `now` still hits the cache, and
  // evict stale entries so the map cannot grow for the life of the instance.
  const bucket = BUSY_TTL_MS;
  const f = new Date(Math.floor(from.getTime() / bucket) * bucket);
  const t = new Date(Math.ceil(to.getTime() / bucket) * bucket);
  const key = `${f.toISOString()}|${t.toISOString()}`;
  const hit = busyCache.get(key);
  if (hit && Date.now() - hit.at < BUSY_TTL_MS) return hit.blocks;
  for (const [k, v] of busyCache) if (Date.now() - v.at >= BUSY_TTL_MS) busyCache.delete(k);
  if (busyCache.size >= BUSY_CACHE_MAX) busyCache.clear();
  const id = calendarId();
  const data = await gapi<{ calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> }>(
    'POST', '/freeBusy', 'freebusy', { timeMin: f.toISOString(), timeMax: t.toISOString(), timeZone: TZ, items: [{ id }] },
  );
  const cal = data.calendars?.[id];
  if (!cal) throw new Error('Google freebusy returned nothing for the configured calendar — is it shared with the service account?');
  if (cal.errors && cal.errors.length) throw new Error(`Google freebusy reported errors: ${JSON.stringify(cal.errors).slice(0, 300)}`);
  const blocks = (cal.busy ?? []).map(b => ({ start: new Date(b.start), end: new Date(b.end) }));
  busyCache.set(key, { at: Date.now(), blocks });
  return blocks;
}

/** Test hook: forget cached free/busy answers. */
export function clearBusyCache() { busyCache.clear(); }

// ── events ────────────────────────────────────────────────────────────
export type CallForEvent = { id?: string; scheduledAt: Date | string; durationMin?: number | null; direction?: string | null; phone?: string | null; agendaLabels?: string[] };
export type InquiryForEvent = { id: string; courseName: string; contactName: string; phone?: string | null; email?: string | null };

function report(where: string, err: unknown) {
  console.error(`[google-calendar] ${where}:`, err);
  try { Sentry.captureException(err, { tags: { where: `google-calendar.${where}` } }); } catch { /* Sentry not wired in this context */ }
}

/** 30-minute event "Call — <course>"; returns the event id, or null on failure (never throws). */
export async function createCallEvent(call: CallForEvent, inquiry: InquiryForEvent): Promise<string | null> {
  try {
    const start = new Date(call.scheduledAt);
    const end = new Date(start.getTime() + (call.durationMin || 30) * 60_000);
    const base = process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
    const lines = [
      `${inquiry.contactName}${inquiry.phone || call.phone ? ` · ${inquiry.phone || call.phone}` : ''}${inquiry.email ? ` · ${inquiry.email}` : ''}`,
      call.direction === 'they_call' ? 'They call us.' : 'We call them.',
      ...(call.agendaLabels && call.agendaLabels.length ? ['', 'Agenda:', ...call.agendaLabels.map(l => `• ${l}`)] : []),
      '',
      `${base}/admin/inquiries/${inquiry.id}`,
    ];
    const ev = await gapi<{ id?: string }>('POST', `/calendars/${encodeURIComponent(calendarId())}/events`, 'events.insert', {
      summary: `Call — ${inquiry.courseName}`,
      description: lines.join('\n'),
      start: { dateTime: start.toISOString(), timeZone: TZ },
      end: { dateTime: end.toISOString(), timeZone: TZ },
      reminders: { useDefault: true },
    });
    busyCache.clear();
    return ev.id ?? null;
  } catch (err) { report('createCallEvent', err); return null; }
}

export async function moveCallEvent(eventId: string, newStart: Date, durationMin = 30): Promise<boolean> {
  try {
    const end = new Date(newStart.getTime() + durationMin * 60_000);
    await gapi('PATCH', `/calendars/${encodeURIComponent(calendarId())}/events/${encodeURIComponent(eventId)}`, 'events.patch', {
      start: { dateTime: newStart.toISOString(), timeZone: TZ },
      end: { dateTime: end.toISOString(), timeZone: TZ },
    });
    busyCache.clear();
    return true;
  } catch (err) { report('moveCallEvent', err); return false; }
}

export async function deleteCallEvent(eventId: string): Promise<boolean> {
  try {
    await gapi('DELETE', `/calendars/${encodeURIComponent(calendarId())}/events/${encodeURIComponent(eventId)}`, 'events.delete');
    busyCache.clear();
    return true;
  } catch (err) { report('deleteCallEvent', err); return false; }
}
