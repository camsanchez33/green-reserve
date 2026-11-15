-- Low-stock email (Cam 2026-11-15, via Build): when a counted item's stock drops to its reorder point, the course's
-- owner gets one email; another only after it has gone back above and dropped again. Additive.
--   * "lowNoticeAt" is when that email was claimed for the current drop (null = none sent since it was last above).
--   * The trigger re-arms it: any update that leaves the row not low (restocked, a put-back, a count or reorder
--     point edited, counting turned off) clears it, whichever code path wrote the row. The claim itself only ever
--     sets it on a low row, so the trigger never undoes a claim.
ALTER TABLE "ShopItem" ADD COLUMN "lowNoticeAt" TIMESTAMP(3);

CREATE FUNCTION "shop_item_low_notice_rearm"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."lowNoticeAt" IS NOT NULL
     AND (NEW."stockCount" IS NULL OR NEW."reorderAt" IS NULL OR NEW."stockCount" > NEW."reorderAt") THEN
    NEW."lowNoticeAt" := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ShopItem_low_notice_rearm" BEFORE UPDATE ON "ShopItem"
  FOR EACH ROW EXECUTE FUNCTION "shop_item_low_notice_rearm"();

-- One-time backfill (Cam 2026-11-15, via Build: "skip items already low"): an item already at or below its number
-- when this ships counts as already reminded, so the first sale after deploy emails nobody about old lows. It emails
-- once it is restocked above the number and drops again.
UPDATE "ShopItem" SET "lowNoticeAt" = (NOW() AT TIME ZONE 'UTC')
  WHERE "stockCount" IS NOT NULL AND "reorderAt" IS NOT NULL AND "stockCount" <= "reorderAt";
