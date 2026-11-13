-- ADMIN-REDO Business analytics: the outreach log (additive; a new table only).
CREATE TABLE "OutreachTouch" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "note" TEXT,
    "adminId" TEXT,
    "adminName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachTouch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutreachTouch_inquiryId_at_idx" ON "OutreachTouch"("inquiryId", "at");
CREATE INDEX "OutreachTouch_at_idx" ON "OutreachTouch"("at");

ALTER TABLE "OutreachTouch" ADD CONSTRAINT "OutreachTouch_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "CourseInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
