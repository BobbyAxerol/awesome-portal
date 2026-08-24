/// <reference types="vite/client" />

/**
 * Build-time configuration.
 *
 * The `ROADMAP_TASK_BOARD_*` entries belong to the embedded Planning feature
 * (U05). Planning's API client reads them, and the Portal build supplies them
 * through `vite.config.ts` `define` so the embedded views address the gateway
 * prefix absolutely instead of relative to the current Portal route.
 */
interface ImportMetaEnv {
  /** Dev-only fixture product routes; never grants source, SSE or command authority. */
  readonly VITE_EXECUTION_PREVIEW_ENABLED?: string;
  readonly VITE_ROADMAP_TASK_BOARD_API_BASE?: string;
  readonly VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY?: string;
  /** `legacy` is the safe default; `v1` only after backend workspace UAT. */
  readonly VITE_ROADMAP_TASK_BOARD_PERSISTENCE?: "legacy" | "v1";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
