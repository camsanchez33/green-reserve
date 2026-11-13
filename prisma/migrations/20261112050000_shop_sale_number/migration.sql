-- PRO-SHOP sale numbers (Cam 2026-11-12, via Build): each course numbers its sales #1, #2, … Additive, no
-- backfill: existing sales keep a null number. The same pattern as CourseNumberCounter, one row per course:
--   * no skips: the counter is an ordinary row, so a sale that rolls back (a refused account charge) gives its
--     number back;
--   * no reuse: deleting a sale never lowers the counter;
--   * no races: concurrent sales at one course queue on its counter row (INSERT … ON CONFLICT DO UPDATE);
--     createSale runs at the default isolation level, so the queue never becomes a serialization failure.
-- The launch wipe empties the counter with the sales; a test-course reset deletes that course's row.
CREATE TABLE "ShopSaleCounter" (
    "courseId" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShopSaleCounter_pkey" PRIMARY KEY ("courseId")
);
ALTER TABLE "ShopSale" ADD COLUMN "number" INTEGER;
CREATE UNIQUE INDEX "ShopSale_courseId_number_key" ON "ShopSale"("courseId", "number");

CREATE FUNCTION "shop_sale_number_assign"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "ShopSaleCounter" ("courseId", "last") VALUES (NEW."courseId", 1)
    ON CONFLICT ("courseId") DO UPDATE SET "last" = "ShopSaleCounter"."last" + 1
    RETURNING "last" INTO NEW."number";
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ShopSale_number_assign" BEFORE INSERT ON "ShopSale"
  FOR EACH ROW EXECUTE FUNCTION "shop_sale_number_assign"();
