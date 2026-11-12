-- BOOKING-REF (Cam 2026-11-12): courses are numbered GR1, GR2, …; bookings within their
-- course, GR1-1, GR1-2, … Additive only, no backfill: existing courses and bookings keep a
-- null number (test data the launch wipe clears). Course numbers never skip; booking numbers
-- may (a rolled-back booking uses its number up — accepted, Cam via Build 2026-11-12).

-- The course number: the highest so far + 1, given by a BEFORE INSERT trigger. Not a sequence
-- (Cam 2026-11-12): a sequence skips numbers after a rollback or a restart, and GR2 followed by
-- GR35 is visible. A transaction-level advisory lock queues concurrent course creations, and
-- each one reads the committed maximum after taking it (a fresh snapshot per statement at READ
-- COMMITTED, which is how every course is created), so numbers never repeat or skip. A course
-- creation that rolls back leaves no gap: its number was never committed. Existing courses
-- stay null (no backfill).
ALTER TABLE "Course" ADD COLUMN "number" INTEGER;
CREATE UNIQUE INDEX "Course_number_key" ON "Course"("number");

CREATE FUNCTION "course_number_assign"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('Course.number'));
  SELECT COALESCE(MAX("number"), 0) + 1 INTO NEW."number" FROM "Course";
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Course_number_assign" BEFORE INSERT ON "Course"
  FOR EACH ROW EXECUTE FUNCTION "course_number_assign"();

-- The booking's number within its course.
ALTER TABLE "Booking" ADD COLUMN "ref" INTEGER;
CREATE UNIQUE INDEX "Booking_courseId_ref_key" ON "Booking"("courseId", "ref");

-- Each course counts its bookings in its OWN sequence, "bookref_<courseId>". A sequence, not a
-- counter column: nextval() writes no row, so the booking claim (Serializable, lib/claim-tee-time)
-- never hits a serialization conflict on it — at one course or across courses. The cost: a
-- booking insert that rolls back (a claim that loses its race) uses up its number.
CREATE FUNCTION "bookref_seq"(course_id TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT quote_ident('bookref_' || left(course_id, 54))
$$;

-- A new course gets its sequence; a deleted one takes it with it.
CREATE FUNCTION "course_bookref_create"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'CREATE SEQUENCE IF NOT EXISTS ' || "bookref_seq"(NEW."id") || ' AS INTEGER';
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Course_bookref_create" AFTER INSERT ON "Course"
  FOR EACH ROW EXECUTE FUNCTION "course_bookref_create"();

CREATE FUNCTION "course_bookref_drop"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'DROP SEQUENCE IF EXISTS ' || "bookref_seq"(OLD."id");
  RETURN OLD;
END;
$$;
CREATE TRIGGER "Course_bookref_drop" AFTER DELETE ON "Course"
  FOR EACH ROW EXECUTE FUNCTION "course_bookref_drop"();

-- Courses that exist today get theirs now (their next booking is number 1; no row is changed).
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT "id" FROM "Course" LOOP
    EXECUTE 'CREATE SEQUENCE IF NOT EXISTS ' || "bookref_seq"(c."id") || ' AS INTEGER';
  END LOOP;
END;
$$;

-- Every booking insert, whatever the path (online, counter, admin, walk-in, a split or
-- late-arrival part, an event), takes its course's next number. A value a caller sends is
-- ignored. If the course has no sequence (it never should), the booking is still made, unnumbered
-- — it shows the old short id — rather than refused. Not in schema.prisma (Prisma does not model
-- triggers or these sequences), so `migrate diff` never sees them.
CREATE FUNCTION "booking_ref_assign"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    NEW."ref" := nextval("bookref_seq"(NEW."courseId"));
  EXCEPTION WHEN undefined_table THEN
    NEW."ref" := NULL;
  END;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Booking_ref_assign" BEFORE INSERT ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION "booking_ref_assign"();

-- Onboarding's Launch column: when the course expects to go live.
ALTER TABLE "CourseInquiry" ADD COLUMN "expectedLaunchAt" TIMESTAMP(3);
