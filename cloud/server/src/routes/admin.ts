import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireUser } from "../auth/requireUser.js";
import { env } from "../env.js";
import { sendEmail } from "../lib/email.js";

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

  app.post("/users/:userId/subscription", async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const { status, tier, expiresAt, notes } = req.body as {
      status: string;
      tier: string;
      expiresAt: string | null;
      notes?: string;
    };

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
      await sendEmail({
        to: updatedUser.email,
        subject: "Your JaeDrive Subscription has been updated",
        html: `<p>Your subscription is now <strong>${status}</strong> (${tier}).</p>`,
      });
    }

    return reply.send(updatedUser);
  });

  app.post("/users/:userId/extra-swaps", async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const { extraSwaps } = req.body as { extraSwaps: number };

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        extraDeviceSwaps: { increment: extraSwaps }
      }
    });

    return reply.send(updatedUser);
  });

  app.patch("/users/:userId/role", async (req, reply) => {
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

  app.post("/discount-codes", async (req, reply) => {
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
    return reply.send(code);
  });

  app.delete("/discount-codes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.discountCode.delete({ where: { id } });
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
