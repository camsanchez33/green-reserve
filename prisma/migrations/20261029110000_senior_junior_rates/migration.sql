-- Cam 2026-10-29: senior and junior prices on the schedule and its tee times, picked at the counter. Additive, nullable.
ALTER TABLE "TeeTimeSchedule" ADD COLUMN "seniorRateWeekdayCents" INTEGER;
ALTER TABLE "TeeTimeSchedule" ADD COLUMN "seniorRateWeekendCents" INTEGER;
ALTER TABLE "TeeTimeSchedule" ADD COLUMN "juniorRateWeekdayCents" INTEGER;
ALTER TABLE "TeeTimeSchedule" ADD COLUMN "juniorRateWeekendCents" INTEGER;
ALTER TABLE "TeeTime" ADD COLUMN "seniorRateCents" INTEGER;
ALTER TABLE "TeeTime" ADD COLUMN "juniorRateCents" INTEGER;
