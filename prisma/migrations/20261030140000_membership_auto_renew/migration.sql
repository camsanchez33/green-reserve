-- AlterTable
ALTER TABLE "CourseMembership" ADD COLUMN     "autoRenew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoRenewCancelledAt" TIMESTAMP(3),
ADD COLUMN     "autoRenewConsentAt" TIMESTAMP(3),
ADD COLUMN     "autoRenewFailedAt" TIMESTAMP(3),
ADD COLUMN     "autoRenewRemindedCents" INTEGER,
ADD COLUMN     "autoRenewRemindedFor" TIMESTAMP(3),
ADD COLUMN     "autoRenewRetryAt" TIMESTAMP(3),
ADD COLUMN     "autoRenewTerms" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "savedCustomerId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "savedPaymentMethodId" TEXT NOT NULL DEFAULT '';
-- AlterTable
ALTER TABLE "MembershipTier" ADD COLUMN     "autoRenew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoRenewRetry" BOOLEAN NOT NULL DEFAULT true;
