-- CreateTable
CREATE TABLE "OwnerSession" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "deviceId" TEXT,
    "method" TEXT NOT NULL,
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "OwnerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerDevice" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "approvalTokenHash" TEXT,
    "approvalExpiresAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "OwnerDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnerSession_adminId_idx" ON "OwnerSession"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerDevice_tokenHash_key" ON "OwnerDevice"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerDevice_approvalTokenHash_key" ON "OwnerDevice"("approvalTokenHash");

-- CreateIndex
CREATE INDEX "OwnerDevice_adminId_idx" ON "OwnerDevice"("adminId");

-- AddForeignKey
ALTER TABLE "OwnerSession" ADD CONSTRAINT "OwnerSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerSession" ADD CONSTRAINT "OwnerSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "OwnerDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerDevice" ADD CONSTRAINT "OwnerDevice_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
