// Settings rework (Cam 2026-10-19: Facilities was "the worst thing I have ever
// seen"). What the course has, in the words golfers read — one source for the
// Settings preview and the booking page. Reads the Course row's own columns
// (rates in cents); nothing here is charged.

export type FacilityFields = {
  hasDrivingRange?: boolean; drivingRangeType?: string; rangeBallsFree?: boolean;
  hasPuttingGreen?: boolean; hasShortGameArea?: boolean;
  hasProShop?: boolean; proShopPhone?: string; hasLessons?: boolean;
  hasClubRental?: boolean; clubRentalRateCents?: number;
  hasPushCartRental?: boolean; pushCartRateCents?: number;
  hasCaddies?: boolean; caddieType?: string; caddieLooperRateCents?: number; caddieForeRateCents?: number; caddieNote?: string;
  hasBagStorage?: boolean; hasLockerRoom?: boolean; hasGpsCarts?: boolean;
  restaurantType?: string; hasCartGirl?: boolean;
  hasTournaments?: boolean; tournamentFrequency?: string;
  amenities?: string[];
};

export const RANGE_TYPES: Record<string, string> = { grass: 'grass tees', mat: 'mats', both: 'grass tees and mats', toptracer: 'Toptracer bays' };
export const FOOD_TYPES: Record<string, string> = { none: 'No food or drink', snack_bar: 'Snack bar', bar: 'Bar', full: 'Restaurant', beverage_cart: 'Beverage cart only' };
export const TOURNAMENT_FREQ: Record<string, string> = { weekly: 'weekly', monthly: 'monthly', seasonally: 'a few times a season', rarely: 'now and then' };

const usd = (c?: number) => (c && c > 0 ? `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}` : '');
const withDetail = (name: string, ...detail: (string | false | undefined)[]) => {
  const d = detail.filter(Boolean).join(', ');
  return d ? `${name} (${d})` : name;
};

/** One plain line per thing the course has, practice first, extras last. */
export function facilityLines(f: FacilityFields): string[] {
  const out: string[] = [];
  if (f.hasDrivingRange) out.push(withDetail('Driving range', RANGE_TYPES[f.drivingRangeType ?? ''], f.rangeBallsFree !== false && 'balls included'));
  if (f.hasPuttingGreen) out.push('Putting green');
  if (f.hasShortGameArea) out.push('Chipping and short-game area');
  if (f.hasProShop) out.push(withDetail('Pro shop', f.proShopPhone?.trim()));
  if (f.hasLessons) out.push('Lessons');
  if (f.hasClubRental) out.push(withDetail('Club rental', usd(f.clubRentalRateCents)));
  if (f.hasPushCartRental) out.push(withDetail('Push carts', usd(f.pushCartRateCents)));
  if (f.hasCaddies) {
    // Unset type reads as "carry the bag", the same default Settings shows.
    const type = f.caddieType || 'looper';
    const looper = type !== 'fore_caddie' && usd(f.caddieLooperRateCents);
    const fore = type !== 'looper' && usd(f.caddieForeRateCents);
    out.push(withDetail('Caddies', looper && `${looper} a bag`, fore && `fore caddie ${fore}`, f.caddieNote?.trim()));
  }
  if (f.hasGpsCarts) out.push('GPS in the carts');
  if (f.hasBagStorage) out.push('Bag storage');
  if (f.hasLockerRoom) out.push('Locker room');
  if (f.restaurantType && f.restaurantType !== 'none') out.push(FOOD_TYPES[f.restaurantType] ?? f.restaurantType);
  if (f.hasCartGirl && f.restaurantType !== 'beverage_cart') out.push('Beverage cart on the course');
  if (f.hasTournaments) out.push(withDetail('Tournaments', TOURNAMENT_FREQ[f.tournamentFrequency ?? '']));
  for (const a of f.amenities ?? []) if (String(a).trim()) out.push(String(a).trim());
  return out;
}
