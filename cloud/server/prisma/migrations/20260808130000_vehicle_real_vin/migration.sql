-- AlterTable Vehicle
-- Real automotive VIN, separate from the existing `vin` column (which is actually the
-- ivi.sn pairing identity, unchanged) - see schema.prisma comment on Vehicle.realVin.
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "real_vin" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "vehicles_real_vin_key" ON "vehicles"("real_vin");

-- AlterTable PairingRequest
ALTER TABLE "pairing_requests" ADD COLUMN IF NOT EXISTS "real_vin" TEXT;
