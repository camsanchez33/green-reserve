-- LEDGER-1: dues are claimed, then charged outside a transaction.
ALTER TABLE "CourseMembership" ADD COLUMN     "duesChargeStartedAt" TIMESTAMP(3);
