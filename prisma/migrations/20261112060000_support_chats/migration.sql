-- SUPPORT (Cam 2026-11-12): support chats. Additive: a new table and a nullable column. Existing messages keep a
-- null chatId and read as each course's one "earlier messages" chat; nothing is backfilled or rewritten.
CREATE TABLE "SupportChat" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportChat_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportChat_courseId_lastMessageAt_idx" ON "SupportChat"("courseId", "lastMessageAt");
CREATE INDEX "SupportChat_lastMessageAt_idx" ON "SupportChat"("lastMessageAt");
ALTER TABLE "SupportChat" ADD CONSTRAINT "SupportChat_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" ADD COLUMN "chatId" TEXT;
CREATE INDEX "Message_chatId_idx" ON "Message"("chatId");
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "SupportChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
