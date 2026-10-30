-- LEDGER-2: dues and event payments taken in cash count in the close-out.
ALTER TABLE "RegisterClose" ADD COLUMN     "otherCashCents" INTEGER NOT NULL DEFAULT 0;
