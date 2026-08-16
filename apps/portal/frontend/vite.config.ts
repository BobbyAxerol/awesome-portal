import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Planning (features/roadmap-task-board) is embedded as source, not as an
 * iframe (v0.4 §P0.10). Its modules import each other through `@/…`, so the
 * Portal build resolves that alias to the Planning source tree. The Portal's
 * own code never uses `@/` — it uses relative imports — so this alias belongs
 * to the embedded feature alone.
 *
 * This is the reviewed build alias sanctioned by §P0.11 step 1; it becomes a
 * real package boundary at U09.
 */
const planningSrc = fileURLToPath(
  new URL("../../../features/roadmap-task-board/frontend/src", import.meta.url),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": planningSrc },
    // Planning's source tree has its own node_modules. Without dedupe, a bare
    // `react` import from that tree resolves to a second React copy and every
    // hook inside the embedded views throws.
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  define: {
    // Planning's API client defaults to a RELATIVE "api" base, which is only
    // correct when it is served from /roadmap-task-board/. Embedded in the
    // shell it must address the gateway prefix absolutely, from any route.
    "import.meta.env.VITE_ROADMAP_TASK_BOARD_API_BASE": JSON.stringify(
      process.env.VITE_ROADMAP_TASK_BOARD_API_BASE ?? "/roadmap-task-board/api",
    ),
    "import.meta.env.VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY": JSON.stringify(
      process.env.VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY ?? "true",
    ),
    "import.meta.env.VITE_ROADMAP_TASK_BOARD_PERSISTENCE": JSON.stringify(
      process.env.VITE_ROADMAP_TASK_BOARD_PERSISTENCE ?? "legacy",
    ),
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
