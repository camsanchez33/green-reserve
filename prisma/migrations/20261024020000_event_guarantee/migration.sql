-- Cam 2026-10-24: guaranteed headcount for organizer events (additive).
ALTER TABLE "CourseEvent" ADD COLUMN "guaranteeDaysBefore" INTEGER;
ALTER TABLE "CourseEvent" ADD COLUMN "guaranteedPlayers" INTEGER;
ALTER TABLE "CourseEvent" ADD COLUMN "guaranteedAt" TIMESTAMP(3);
ALTER TABLE "CourseEvent" ADD COLUMN "guaranteedBy" TEXT NOT NULL DEFAULT '';
