// POS-6 (Cam 2026-11-09, round packs: "get rid of that … something different that will be worked out in the
// membership tab"): round packs are TURNED OFF — no pack is sold (counter or online) and no booking uses one.
// The pack code stays so a pack already held can still be returned, voided or given back on a cancel; unlimited
// golf is a membership tier with a $0 green fee. Its own file so shop-sales can read it without importing
// round-packs (which imports shop-sales).
export const ROUND_PACKS_ON = false;
export const PACKS_OFF = 'Round packs are turned off.';
