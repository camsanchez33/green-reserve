-- Company docs (Cam 2026-11-17): Cam's own labels, a row per document, and its versions (Replace keeps
-- the old file). Additive: new tables only. Files already in storage stay as they are and get a row the
-- first time they are relabelled, renamed or replaced; no backfill.
CREATE TABLE "CompanyDocLabel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDocLabel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyDocument" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyDocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "contentType" TEXT NOT NULL DEFAULT '',
    "uploadedById" TEXT NOT NULL DEFAULT '',
    "uploadedByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- The fresh second-factor check on delete: set by an explicit confirm, used up by the delete. Defaulted column.
ALTER TABLE "OwnerSession" ADD COLUMN "stepUpFresh" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "CompanyDocument_label_idx" ON "CompanyDocument"("label");
CREATE UNIQUE INDEX "CompanyDocumentVersion_pathname_key" ON "CompanyDocumentVersion"("pathname");
CREATE UNIQUE INDEX "CompanyDocumentVersion_documentId_version_key" ON "CompanyDocumentVersion"("documentId", "version");

ALTER TABLE "CompanyDocumentVersion" ADD CONSTRAINT "CompanyDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CompanyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
