-- AlterTable
ALTER TABLE "MembershipTier" ADD COLUMN     "accountLimitCents" INTEGER,
ADD COLUMN     "accountOn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accountSettle" TEXT NOT NULL DEFAULT 'link';

-- CreateTable
CREATE TABLE "MemberCharge" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "bookingId" TEXT,
    "shopSaleId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statementId" TEXT,

    CONSTRAINT "MemberCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberCharge_bookingId_key" ON "MemberCharge"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberCharge_shopSaleId_key" ON "MemberCharge"("shopSaleId");

-- CreateIndex
CREATE INDEX "MemberCharge_membershipId_createdAt_idx" ON "MemberCharge"("membershipId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberCharge_courseId_createdAt_idx" ON "MemberCharge"("courseId", "createdAt");

-- AddForeignKey
ALTER TABLE "MemberCharge" ADD CONSTRAINT "MemberCharge_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCharge" ADD CONSTRAINT "MemberCharge_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CourseMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

