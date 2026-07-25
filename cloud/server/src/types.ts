import "fastify";
import type { User, Device } from "@prisma/client";

// Fastify request decorations set by the auth preHandlers (see src/auth). Two completely
// separate identities can be attached depending on route prefix - see DESIGN.md §5 - never
// both on the same request.
declare module "fastify" {
  interface FastifyRequest {
    authUser?: User;
    authDevice?: Device;
  }
}
