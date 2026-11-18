-- GOLFER-LOGIN-1 (Cam 2026-11-18): log in with a code, the first-log-in terms record, the course's Log in switch and
-- the resident booking window. Additive only: two new tables, a defaulted and a nullable column.
-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "memberLoginOn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "residentAdvanceDays" INTEGER;

-- CreateTable
CREATE TABLE "MemberLoginCode" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberLoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberTermsAgreement" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "MemberTermsAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberLoginCode_courseId_email_idx" ON "MemberLoginCode"("courseId", "email");

-- CreateIndex
CREATE INDEX "MemberLoginCode_createdAt_idx" ON "MemberLoginCode"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MemberTermsAgreement_courseId_email_version_key" ON "MemberTermsAgreement"("courseId", "email", "version");

