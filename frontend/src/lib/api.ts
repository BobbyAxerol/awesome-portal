/** Typed API client for the portal backend (schemas mirror portal_api contracts). */

export interface DatasetDescriptor {
  dataset_id: string;
  symbol: string | null;
  venue: string;
  timeframe: string | null;
  dynamic_query: boolean;
  supported_timeframes: string[];
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
  data_quality: { rows: number; content_hash: string; missing_bar_count: number };
  config_hash: string;
}

export type ParameterSpec =
  | { kind: "fixed"; value: number }
  | { kind: "int_range"; low: number; high: number; step: number }
  | { kind: "float_range"; low: number; high: number; step: number };

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

export interface SeriesPayload {
  segment: string;
  timestamps: string[];
  series: Record<string, (number | null)[]>;
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
  capabilities: () => request<Record<string, unknown>[]>("/api/capabilities/walk-forward"),
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
    request<Record<string, unknown>[]>(`/api/runs/${runId}/wfo/trials${params ? `?${params}` : ""}`),
  candidates: (runId: string) =>
    request<Record<string, unknown>[]>(`/api/runs/${runId}/wfo/candidates`),
  parameters: (runId: string) =>
    request<{ params_by_fold: Record<string, unknown>; selected: { params: Record<string, number> } }>(
      `/api/runs/${runId}/wfo/parameters`,
    ),
  trace: (runId: string) => request<Record<string, unknown>>(`/api/runs/${runId}/selection/trace`),
  series: (runId: string, segment: string, maxPoints?: number) =>
    request<SeriesPayload>(
      `/api/runs/${runId}/series/${segment}${maxPoints ? `?max_points=${maxPoints}` : ""}`,
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
