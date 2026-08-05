import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { deviceRoutes } from "./routes/device.js";
import { userRoutes } from "./routes/user.js";
import { adminRoutes } from "./routes/admin.js";

import { startSubscriptionNotifierCron } from "./cron/subscriptionNotifier.js";
import { startPairingCleanupCron } from "./cron/pairingCleanup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({
  logger: env.nodeEnv === "development" ? { transport: { target: "pino-pretty" } } : true,
});

// Bearer-token APIs only (no cookies/ambient credentials involved), so a permissive,
// reflected-origin CORS policy carries no CSRF-style risk and keeps the Vite dev server
// (a different origin/port than the API in local dev) working without extra config.
await app.register(fastifyCors, { origin: true });

await app.register(fastifyRateLimit, { global: false });

await app.register(deviceRoutes, { prefix: "/api/device" });
await app.register(userRoutes, { prefix: "/api/user" });
await app.register(adminRoutes, { prefix: "/api/admin" });

// Start automated subscription notifier cron
startSubscriptionNotifierCron();
startPairingCleanupCron();

// Serves the built React SPA (see cloud/web) from the same process/port as the API - no
// separate frontend container, see DESIGN.md §2 and §13.
const webDist = path.join(__dirname, "../../web/dist");
await app.register(fastifyStatic, { root: webDist });
app.setErrorHandler((error, req, reply) => {
  app.log.error(error);
  reply.status(error.statusCode ?? 500).send({
    error: error.message || "Internal server error",
  });
});

app.setNotFoundHandler((req, reply) => {
  if (req.raw.url?.startsWith("/api/")) {
    return reply.code(404).send({ error: "Not found" });
  }
  return reply.sendFile("index.html");
});

app.listen({ port: env.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
