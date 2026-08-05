-- AlterTable Device
-- Impostato al primo PATCH /api/device/vehicle riuscito dopo il pairing (vedi
-- routes/device.ts) - prova che l'app ha davvero ricevuto il token e completato
-- l'handshake, non solo che il claim sia avvenuto sul sito. Un device mai confermato entro
-- la finestra di grazia viene ripulito da cron/pairingCleanup.ts insieme al Vehicle, se
-- quest'ultimo non ha altri device/trip.
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "confirmed_at" TIMESTAMP(3);
