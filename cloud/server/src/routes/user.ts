import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireUser } from "../auth/requireUser.js";
import { generateDeviceToken, sha256Hex } from "../lib/tokens.js";

const TRIPS_PAGE_SIZE = 20;

async function loadOwnedVehicle(userId: string, vehicleId: string) {
  return prisma.vehicle.findFirst({ where: { id: vehicleId, userId } });
}

export async function userRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  app.get("/me", async (req, reply) => {
    const u = req.authUser!;
    return reply.send({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      firstName: u.firstName,
      lastName: u.lastName,
      nationality: u.nationality,
      photoUrl: u.photoUrl,
      // Drives the web app's onboarding gate (RequireProfile.tsx) - nationality is never
      // provided by any auth provider, so even a Google sign-in with a prefilled name still
      // needs to pass through onboarding once for this.
      profileComplete: Boolean(u.firstName && u.lastName && u.nationality),
      createdAt: u.createdAt,
    });
  });

  app.patch(
    "/me",
    {
      schema: {
        body: {
          type: "object",
          required: ["firstName", "lastName", "nationality"],
          properties: {
            firstName: { type: "string", minLength: 1, maxLength: 80 },
            lastName: { type: "string", minLength: 1, maxLength: 80 },
            nationality: { type: "string", minLength: 2, maxLength: 2 }, // ISO 3166-1 alpha-2
          },
        },
      },
    },
    async (req, reply) => {
      const { firstName, lastName, nationality } = req.body as {
        firstName: string;
        lastName: string;
        nationality: string;
      };
      const updated = await prisma.user.update({
        where: { id: req.authUser!.id },
        data: { firstName, lastName, nationality },
      });
      return reply.send({
        id: updated.id,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        nationality: updated.nationality,
        photoUrl: updated.photoUrl,
        profileComplete: true,
      });
    },
  );

  app.get("/vehicles", async (req, reply) => {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId: req.authUser!.id },
      orderBy: { createdAt: "asc" },
    });
    return reply.send(vehicles);
  });

  app.patch(
    "/vehicles/:id",
    {
      schema: {
        body: {
          type: "object",
          required: ["nickname"],
          properties: { nickname: { type: "string", minLength: 1, maxLength: 80 } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { nickname } = req.body as { nickname: string };

      const owned = await loadOwnedVehicle(req.authUser!.id, id);
      if (!owned) return reply.code(404).send({ error: "Vehicle not found" });

      const updated = await prisma.vehicle.update({ where: { id }, data: { nickname } });
      return reply.send(updated);
    },
  );

  app.delete("/vehicles/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const owned = await loadOwnedVehicle(req.authUser!.id, id);
    if (!owned) return reply.code(404).send({ error: "Vehicle not found" });

    // Cascades to devices (vehicle_id set null) and trips (deleted) per the Prisma schema's
    // onDelete rules - satisfies "right to erasure" for this vehicle's data, see DESIGN.md §6.
    await prisma.vehicle.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.post(
    "/pairing/claim",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["code"],
          properties: { code: { type: "string", minLength: 4, maxLength: 16 } },
        },
      },
    },
    async (req, reply) => {
      const { code } = req.body as { code: string };
      const userId = req.authUser!.id;

      const pairing = await prisma.pairingRequest.findUnique({ where: { code: code.trim().toUpperCase() } });
      if (!pairing || pairing.status !== "pending" || pairing.expiresAt < new Date()) {
        return reply.code(400).send({ error: "Invalid or expired code" });
      }

      // Resolve the vehicle by VIN - see DESIGN.md §7 step 5 for the three cases.
      const existing = await prisma.vehicle.findUnique({ where: { vin: pairing.vin } });
      if (existing && existing.userId !== userId) {
        return reply.code(409).send({ error: "This vehicle is already paired to a different account" });
      }

      const vehicle =
        existing ??
        (await prisma.vehicle.create({ data: { userId, vin: pairing.vin } }));

      const rawToken = generateDeviceToken();
      const device = await prisma.device.create({
        data: {
          vehicleId: vehicle.id,
          deviceTokenHash: sha256Hex(rawToken),
          appVersion: pairing.deviceHint,
        },
      });

      await prisma.pairingRequest.update({
        where: { id: pairing.id },
        data: { status: "claimed", deviceId: device.id, claimedBy: userId, plaintextToken: rawToken },
      });

      return reply.send({ vehicleId: vehicle.id });
    },
  );

  app.get("/vehicles/:id/trips", async (req, reply) => {
    const { id } = req.params as { id: string };
    const owned = await loadOwnedVehicle(req.authUser!.id, id);
    if (!owned) return reply.code(404).send({ error: "Vehicle not found" });

    const { from, to, kind, page } = req.query as {
      from?: string;
      to?: string;
      kind?: string;
      page?: string;
    };

    const pageNum = Math.max(1, Number(page ?? 1) || 1);
    const where = {
      vehicleId: id,
      ...(kind ? { kind } : {}),
      ...(from || to
        ? {
            startedAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const [total, trips] = await Promise.all([
      prisma.trip.count({ where }),
      prisma.trip.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: (pageNum - 1) * TRIPS_PAGE_SIZE,
        take: TRIPS_PAGE_SIZE,
        // gpxRaw omitted here on purpose - it's only needed on the detail view and can be
        // tens of KB per trip, wasteful to include in every list page.
        select: {
          id: true,
          kind: true,
          startedAt: true,
          endedAt: true,
          label: true,
          km: true,
          liters: true,
          avgConsumption: true,
          pctEv: true,
          pctSeries: true,
          pctParallel: true,
          pctOther: true,
        },
      }),
    ]);

    return reply.send({ total, page: pageNum, pageSize: TRIPS_PAGE_SIZE, trips });
  });

  app.get("/trips/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const trip = await prisma.trip.findUnique({ where: { id }, include: { vehicle: true } });
    if (!trip || trip.vehicle.userId !== req.authUser!.id) {
      return reply.code(404).send({ error: "Trip not found" });
    }
    const { vehicle, ...rest } = trip;
    return reply.send(rest);
  });

  app.delete("/trips/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const trip = await prisma.trip.findUnique({ where: { id }, include: { vehicle: true } });
    if (!trip || trip.vehicle.userId !== req.authUser!.id) {
      return reply.code(404).send({ error: "Trip not found" });
    }
    await prisma.trip.delete({ where: { id } });
    return reply.code(204).send();
  });
}
