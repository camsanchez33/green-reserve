-- PERS-1: optional note from the course on the confirmation page and email. Additive, nullable.
ALTER TABLE "Course" ADD COLUMN "confirmationNote" TEXT;
