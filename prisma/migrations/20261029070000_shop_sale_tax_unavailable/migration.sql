-- Cam 2026-10-29: a cash sale taken with no tax because Stripe Tax couldn't be reached. Additive, with a default.
ALTER TABLE "ShopSale" ADD COLUMN "taxUnavailable" BOOLEAN NOT NULL DEFAULT false;
