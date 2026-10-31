-- AlterTable
ALTER TABLE "CourseMembership" ADD COLUMN     "accountCardConsentAt" TIMESTAMP(3),
ADD COLUMN     "accountCardTerms" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "accountCustomerId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "accountPaymentMethodId" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "MemberStatement" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "payToken" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMP(3),
    "chargeStartedAt" TIMESTAMP(3),
    "autoChargeAt" TIMESTAMP(3),
    "autoFailedAt" TIMESTAMP(3),
    "autoRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberStatement_payToken_key" ON "MemberStatement"("payToken");

-- CreateIndex
CREATE INDEX "MemberStatement_courseId_status_idx" ON "MemberStatement"("courseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MemberStatement_membershipId_period_key" ON "MemberStatement"("membershipId", "period");

-- AddForeignKey
ALTER TABLE "MemberCharge" ADD CONSTRAINT "MemberCharge_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "MemberStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberStatement" ADD CONSTRAINT "MemberStatement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberStatement" ADD CONSTRAINT "MemberStatement_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CourseMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

