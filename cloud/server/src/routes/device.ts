import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireDevice } from "../auth/requireDevice.js";
import { generatePairingCode } from "../lib/tokens.js";

const PAIRING_TTL_MS = 10 * 60 * 1000;

const tripBodySchema = {
  type: "object",
  required: ["kind", "startedAt"],
  properties: {
    kind: { type: "string", enum: ["auto", "manual_a", "manual_b"] },
    startedAt: { type: "string", format: "date-time" },
    endedAt: { type: "string", format: "date-time", nullable: true },
    label: { type: "string", nullable: true },
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
          required: ["vin"],
          properties: {
            vin: { type: "string", minLength: 5, maxLength: 32 },
            appVersion: { type: "string", nullable: true },
          },
        },
      },
    },
    async (req, reply) => {
      const { vin, appVersion } = req.body as { vin: string; appVersion?: string };

      const code = generatePairingCode();
      const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
      const pairing = await prisma.pairingRequest.create({
        data: { code, vin: vin.trim().toUpperCase(), deviceHint: appVersion ?? null, expiresAt },
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

      const body = req.body as {
        kind: "auto" | "manual_a" | "manual_b";
        startedAt: string;
        endedAt?: string | null;
        label?: string | null;
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
      const data = {
        vehicleId: device.vehicleId,
        deviceId: device.id,
        kind: body.kind,
        startedAt,
        endedAt: body.endedAt ? new Date(body.endedAt) : null,
        label: body.label ?? null,
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

    protectedApp.post("/heartbeat", async (_req, reply) => {
      // lastSeenAt is already bumped by the requireDevice preHandler on every authenticated
      // device request - this route exists purely so the app has an explicit "I'm alive"
      // call to make even between trips.
      return reply.send({ ok: true });
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
      return reply.send({ firstName: u.firstName, lastName: u.lastName, email: u.email, photoUrl: u.photoUrl });
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
  });
}
