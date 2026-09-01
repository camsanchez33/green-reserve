import { centsToDollars, centsToDollarsOr0, dollarsToCents, dollarsToCentsOr0 } from './money';

/**
 * TeeTimeSchedule and TeeTime money: cents at rest, dollars on the wire.
 *
 * MP-3 runs B2c+B2d. Same contract as tier-wire and course-wire — the schedule
 * editor and the tee-sheet UI still send and receive dollars, so no form or
 * client component changed, and none could be silently missed.
 *
 * These two models converted in the SAME migration because tee-sheet-engine
 * copies schedule rates straight onto generated tee times; splitting them would
 * have put a x100 in the middle of that copy.
 */

const SCHEDULE_MONEY = {
  greenFeeWeekday:     'greenFeeWeekdayCents',
  greenFeeWeekend:     'greenFeeWeekendCents',
  memberRateWeekday:   'memberRateWeekdayCents',
  memberRateWeekend:   'memberRateWeekendCents',
  residentRateWeekday: 'residentRateWeekdayCents',
  residentRateWeekend: 'residentRateWeekendCents',
  cartFee:             'cartFeeCents',
} as const;

/** NOT NULL in the schema — these must never become null on the way in. */
const SCHEDULE_REQUIRED = new Set(['greenFeeWeekdayCents', 'greenFeeWeekendCents', 'cartFeeCents']);

export function scheduleToWire<T extends Record<string, unknown>>(row: T) {
  const out: Record<string, unknown> = { ...row };
  for (const [wire, cents] of Object.entries(SCHEDULE_MONEY)) {
    if (cents in out) {
      const v = out[cents] as number | null | undefined;
      out[wire] = SCHEDULE_REQUIRED.has(cents) ? centsToDollarsOr0(v) : centsToDollars(v);
      delete out[cents];
    }
  }
  return out;
}

/** Dollar fields present in a PATCH/POST body -> their *Cents columns. */
export function scheduleMoneyFromWire(body: Record<string, unknown>): Record<string, number | null> {
  const data: Record<string, number | null> = {};
  for (const [wire, cents] of Object.entries(SCHEDULE_MONEY)) {
    if (wire in body) {
      const v = body[wire] as number | string | null | undefined;
      data[cents] = SCHEDULE_REQUIRED.has(cents) ? dollarsToCentsOr0(v) : dollarsToCents(v);
    }
  }
  return data;
}

const TEETIME_MONEY = {
  greenFee:     'greenFeeCents',
  memberRate:   'memberRateCents',
  residentRate: 'residentRateCents',
  cartFee:      'cartFeeCents',
} as const;

const TEETIME_REQUIRED = new Set(['greenFeeCents', 'cartFeeCents']);

export function teeTimeToWire<T extends Record<string, unknown>>(row: T) {
  const out: Record<string, unknown> = { ...row };
  for (const [wire, cents] of Object.entries(TEETIME_MONEY)) {
    if (cents in out) {
      const v = out[cents] as number | null | undefined;
      out[wire] = TEETIME_REQUIRED.has(cents) ? centsToDollarsOr0(v) : centsToDollars(v);
      delete out[cents];
    }
  }
  return out;
}

/**
 * For a CREATE, where greenFeeWeekdayCents / greenFeeWeekendCents / cartFeeCents
 * are NOT NULL. scheduleMoneyFromWire returns `number | null` per key, which
 * cannot satisfy those at type level — this states the required ones concretely
 * so the compiler checks the create rather than trusting a spread.
 */
export function scheduleMoneyForCreate(body: Record<string, unknown>) {
  const n = (v: unknown) => dollarsToCentsOr0(v as number | string | null | undefined);
  const o = (v: unknown) => dollarsToCents(v as number | string | null | undefined);
  return {
    greenFeeWeekdayCents:     n(body.greenFeeWeekday),
    greenFeeWeekendCents:     n(body.greenFeeWeekend),
    cartFeeCents:             n(body.cartFee),
    memberRateWeekdayCents:   o(body.memberRateWeekday),
    memberRateWeekendCents:   o(body.memberRateWeekend),
    residentRateWeekdayCents: o(body.residentRateWeekday),
    residentRateWeekendCents: o(body.residentRateWeekend),
  };
}
