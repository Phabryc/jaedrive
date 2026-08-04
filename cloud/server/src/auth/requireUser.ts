import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyFirebaseIdToken } from "./firebase.js";
import { prisma } from "../db.js";
import { env } from "../env.js";

// preHandler for all /api/user/* routes. Verifies a Firebase ID token and lazily
// creates/updates the mirrored `users` row - this service never stores credentials itself.
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  if (!idToken) {
    return reply.code(401).send({ error: "Missing bearer token" });
  }

  let decoded;
  try {
    decoded = await verifyFirebaseIdToken(idToken);
  } catch {
    return reply.code(401).send({ error: "Invalid or expired token" });
  }

  const nameParts = decoded.name ? decoded.name.trim().split(/\s+/) : [];
  const firstName = nameParts.length > 0 ? nameParts[0] : null;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;
  const photoUrl = typeof decoded.picture === "string" ? decoded.picture : null;

  const existing = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  const isAdminEmail = Boolean(decoded.email && env.adminEmails.includes(decoded.email));
  const targetRole = isAdminEmail ? "ADMIN" : (existing?.role ?? "USER");

  let user: any = existing;

  if (existing) {
    try {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          email: decoded.email ?? undefined,
          lastLoginAt: new Date(),
          role: targetRole,
          firstName: existing.firstName ?? firstName ?? undefined,
          lastName: existing.lastName ?? lastName ?? undefined,
          photoUrl: existing.photoUrl ?? photoUrl ?? undefined,
        },
      });
    } catch (err) {
      console.warn("prisma.user.update with role failed, trying fallback without role:", err);
      try {
        user = await prisma.user.update({
          where: { id: existing.id },
          data: {
            email: decoded.email ?? undefined,
            lastLoginAt: new Date(),
            firstName: existing.firstName ?? firstName ?? undefined,
            lastName: existing.lastName ?? lastName ?? undefined,
            photoUrl: existing.photoUrl ?? photoUrl ?? undefined,
          },
        });
      } catch (err2) {
        console.warn("prisma.user.update fallback failed:", err2);
        user = existing;
      }
    }
  } else {
    try {
      user = await prisma.user.create({
        data: {
          firebaseUid: decoded.uid,
          email: decoded.email ?? null,
          displayName: decoded.name ?? null,
          firstName,
          lastName,
          photoUrl,
          role: targetRole,
          lastLoginAt: new Date(),
        },
      });
    } catch (err) {
      console.warn("prisma.user.create with role failed, trying fallback without role:", err);
      user = await prisma.user.create({
        data: {
          firebaseUid: decoded.uid,
          email: decoded.email ?? null,
          displayName: decoded.name ?? null,
          firstName,
          lastName,
          photoUrl,
          lastLoginAt: new Date(),
        },
      });
    }
  }

  req.authUser = {
    ...user,
    role: user?.role ?? (isAdminEmail ? "ADMIN" : "USER"),
  };
}
