/**
 * W5c · the real-API receipt lane for a frontend the preview has not built.
 *
 * The Research preview (scripts/research-preview, loopback :8095) serves the
 * bundle it was built with. To look at *this* tree against the preview's real
 * API, run Vite here and proxy `/api` to the preview, standing in for its
 * gateway: the proxied request carries the stack's public Origin, which the
 * Control API compares on writes. Nothing else is rewritten, and nothing is
 * stubbed — the browser reads exactly what the preview serves.
 *
 *   npx vite --config vite.research-preview.config.ts
 *   RESEARCH_PREVIEW_BASE_URL=http://localhost:5195 \
 *     npx playwright test -c playwright.research-preview.config.ts
 */
import { mergeConfig } from "vite";

import base from "./vite.config.ts";

const TARGET = process.env.RESEARCH_PREVIEW_API ?? "http://127.0.0.1:8095";
const ORIGIN = process.env.RESEARCH_PREVIEW_ORIGIN ?? "https://research-portal.primusspark.com";

export default mergeConfig(base, {
  server: {
    host: "localhost",
    port: Number(process.env.RESEARCH_PREVIEW_VITE_PORT ?? 5195),
    strictPort: true,
    proxy: {
      "/api": { target: TARGET, changeOrigin: true, headers: { origin: ORIGIN } },
    },
  },
});
