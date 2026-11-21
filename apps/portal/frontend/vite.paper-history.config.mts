import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * UXM-07 closeout 3.2 · tiny measurement build of e2e/paper-history-harness (NOT the app, NOT the visual harness).
 * Output goes to PAPER_HISTORY_DIST (default dist-paper-history, untracked). Served by `vite preview` on its own port.
 */
const planningSrc = fileURLToPath(new URL("../../../features/roadmap-task-board/frontend/src", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": planningSrc }, dedupe: ["react", "react-dom", "react/jsx-runtime"] },
  build: {
    outDir: process.env.PAPER_HISTORY_DIST ?? "dist-paper-history",
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL("./e2e/paper-history-harness/index.html", import.meta.url)) },
  },
});
