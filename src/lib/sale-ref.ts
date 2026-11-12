// PRO-SHOP sale numbers (Cam 2026-11-12, via Build): ONE way to print a sale's reference, for the receipt page, the
// staff receipt and the emailed receipt — "#18" for a numbered sale, else the last 8 of its id (sales from before
// numbers). Pure and client-safe.
export const saleRef = (id: string, number: number | null | undefined) => (number != null ? `#${number}` : id.slice(-8).toUpperCase());
