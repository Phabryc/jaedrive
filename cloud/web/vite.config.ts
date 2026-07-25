import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-only proxy so the SPA can call relative /api/... paths exactly like it will in
// production, where the same Fastify process serves both - see cloud/DESIGN.md §2/§13.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
