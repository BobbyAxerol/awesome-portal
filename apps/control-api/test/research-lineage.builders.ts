/** W6b · shared P19 lineage builders: persisted-row shapes and the Screen-01/Atlas fakes. */
import { vi } from "vitest";

import { ResearchLineageService } from "../src/research/lineage.service";

export const scope = { workspaceId: "ws-p19", actorUserId: "usr-p19" };
export const user = { userId: "usr-p19", username: "p19", role: "ADMIN" };
export const digest = (character: string) => character.repeat(64);
export const CONFIG = {
  FEATURE_RESEARCH_LINEAGE: "true",
  FEATURE_RESEARCH_RUN_LIBRARY: "true",
  QUERY_CURSOR_ACTIVE_KEY_ID: "p19-k1",
  QUERY_CURSOR_KEYS_JSON: '{"p19-k1":"p19-query-signing-key-which-is-longer-than-thirty-two-bytes"}',
};

export const DECLARED = {
  version: "0.9.1",
  entrypoint: "strategy:main",
  timeframes: ["1h"],
  required_columns: ["close"],
  warmup_bars: 10,
  determinism: { seed_required: true },
  parameter_space: {
    window: { kind: "int_range", low: 12, high: 72, step: 1 },
    entry_z: { kind: "float_range", low: 0.6, high: 2.6, step: 0.1 },
    fee_bps: { kind: "fixed", value: 4 },
  },
};

export function requested(overrides: unknown[] = [], schedule = "global", seed = 7, route = "signal_notional") {
  return {
    schema_version: "research.requested-spec.v1",
    alpha_binding: { alpha_id: "alpha-p19", alpha_version_id: "av-p19-1" },
    not_publishable: false,
    strategy_id: "delta-rsi",
    execution_route: route,
    route_params: {},
    data: { dataset_id: "hmd", symbol: "BTCUSDT", timeframe: "1h" },
    protocol: "three_window_decay",
    windows: {
      is: { start: "2024-01-01", end_exclusive: "2024-02-01" },
      oos: { start: "2024-02-01", end_exclusive: "2024-03-01" },
      holdout: { start: "2024-03-01", end_exclusive: "2024-04-01" },
    },
    optimization_mode: "mode_1_decay",
    optimization_schedule: schedule,
    parameter_space_overrides: overrides,
    optuna_trials: 10,
    early_stopping: null,
    random_seed: seed,
    optimization_config: {},
    client: { engine_release_id: "quantbt-1.1.1", config_digest: digest("a") },
  };
}

export function effective(schedule = "global", seed = 7) {
  return {
    schema_version: "research.effective-spec.v1",
    engine: { engine_release_id: "quantbt-1.1.1", execution_route: "signal_notional" },
    data_binding: { snapshot_content_hash: digest("b"), market_content_hash: digest("c") },
    topology: { topology_digest: digest("d") },
    optimization: { mode: "mode_1_decay", schedule, trial_count: 10, early_stopping: null, random_seed: seed },
  };
}

let clock = 0;
/** Builders stamp attempts one minute apart; a fixture resets the clock so its body is deterministic. */
export function resetClock(): void {
  clock = 0;
}
export function attempt(id: string, overrides: Record<string, unknown> = {}) {
  clock += 1;
  return {
    attempt_id: id,
    parent_attempt_id: null,
    parent_alpha_id: null,
    alpha_version_id: "av-p19-1",
    alpha_version_label: "av_0_9_1",
    state: "READY",
    intent_kind: "NEW",
    reason: null,
    space_signature: digest("e"),
    created_at: new Date(Date.UTC(2026, 8, 22, 0, clock)),
    created_at_cursor: `2026-09-22T00:${String(clock).padStart(2, "0")}:00.000000Z`,
    updated_at: new Date(Date.UTC(2026, 8, 22, 1, clock)),
    primary_run_id: `run-${id}`,
    primary_run_state: "READY",
    effective_spec_digest: digest("f"),
    engine_release_id: "quantbt-1.1.1",
    dataset_binding_digest: digest("b"),
    requested_spec: requested(),
    effective_spec: effective(),
    technical_retry_count: 0,
    exposure_count: 0,
    exposure_roles: [],
    latest_source_as_of: null,
    execution_profile_id: "p04.fixed-qualification.v1",
    ...overrides,
  };
}

export function version(id: string, lifecycle: string, overrides: Record<string, unknown> = {}) {
  return {
    alpha_version_id: id,
    code_digest: digest("1"),
    entrypoint: "strategy:main",
    declared_contract: { ...DECLARED, version: id === "av-p19-1" ? "0.9.1" : "0.9.2" },
    lifecycle_state: lifecycle,
    registered_at: new Date("2026-09-21T00:00:00.000Z"),
    supersedes_alpha_version_id: null,
    supersedes_recorded: true,
    first_attempt_id: null,
    promotion_attempt_id: null,
    promotion_run_id: null,
    promotion_source_contract_rev: null,
    promotion_source_digest: null,
    promotion_source_as_of: null,
    ...overrides,
  };
}

export function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    alpha: { alpha_id: "alpha-p19", name: "P19 Alpha", active_version_id: "av-p19-1", active_version_state: "ACTIVE" },
    versions: [version("av-p19-1", "ACTIVE", { first_attempt_id: "att-1" })],
    attempts: [attempt("att-1")],
    childRuns: [],
    counts: {
      total_attempts: 1, draft_attempts: 0, submitted_attempts: 1, failed_attempts: 0,
      abandoned_attempts: 0, child_runs: 0, technical_retries: 0,
    },
    hasMore: false,
    asOfUtcMs: 1_790_035_200_000,
    libraryRows: [],
    retainedMetrics: [],
    exercised: [],
    exercisedBounded: false,
    window: "NEWEST",
    ...overrides,
  };
}

/** A Screen-01 item as `ResearchRunLibraryService.mapRow` returns it (only the fields the lineage reads). */
export function libraryItem(runId: string, overrides: Record<string, unknown> = {}) {
  return {
    run_id: runId,
    rc: null,
    rc_availability: { state: "NOT_PUBLISHED", reason_code: "P21_NO_PERSISTED_RELEASE_CANDIDATE" },
    certificate: { grade: null, availability: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE" } },
    claim: { state: "NOT_ISSUED", text: "The fixed P10 qualification sealed its artifacts but did not issue a release claim.", availability: { state: "AVAILABLE", reason_code: null } },
    stats: [
      { key: "oos_sharpe", label: "OOS sharpe", role: "OOS_SHARPE", value: "0.7440081232022494", tone: "DEFAULT", availability: { state: "AVAILABLE", reason_code: null }, scope: "OOS", definition_id: "research.metric.v3.oos_sharpe" },
      { key: "decay", label: "Δ decay", role: "DECAY", value: null, tone: "DEFAULT", availability: { state: "NOT_PUBLISHED", reason_code: "P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT" }, scope: null, definition_id: null },
      { key: "trade_count", label: "trades", role: "TRADE_COUNT", value: "45", tone: "DEFAULT", availability: { state: "AVAILABLE", reason_code: null }, scope: "CHILD_TAPE", definition_id: "research.metric.v1.trade_count" },
    ],
    ...overrides,
  };
}

export const ATLAS = {
  routes: [
    { route_id: "signal_notional", status_word: "DEFAULT" },
    { route_id: "intrabar_bracket", status_word: "SUPPORTED" },
    { route_id: "dca_ladder", status_word: "LEGACY" },
    { route_id: "options", status_word: "DEFERRED" },
  ],
};

export function subject(
  value: Record<string, unknown> = snapshot(),
  items: Record<string, ReturnType<typeof libraryItem>> = {},
  atlas: { read: () => Promise<unknown> } | null = { read: vi.fn().mockResolvedValue(ATLAS) },
) {
  const repository = { read: vi.fn().mockResolvedValue(value) };
  const runLibrary = { mapRow: vi.fn((row: { run_id: string }) => items[row.run_id] ?? libraryItem(row.run_id)) };
  const service = new ResearchLineageService(repository as never, CONFIG as never, runLibrary as never, (atlas ?? undefined) as never);
  return { service, repository, runLibrary };
}

export const rows = (...ids: string[]) => ids.map((id) => ({ run_id: id }));
