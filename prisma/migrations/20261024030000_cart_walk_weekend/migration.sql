-- CART-1 (Cam 2026-10-24): weekend cart price and walking per schedule row (additive).
ALTER TABLE "TeeTimeSchedule" ADD COLUMN "cartFeeWeekendCents" INTEGER;
ALTER TABLE "TeeTimeSchedule" ADD COLUMN "walkingWeekend" BOOLEAN;
