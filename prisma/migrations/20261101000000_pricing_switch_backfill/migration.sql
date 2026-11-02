-- Pricing switches (Cam 2026-11-01: "Off stops the rates", with "Backfill + auto-on").
-- From this release Settings → Members / Residents decide whether those prices are
-- charged at all (src/lib/pricing-switch.ts). Both switches default to off, and until
-- now they didn't stop anything — so a course that set a member or resident price but
-- never flipped the switch would see its members and residents suddenly pay the public
-- price. This switches ON every course that already has such a price, so nobody's price
-- changes on the day this ships. It only ever turns a switch on; no switch is turned off,
-- no price is changed, no other column is touched. Re-running it is a no-op.

-- Members: an active membership with its own price (flat or % off), or an active
-- schedule with a member rate (what a membership without its own price pays).
UPDATE "Course" c
SET "hasMemberPricing" = true
WHERE c."hasMemberPricing" = false
  AND (
    EXISTS (
      SELECT 1 FROM "MembershipTier" t
      WHERE t."courseId" = c."id" AND t."active" = true
        AND (t."greenFeeWeekdayCents" IS NOT NULL OR t."greenFeeWeekendCents" IS NOT NULL
          OR t."cartFeeWeekdayCents" IS NOT NULL OR t."cartFeeWeekendCents" IS NOT NULL
          OR t."discountPct" IS NOT NULL)
    )
    OR EXISTS (
      SELECT 1 FROM "TeeTimeSchedule" s
      WHERE s."courseId" = c."id" AND s."active" = true
        AND (s."memberRateWeekdayCents" IS NOT NULL OR s."memberRateWeekendCents" IS NOT NULL)
    )
  );

-- Residents: an active schedule with a resident rate.
UPDATE "Course" c
SET "hasResidentPricing" = true
WHERE c."hasResidentPricing" = false
  AND EXISTS (
    SELECT 1 FROM "TeeTimeSchedule" s
    WHERE s."courseId" = c."id" AND s."active" = true
      AND (s."residentRateWeekdayCents" IS NOT NULL OR s."residentRateWeekendCents" IS NOT NULL)
  );
