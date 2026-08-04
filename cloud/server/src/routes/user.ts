import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireUser } from "../auth/requireUser.js";
import { generateDeviceToken, sha256Hex } from "../lib/tokens.js";
import { reverseGeocode, firstAndLastPoint, searchAddress } from "../lib/geocode.js";
import { computeVehicleStats } from "../lib/stats.js";
import { computeKmByBucket, computeFlowBreakdownForRange } from "../lib/gpxEnergy.js";
import { haversineMeters } from "../lib/geo.js";
import { deleteFirebaseUser } from "../auth/firebase.js";

const ROUTE_TRIP_SELECT = {
  id: true,
  kind: true,
  startedAt: true,
  endedAt: true,
  label: true,
  startLabel: true,
  km: true,
  liters: true,
  avgConsumption: true,
  pctEv: true,
  pctSeries: true,
  pctParallel: true,
  pctOther: true,
} as const;

const DEFAULT_ROUTE_RADIUS_M = 150;
const MIN_ROUTE_RADIUS_M = 30;
const MAX_ROUTE_RADIUS_M = 2000;

const TRIPS_PAGE_SIZE = 20;

// Data "Ultimo aggiornamento"/"Last updated" del testo legale corrente (vedi
// cloud/web/src/legal/*.md) - un'unica versione per la coppia EULA+Privacy Policy,
// accettate insieme in un solo checkbox durante l'onboarding. Bump quando uno dei due
// documenti cambia in modo sostanziale: profileComplete torna false per chi aveva
// accettato una versione precedente, forzando una nuova accettazione.
const CURRENT_LEGAL_VERSION = "2026-07-26";

function isProfileComplete(u: { firstName: string | null; lastName: string | null; legalAcceptedAt: Date | null; legalVersion: string | null }) {
  return Boolean(u.firstName && u.lastName && u.legalAcceptedAt && u.legalVersion === CURRENT_LEGAL_VERSION);
}

async function loadOwnedVehicle(userId: string, vehicleId: string) {
  return prisma.vehicle.findFirst({ where: { id: vehicleId, userId } });
}

export async function userRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  app.get("/me", async (req, reply) => {
    try {
      const u = await prisma.user.findUnique({ where: { id: req.authUser!.id } });
      if (!u) return reply.code(404).send({ error: "User not found" });

      let headunitSwapsUsed = 0;
      try {
        const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        const history = await (prisma as any).deviceHistory?.findMany({
          where: { userId: u.id, firstPairedAt: { gte: oneYearAgo } },
          select: { headunitId: true },
          distinct: ['headunitId'],
        });
        if (history) headunitSwapsUsed = history.length;
      } catch (err) {
        console.warn("Could not query deviceHistory:", err);
      }

      const role = u.role ?? "USER";
      const subscriptionStatus = u.subscriptionStatus ?? "FREE";
      const subscriptionTier = u.subscriptionTier ?? "STANDARD";
      const extraDeviceSwaps = u.extraDeviceSwaps ?? 0;
      const baseSwaps = subscriptionTier === 'GARAGE' ? 5 : 2;
      const headunitSwapsMax = baseSwaps + extraDeviceSwaps;
      const maxVehicles = subscriptionTier === 'GARAGE' ? 3 : 1;

      let activeVehiclesCount = 0;
      try {
        activeVehiclesCount = await prisma.vehicle.count({ where: { userId: u.id } });
      } catch {}

      return reply.send({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        firstName: u.firstName,
        lastName: u.lastName,
        photoUrl: u.photoUrl,
        role,
        profileComplete: isProfileComplete(u as any),
        legalVersion: u.legalVersion,
        currentLegalVersion: CURRENT_LEGAL_VERSION,
        createdAt: u.createdAt,
        subscription: {
          status: subscriptionStatus,
          tier: subscriptionTier,
          expiresAt: u.subscriptionExpiresAt ?? null,
          maxVehicles,
          activeVehiclesCount,
          headunitSwapsUsed,
          headunitSwapsMax,
          headunitSwapsRemaining: Math.max(0, headunitSwapsMax - headunitSwapsUsed),
        },
      });
    } catch (err) {
      console.error("Error in /me endpoint:", err);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  app.post(
    "/redeem-discount-code",
    {
      schema: {
        body: {
          type: "object",
          required: ["code"],
          properties: { code: { type: "string", minLength: 1, maxLength: 50 } },
        },
      },
    },
    async (req, reply) => {
      const { code } = req.body as { code: string };
      const user = req.authUser!;

      const promo = await prisma.discountCode.findUnique({
        where: { code: code.trim().toUpperCase() },
      });

      if (!promo) {
        return reply.code(400).send({ error: "Codice promo non valido" });
      }

      if (promo.expiresAt && promo.expiresAt < new Date()) {
        return reply.code(400).send({ error: "Codice promo scaduto" });
      }

      if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
        return reply.code(400).send({ error: "Codice promo esaurito" });
      }

      if (!promo.isGlobal && promo.assignedEmail && promo.assignedEmail.toLowerCase() !== (user.email ?? "").toLowerCase()) {
        return reply.code(403).send({ error: "Questo codice promo è riservato ad un altro utente" });
      }

      let daysToAdd = 30;
      if (promo.discountType === "FREE_DAYS") {
        daysToAdd = Math.max(1, promo.value);
      } else if (promo.discountType === "PERCENT" || promo.discountType === "FIXED_AMOUNT") {
        daysToAdd = promo.value > 0 ? Math.round(promo.value) : 30;
      }

      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      const currentExpiry = dbUser?.subscriptionExpiresAt && dbUser.subscriptionExpiresAt > new Date()
        ? dbUser.subscriptionExpiresAt
        : new Date();

      const newExpiry = new Date(currentExpiry.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: "PREMIUM",
          subscriptionExpiresAt: newExpiry,
        },
      });

      await prisma.discountCode.update({
        where: { id: promo.id },
        data: { usedCount: { increment: 1 } },
      });

      await prisma.subscriptionLog.create({
        data: {
          userId: user.id,
          status: "PREMIUM",
          tier: dbUser?.subscriptionTier ?? "STANDARD",
          expiresAt: newExpiry,
          notes: `Riscattato codice promo: ${promo.code}`,
          createdBy: user.id,
        },
      });

      return reply.send({
        success: true,
        message: `Codice promo riscattato con successo! Il tuo abbonamento Premium è attivo.`,
        expiresAt: newExpiry,
      });
    }
  );

  app.patch(
    "/me",
    {
      schema: {
        body: {
          type: "object",
          required: ["firstName", "lastName", "acceptLegal"],
          properties: {
            firstName: { type: "string", minLength: 1, maxLength: 80 },
            lastName: { type: "string", minLength: 1, maxLength: 80 },
            // const: true - rifiuta con 400 qualunque valore diverso da true (non basta
            // che la chiave sia presente, deve essere esplicitamente accettato).
            acceptLegal: { const: true },
          },
        },
      },
    },
    async (req, reply) => {
      const { firstName, lastName } = req.body as { firstName: string; lastName: string; acceptLegal: true };
      const updated = await prisma.user.update({
        where: { id: req.authUser!.id },
        data: { firstName, lastName, legalAcceptedAt: new Date(), legalVersion: CURRENT_LEGAL_VERSION },
      });
      return reply.send({
        id: updated.id,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        photoUrl: updated.photoUrl,
        profileComplete: isProfileComplete(updated),
      });
    },
  );

  // Cancellazione account (jaedrive_todo #1) - "diritto all'oblio" GDPR completo, non solo
  // per-veicolo (vedi DESIGN.md §6, che finora copriva solo DELETE .../vehicles/:id).
  // L'identita' Firebase viene cancellata PRIMA della riga Postgres apposta: e' la chiamata
  // di rete (quindi quella con piu' probabilita' di fallire) e se fallisce non deve lasciare
  // l'account a meta' cancellato - meglio fallire prima di aver toccato Postgres, cosi'
  // l'utente puo' riprovare l'intera operazione da uno stato ancora consistente. Il delete
  // di Postgres da solo e' un'operazione locale, molto piu' affidabile, e cascata gia' su
  // vehicles/devices/trips/preset_routes tramite le regole onDelete dello schema (vedi
  // Vehicle - Cascade - e i suoi stessi figli).
  app.delete("/me", async (req, reply) => {
    const u = req.authUser!;
    await deleteFirebaseUser(u.firebaseUid);
    await prisma.user.delete({ where: { id: u.id } });
    return reply.code(204).send();
  });

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

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.code(404).send({ error: "User not found" });

      if (user.subscriptionStatus !== "PREMIUM" || (user.subscriptionExpiresAt && user.subscriptionExpiresAt < new Date())) {
        return reply.code(403).send({ error: "SUBSCRIPTION_REQUIRED" });
      }

      const pairing = await prisma.pairingRequest.findUnique({ where: { code: code.trim().toUpperCase() } });
      if (!pairing || pairing.status !== "pending" || pairing.expiresAt < new Date()) {
        return reply.code(400).send({ error: "Invalid or expired code" });
      }

      if (pairing.headunitId) {
        const hasSeenThisHeadunit = await prisma.deviceHistory.findFirst({
          where: { userId, headunitId: pairing.headunitId }
        });

        if (!hasSeenThisHeadunit) {
          const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
          const history = await prisma.deviceHistory.findMany({
            where: { userId, firstPairedAt: { gte: oneYearAgo } },
            select: { headunitId: true },
            distinct: ['headunitId'],
          });
          const headunitSwapsUsed = history.length;
          const baseSwaps = user.subscriptionTier === 'GARAGE' ? 5 : 2;
          const headunitSwapsMax = baseSwaps + user.extraDeviceSwaps;

          if (headunitSwapsUsed >= headunitSwapsMax) {
            return reply.code(403).send({ error: "SWAP_LIMIT_EXCEEDED" });
          }
        }
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
          headunitId: pairing.headunitId,
        },
      });

      if (pairing.headunitId) {
        const existingHistory = await prisma.deviceHistory.findFirst({
          where: { userId, headunitId: pairing.headunitId }
        });
        if (existingHistory) {
          await prisma.deviceHistory.update({
            where: { id: existingHistory.id },
            data: { lastPairedAt: new Date(), isActive: true }
          });
        } else {
          await prisma.deviceHistory.create({
            data: { userId, headunitId: pairing.headunitId }
          });
        }
      }

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
          startLabel: true,
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

  // Recupero indirizzi mancanti per i trip caricati PRIMA del fallback di geocoding
  // lato server (vedi routes/device.ts) - quelli restano "Percorso GPS" per sempre senza
  // questo, anche se la traccia GPX (e quindi i punti da geocodificare) ce l'hanno gia'.
  // Innescato manualmente dal web (un bottone), non automatico: e' un servizio pubblico
  // gratuito (Nominatim), non ha senso interrogarlo in background senza che l'utente lo
  // chieda esplicitamente. Sequenziale con una piccola pausa tra le chiamate, non
  // parallelo, per restare nei limiti d'uso ragionevoli di un servizio gratuito.
  app.post("/vehicles/:id/backfill-addresses", async (req, reply) => {
    const { id } = req.params as { id: string };
    const owned = await loadOwnedVehicle(req.authUser!.id, id);
    if (!owned) return reply.code(404).send({ error: "Vehicle not found" });

    // Un batch alla volta (non tutti insieme): tra il rate limit di Nominatim (~1
    // richiesta/secondo) e i trip che ne servono fino a 2 ciascuno, uno storico grande
    // rischierebbe di far scadere il timeout del reverse proxy davanti al server. Il
    // "remaining" nella risposta dice al web se richiamare ancora.
    const BATCH_SIZE = 20;
    const where = { vehicleId: id, gpxRaw: { not: null }, OR: [{ label: null }, { startLabel: null }] };
    const [totalMissing, trips] = await Promise.all([
      prisma.trip.count({ where }),
      prisma.trip.findMany({ where, take: BATCH_SIZE, select: { id: true, label: true, startLabel: true, gpxRaw: true } }),
    ]);

    let updated = 0;
    for (const t of trips) {
      if (!t.gpxRaw) continue;
      const points = firstAndLastPoint(t.gpxRaw);
      if (!points) continue;

      const data: { label?: string; startLabel?: string } = {};
      if (!t.label) {
        const l = await reverseGeocode(points.last.lat, points.last.lon);
        if (l) data.label = l;
      }
      if (!t.startLabel) {
        const sl = await reverseGeocode(points.first.lat, points.first.lon);
        if (sl) data.startLabel = sl;
      }
      if (Object.keys(data).length > 0) {
        await prisma.trip.update({ where: { id: t.id }, data });
        updated++;
      }
      // Un rispetto minimo verso un servizio gratuito condiviso - vedi la policy d'uso di
      // Nominatim (max ~1 richiesta/secondo).
      await new Promise((r) => setTimeout(r, 1100));
    }

    return reply.send({ scanned: trips.length, updated, remaining: totalMissing - updated });
  });

  // Ricalcolo km EV/HEV per i trip AUTO gia' caricati - vedi lib/gpxEnergy.ts per il perche'
  // (ID_EV_MILEAGE/ID_HEV_MILEAGE via VDB confermati inaffidabili sul campo 2026-08-01, gia'
  // rimossi lato Android per i nuovi upload). A differenza di backfill-addresses qui non c'e'
  // nessun servizio esterno da rispettare (solo regex + calcolo su un campo gia' in DB), un
  // solo giro basta - nessun batch/"remaining" da gestire. Sovrascrive SEMPRE (non solo se
  // null): a differenza degli indirizzi mancanti, qui i valori esistenti sono per definizione
  // quelli vecchi/sbagliati (dal VDB), non "gia' corretti da non toccare".
  app.post("/vehicles/:id/backfill-energy-km", async (req, reply) => {
    const { id } = req.params as { id: string };
    const owned = await loadOwnedVehicle(req.authUser!.id, id);
    if (!owned) return reply.code(404).send({ error: "Vehicle not found" });

    const trips = await prisma.trip.findMany({
      where: { vehicleId: id, kind: "auto", gpxRaw: { not: null } },
      select: { id: true, gpxRaw: true },
    });

    let updated = 0;
    for (const t of trips) {
      if (!t.gpxRaw) continue;
      const result = computeKmByBucket(t.gpxRaw);
      if (!result) continue;
      await prisma.trip.update({ where: { id: t.id }, data: { kmEv: result.kmEv, kmHev: result.kmHev } });
      updated++;
    }

    return reply.send({ scanned: trips.length, updated });
  });

  app.get("/trips/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const trip = await prisma.trip.findUnique({ where: { id }, include: { vehicle: true } });
    if (!trip || trip.vehicle.userId !== req.authUser!.id) {
      return reply.code(404).send({ error: "Trip not found" });
    }
    const { vehicle, ...rest } = trip;

    // Ripartizione flusso energia per i MANUALI (richiesta esplicita 2026-08-02) - calcolata
    // al volo dai trip AUTO che si sovrappongono al range [startedAt, endedAt] di questo
    // manuale (vedi lib/gpxEnergy.ts computeFlowBreakdownForRange() per il perche' e'
    // possibile: il tracciamento automatico gira sempre in parallelo). Mai persistita sul
    // trip manuale stesso: se arrivano altri trip AUTO in futuro per lo stesso intervallo
    // (non dovrebbe succedere, ma il calcolo e' comunque a costo quasi nullo), il prossimo
    // GET la ricalcola gia' aggiornata. Nessun calcolo se il trip e' ancora aperto (endedAt
    // null - range non ancora definito) o non e' manuale.
    if (trip.kind === "manual" && trip.endedAt) {
      const overlapping = await prisma.trip.findMany({
        where: {
          vehicleId: trip.vehicleId,
          kind: "auto",
          gpxRaw: { not: null },
          startedAt: { lte: trip.endedAt },
          OR: [{ endedAt: { gte: trip.startedAt } }, { endedAt: null }],
        },
        select: { gpxRaw: true },
      });
      if (overlapping.length) {
        const breakdown = computeFlowBreakdownForRange(
          overlapping.map((t) => t.gpxRaw!),
          trip.startedAt,
          trip.endedAt,
        );
        if (breakdown) {
          return reply.send({
            ...rest,
            pctEv: breakdown.pctEv,
            pctSeries: breakdown.pctSeries,
            pctParallel: breakdown.pctParallel,
            pctOther: breakdown.pctOther,
          });
        }
      }
    }

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

    // "kind" opzionale (2026-07-26): aggiunto per il dettaglio di un trip manuale (vedi
    // jaedrive_todo #15), che vuole le statistiche calcolate SOLO sui trip AUTO caduti nel
    // suo range di date - lo stesso filtro gia' supportato da GET .../trips.
    //
    // BUG TROVATO SUL CAMPO (2026-08-01): quando "kind" non e' specificato (il caso della
    // dashboard principale, vedi VehicleStatsPanel.tsx) il default era "nessun filtro",
    // cioe' AUTO + MANUAL sommati insieme in totals.km/totals.liters - ma i trip manuali
    // (Trip A/B) sono accumulatori che sommano km/litri ad OGNI lettura VDB indipendentemente
    // dal viaggio automatico a marcia (vedi Android ManualTripComputer), quindi non sono una
    // partizione distinta della guida ma una vista che si SOVRAPPONE agli stessi trip AUTO -
    // sommarli assieme conta due (o piu') volte lo stesso carburante realmente consumato.
    // Utente ha segnalato esattamente questo: "sembra abbia fatto due pieni" con un solo
    // pieno reale. Default ora "auto" (stessa scelta gia' fatta per /stats/calendar, stessa
    // motivazione), non piu' "nessun filtro" - un chiamante che vuole esplicitamente un altro
    // kind puo' ancora richiederlo via query string.
    const { from, to, kind } = req.query as { from?: string; to?: string; kind?: string };
    const where = {
      vehicleId: id,
      kind: kind ?? "auto",
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

    return reply.send(computeVehicleStats(trips));
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

    // Solo AUTO: i trip manuali sono accumulatori che l'utente puo' resettare dopo giorni o
    // settimane, il loro startedAt/endedAt non rappresenta un vero "quel giorno" - inclusi
    // sfaserebbero pesantemente km/durata/consumo attribuiti a un singolo giorno (l'utente
    // ha segnalato proprio il conteggio ore alla guida come il caso piu' evidente).
    const trips = await prisma.trip.findMany({
      where: { vehicleId: id, kind: "auto", startedAt: { gte: from, lt: to } },
      select: { startedAt: true, endedAt: true, km: true, liters: true },
    });

    const byDay = new Map<
      string,
      { km: number; liters: number; durationMin: number; tripCount: number }
    >();
    for (const t of trips) {
      const day = t.startedAt.toISOString().slice(0, 10);
      const entry = byDay.get(day) ?? { km: 0, liters: 0, durationMin: 0, tripCount: 0 };
      entry.km += t.km ?? 0;
      entry.liters += t.liters ?? 0;
      if (t.endedAt) entry.durationMin += (t.endedAt.getTime() - t.startedAt.getTime()) / 60000;
      entry.tripCount += 1;
      byDay.set(day, entry);
    }

    return reply.send({
      year: y,
      days: Array.from(byDay.entries())
        .map(([date, v]) => ({
          date,
          km: v.km,
          liters: v.liters,
          durationMin: Math.round(v.durationMin),
          tripCount: v.tripCount,
          // km totali / litri totali del giorno (non media tra viaggi, vedi stats.ts
          // consumptionTrend): un viaggio elettrico a 0 litri pesa sul numeratore invece
          // di essere scartato come dato mancante. Indefinito (null) solo se il giorno e'
          // stato interamente elettrico (0 litri totali).
          avgConsumption: v.liters > 0 ? v.km / v.liters : null,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
  });

  // Ricerca indirizzo per l'editor mappa dei percorsi preimpostati (jaedrive_todo #14,
  // vedi RouteMapEditor.tsx/AddressSearch.tsx) - proxy verso Nominatim invece di chiamarlo
  // direttamente dal browser (stesso User-Agent/policy gia' usati per il reverse geocoding
  // in lib/geocode.ts). Rate-limited perche' l'utente digita interattivamente (una chiamata
  // per ogni ricerca, debounced lato client, ma comunque piu' frequente di un'azione
  // esplicita come pairing/claim).
  app.get(
    "/geocode/search",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { q } = req.query as { q?: string };
      if (!q || q.trim().length < 3) return reply.send([]);
      const results = await searchAddress(q.trim());
      return reply.send(results);
    },
  );

  // Percorsi preimpostati (jaedrive_todo #14) - vedi PresetRoute in schema.prisma per il
  // perche' non c'e' una UI di disegno mappa: un percorso si crea scegliendo un trip AUTO
  // gia' esistente come "modello", le sue coordinate di partenza/arrivo diventano quelle
  // del percorso. Elenco leggero (nessun conteggio match qui: richiederebbe leggere il
  // gpxRaw di ogni trip AUTO per ogni percorso, costoso - il conteggio si vede aprendo il
  // dettaglio del singolo percorso).
  app.get("/vehicles/:id/routes", async (req, reply) => {
    const { id } = req.params as { id: string };
    const owned = await loadOwnedVehicle(req.authUser!.id, id);
    if (!owned) return reply.code(404).send({ error: "Vehicle not found" });

    const routes = await prisma.presetRoute.findMany({
      where: { vehicleId: id },
      orderBy: { createdAt: "asc" },
    });
    return reply.send(routes);
  });

  app.post(
    "/vehicles/:id/routes",
    {
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 80 },
            // Due modi di specificare partenza/arrivo (jaedrive_todo #14): "sourceTripId"
            // (scorciatoia da TripDetail.tsx, "Salva come percorso" su un trip gia'
            // esistente) oppure le quattro coordinate esplicite (dall'editor mappa,
            // RouteMapEditor.tsx) - validato nell'handler, non nello schema, perche' e' un
            // OR fra due gruppi di campi che JSON Schema esprimerebbe in modo piu' contorto
            // di un semplice if.
            sourceTripId: { type: "string" },
            startLat: { type: "number", minimum: -90, maximum: 90 },
            startLon: { type: "number", minimum: -180, maximum: 180 },
            endLat: { type: "number", minimum: -90, maximum: 90 },
            endLon: { type: "number", minimum: -180, maximum: 180 },
            radiusMeters: { type: "number", minimum: MIN_ROUTE_RADIUS_M, maximum: MAX_ROUTE_RADIUS_M },
            roundTrip: { type: "boolean" },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const owned = await loadOwnedVehicle(req.authUser!.id, id);
      if (!owned) return reply.code(404).send({ error: "Vehicle not found" });

      const { name, sourceTripId, startLat, startLon, endLat, endLon, radiusMeters, roundTrip } = req.body as {
        name: string;
        sourceTripId?: string;
        startLat?: number;
        startLon?: number;
        endLat?: number;
        endLon?: number;
        radiusMeters?: number;
        roundTrip?: boolean;
      };

      let start: { lat: number; lon: number };
      let end: { lat: number; lon: number };

      if (sourceTripId) {
        const sourceTrip = await prisma.trip.findFirst({ where: { id: sourceTripId, vehicleId: id, kind: "auto" } });
        if (!sourceTrip) return reply.code(404).send({ error: "Source trip not found" });
        if (!sourceTrip.gpxRaw) return reply.code(400).send({ error: "Source trip has no GPS track" });
        const points = firstAndLastPoint(sourceTrip.gpxRaw);
        if (!points) return reply.code(400).send({ error: "Could not extract start/end points from source trip" });
        start = points.first;
        end = points.last;
      } else if (startLat != null && startLon != null && endLat != null && endLon != null) {
        start = { lat: startLat, lon: startLon };
        end = { lat: endLat, lon: endLon };
      } else {
        return reply.code(400).send({ error: "Provide either sourceTripId or startLat/startLon/endLat/endLon" });
      }

      const route = await prisma.presetRoute.create({
        data: {
          vehicleId: id,
          name,
          startLat: start.lat,
          startLon: start.lon,
          endLat: end.lat,
          endLon: end.lon,
          radiusMeters: radiusMeters ?? DEFAULT_ROUTE_RADIUS_M,
          roundTrip: roundTrip ?? false,
        },
      });
      return reply.code(201).send(route);
    },
  );

  app.patch(
    "/vehicles/:id/routes/:routeId",
    {
      schema: {
        body: {
          type: "object",
          minProperties: 1,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 80 },
            radiusMeters: { type: "number", minimum: MIN_ROUTE_RADIUS_M, maximum: MAX_ROUTE_RADIUS_M },
            startLat: { type: "number", minimum: -90, maximum: 90 },
            startLon: { type: "number", minimum: -180, maximum: 180 },
            endLat: { type: "number", minimum: -90, maximum: 90 },
            endLon: { type: "number", minimum: -180, maximum: 180 },
            roundTrip: { type: "boolean" },
          },
        },
      },
    },
    async (req, reply) => {
      const { id, routeId } = req.params as { id: string; routeId: string };
      const owned = await loadOwnedVehicle(req.authUser!.id, id);
      if (!owned) return reply.code(404).send({ error: "Vehicle not found" });

      const existing = await prisma.presetRoute.findFirst({ where: { id: routeId, vehicleId: id } });
      if (!existing) return reply.code(404).send({ error: "Route not found" });

      const { name, radiusMeters, startLat, startLon, endLat, endLon, roundTrip } = req.body as {
        name?: string;
        radiusMeters?: number;
        startLat?: number;
        startLon?: number;
        endLat?: number;
        endLon?: number;
        roundTrip?: boolean;
      };
      const route = await prisma.presetRoute.update({
        where: { id: routeId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(radiusMeters !== undefined ? { radiusMeters } : {}),
          ...(startLat !== undefined ? { startLat } : {}),
          ...(startLon !== undefined ? { startLon } : {}),
          ...(endLat !== undefined ? { endLat } : {}),
          ...(endLon !== undefined ? { endLon } : {}),
          ...(roundTrip !== undefined ? { roundTrip } : {}),
        },
      });
      return reply.send(route);
    },
  );

  app.delete("/vehicles/:id/routes/:routeId", async (req, reply) => {
    const { id, routeId } = req.params as { id: string; routeId: string };
    const owned = await loadOwnedVehicle(req.authUser!.id, id);
    if (!owned) return reply.code(404).send({ error: "Vehicle not found" });

    const existing = await prisma.presetRoute.findFirst({ where: { id: routeId, vehicleId: id } });
    if (!existing) return reply.code(404).send({ error: "Route not found" });

    await prisma.presetRoute.delete({ where: { id: routeId } });
    return reply.code(204).send();
  });

  // Dettaglio percorso: quali trip AUTO lo hanno effettivamente percorso (partenza E arrivo
  // entro radiusMeters dal percorso, haversine - vedi lib/geo.ts) + le statistiche
  // aggregate su quel sottoinsieme, riusando la stessa aggregazione di GET .../stats (vedi
  // lib/stats.ts). Legge il gpxRaw di OGNI trip AUTO del veicolo per calcolare il match
  // (nessuna coordinata di partenza/arrivo e' salvata separatamente sul trip) - accettabile
  // alla scala personale di questo progetto (vedi lo stesso trade-off gia' documentato su
  // GET .../stats), ma e' l'endpoint piu' pesante di questo file: select ridotta al minimo
  // indispensabile (id/startedAt/gpxRaw) per limitare il danno.
  //
  // Andata/ritorno (route.roundTrip, richiesta esplicita 2026-08-02): se abilitato, un trip
  // che NON matcha in avanti (partenza~route.start, arrivo~route.end) viene ricontrollato
  // anche al CONTRARIO (partenza~route.end, arrivo~route.start) - se combacia e' un "return"
  // invece di un "outbound". Nessuna nuova colonna sul trip: la direzione resta calcolata al
  // volo come il match stesso, mai persistita. ?direction=outbound|return|all (default "all")
  // filtra sia l'elenco che le statistiche restituite; "counts" riflette invece SEMPRE il
  // totale non filtrato, cosi' la UI puo' mostrare i numeri sulle tab senza un'altra chiamata.
  app.get("/vehicles/:id/routes/:routeId", async (req, reply) => {
    const { id, routeId } = req.params as { id: string; routeId: string };
    const owned = await loadOwnedVehicle(req.authUser!.id, id);
    if (!owned) return reply.code(404).send({ error: "Vehicle not found" });

    const route = await prisma.presetRoute.findFirst({ where: { id: routeId, vehicleId: id } });
    if (!route) return reply.code(404).send({ error: "Route not found" });

    const { direction } = req.query as { direction?: "outbound" | "return" | "all" };

    const candidates = await prisma.trip.findMany({
      where: { vehicleId: id, kind: "auto", gpxRaw: { not: null } },
      select: { id: true, gpxRaw: true },
    });

    const directionById = new Map<string, "outbound" | "return">();
    for (const c of candidates) {
      const points = firstAndLastPoint(c.gpxRaw!);
      if (!points) continue;
      const startOk = haversineMeters(points.first, { lat: route.startLat, lon: route.startLon }) <= route.radiusMeters;
      const endOk = haversineMeters(points.last, { lat: route.endLat, lon: route.endLon }) <= route.radiusMeters;
      if (startOk && endOk) {
        directionById.set(c.id, "outbound");
        continue;
      }
      if (!route.roundTrip) continue;
      const startReturnOk = haversineMeters(points.first, { lat: route.endLat, lon: route.endLon }) <= route.radiusMeters;
      const endReturnOk = haversineMeters(points.last, { lat: route.startLat, lon: route.startLon }) <= route.radiusMeters;
      if (startReturnOk && endReturnOk) directionById.set(c.id, "return");
    }

    const counts = { outbound: 0, return: 0 };
    for (const d of directionById.values()) counts[d]++;

    const wantedDirection = direction === "outbound" || direction === "return" ? direction : null;
    const idsArray = Array.from(directionById.entries())
      .filter(([, d]) => !wantedDirection || d === wantedDirection)
      .map(([tripId]) => tripId);

    // Due select separate sugli stessi id: quella "lista" rispecchia TripSummary (leggera,
    // e' quella che il web mostra come elenco), quella "stats" ha i campi in piu' che
    // servono solo a computeVehicleStats() (stessa select gia' usata da GET .../stats) - piu'
    // pulito di allargare ROUTE_TRIP_SELECT con campi che la UI della lista non usa.
    const [matchedTrips, statsTrips] = idsArray.length
      ? await Promise.all([
          prisma.trip.findMany({ where: { id: { in: idsArray } }, orderBy: { startedAt: "desc" }, select: ROUTE_TRIP_SELECT }),
          prisma.trip.findMany({
            where: { id: { in: idsArray } },
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
          }),
        ])
      : [[], []];

    const tripsWithDirection = matchedTrips.map((t) => ({ ...t, direction: directionById.get(t.id) ?? null }));

    return reply.send({
      route,
      trips: tripsWithDirection,
      stats: computeVehicleStats(statsTrips),
      counts,
    });
  });
}
