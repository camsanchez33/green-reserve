-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "areasSetAt" TIMESTAMP(3);
