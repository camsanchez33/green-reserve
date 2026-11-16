-- SHOP-FEE-1 (Cam 2026-11-16): GreenReserve's 1% service fee on a walk-up sale paid by card. Additive, defaulted; no backfill.
ALTER TABLE "ShopSale" ADD COLUMN "serviceFeeCents" INTEGER NOT NULL DEFAULT 0;
