-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "twoFactorEnrolledAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "twoFactorSecret" TEXT;

