-- CART-2 (Cam 2026-11-06): a course charges carts per player (as now) or per cart. Additive only.
ALTER TABLE "Course" ADD COLUMN "cartPricing" TEXT NOT NULL DEFAULT 'per_player';
ALTER TABLE "Booking" ADD COLUMN "cartUnitCents" INTEGER;
ALTER TABLE "Booking" ADD COLUMN "cartRiders" INTEGER;
