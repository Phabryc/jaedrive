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
      photoUrl: u.photoUrl,
      // Drives the web app's onboarding gate (RequireProfile.tsx).
      profileComplete: Boolean(u.firstName && u.lastName),
      createdAt: u.createdAt,
    });
  });

  app.patch(
    "/me",
    {
      schema: {
        body: {
          type: "object",
          required: ["firstName", "lastName"],
          properties: {
            firstName: { type: "string", minLength: 1, maxLength: 80 },
            lastName: { type: "string", minLength: 1, maxLength: 80 },
          },
        },
      },
    },
    async (req, reply) => {
      const { firstName, lastName } = req.body as { firstName: string; lastName: string };
      const updated = await prisma.user.update({
        where: { id: req.authUser!.id },
        data: { firstName, lastName },
      });
      return reply.send({
        id: updated.id,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
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

  // Statistics (cloud/DESIGN.md §12) - computed at request time over a plain findMany, no
  // precompute job/materialized view: at personal-vehicle scale (hundreds/low thousands of
  // trips, not fleet-scale) this is fast enough, and it's the only way to get the
  // km-weighted averages and best/worst-trip logic below without fighting Prisma's groupBy.
  app.get("/vehicles/:id/stats", async (req, reply) => {
    const { id } = req.params as { id: string };
    const owned = await loadOwnedVehicle(req.authUser!.id, id);
    if (!owned) return reply.code(404).send({ error: "Vehicle not found" });

    const { from, to } = req.query as { from?: string; to?: string };
    const where = {
      vehicleId: id,
      ...(from || to
        ? { startedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
    };

    const trips = await prisma.trip.findMany({
      where,
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        kind: true,
        startedAt: true,
        label: true,
        km: true,
        liters: true,
        avgConsumption: true,
        pctEv: true,
        pctSeries: true,
        pctParallel: true,
        pctOther: true,
        pctEco: true,
        pctNormal: true,
        pctSport: true,
        kmEv: true,
        kmHev: true,
      },
    });

    // Media pesata per km: un viaggio di 200km pesa piu' di uno di 2km nella % complessiva,
    // a differenza di una semplice media aritmetica tra viaggi.
    function weightedPct(field: "pctEv" | "pctSeries" | "pctParallel" | "pctOther" | "pctEco" | "pctNormal" | "pctSport") {
      let weightedSum = 0;
      let totalKm = 0;
      for (const t of trips) {
        if (t[field] == null || t.km == null) continue;
        weightedSum += t[field]! * t.km;
        totalKm += t.km;
      }
      return totalKm > 0 ? weightedSum / totalKm : null;
    }

    const totalKm = trips.reduce((s, t) => s + (t.km ?? 0), 0);
    const totalLiters = trips.reduce((s, t) => s + (t.liters ?? 0), 0);
    // Fattore di emissione benzina standard (~2.31 kg CO2/litro) - stima rispetto a un
    // "tutto benzina" (vedi DESIGN.md §12), non una misura reale delle emissioni del
    // powertrain ibrido: e' semplicemente i litri effettivamente bruciati * fattore fisso.
    const co2Kg = totalLiters * 2.31;

    const consumable = trips.filter((t) => t.avgConsumption != null && t.km != null && t.km >= 1);
    const bestTrip = consumable.length
      ? consumable.reduce((a, b) => (b.avgConsumption! > a.avgConsumption! ? b : a))
      : null;
    const worstTrip = consumable.length
      ? consumable.reduce((a, b) => (b.avgConsumption! < a.avgConsumption! ? b : a))
      : null;

    const kindBreakdown: Record<string, { count: number; km: number }> = {};
    for (const t of trips) {
      const k = kindBreakdown[t.kind] ?? { count: 0, km: 0 };
      k.count += 1;
      k.km += t.km ?? 0;
      kindBreakdown[t.kind] = k;
    }

    // Trend consumo: media (non pesata) tra i viaggi dello stesso giorno - una linea al
    // giorno e' gia' abbastanza densa per l'uso personale di questo veicolo, niente
    // aggregazione settimanale/mensile per ora (si puo' aggiungere se il range diventa lungo).
    const trendByDay = new Map<string, { sum: number; count: number }>();
    for (const t of trips) {
      if (t.avgConsumption == null) continue;
      const day = t.startedAt.toISOString().slice(0, 10);
      const entry = trendByDay.get(day) ?? { sum: 0, count: 0 };
      entry.sum += t.avgConsumption;
      entry.count += 1;
      trendByDay.set(day, entry);
    }
    const consumptionTrend = Array.from(trendByDay.entries())
      .map(([date, { sum, count }]) => ({ date, avgConsumption: sum / count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const kmEvTotal = trips.reduce((s, t) => s + (t.kmEv ?? 0), 0);
    const kmHevTotal = trips.reduce((s, t) => s + (t.kmHev ?? 0), 0);
    const evHevSampleCount = trips.filter((t) => t.kmEv != null || t.kmHev != null).length;

    return reply.send({
      totals: { km: totalKm, liters: totalLiters, tripCount: trips.length, co2Kg },
      energyFlowBreakdown: {
        pctEv: weightedPct("pctEv"),
        pctSeries: weightedPct("pctSeries"),
        pctParallel: weightedPct("pctParallel"),
        pctOther: weightedPct("pctOther"),
      },
      driveModeBreakdown: {
        pctEco: weightedPct("pctEco"),
        pctNormal: weightedPct("pctNormal"),
        pctSport: weightedPct("pctSport"),
      },
      // null se nessun trip ha ancora questo dato (feature piu' recente di pctEv/...).
      evHevKmSplit: evHevSampleCount > 0 ? { kmEv: kmEvTotal, kmHev: kmHevTotal } : null,
      kindBreakdown,
      consumptionTrend,
      bestTrip: bestTrip
        ? { id: bestTrip.id, label: bestTrip.label, startedAt: bestTrip.startedAt, avgConsumption: bestTrip.avgConsumption, km: bestTrip.km }
        : null,
      worstTrip: worstTrip
        ? { id: worstTrip.id, label: worstTrip.label, startedAt: worstTrip.startedAt, avgConsumption: worstTrip.avgConsumption, km: worstTrip.km }
        : null,
    });
  });

  // Giorni guidati (per la heatmap calendario) - un anno alla volta, default l'anno corrente.
  app.get("/vehicles/:id/stats/calendar", async (req, reply) => {
    const { id } = req.params as { id: string };
    const owned = await loadOwnedVehicle(req.authUser!.id, id);
    if (!owned) return reply.code(404).send({ error: "Vehicle not found" });

    const { year } = req.query as { year?: string };
    const y = Math.trunc(Number(year)) || new Date().getFullYear();
    const from = new Date(Date.UTC(y, 0, 1));
    const to = new Date(Date.UTC(y + 1, 0, 1));

    const trips = await prisma.trip.findMany({
      where: { vehicleId: id, startedAt: { gte: from, lt: to } },
      select: { startedAt: true, km: true },
    });

    const byDay = new Map<string, { km: number; tripCount: number }>();
    for (const t of trips) {
      const day = t.startedAt.toISOString().slice(0, 10);
      const entry = byDay.get(day) ?? { km: 0, tripCount: 0 };
      entry.km += t.km ?? 0;
      entry.tripCount += 1;
      byDay.set(day, entry);
    }

    return reply.send({
      year: y,
      days: Array.from(byDay.entries())
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
  });
}
