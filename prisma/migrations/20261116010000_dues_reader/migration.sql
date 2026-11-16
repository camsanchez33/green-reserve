-- Memberships item 1: the card reader a membership's dues are on (additive, defaulted).
ALTER TABLE "CourseMembership" ADD COLUMN "duesReaderId" TEXT NOT NULL DEFAULT '';
