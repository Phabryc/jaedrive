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
    gpxRaw: { type: "string", nullable: true },
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
        gpxRaw?: string | null;
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
        gpxRaw: body.gpxRaw ?? null,
      };

      // Idempotent by design (unique vehicle+kind+startedAt) so the Android WorkManager
      // retry-with-backoff sync job can safely re-POST the same trip - see DESIGN.md §8.
      const trip = await prisma.trip.upsert({
        where: {
          vehicleId_kind_startedAt: { vehicleId: device.vehicleId, kind: body.kind, startedAt },
        },
        update: data,
        create: data,
      });

      return reply.send({ tripId: trip.id });
    });

    protectedApp.post("/heartbeat", async (_req, reply) => {
      // lastSeenAt is already bumped by the requireDevice preHandler on every authenticated
      // device request - this route exists purely so the app has an explicit "I'm alive"
      // call to make even between trips.
      return reply.send({ ok: true });
    });
  });
}
