-- Cam 2026-10-29: who gets a member rate at the counter (the member shows their membership by default). Additive, with a default.
ALTER TABLE "Course" ADD COLUMN "counterMemberRate" TEXT NOT NULL DEFAULT 'member';
