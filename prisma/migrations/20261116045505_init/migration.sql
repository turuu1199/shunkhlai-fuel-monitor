-- CreateEnum
CREATE TYPE "Language" AS ENUM ('mn', 'en');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('A92_AVAILABLE', 'A92_ARRIVAL_TIME');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "district" TEXT NOT NULL DEFAULT 'BZD',
    "notificationRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "telegramNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnAvailable" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnArrivalTime" BOOLEAN NOT NULL DEFAULT true,
    "favoritesOnly" BOOLEAN NOT NULL DEFAULT false,
    "language" "Language" NOT NULL DEFAULT 'mn',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "telegramUsername" TEXT,
    "firstName" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramConnectionToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramConnectionToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelStation" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "address" TEXT,
    "district" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "coordinateVerified" BOOLEAN NOT NULL DEFAULT false,
    "coordinateSource" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelAvailability" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL,
    "arrivedAt" TEXT,
    "emptyAt" TEXT,
    "limitPerPerson" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityEvent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "arrivedAt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "notificationType" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "distanceKm" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "NotificationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoriteStation" (
    "userId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteStation_pkey" PRIMARY KEY ("userId","stationId")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "stationCount" INTEGER,
    "changes" INTEGER,
    "events" INTEGER,
    "notificationsSent" INTEGER,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConnection_userId_key" ON "TelegramConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConnection_chatId_key" ON "TelegramConnection"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConnectionToken_tokenHash_key" ON "TelegramConnectionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TelegramConnectionToken_userId_createdAt_idx" ON "TelegramConnectionToken"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FuelStation_externalId_key" ON "FuelStation"("externalId");

-- CreateIndex
CREATE INDEX "FuelStation_district_idx" ON "FuelStation"("district");

-- CreateIndex
CREATE INDEX "FuelAvailability_stationId_fuelType_recordedAt_idx" ON "FuelAvailability"("stationId", "fuelType", "recordedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityEvent_key_key" ON "AvailabilityEvent"("key");

-- CreateIndex
CREATE INDEX "AvailabilityEvent_createdAt_idx" ON "AvailabilityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationHistory_userId_stationId_createdAt_idx" ON "NotificationHistory"("userId", "stationId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationHistory_userId_eventId_key" ON "NotificationHistory"("userId", "eventId");

-- CreateIndex
CREATE INDEX "SyncRun_startedAt_idx" ON "SyncRun"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "SyncRun_ok_startedAt_idx" ON "SyncRun"("ok", "startedAt" DESC);

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramConnection" ADD CONSTRAINT "TelegramConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramConnectionToken" ADD CONSTRAINT "TelegramConnectionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAvailability" ADD CONSTRAINT "FuelAvailability_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "FuelStation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityEvent" ADD CONSTRAINT "AvailabilityEvent_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "FuelStation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationHistory" ADD CONSTRAINT "NotificationHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationHistory" ADD CONSTRAINT "NotificationHistory_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "FuelStation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationHistory" ADD CONSTRAINT "NotificationHistory_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AvailabilityEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteStation" ADD CONSTRAINT "FavoriteStation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteStation" ADD CONSTRAINT "FavoriteStation_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "FuelStation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
