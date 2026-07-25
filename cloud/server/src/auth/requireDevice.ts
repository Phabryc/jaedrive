import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../db.js";
import { sha256Hex } from "../lib/tokens.js";

// preHandler for all /api/device/* routes that need an already-paired device (not the
// pairing/start or pairing/status endpoints themselves, which are unauthenticated - see
// DESIGN.md §7). Looks up the device by the sha256 hash of the bearer token; the raw token
// is never stored server-side.
export async function requireDevice(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  if (!token) {
    return reply.code(401).send({ error: "Missing bearer token" });
  }

  const device = await prisma.device.findUnique({
    where: { deviceTokenHash: sha256Hex(token) },
  });
  if (!device) {
    return reply.code(401).send({ error: "Invalid device token" });
  }

  await prisma.device.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });

  req.authDevice = device;
}
