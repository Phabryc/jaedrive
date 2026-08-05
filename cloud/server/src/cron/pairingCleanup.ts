import { prisma } from "../db.js";

// Finestra di grazia entro cui l'app deve completare l'handshake (primo PATCH /vehicle
// riuscito, vedi Device.confirmedAt in schema.prisma e routes/device.ts) dopo un claim -
// scelta dall'utente il 2026-08-06 dopo aver trovato un caso reale: un pairing interrotto
// lato app (dialog chiuso prima che l'app tornasse a leggere il token via poll) lasciava
// Vehicle+Device creati per sempre sul cloud senza che l'app li avesse mai davvero ricevuti,
// mostrando "auto associata" ma "marca/modello non sincronizzati" senza alcuna via d'uscita.
const CONFIRMATION_GRACE_MS = 30 * 1000;
const SWEEP_INTERVAL_MS = 15 * 1000;

export async function cleanupUnconfirmedPairings() {
  try {
    const staleDevices = await prisma.device.findMany({
      where: {
        confirmedAt: null,
        createdAt: { lt: new Date(Date.now() - CONFIRMATION_GRACE_MS) },
      },
      select: { id: true, vehicleId: true },
    });

    for (const d of staleDevices) {
      // pairingRequests.deviceId punta qui con onDelete SetNull (default Prisma su relazione
      // opzionale) - nessun vincolo da rompere, la pairingRequest resta come storico con
      // deviceId azzerato invece di essere cancellata anche lei.
      await prisma.device.delete({ where: { id: d.id } });

      if (!d.vehicleId) continue;

      // Il Vehicle va rimosso SOLO se, tolto questo device, non ha piu' nessun altro
      // device ne' alcun trip - altrimenti si rischierebbe di cancellare un'auto che nel
      // frattempo ha ricevuto un secondo pairing riuscito (es. l'utente ha ritentato con un
      // nuovo codice mentre il primo tentativo era ancora "in sospeso"), o che aveva gia'
      // dati reali prima di questo pairing (re-pairing di un'auto esistente).
      const [otherDevices, trips] = await Promise.all([
        prisma.device.count({ where: { vehicleId: d.vehicleId } }),
        prisma.trip.count({ where: { vehicleId: d.vehicleId } }),
      ]);
      if (otherDevices === 0 && trips === 0) {
        await prisma.vehicle.delete({ where: { id: d.vehicleId } }).catch(() => {
          // Race condition innocua: qualcun altro l'ha gia' cancellato (es. l'utente ha
          // rimosso l'auto a mano nel frattempo) - non e' un errore da segnalare.
        });
      }
    }
  } catch (err) {
    console.error("[CRON] Error cleaning up unconfirmed pairings:", err);
  }
}

export function startPairingCleanupCron() {
  setInterval(cleanupUnconfirmedPairings, SWEEP_INTERVAL_MS);
}
