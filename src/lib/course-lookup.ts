// @brain outreach
// Inquiries data (Cam 2026-11-17): "Add a course" search over PUBLIC listings — OpenStreetMap's Nominatim.
// Only public facts about the course as a business (name, address, town, website, its public phone,
// location). No people, no personal data.
//
// Nominatim's usage policy (operations.osmfoundation.org/policies/nominatim): at most 1 request a second
// across the whole app, an identifying User-Agent, no bulk or automatic lookups, results attributed to
// "© OpenStreetMap contributors". So: one search per click (never per keystroke — the page sends on
// submit), a platform-wide 1/second limit plus a per-admin cap, and a generic User-Agent that names the
// app, not a person.
import { rateLimit } from './rate-limit';
import { cleanWebsite, cleanPhone, type CourseFacts } from './outreach';

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'GreenReserve-Admin/1.0 (+https://greenreserve.app)';

export type LookupResult = CourseFacts & { courseName: string; city: string; state: string; display: string; osmRef: string };

type NominatimHit = {
  osm_type?: string; osm_id?: number; lat?: string; lon?: string; category?: string; type?: string; name?: string; display_name?: string;
  address?: Record<string, string>; extratags?: Record<string, string> | null;
};

const isGolf = (h: NominatimHit) =>
  (h.category === 'leisure' && h.type === 'golf_course') || !!h.extratags?.golf || /\bgolf\b|\blinks\b|country club/i.test(h.name ?? '');

/** One Nominatim hit → the facts the add-course form fills. Exported for tests. */
export function toResult(h: NominatimHit): LookupResult | null {
  const name = (h.name ?? '').trim();
  if (!name || !h.osm_type || !h.osm_id || !['node', 'way', 'relation'].includes(h.osm_type)) return null;
  const a = h.address ?? {};
  const x = h.extratags ?? {};
  const city = a.city || a.town || a.village || a.hamlet || a.municipality || a.suburb || '';
  const iso = a['ISO3166-2-lvl4'] ?? '';
  const state = /^US-[A-Z]{2}$/.test(iso) ? iso.slice(3) : (a.state ?? '');
  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  const lat = Number(h.lat), lon = Number(h.lon);
  const holes = Number(x.holes ?? x['golf:holes']);
  return {
    courseName: name.slice(0, 200),
    city: city.slice(0, 100), state: state.slice(0, 40),
    address: street.slice(0, 300), zipCode: (a.postcode ?? '').slice(0, 20),
    website: cleanWebsite(x.website || x['contact:website'] || x.url || ''),
    coursePhone: cleanPhone(x.phone || x['contact:phone'] || '') || null,
    holes: Number.isInteger(holes) && holes > 0 && holes <= 72 ? holes : null,
    latitude: Number.isFinite(lat) ? lat : null, longitude: Number.isFinite(lon) ? lon : null,
    osmRef: `osm:${h.osm_type}/${h.osm_id}`,
    display: (h.display_name ?? '').slice(0, 300),
  };
}

export type LookupOutcome = { ok: true; results: LookupResult[]; attribution: string } | { ok: false; status: number; error: string };

export async function lookupCourses(query: string, near: string, adminId: string, fetchImpl: typeof fetch = fetch): Promise<LookupOutcome> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 120);
  const n = near.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (q.length < 3) return { ok: false, status: 400, error: 'Type at least three letters of the course name.' };
  if (!(await rateLimit('osm-lookup:global', 1, 1))) return { ok: false, status: 429, error: 'Searching too fast — try again in a second.' };
  if (!(await rateLimit(`osm-lookup:admin:${adminId}`, 30, 600))) return { ok: false, status: 429, error: 'That is a lot of searches — wait a few minutes, or add the course by hand.' };
  const text = [q, n].filter(Boolean).join(', ');
  const url = `${ENDPOINT}?${new URLSearchParams({ q: /golf|links|club/i.test(text) ? text : `${text} golf`, format: 'jsonv2', addressdetails: '1', extratags: '1', limit: '10', countrycodes: 'us' })}`;
  let hits: NominatimHit[];
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (res.status === 429 || res.status === 403) return { ok: false, status: 503, error: 'The public map search is busy — try again in a minute, or add the course by hand.' };
    if (!res.ok) return { ok: false, status: 502, error: `The public map search answered ${res.status} — add the course by hand.` };
    hits = await res.json() as NominatimHit[];
    if (!Array.isArray(hits)) hits = [];
  } catch (err) {
    console.error('[course-lookup] Nominatim failed:', err instanceof Error ? err.message : err);
    return { ok: false, status: 502, error: 'The public map search did not answer — add the course by hand.' };
  }
  const seen = new Set<string>();
  const results = hits.filter(isGolf).map(toResult).filter((r): r is LookupResult => {
    if (!r) return false;
    const key = `${r.courseName.toLowerCase()}|${r.city.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 8);
  return { ok: true, results, attribution: OSM_ATTRIBUTION };
}
