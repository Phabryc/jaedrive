import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireUser } from "../auth/requireUser.js";
import { env } from "../env.js";
import { sendTransactionalEmail, type EmailTemplateType } from "../lib/email.js";
import type { Language } from "../lib/emailTemplates.js";

async function requireAdmin(req: any, reply: any) {
  const user = req.authUser!;
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const isAdmin = dbUser?.role === "ADMIN" || env.adminEmails.includes(user.email ?? "");
  if (!isAdmin) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);
  app.addHook("preHandler", requireAdmin);

  app.get("/users", async (req, reply) => {
    const { q, role, status } = req.query as { q?: string; role?: string; status?: string };

    const where: any = {};
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (role) where.role = role;
    if (status) where.subscriptionStatus = status;

    const users = await prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    const mappedUsers = await Promise.all(
      users.map(async (u) => {
        const activeVehiclesCount = await prisma.vehicle.count({ where: { userId: u.id } });
        const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        let headunitSwaps = 0;
        try {
          const history = await (prisma as any).deviceHistory?.findMany({
            where: { userId: u.id, firstPairedAt: { gte: oneYearAgo } },
            select: { headunitId: true },
            distinct: ['headunitId'],
          });
          if (history) headunitSwaps = history.length;
        } catch {}

        const subscriptionTier = u.subscriptionTier ?? "STANDARD";
        const maxVehicles = subscriptionTier === "GARAGE" ? 3 : 1;
        const baseSwaps = subscriptionTier === "GARAGE" ? 5 : 2;
        const maxHeadunitSwaps = baseSwaps + (u.extraDeviceSwaps ?? 0);

        return {
          ...u,
          subscriptionStatus: u.subscriptionStatus ?? "FREE",
          subscriptionTier,
          subscriptionExpiresAt: u.subscriptionExpiresAt,
          subscription: {
            status: u.subscriptionStatus ?? "FREE",
            tier: subscriptionTier,
            expiresAt: u.subscriptionExpiresAt ? u.subscriptionExpiresAt.toISOString() : null,
            activeVehicles: activeVehiclesCount,
            activeVehiclesCount,
            maxVehicles,
            headunitSwaps,
            maxHeadunitSwaps,
          },
        };
      })
    );
    return reply.send(mappedUsers);
  });

  app.post(
    "/users/:userId/subscription",
    {
      schema: {
        body: {
          type: "object",
          required: ["status", "tier"],
          properties: {
            status: { type: "string", enum: ["FREE", "PREMIUM"] },
            tier: { type: "string", enum: ["STANDARD", "GARAGE"] },
            expiresAt: { type: "string", nullable: true },
            notes: { type: "string", nullable: true },
          },
        },
      },
    },
    async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const { status, tier, expiresAt, notes } = req.body as {
      status: string;
      tier: string;
      expiresAt: string | null;
      notes?: string;
    };

    const prevUser = await prisma.user.findUnique({ where: { id: userId } });
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: status,
        subscriptionTier: tier,
        subscriptionExpiresAt: expiresAt ? new Date(expiresAt) : null,
      }
    });

    await prisma.subscriptionLog.create({
      data: {
        userId,
        status,
        tier,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        notes,
        createdBy: req.authUser!.id,
      }
    });

    if (updatedUser.email) {
      const name = updatedUser.firstName ?? updatedUser.displayName ?? null;
      const dateStr = expiresAt ? new Date(expiresAt).toISOString() : null;
      if (status === "PREMIUM" && prevUser?.subscriptionStatus !== "PREMIUM") {
        await sendTransactionalEmail("SUBSCRIPTION_ACTIVATED", updatedUser.email, { name, tier, expiresAt: dateStr });
      } else if (status === "PREMIUM") {
        await sendTransactionalEmail("SUBSCRIPTION_RENEWED", updatedUser.email, { name, tier, expiresAt: dateStr });
      } else {
        await sendTransactionalEmail("SUBSCRIPTION_EXPIRED", updatedUser.email, { name });
      }
    }

    return reply.send(updatedUser);
  });

  app.post(
    "/users/:userId/extra-swaps",
    {
      // "extraSwaps" e' opzionale (default 1): il pulsante Admin esistente
      // (handleAddExtraSwap in AdminDashboard.tsx) chiama questa route senza body,
      // intende sempre "+1" - required qui romperebbe quel pulsante.
      schema: {
        body: {
          type: "object",
          properties: { extraSwaps: { type: "integer", minimum: -1000, maximum: 1000 } },
        },
      },
    },
    async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const { extraSwaps } = (req.body ?? {}) as { extraSwaps?: number };

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        extraDeviceSwaps: { increment: extraSwaps ?? 1 }
      }
    });

    return reply.send(updatedUser);
  });

  app.patch(
    "/users/:userId/role",
    {
      schema: {
        body: {
          type: "object",
          required: ["role"],
          properties: { role: { type: "string", enum: ["USER", "ADMIN"] } },
        },
      },
    },
    async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const { role } = req.body as { role: string };

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role }
    });

    return reply.send(updatedUser);
  });

  app.get("/discount-codes", async (req, reply) => {
    const codes = await prisma.discountCode.findMany({ orderBy: { createdAt: 'desc' } });
    return reply.send(codes);
  });

  app.post(
    "/discount-codes",
    {
      schema: {
        body: {
          type: "object",
          required: ["code", "discountType", "value"],
          properties: {
            code: { type: "string", minLength: 1, maxLength: 50 },
            discountType: { type: "string", enum: ["FREE_DAYS", "PERCENT", "FIXED_AMOUNT"] },
            value: { type: "number" },
            maxUses: { type: "integer", nullable: true },
            expiresAt: { type: "string", nullable: true },
            isGlobal: { type: "boolean", nullable: true },
            assignedEmail: { type: "string", nullable: true },
          },
        },
      },
    },
    async (req, reply) => {
    const data = req.body as {
      code: string;
      discountType: string;
      value: number;
      maxUses?: number;
      expiresAt?: string;
      isGlobal?: boolean;
      assignedEmail?: string;
    };
    const code = await prisma.discountCode.create({
      data: {
        ...data,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      }
    });

    if (code.assignedEmail) {
      await sendTransactionalEmail("DISCOUNT_CODE_ASSIGNED", code.assignedEmail, {
        code: code.code,
        discountType: code.discountType,
        value: code.value,
      });
    }

    return reply.send(code);
  });

  app.delete("/discount-codes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.discountCode.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.post("/test-email", async (req, reply) => {
    const { type, to, lang, name, tier, expiresAt, daysLeft, vehicleName, vin, code, discountType, value } = req.body as {
      type: EmailTemplateType;
      to: string;
      lang?: Language;
      name?: string;
      tier?: string;
      expiresAt?: string;
      daysLeft?: number;
      vehicleName?: string;
      vin?: string;
      code?: string;
      discountType?: string;
      value?: number;
    };

    if (!type || !to) {
      return reply.code(400).send({ error: "Missing type or to parameters" });
    }

    const res = await sendTransactionalEmail(type, to, {
      lang: lang ?? "it",
      name: name || "Test User",
      tier: tier || "STANDARD",
      expiresAt: expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      daysLeft: daysLeft ? Number(daysLeft) : 10,
      vehicleName: vehicleName || "Jaecoo 7 PHEV",
      vin: vin || "LVVDB21A5MD123456",
      code: code || "TESTPROMO8",
      discountType: discountType || "FREE_DAYS",
      value: value ? Number(value) : 30,
    });

    return reply.send({ ok: true, subject: res.subject });
  });

  // Rete di sicurezza per lo scenario "VIN/ivi_sn squatting" (vedi agent_log.md e
  // cloud/DESIGN.md §14/§15): oggi il primo che reclama un VIN/ivi_sn mai visto vince per
  // sempre (unique constraint su vehicles.vin), e non esiste altro modo di liberarlo per il
  // vero proprietario rimasto bloccato con un 409. Lookup by VIN cosi' l'admin (che di
  // solito conosce solo il VIN segnalato dall'utente, non l'id interno) puo' vedere chi lo
  // ha reclamato prima di decidere se sganciarlo.
  app.get("/vehicles/lookup", async (req, reply) => {
    const { vin } = req.query as { vin?: string };
    if (!vin || vin.trim().length < 5) return reply.code(400).send({ error: "Missing or invalid vin" });

    const vehicle = await prisma.vehicle.findUnique({
      where: { vin: vin.trim().toUpperCase() },
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
    if (!vehicle) return reply.code(404).send({ error: "No vehicle claims this VIN" });

    return reply.send({
      id: vehicle.id,
      vin: vehicle.vin,
      nickname: vehicle.nickname,
      brand: vehicle.brand,
      model: vehicle.model,
      createdAt: vehicle.createdAt,
      owner: vehicle.user,
    });
  });

  // Cancella il veicolo (cascata su devices/trips/presetRoutes, stesse regole gia' usate da
  // DELETE /api/user/vehicles/:id) cosi' il VIN torna reclamabile con un nuovo pairing - uso
  // previsto: supporto manuale dopo che un utente segnala di non riuscire ad associare la
  // propria auto reale perche' qualcun altro l'ha gia' reclamata.
  app.delete("/vehicles/:vehicleId", async (req, reply) => {
    const { vehicleId } = req.params as { vehicleId: string };
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) return reply.code(404).send({ error: "Vehicle not found" });

    await prisma.vehicle.delete({ where: { id: vehicleId } });
    return reply.code(204).send();
  });

  app.get("/stats", async (req, reply) => {
    const totalUsers = await prisma.user.count();
    const activeSubscriptions = await prisma.user.count({ where: { subscriptionStatus: 'PREMIUM' } });
    const headunits = await prisma.device.count({ where: { headunitId: { not: null } } });
    const totalTrips = await prisma.trip.count();

    return reply.send({
      totalUsers,
      activeSubscriptions,
      headunits,
      totalTrips,
    });
  });
}
