-- RANGE-1: one bucket list (ShopItem.rangeBalls), the online switch, and each booking's buckets as booked. Additive only.
ALTER TABLE "Course" ADD COLUMN "sellRangeOnline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Booking" ADD COLUMN "rangeBuckets" JSONB;
ALTER TABLE "ShopItem" ADD COLUMN "rangeBalls" INTEGER;
