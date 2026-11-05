-- AUDIT-1 (security audit 2026-11-05, S1; Cam: "it's a test course so anything can
-- be changed"): one TeeTime row per slot. Two tee-sheet generations racing (two
-- schedule saves, a save over the nightly cron) could both insert the same time,
-- doubling that tee's capacity. The unique index below makes that impossible.

-- 1. Fold any duplicates already there into one row per slot: the row with the most
--    players booked (then the oldest) keeps the slot; bookings and alerts on the
--    others move to it, its booked count becomes the sum, the others are deleted.
CREATE TEMP TABLE "_tt_dupes" ON COMMIT DROP AS
SELECT id,
       first_value(id) OVER w AS keeper,
       row_number()    OVER w AS rn
FROM "TeeTime"
WINDOW w AS (PARTITION BY "courseId", "date", "time", COALESCE("productId", '')
             ORDER BY "playersBooked" DESC, "createdAt" ASC, id ASC);

DELETE FROM "_tt_dupes" WHERE keeper IN (SELECT keeper FROM "_tt_dupes" GROUP BY keeper HAVING count(*) = 1);

UPDATE "TeeTime" k SET "playersBooked" = s.total
FROM (SELECT d.keeper, sum(t."playersBooked") AS total FROM "_tt_dupes" d JOIN "TeeTime" t ON t.id = d.id GROUP BY d.keeper) s
WHERE k.id = s.keeper;

UPDATE "Booking" b SET "teeTimeId" = d.keeper FROM "_tt_dupes" d WHERE d.rn > 1 AND b."teeTimeId" = d.id;
UPDATE "TeeTimeAlert" a SET "teeTimeId" = d.keeper FROM "_tt_dupes" d WHERE d.rn > 1 AND a."teeTimeId" = d.id;
DELETE FROM "TeeTime" t USING "_tt_dupes" d WHERE d.rn > 1 AND t.id = d.id;

-- 2. From now on the database refuses a second row for the same slot. (An expression
--    index — COALESCE so slots with no round are covered too — can't be written in
--    schema.prisma; tee-sheet-engine and the manual add route handle the refusal.)
CREATE UNIQUE INDEX "TeeTime_slot_key" ON "TeeTime"("courseId", "date", "time", COALESCE("productId", ''));
