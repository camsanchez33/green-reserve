// HOME-W (Cam 2026-11-05, "weather bar up top with the next tee times"): the hourly forecast at the
// course. The fetches run on the server only; hourKey/parseHourly are pure and client-safe. The course's street address goes to the US Census geocoder (free, no key) for its
// coordinates, then to weather.gov (the National Weather Service — free, no key, fine for commercial use;
// Open-Meteo's free tier is non-commercial only, so it's not used). US courses only.
// Every step is cached by Next's fetch cache: coordinates for 30 days, the forecast URL for a day, the
// forecast for 30 minutes — so a busy Home page costs a few requests an hour, not one per load.
// Never throws: every failure is a { ok: false, reason } the card can say in words.
import { SUPPORT_EMAIL } from './contact';

const UA = `GreenReserve (https://greenreserve.app, ${SUPPORT_EMAIL})`;
const DAY = 86400;

export type WeatherHour = { at: string; tempF: number; summary: string; windMph: number | null; rainPct: number | null };
export type Weather =
  | { ok: true; hours: WeatherHour[] }
  | { ok: false; reason: 'no_address' | 'address_not_found' | 'unavailable' };

async function getJson(url: string, revalidate: number, headers: Record<string, string> = {}): Promise<unknown> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/geo+json, application/json', ...headers }, next: { revalidate }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** "1 Main St, Paramus, NJ 07652" → [lat, lon], or null when the Census has no match. */
export async function geocodeAddress(address: string): Promise<[number, number] | null> {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(address)}`;
  const d = await getJson(url, 30 * DAY) as { result?: { addressMatches?: { coordinates?: { x?: number; y?: number } }[] } };
  const c = d.result?.addressMatches?.[0]?.coordinates;
  return c && typeof c.x === 'number' && typeof c.y === 'number' ? [c.y, c.x] : null;
}

/** weather.gov's hourly periods → our hours. Pure, so the test can pin it. */
export function parseHourly(raw: unknown, max = 24): WeatherHour[] {
  const periods = (raw as { properties?: { periods?: unknown[] } })?.properties?.periods;
  if (!Array.isArray(periods)) return [];
  const out: WeatherHour[] = [];
  for (const p of periods.slice(0, max) as Record<string, unknown>[]) {
    if (typeof p.startTime !== 'string' || typeof p.temperature !== 'number') continue;
    const tempF = p.temperatureUnit === 'C' ? Math.round(p.temperature * 9 / 5 + 32) : Math.round(p.temperature);
    const wind = typeof p.windSpeed === 'string' ? p.windSpeed.match(/(\d+)(?!.*\d)/) : null;
    const rain = (p.probabilityOfPrecipitation as { value?: unknown } | undefined)?.value;
    out.push({ at: p.startTime, tempF, summary: typeof p.shortForecast === 'string' ? p.shortForecast : '', windMph: wind ? Number(wind[1]) : null, rainPct: typeof rain === 'number' ? rain : null });
  }
  return out;
}

/** "2026-11-05T16:00:00-05:00" → "2026-11-05 16" — the forecast's own local hour, which is the course's. */
export const hourKey = (at: string) => `${at.slice(0, 10)} ${at.slice(11, 13)}`;

export async function courseWeather(c: { address?: string | null; city?: string | null; state?: string | null; zipCode?: string | null }): Promise<Weather> {
  const street = (c.address ?? '').trim();
  if (!street || !(c.city ?? '').trim() || !(c.state ?? '').trim()) return { ok: false, reason: 'no_address' };
  try {
    const at = await geocodeAddress(`${street}, ${c.city}, ${c.state} ${c.zipCode ?? ''}`.trim());
    if (!at) return { ok: false, reason: 'address_not_found' };
    const point = await getJson(`https://api.weather.gov/points/${at[0].toFixed(4)},${at[1].toFixed(4)}`, DAY) as { properties?: { forecastHourly?: unknown } };
    const hourly = point.properties?.forecastHourly;
    if (typeof hourly !== 'string' || !hourly.startsWith('https://api.weather.gov/')) return { ok: false, reason: 'unavailable' };
    const hours = parseHourly(await getJson(hourly, 1800));
    return hours.length ? { ok: true, hours } : { ok: false, reason: 'unavailable' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
