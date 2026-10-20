// W2-7 part B: how a pro-shop item is taxed, and the states a course can hold
// a sales-tax permit in. Pure and browser-safe — the Stripe side is lib/sales-tax.ts.

/** How an item is taxed → Stripe product tax code (docs.stripe.com/tax/tax-codes). */
export const TAX_CATEGORIES = {
  general:  { label: 'General merchandise', hint: 'Balls, gloves, tees, accessories, equipment', code: 'txcd_99999999' },
  clothing: { label: 'Clothing and hats', hint: 'Shirts, hats, outerwear, shoes', code: 'txcd_30011000' },
  snack:    { label: 'Snacks', hint: 'Chips, bars, packaged snacks', code: 'txcd_40070005' },
  candy:    { label: 'Candy', hint: 'Candy and gum', code: 'txcd_40100001' },
  soda:     { label: 'Soft drinks', hint: 'Soda, sports drinks with no juice', code: 'txcd_41040002' },
  water:    { label: 'Bottled water', hint: 'Plain bottled water', code: 'txcd_41030001' },
  food:     { label: 'Food made here', hint: 'Sandwiches, hot dogs, anything prepared to eat now', code: 'txcd_40060003' },
  none:     { label: 'Not taxed', hint: 'Gift cards, items your state exempts', code: 'txcd_00000000' },
} as const;
export type TaxCategory = keyof typeof TAX_CATEGORIES;
// Own keys only — `'toString' in TAX_CATEGORIES` would be true.
export const isTaxCategory = (v: unknown): v is TaxCategory => typeof v === 'string' && Object.prototype.hasOwnProperty.call(TAX_CATEGORIES, v);

export const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'] as const;

