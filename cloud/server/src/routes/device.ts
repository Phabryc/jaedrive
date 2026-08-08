import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireDevice } from "../auth/requireDevice.js";
import { generatePairingCode } from "../lib/tokens.js";
import { reverseGeocode, firstAndLastPoint } from "../lib/geocode.js";
import { verifyPairingSignature } from "../lib/pairingAuth.js";

const PAIRING_TTL_MS = 10 * 60 * 1000;

// Oltre al rate-limit per IP gia' su questa route, un limite per VIN/ivi_sn indipendente:
// impedisce lo scanning massivo di piu' identificativi anche da chi e' gia' riuscito a
// falsificare una firma valida (vedi lib/pairingAuth.ts) - un singolo tentativo mirato non
// e' comunque bloccabile da un rate-limit, per quello serve il recupero manuale lato admin.
const MAX_PAIRING_STARTS_PER_VIN_PER_DAY = 3;

const tripBodySchema = {
  type: "object",
  required: ["kind", "startedAt"],
  properties: {
    kind: { type: "string", enum: ["auto", "manual"] },
    startedAt: { type: "string", format: "date-time" },
    endedAt: { type: "string", format: "date-time", nullable: true },
    label: { type: "string", nullable: true },
    startLabel: { type: "string", nullable: true },
    km: { type: "number", nullable: true },
    liters: { type: "number", nullable: true },
    avgConsumption: { type: "number", nullable: true },
    pctEv: { type: "number", nullable: true },
    pctSeries: { type: "number", nullable: true },
    pctParallel: { type: "number", nullable: true },
    pctOther: { type: "number", nullable: true },
    pctEco: { type: "number", nullable: true },
    pctNormal: { type: "number", nullable: true },
    pctSport: { type: "number", nullable: true },
    kmEv: { type: "number", nullable: true },
    kmHev: { type: "number", nullable: true },
    gpxRaw: { type: "string", nullable: true },
    // Client-generated UUID (Android TripDatabase) - the primary idempotency key when
    // present, stronger than (vehicleId, kind, startedAt) alone since it survives a device
    // DB reset/restore re-uploading the same trips after re-pairing. Optional so older app
    // versions without it still work via the old natural-key upsert - see the handler below.
    clientUuid: { type: "string", nullable: true },
  },
} as const;

export async function deviceRoutes(app: FastifyInstance) {
  // No auth: entry point of the pairing flow, see DESIGN.md §7. Rate-limited below to
  // deter code brute-forcing / VIN enumeration.
  app.post(
    "/pairing/start",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["vin", "timestamp", "signature"],
          properties: {
            vin: { type: "string", minLength: 5, maxLength: 32 },
            // VIN automobilistico reale, opzionale - vedi schema.prisma Vehicle.realVin.
            // Formato gia' validato lato app (17 caratteri ISO 3779) prima dell'invio, qui
            // solo un limite di lunghezza generoso, non e' questo il posto per rifiutare un
            // pairing per un formato leggermente diverso.
            realVin: { type: "string", minLength: 5, maxLength: 32, nullable: true },
            timestamp: { type: "string" },
            signature: { type: "string" },
            appVersion: { type: "string", nullable: true },
            headunitId: { type: "string", nullable: true },
          },
        },
      },
    },
    async (req, reply) => {
      const { vin, realVin, timestamp, signature, appVersion, headunitId } = req.body as {
        vin: string;
        realVin?: string | null;
        timestamp: string;
        signature: string;
        appVersion?: string;
        headunitId?: string;
      };

      // Non prova il possesso fisico di QUESTA auto, solo che il chiamante conosce la
      // chiave embedded nell'app - vedi lib/pairingAuth.ts per i limiti espliciti di
      // questa scelta e agent_log.md per la discussione completa.
      if (!verifyPairingSignature(vin, timestamp, signature)) {
        return reply.code(401).send({ error: "Invalid or expired pairing signature" });
      }

      const normalizedVin = vin.trim().toUpperCase();
      const normalizedRealVin = realVin ? realVin.trim().toUpperCase() : null;
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentStarts = await prisma.pairingRequest.count({
        where: { vin: normalizedVin, createdAt: { gte: oneDayAgo } },
      });
      if (recentStarts >= MAX_PAIRING_STARTS_PER_VIN_PER_DAY) {
        return reply.code(429).send({ error: "Too many pairing attempts for this vehicle, try again later" });
      }

      const code = generatePairingCode();
      const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
      const pairing = await prisma.pairingRequest.create({
        data: {
          code,
          vin: normalizedVin,
          realVin: normalizedRealVin,
          deviceHint: appVersion ?? null,
          headunitId: headunitId ?? null,
          expiresAt,
        },
      });

      return reply.send({ pairingRequestId: pairing.id, code: pairing.code, expiresAt: pairing.expiresAt });
    },
  );

  // No auth: the pairingRequestId (a UUID) is itself the bearer secret for this one poll
  // target - see DESIGN.md §7 step 3.
  app.get(
    "/pairing/status/:id",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const pairing = await prisma.pairingRequest.findUnique({ where: { id } });
      if (!pairing) return reply.code(404).send({ error: "Unknown pairing request" });

      if (pairing.status === "pending" && pairing.expiresAt < new Date()) {
        await prisma.pairingRequest.update({ where: { id }, data: { status: "expired" } });
        return reply.send({ status: "expired" });
      }

      if (pairing.status === "claimed" && pairing.plaintextToken && !pairing.tokenDeliveredAt) {
        const token = pairing.plaintextToken;
        await prisma.pairingRequest.update({
          where: { id },
          data: { plaintextToken: null, tokenDeliveredAt: new Date() },
        });
        return reply.send({ status: "claimed", deviceToken: token });
      }

      return reply.send({ status: pairing.status });
    },
  );

  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", requireDevice);

    protectedApp.post("/trips", { schema: { body: tripBodySchema } }, async (req, reply) => {
      const device = req.authDevice!;
      if (!device.vehicleId) {
        return reply.code(409).send({ error: "Device is not paired to a vehicle" });
      }

      const vehicle = await prisma.vehicle.findUnique({ where: { id: device.vehicleId }, include: { user: true } });
      if (!vehicle) {
        return reply.code(404).send({ error: "Vehicle not found" });
      }

      if (vehicle.user.subscriptionStatus !== "PREMIUM" || (vehicle.user.subscriptionExpiresAt && vehicle.user.subscriptionExpiresAt < new Date())) {
        return reply.code(403).send({ error: "SUBSCRIPTION_REQUIRED" });
      }

      const body = req.body as {
        kind: "auto" | "manual";
        startedAt: string;
        endedAt?: string | null;
        label?: string | null;
        startLabel?: string | null;
        km?: number | null;
        liters?: number | null;
        avgConsumption?: number | null;
        pctEv?: number | null;
        pctSeries?: number | null;
        pctParallel?: number | null;
        pctOther?: number | null;
        pctEco?: number | null;
        pctNormal?: number | null;
        pctSport?: number | null;
        kmEv?: number | null;
        kmHev?: number | null;
        gpxRaw?: string | null;
        clientUuid?: string | null;
      };

      const startedAt = new Date(body.startedAt);

      // Fallback: se l'app non e' riuscita a geocodificare (nessuna connessione al momento
      // della chiusura del viaggio - vedi TrackingService.saveTripRecordAsync()), ma il
      // viaggio ha comunque una traccia GPX, ci proviamo qui - a questo punto l'upload
      // stesso e' andato a buon fine, quindi la connessione c'e' di sicuro. Stesso servizio
      // (Nominatim) e stessa logica dell'app, vedi lib/geocode.ts.
      let label = body.label ?? null;
      let startLabel = body.startLabel ?? null;
      if ((!label || !startLabel) && body.gpxRaw) {
        const points = firstAndLastPoint(body.gpxRaw);
        if (points) {
          if (!startLabel) startLabel = await reverseGeocode(points.first.lat, points.first.lon);
          if (!label) label = await reverseGeocode(points.last.lat, points.last.lon);
        }
      }

      const data = {
        vehicleId: device.vehicleId,
        deviceId: device.id,
        kind: body.kind,
        startedAt,
        endedAt: body.endedAt ? new Date(body.endedAt) : null,
        label,
        startLabel,
        km: body.km ?? null,
        liters: body.liters ?? null,
        avgConsumption: body.avgConsumption ?? null,
        pctEv: body.pctEv ?? null,
        pctSeries: body.pctSeries ?? null,
        pctParallel: body.pctParallel ?? null,
        pctOther: body.pctOther ?? null,
        pctEco: body.pctEco ?? null,
        pctNormal: body.pctNormal ?? null,
        pctSport: body.pctSport ?? null,
        kmEv: body.kmEv ?? null,
        kmHev: body.kmHev ?? null,
        gpxRaw: body.gpxRaw ?? null,
        clientUuid: body.clientUuid ?? null,
      };

      // Idempotent by design so the Android WorkManager retry-with-backoff sync job can
      // safely re-POST the same trip - see DESIGN.md §8. clientUuid is the primary key when
      // present (stronger: survives a device DB reset/restore re-uploading the same trips
      // after re-pairing, unlike the natural key below which only survives retries within
      // the SAME local DB). Falls back to (vehicleId, kind, startedAt) for older app
      // versions that don't send a clientUuid yet, and also checked second even when a
      // clientUuid IS sent, so a trip uploaded by an old app version and re-uploaded by an
      // updated one (now with a UUID) gets that UUID attached instead of duplicating.
      let existing = body.clientUuid
        ? await prisma.trip.findUnique({ where: { clientUuid: body.clientUuid } })
        : null;
      if (!existing) {
        existing = await prisma.trip.findUnique({
          where: { vehicleId_kind_startedAt: { vehicleId: device.vehicleId, kind: body.kind, startedAt } },
        });
      }

      const trip = existing
        ? await prisma.trip.update({ where: { id: existing.id }, data })
        : await prisma.trip.create({ data });

      return reply.send({ tripId: trip.id });
    });

    protectedApp.post("/heartbeat", async (req, reply) => {
      const device = req.authDevice!;
      let subscription = { status: "FREE", tier: "STANDARD", expiresAt: null as string | null, isActive: false };
      if (device.vehicleId) {
        const vehicle = await prisma.vehicle.findUnique({ where: { id: device.vehicleId }, include: { user: true } });
        if (vehicle?.user) {
          const u = vehicle.user;
          const isActive = u.subscriptionStatus === "PREMIUM" && (!u.subscriptionExpiresAt || u.subscriptionExpiresAt > new Date());
          subscription = {
            status: u.subscriptionStatus ?? "FREE",
            tier: u.subscriptionTier ?? "STANDARD",
            expiresAt: u.subscriptionExpiresAt ? u.subscriptionExpiresAt.toISOString() : null,
            isActive,
          };
        }
      }
      return reply.send({ ok: true, subscription });
    });

    // Powers the Android app's "CLOUD" card in Impostazioni (name/email/photo of the
    // account this car is linked to) - the device only ever has a device token, never a
    // Firebase user token, so this can't go through the /api/user/* routes.
    protectedApp.get("/owner", async (req, reply) => {
      const device = req.authDevice!;
      if (!device.vehicleId) return reply.code(409).send({ error: "Device is not paired to a vehicle" });

      const vehicle = await prisma.vehicle.findUnique({ where: { id: device.vehicleId }, include: { user: true } });
      if (!vehicle) return reply.code(404).send({ error: "Vehicle not found" });

      const u = vehicle.user;
      const isActive = u.subscriptionStatus === "PREMIUM" && (!u.subscriptionExpiresAt || u.subscriptionExpiresAt > new Date());
      return reply.send({
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        photoUrl: u.photoUrl,
        subscription: {
          status: u.subscriptionStatus ?? "FREE",
          tier: u.subscriptionTier ?? "STANDARD",
          expiresAt: u.subscriptionExpiresAt ? u.subscriptionExpiresAt.toISOString() : null,
          isActive,
        },
      });
    });

    // Device-initiated trip delete - Android asks "delete from the cloud too?" after a
    // local delete, see MainActivity.confirmDeleteSelectedTrips().
    protectedApp.delete("/trips/:id", async (req, reply) => {
      const device = req.authDevice!;
      const { id } = req.params as { id: string };
      const trip = await prisma.trip.findUnique({ where: { id } });
      if (!trip || trip.vehicleId !== device.vehicleId) {
        return reply.code(404).send({ error: "Trip not found" });
      }
      await prisma.trip.delete({ where: { id } });
      return reply.code(204).send();
    });

    // Device-initiated vehicle delete - Android asks "delete the car from the cloud too?"
    // when unpairing, see MainActivity's unpair flow. Cascades devices/trips same as the
    // user-facing DELETE /api/user/vehicles/:id.
    protectedApp.delete("/vehicle", async (req, reply) => {
      const device = req.authDevice!;
      if (!device.vehicleId) return reply.code(409).send({ error: "Device is not paired to a vehicle" });
      await prisma.vehicle.delete({ where: { id: device.vehicleId } });
      return reply.code(204).send();
    });

    // Brand/model/powertrain dall'onboarding obbligatorio Android (vedi VehicleCatalog.java),
    // e/o il VIN reale (campo `realVin`, separato da `vin`/ivi.sn - vedi schema.prisma
    // Vehicle.realVin e MainActivity.readTboxVinProperty(), richiesta esplicita utente
    // 2026-08-08). `vin` resta accettato per compatibilita' ma l'app non lo invia piu' da
    // questa route: e' la chiave di pairing, non cambia mai via PATCH, solo via
    // POST /pairing/claim (riassociazione a parita' di realVin). Aggiornamento parziale: il
    // device puo' richiamarla con solo uno dei campi (es. solo realVin quando si rende
    // disponibile dopo il pairing, senza dover rispedire marca/modello/motorizzazione).
    // Nickname resta gestito solo lato utente/web, non qui - vedi PATCH /api/user/vehicles/:id.
    protectedApp.patch(
      "/vehicle",
      {
        schema: {
          body: {
            type: "object",
            minProperties: 1,
            properties: {
              brand: { type: "string", enum: ["JAECOO", "OMODA"] },
              model: { type: "string", minLength: 1, maxLength: 20 },
              powertrain: { type: "string", minLength: 1, maxLength: 20 },
              vin: { type: "string", minLength: 5, maxLength: 32 },
              realVin: { type: "string", minLength: 5, maxLength: 32, nullable: true },
            },
          },
        },
      },
      async (req, reply) => {
        const device = req.authDevice!;
        if (!device.vehicleId) return reply.code(409).send({ error: "Device is not paired to a vehicle" });
        const { brand, model, powertrain, vin, realVin } = req.body as {
          brand?: string;
          model?: string;
          powertrain?: string;
          vin?: string;
          realVin?: string | null;
        };
        const data: { brand?: string; model?: string; powertrain?: string; vin?: string; realVin?: string } = {};
        if (brand !== undefined) data.brand = brand;
        if (model !== undefined) data.model = model;
        if (powertrain !== undefined) data.powertrain = powertrain;
        if (vin !== undefined) data.vin = vin.trim().toUpperCase();
        if (realVin !== undefined && realVin !== null) data.realVin = realVin.trim().toUpperCase();

        try {
          const vehicle = await prisma.vehicle.update({ where: { id: device.vehicleId }, data });
          // Prima sincronizzazione riuscita dopo il pairing = prova che l'app ha davvero
          // ricevuto il token e completato l'handshake, non solo che il claim sia avvenuto
          // sul sito - vedi Device.confirmedAt in schema.prisma e cron/pairingCleanup.ts.
          // Solo se non gia' confermato: nessun bisogno di riscrivere lo stesso timestamp
          // ad ogni PATCH successiva (es. aggiornamento realVin, vedi commento sopra la route).
          if (!device.confirmedAt) {
            await prisma.device.update({ where: { id: device.id }, data: { confirmedAt: new Date() } });
          }
          return reply.send({
            brand: vehicle.brand,
            model: vehicle.model,
            powertrain: vehicle.powertrain,
            vin: vehicle.vin,
            realVin: vehicle.realVin,
          });
        } catch (err: any) {
          // Collisione unique su "vin" o "real_vin" - un'altro veicolo ha gia' questo stesso
          // identificativo (es. due device associati per errore con lo stesso VIN reale).
          // Non e' un errore di rete: lo segnaliamo distintamente cosi' l'app puo' loggarlo
          // invece di ritentare all'infinito come farebbe per un errore generico.
          if (err?.code === "P2002") {
            const target = Array.isArray(err?.meta?.target) ? err.meta.target.join(",") : String(err?.meta?.target ?? "");
            const field = target.includes("real_vin") ? "VIN" : "identifier";
            return reply.code(409).send({ error: `This ${field} is already in use by another vehicle` });
          }
          throw err;
        }
      },
    );
  });
}
