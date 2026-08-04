-- AlterTable User
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_status" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_tier" TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscriptionTier" TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_expires_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "extra_device_swaps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "extraDeviceSwaps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable Device
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "headunit_id" TEXT;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "headunitId" TEXT;

-- AlterTable PairingRequest
ALTER TABLE "pairing_requests" ADD COLUMN IF NOT EXISTS "headunit_id" TEXT;
ALTER TABLE "pairing_requests" ADD COLUMN IF NOT EXISTS "headunitId" TEXT;

-- CreateTable DeviceHistory
CREATE TABLE IF NOT EXISTS "device_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "headunit_id" TEXT NOT NULL,
    "first_paired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_paired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "device_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable DiscountCode
CREATE TABLE IF NOT EXISTS "discount_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discount_type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "is_global" BOOLEAN NOT NULL DEFAULT true,
    "assigned_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable SubscriptionLog
CREATE TABLE IF NOT EXISTS "subscription_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "headunit_id" TEXT,
    "status" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "device_history_user_id_headunit_id_key" ON "device_history"("user_id", "headunit_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "discount_codes_code_key" ON "discount_codes"("code");
