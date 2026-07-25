-- AlterTable
ALTER TABLE "users" ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "last_name" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "photo_url" TEXT;

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "client_uuid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "trips_client_uuid_key" ON "trips"("client_uuid");

