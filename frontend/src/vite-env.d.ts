/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROADMAP_TASK_BOARD_API_BASE?: string;
  readonly VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY?: string;
  /** `legacy` is safe default; set `v1` only after backend workspace UAT. */
  readonly VITE_ROADMAP_TASK_BOARD_PERSISTENCE?: "legacy" | "v1";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
