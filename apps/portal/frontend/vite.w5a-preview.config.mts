/**
 * W5a · a Vite dev server proxied to the read-only Research preview (:8095).
 * Local verification only (not a product config): every /api request carries
 * the preview's public Origin, which its Control API checks on writes.
 */
import base from "./vite.config";

const config = typeof base === "function" ? base({ command: "serve", mode: "development" } as never) : base;

export default {
  ...config,
  server: {
    host: "127.0.0.1",
    port: 5199,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8095",
        changeOrigin: false,
        headers: { origin: "https://research-portal.primusspark.com", "x-dev-access-email": "claude-preview@azdag.com" },
      },
    },
  },
};
