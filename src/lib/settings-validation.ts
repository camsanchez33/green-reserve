// SD-1. Server-side validation for the operator settings PATCH. Before this the
// route copied every allow-listed key straight from the body into the row —
// `holes: -3`, `maxPlayers: 0`, `cancellationHours: 99999`, a 40KB description
// or a `javascript:` gift-card URL all saved fine. The dashboard form checks
// some of it; the API is the boundary, and staff logins could reach it raw.
//
// Every rule here is intentionally generous — it rejects nonsense, not edge
// cases a real course might have. Money fields are not handled here: they go
// through course-wire's cents conversion, which already coerces.

export type SettingsValidation =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

const INT_RANGES: Record<string, [number, number]> = {
  holes: [1, 45],
  par: [20, 120],
  yardage: [0, 12000],
  slope: [0, 155],
  minPlayers: [1, 8],
  maxPlayers: [1, 8],
  cancellationHours: [0, 24 * 14],
  checkInWindowHours: [0, 48],
  publicAdvanceDays: [1, 365],
  memberAdvanceDays: [1, 365],
  establishedYear: [1700, new Date().getFullYear()],
};
const FLOAT_RANGES: Record<string, [number, number]> = {
  courseRating: [0, 90],
};
const STRING_MAX: Record<string, number> = {
  name: 120, phone: 40, proShopPhone: 40, website: 300, giftCardUrl: 500,
  address: 200, city: 100, state: 40, zipCode: 20,
  description: 5000, walkingNote: 500, rainCheckPolicy: 1000, dresscode: 1000,
  residentCounty: 100, residentState: 40, drivingRangeType: 60, restaurantType: 60,
  tournamentFrequency: 60, caddieType: 60, caddieNote: 500, amenities: 2000,
};
const URL_FIELDS = new Set(['website', 'giftCardUrl']);
const ENUMS: Record<string, string[]> = {
  type: ['public', 'private', 'semi-private', 'municipal', 'resort'],
  walkingAllowed: ['always', 'weekdays', 'after12', 'never'],
};
const BOOLEANS = new Set([
  'hasMemberPricing', 'hasResidentPricing', 'residentProofRequired', 'cartRequired',
  'hasDrivingRange', 'rangeBallsFree', 'hasPuttingGreen', 'hasShortGameArea', 'hasProShop',
  'hasCartGirl', 'hasLessons', 'hasClubRental', 'hasPushCartRental', 'hasBagStorage',
  'hasLockerRoom', 'hasGpsCarts', 'hasTournaments', 'hasCaddies',
]);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** A URL a golfer may be sent to: http(s) only, or blank. Bare domains get https://. */
export function normalizeHttpUrl(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // A host has to look like one — the URL parser is lenient about junk.
    if (!/^[a-z0-9.-]+$/i.test(u.hostname) || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch { return null; }
}

export function validateSettingsPatch(body: Record<string, unknown>, allowed: string[]): SettingsValidation {
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in body)) continue;
    const v = body[key];

    if (key in INT_RANGES) {
      if (v === null || v === '') { if (key === 'establishedYear') { data[key] = null; continue; } return { ok: false, error: `${key} is required.` }; }
      const n = Number(v);
      const [lo, hi] = INT_RANGES[key];
      if (!Number.isInteger(n) || n < lo || n > hi) return { ok: false, error: `${key} must be a whole number between ${lo} and ${hi}.` };
      data[key] = n; continue;
    }
    if (key in FLOAT_RANGES) {
      const n = Number(v);
      const [lo, hi] = FLOAT_RANGES[key];
      if (!Number.isFinite(n) || n < lo || n > hi) return { ok: false, error: `${key} must be a number between ${lo} and ${hi}.` };
      data[key] = n; continue;
    }
    if (BOOLEANS.has(key)) { data[key] = v === true || v === 'true'; continue; }
    if (key in ENUMS) {
      const s = String(v ?? '');
      if (!ENUMS[key].includes(s)) return { ok: false, error: `${key} must be one of: ${ENUMS[key].join(', ')}.` };
      data[key] = s; continue;
    }
    if (key === 'brandColor') {
      const s = String(v ?? '').trim();
      if (!HEX_COLOR.test(s)) return { ok: false, error: 'brandColor must be a six-digit hex colour like #24513B.' };
      data[key] = s; continue;
    }
    if (URL_FIELDS.has(key)) {
      const u = normalizeHttpUrl(v);
      if (u === null) return { ok: false, error: `${key} must be a web address starting with http:// or https://.` };
      if (u.length > (STRING_MAX[key] ?? 500)) return { ok: false, error: `${key} is too long.` };
      data[key] = u; continue;
    }
    if (key in STRING_MAX) {
      if (v !== null && typeof v !== 'string' && typeof v !== 'number') return { ok: false, error: `${key} must be text.` };
      const s = String(v ?? '').trim();
      if (s.length > STRING_MAX[key]) return { ok: false, error: `${key} is too long (max ${STRING_MAX[key]} characters).` };
      data[key] = s; continue;
    }
    // Anything allow-listed but not described above passes through unchanged.
    data[key] = v;
  }

  if ('minPlayers' in data && 'maxPlayers' in data && (data.minPlayers as number) > (data.maxPlayers as number)) {
    return { ok: false, error: 'minPlayers cannot be greater than maxPlayers.' };
  }
  if ('name' in data && !(data.name as string)) return { ok: false, error: 'Course name cannot be blank.' };

  return { ok: true, data };
}
