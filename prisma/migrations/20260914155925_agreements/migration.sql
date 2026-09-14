-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "legalName" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "AgreementAcceptance" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerTitle" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "authorityAttested" BOOLEAN NOT NULL DEFAULT false,
    "marketingOptOut" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "pdfUrl" TEXT,
    "legacy" BOOLEAN NOT NULL DEFAULT false,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgreementAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementVersion" (
    "id" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "reacceptBy" TIMESTAMP(3),
    "noticeSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgreementVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgreementAcceptance_courseId_document_acceptedAt_idx" ON "AgreementAcceptance"("courseId", "document", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgreementVersion_document_version_key" ON "AgreementVersion"("document", "version");

-- AddForeignKey
ALTER TABLE "AgreementAcceptance" ADD CONSTRAINT "AgreementAcceptance_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

