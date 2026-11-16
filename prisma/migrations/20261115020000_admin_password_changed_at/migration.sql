-- My profile (Cam 2026-11-15, via Build): when an admin's or the owner's password in force was set, shown on
-- /admin/profile. Additive and nullable; no backfill (null = set before this column existed, the row is hidden).
ALTER TABLE "AdminUser" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
