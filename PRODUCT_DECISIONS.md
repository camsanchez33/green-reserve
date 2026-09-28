# Product decisions

Decisions that are settled. If a session proposes re-opening one, it needs a new
reason, not a re-argument. Newest first.

## D-2 — Desktop app: deferred, and it will be a wrapper (2026-09-28)

Cam wants courses to download GreenReserve and open it like an application.
DECIDED: this is a packaging decision, not an architecture decision. When it
happens it is a Tauri or Electron wrapper (or an installable PWA) around the
existing Next.js app. It is NOT a native rewrite and NOT a separate codebase.

Deferred because the cost is code signing, auto-update infrastructure, and a
two-platform release process — paid now, for a dock icon. Nothing in the current
build should be shaped around it.

Revisit when: a real operator asks for it, or the PWA install path is free to add.

## D-1 — No offline mode (2026-09-28)

The app requires an internet connection. A course that loses wifi cannot take a
booking through GreenReserve.

WHY THIS IS THE REAL QUESTION BEHIND D-2: offline is what a downloadable app
would actually buy, and it is not a wrapper. It means a local database, a sync
engine, and conflict resolution for two people booking one slot — a different
product, months of work, and a permanent tax on every feature after it.

The competitive read: Lightspeed Golf and foreUP are web-based and pro shops
live with it. Accepted as an objection to answer in sales, not a feature to
build.

Revisit only if: a real course loses bookings to connectivity, with specifics.

## D-0 — Analytics is a sales feature, not the moat (2026-09-28)

Stated for the record because it shapes priority. What locks a course in is
being their system of record: the tee sheet their staff runs the day on, their
member list, saved golfer cards, and a booking link printed on scorecards and
embedded on their site. Ripping that out mid-season is unthinkable. A report is
not.

So: analytics wins demos and justifies price — build it. Do not let it outrank
the ship-blockers that make GreenReserve the system of record in the first
place (see the SD items in RUN_QUEUE.md).

The one exception is the event log (A-1), which is queued now because it is
cheap today and irrecoverable later — data not captured in October cannot be
recovered in March.
