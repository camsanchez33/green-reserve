-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "passkeyChallenge" TEXT,
ADD COLUMN     "passkeyChallengeExpiry" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OwnerPasskey" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "name" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "OwnerPasskey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerPasskey_credentialId_key" ON "OwnerPasskey"("credentialId");

-- CreateIndex
CREATE INDEX "OwnerPasskey_adminId_idx" ON "OwnerPasskey"("adminId");

-- AddForeignKey
ALTER TABLE "OwnerPasskey" ADD CONSTRAINT "OwnerPasskey_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
