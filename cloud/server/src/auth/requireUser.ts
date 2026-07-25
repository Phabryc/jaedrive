import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyFirebaseIdToken } from "./firebase.js";
import { prisma } from "../db.js";

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

  // Best-effort prefill from the identity provider - present for Google sign-in
  // (decoded.name/decoded.picture), absent for plain email/password (where the user
  // completes these in the web onboarding gate instead, see RequireProfile.tsx).
  const nameParts = decoded.name ? decoded.name.trim().split(/\s+/) : [];
  const firstName = nameParts.length > 0 ? nameParts[0] : null;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;
  const photoUrl = typeof decoded.picture === "string" ? decoded.picture : null;

  const existing = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          email: decoded.email ?? undefined,
          lastLoginAt: new Date(),
          // Backfill only fields still null - never overwrite a value the user (or an
          // earlier login) already set, but DO fill in accounts that were created before
          // this prefill existed, or that were missing it for any other reason (e.g. this
          // row's very first login happened before Google's claims were being read).
          firstName: existing.firstName ?? firstName ?? undefined,
          lastName: existing.lastName ?? lastName ?? undefined,
          photoUrl: existing.photoUrl ?? photoUrl ?? undefined,
        },
      })
    : await prisma.user.create({
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

  req.authUser = user;
}
