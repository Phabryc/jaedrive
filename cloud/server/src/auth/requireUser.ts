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

  // Best-effort prefill from the identity provider, only on first creation - present for
  // Google sign-in (decoded.name/decoded.picture), absent for plain email/password (where
  // the user completes these in the web onboarding gate instead, see RequireProfile.tsx).
  // Never overwritten on later logins so it doesn't clobber a user's own edits.
  const nameParts = decoded.name ? decoded.name.trim().split(/\s+/) : [];
  const firstName = nameParts.length > 0 ? nameParts[0] : null;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

  const user = await prisma.user.upsert({
    where: { firebaseUid: decoded.uid },
    update: {
      email: decoded.email ?? undefined,
      lastLoginAt: new Date(),
    },
    create: {
      firebaseUid: decoded.uid,
      email: decoded.email ?? null,
      displayName: decoded.name ?? null,
      firstName,
      lastName,
      photoUrl: typeof decoded.picture === "string" ? decoded.picture : null,
      lastLoginAt: new Date(),
    },
  });

  req.authUser = user;
}
