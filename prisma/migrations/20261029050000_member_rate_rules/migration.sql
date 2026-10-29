-- Cam 2026-10-29: member rates for guests (per tier) and how long after expiry rates last (per course). Additive, with defaults.
ALTER TABLE "MembershipTier" ADD COLUMN "guestsPayMemberRate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" ADD COLUMN "memberGraceDays" INTEGER NOT NULL DEFAULT 0;
