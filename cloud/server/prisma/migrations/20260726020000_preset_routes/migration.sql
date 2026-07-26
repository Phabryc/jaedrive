-- CreateTable
CREATE TABLE "preset_routes" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_lat" DOUBLE PRECISION NOT NULL,
    "start_lon" DOUBLE PRECISION NOT NULL,
    "end_lat" DOUBLE PRECISION NOT NULL,
    "end_lon" DOUBLE PRECISION NOT NULL,
    "radius_meters" DOUBLE PRECISION NOT NULL DEFAULT 150,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preset_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "preset_routes_vehicle_id_idx" ON "preset_routes"("vehicle_id");

-- AddForeignKey
ALTER TABLE "preset_routes" ADD CONSTRAINT "preset_routes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
