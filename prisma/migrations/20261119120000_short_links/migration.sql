-- Emails and texts redo (Cam 2026-11-19): short links on our own domain for texts —
-- greenreserve.app/b|p|r|a/<code> → the existing long link. Additive: a new table only.
CREATE TABLE "ShortLink" (
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "courseId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortLink_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "ShortLink_kind_target_idx" ON "ShortLink"("kind", "target");
