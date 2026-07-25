-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "firebase_uid" TEXT NOT NULL,
    "email" TEXT,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "nickname" TEXT NOT NULL DEFAULT 'La mia auto',
    "model" TEXT,
    "model_year" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "device_token_hash" TEXT NOT NULL,
    "app_version" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pairing_requests" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "device_hint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "device_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "claimed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plaintext_token" TEXT,
    "token_delivered_at" TIMESTAMP(3),

    CONSTRAINT "pairing_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "device_id" TEXT,
    "kind" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "label" TEXT,
    "km" DOUBLE PRECISION,
    "liters" DOUBLE PRECISION,
    "avg_consumption" DOUBLE PRECISION,
    "pct_ev" DOUBLE PRECISION,
    "pct_series" DOUBLE PRECISION,
    "pct_parallel" DOUBLE PRECISION,
    "pct_other" DOUBLE PRECISION,
    "gpx_raw" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "devices_device_token_hash_key" ON "devices"("device_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "pairing_requests_code_key" ON "pairing_requests"("code");

-- CreateIndex
CREATE INDEX "trips_vehicle_id_started_at_idx" ON "trips"("vehicle_id", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "trips_vehicle_id_kind_started_at_key" ON "trips"("vehicle_id", "kind", "started_at");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pairing_requests" ADD CONSTRAINT "pairing_requests_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pairing_requests" ADD CONSTRAINT "pairing_requests_claimed_by_fkey" FOREIGN KEY ("claimed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
