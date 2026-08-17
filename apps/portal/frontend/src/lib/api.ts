/** Typed API client for the portal backend (schemas mirror portal_api contracts). */
import type {
  AlphaImportRecord,
  AlphaVerifyResult,
  FoldPlanDocument,
  RowEnvelope,
} from "../portal/contracts";

export interface DatasetDescriptor {
  dataset_id: string;
  symbol: string | null;
  venue: string;
  timeframe: string | null;
  dynamic_query: boolean;
  supported_timeframes: string[];
  source_class: string;
  data_kind: string;
  availability: "available" | "unavailable";
  unavailable_reason: string | null;
  usage_scopes: string[];
  excluded_scopes: string[];
  source_timezone: string;
}

export interface StrategyResponse {
  strategy_id: string;
  display_name: string;
  version: string;
  default_timeframe: string;
  required_columns: string[];
  structural_contract: Record<string, unknown>;
  parameter_space: Record<string, { low: number; high: number; step: number }>;
}

export interface WindowSummary {
  role: string;
  start_inclusive: string;
  end_exclusive: string;
  bars: number;
}

export interface PreflightResponse {
  valid: boolean;
  strategy_id: string;
  dataset_id: string;
  symbol: string;
  timeframe: string;
  windows: WindowSummary[];
  data_quality: {
    rows: number;
    content_hash: string;
    missing_bar_count: number;
    analysis?: { rows: number; first_timestamp: string; last_timestamp: string; content_hash: string };
    load_metadata?: Record<string, unknown>;
  };
  config_hash: string;
}

export type ParameterSpec =
  | { kind: "fixed"; value: unknown }
  | { kind: "int_range"; low: number; high: number; step: number }
  | { kind: "float_range"; low: number; high: number; step: number }
  | { kind: "categorical"; values: unknown[] };

export interface ConfigOptions {
  schema_version: string;
  protocols: string[];
  target_modes: string[];
  optimization_modes: string[];
  optimization_schedules: string[];
  split_frequencies: string[];
  window_modes: string[];
  position_boundary_policies: string[];
  candidate_selection_metrics: string[];
  compatibility: Record<string, Record<string, string>>;
  defaults: {
    account: Record<string, unknown>;
    execution: Record<string, unknown>;
    optimization: Record<string, unknown>;
    three_window: Record<string, unknown>;
    advanced_walk_forward: Record<string, unknown>;
  };
}

export interface RunLedger {
  run_id: string;
  status: string;
  stage_events: Array<{ state: string; at: number }>;
  trial_events: Record<string, unknown>[];
  candidate_events: Record<string, unknown>[];
  trial_ledger_ready: boolean;
}

/**
 * Fold plan, with its BAR-02 provenance.
 *
 * `producer.as_of` pins the write instant and `producer.source_artifact_digest`
 * names the analysis frame the plan was derived from, so the fold Gantt can
 * cite its source like any other §12.2 figure. Both are nullable in the
 * schema: a plan written before they existed has neither, and the UI says
 * "chưa công bố" rather than assuming.
 *
 * The row shape stays declared here because `FoldPlanDocument.folds` is an
 * untyped record array in the contract — the runner writes protocol-specific
 * columns, which OpenAPI does not model.
 */
export type FoldRow = {
  fold_id: number;
  role?: string;
  start?: string;
  end?: string;
  train_start?: string;
  train_end?: string;
  test_start?: string;
  test_end?: string;
};

export type RunFoldPlan = Omit<FoldPlanDocument, "folds"> & { folds: FoldRow[] };

/**
 * Envelope shared by every row-table endpoint (v0.5 §12.2).
 *
 * `total_rows` counts the rows stored in the artifact before any filter or
 * `top_n` cap, so truncation is read rather than inferred from
 * `returned_rows === top_n` — which cannot distinguish a truncated artifact
 * from one that happens to hold exactly the cap.
 */
export type RowsPayload = RowEnvelope;

export interface RunSummary {
  run_id: string;
  status: string;
  protocol: string | null;
  strategy_id: string | null;
  symbol: string | null;
  timeframe: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface RunDetail extends RunSummary {
  stage_index: number | null;
  stage_count: number | null;
  events: Array<{ state: string; at: number }>;
  failure: { code: string; message: string } | null;
}

/**
 * Series envelope (v0.5 §12.2).
 *
 * `source_rows` is the segment's row count **before** downsampling and before
 * start/end clipping; `returned_rows` is what actually arrived; and
 * `downsample_stride` is 1 when the payload was not thinned. The three
 * together are what let a chart say "5.000/128.400 điểm, stride 26" instead of
 * implying it drew everything.
 *
 * Delivered by codex on 2026-08-17; before that the frontend could only assume
 * returned == source, which quietly understated every reduced chart.
 */
export interface SeriesPayload {
  segment: string;
  timestamps: string[];
  series: Record<string, (number | null)[]>;
  source_rows: number;
  returned_rows: number;
  downsample_stride: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.error?.message) detail = body.error.message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export const api = {
  health: () => request<{ status: string; version: string }>("/api/health"),
  datasets: () => request<DatasetDescriptor[]>("/api/datasets"),
  strategies: () => request<StrategyResponse[]>("/api/strategies"),
  /** Imported alpha registry projection (strategy import contract §1). */
  alphas: () => request<unknown>("/api/v1/alphas"),
  /** Quarantine inbox for imported alphas (strategy import contract §5). */
  alphaImports: () => request<AlphaImportRecord[]>("/api/v1/alphas/imports"),
  /**
   * Re-verifies a registered alpha version's artifact digest.
   *
   * Read-only: it recomputes and compares, it does not promote anything.
   */
  verifyAlpha: (alphaId: string, version: string) =>
    request<AlphaVerifyResult>(
      `/api/v1/alphas/${encodeURIComponent(alphaId)}/versions/${encodeURIComponent(version)}/verify`,
    ),
  /** Engine capability manifest for the installed release (§4). */
  engineCapabilities: () => request<unknown>("/api/v1/portal/capabilities"),
  capabilities: () => request<Record<string, unknown>[]>("/api/capabilities/walk-forward"),
  configOptions: () => request<ConfigOptions>("/api/config/options"),
  preflight: (payload: unknown) =>
    request<PreflightResponse>("/api/runs/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  createRun: (payload: unknown) =>
    request<{ run_id: string; status: string }>("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  listRuns: () => request<RunSummary[]>("/api/runs"),
  getRun: (runId: string) => request<RunDetail>(`/api/runs/${runId}`),
  runConfig: (runId: string) => request<Record<string, unknown>>(`/api/runs/${runId}/config`),
  ledger: (runId: string) => request<RunLedger>(`/api/runs/${runId}/ledger`),
  foldPlan: (runId: string) => request<RunFoldPlan>(`/api/runs/${runId}/fold-plan`),
  progress: (runId: string) =>
    request<{ run_id: string; studyStarts: number; trialsDone: number; bestByStudy: Array<number | null> }>(
      `/api/runs/${runId}/progress`,
    ),
  console: (runId: string, tail = 2000) =>
    request<{ run_id: string; lines: string[] }>(
      `/api/runs/${runId}/console?tail=${tail}`,
    ),
  cancelRun: (runId: string) =>
    request<{ run_id: string; status: string }>(`/api/runs/${runId}/cancel`, { method: "POST" }),
  summary: (runId: string) =>
    request<{
      selected_params: { params: Record<string, number>; trial_id: number | null };
      selection_trace: Record<string, unknown>;
      metrics: {
        segments: Record<string, Record<string, number | null>>;
        reconciliation: Record<string, { matches: boolean }>;
        warnings: string[];
      };
    }>(`/api/runs/${runId}/summary`),
  trials: (runId: string, params?: string) =>
    request<RowsPayload>(`/api/runs/${runId}/wfo/trials${params ? `?${params}` : ""}`),
  candidates: (runId: string) =>
    request<RowsPayload>(`/api/runs/${runId}/wfo/candidates`),
  folds: (runId: string) => request<RowsPayload>(`/api/runs/${runId}/wfo/folds`),
  parameters: (runId: string) =>
    request<{ params_by_fold: Record<string, unknown>; selected: { params: Record<string, number> } }>(
      `/api/runs/${runId}/wfo/parameters`,
    ),
  trace: (runId: string) => request<Record<string, unknown>>(`/api/runs/${runId}/selection/trace`),
  series: (runId: string, segment: string, maxPoints?: number) =>
    request<SeriesPayload>(
      `/api/runs/${runId}/series/${segment}${maxPoints ? `?max_points=${maxPoints}` : ""}`,
    ),
  presentation: (runId: string, mode: "calendar" | "rebased", maxPoints?: number) =>
    request<SeriesPayload>(
      `/api/runs/${runId}/presentation/${mode}${maxPoints ? `?max_points=${maxPoints}` : ""}`,
    ),
  audit: (runId: string) =>
    request<{
      manifest: Record<string, unknown>;
      config: Record<string, unknown>;
      strategy: Record<string, unknown>;
      metrics: Record<string, unknown>;
    }>(`/api/runs/${runId}/audit`),
};

export const TERMINAL_STATES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export function isTerminal(state: string): boolean {
  return TERMINAL_STATES.has(state);
}

export function canOpenRunResults(state: string): boolean {
  return state === "COMPLETED";
}

/** Trial/candidate rows persist dict columns as `params_json` strings. */
export function rowParams(row: Record<string, unknown>): Record<string, unknown> {
  const raw = row.params_json ?? row.params;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (raw as Record<string, unknown>) ?? {};
}
