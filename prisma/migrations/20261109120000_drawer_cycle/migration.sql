-- DRAWER-1: the close-out leaves a float and a deposit; the next opening sees what was left (additive).
ALTER TABLE "RegisterOpen" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'open';
ALTER TABLE "RegisterOpen" ADD COLUMN "leftCents" INTEGER;
ALTER TABLE "RegisterClose" ADD COLUMN "leaveInCents" INTEGER;
ALTER TABLE "RegisterClose" ADD COLUMN "depositCents" INTEGER;
