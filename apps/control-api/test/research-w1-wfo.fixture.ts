/** W1 shared fixtures: P04 golden + locked Delta WFO requests and manifests. */

import { vi } from "vitest";

import type { PortalUser } from "../src/domain";
import type { ResearchPreflightManifestRecord } from "../src/research/contracts";
import { P04_DELTA_ADAPTER_CONTRACT_DIGEST, P04_DELTA_BINDING } from "../src/research/p04-delta.binding";
import type { ResearchRequestedSpec } from "../src/research/preflight.contract";
import { sha256ResearchJson } from "../src/research/preflight.service";

export const w1Scope = { workspaceId: "w1-workspace", actorUserId: "w1-admin" };

export const w1Admin: PortalUser = {
  userId: w1Scope.actorUserId, username: "w1-admin", displayName: "W1 Admin", role: "ADMIN", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date("2026-09-24T00:00:00.000Z"), updatedAt: new Date("2026-09-24T00:00:00.000Z"),
  disabledAt: null, accountRevision: 1, archivedAt: null,
};

export function p04Requested(overrides: Partial<ResearchRequestedSpec> = {}): ResearchRequestedSpec {
  return {
    schema_version: "research.requested-spec.v1",
    alpha_binding: { alpha_id: P04_DELTA_BINDING.alphaId, alpha_version_id: P04_DELTA_BINDING.alphaVersionId },
    not_publishable: false,
    strategy_id: P04_DELTA_BINDING.alphaId,
    execution_route: "signal_notional",
    route_params: {},
    data: { dataset_id: "crypto-binance-1m", symbol: "BTCUSDT", timeframe: "1h" },
    protocol: "three_window_decay",
    windows: {
      is: { start: "2025-01-01T00:00:00Z", end_exclusive: "2025-01-04T00:00:00Z" },
      oos: { start: "2025-01-04T00:00:00Z", end_exclusive: "2025-01-06T00:00:00Z" },
      holdout: { start: "2025-01-06T00:00:00Z", end_exclusive: "2025-01-08T00:00:00Z" },
    },
    optimization_mode: "mode_1_decay",
    optimization_schedule: "global",
    parameter_space_overrides: [],
    optuna_trials: 1,
    early_stopping: null,
    random_seed: null,
    optimization_config: {},
    client: { engine_release_id: "er_quantbt_111", config_digest: "a".repeat(64) },
    ...overrides,
  } as ResearchRequestedSpec;
}

/** The measured W1 real-HMD shape: BTCUSDT 1h 2026-06-01..07-15, weekly expanding. */
export function wfoRequested(
  overrides: Partial<ResearchRequestedSpec> = {},
  walkForward: Partial<NonNullable<ResearchRequestedSpec["walk_forward"]>> = {},
): ResearchRequestedSpec {
  const base = p04Requested();
  const { windows: _windows, ...rest } = base;
  return {
    ...rest,
    protocol: "advanced",
    walk_forward: {
      start: "2026-06-01T00:00:00Z",
      end_exclusive: "2026-07-15T00:00:00Z",
      split_mode: "2026-07-01T00:00:00Z",
      frequency: "weekly",
      window_mode: "expanding",
      ...walkForward,
    },
    optuna_trials: 3,
    random_seed: 42,
    ...overrides,
  } as ResearchRequestedSpec;
}

export function weeklyTopology(folds: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const week = 7 * 86_400_000;
  const first = Date.parse("2026-07-01T00:00:00Z");
  const start = Date.parse("2026-06-01T00:00:00Z");
  const range = (from: number, to: number) => ({
    start_utc: new Date(from).toISOString(), end_exclusive_utc: new Date(to).toISOString(),
    start_utc_ms: from, end_exclusive_utc_ms: to,
  });
  return {
    protocol: "advanced_walk_forward",
    frequency: "weekly",
    window_mode: "expanding",
    folds: Array.from({ length: folds }, (_, index) => ({
      fold_id: `fold_${String(index + 1).padStart(3, "0")}`,
      train: range(start, first + index * week),
      outer_oos: range(first + index * week, first + (index + 1) * week),
      state: "BOUNDARY_FIXED_NOT_EVALUATED",
    })),
    sealed_holdout: null,
    topology_digest: "c".repeat(64),
    ...overrides,
  };
}

export function manifestFor(
  spec: ResearchRequestedSpec,
  options: { topology?: Record<string, unknown>; engine?: Record<string, unknown>; token?: string } = {},
): ResearchPreflightManifestRecord {
  const requestedSpecDigest = sha256ResearchJson(spec);
  const effectiveSpec = {
    schema_version: "research.effective-spec.v1",
    requested_spec_digest: requestedSpecDigest,
    engine: options.engine ?? { engine_release_id: spec.client.engine_release_id, execution_route: spec.execution_route },
  };
  const datasetBinding = { schema_version: "research.dataset-binding.v1", snapshot_id: "dss_0123456789abcdef0123456789abcdef" };
  const topology = options.topology ?? (spec.protocol === "advanced"
    ? weeklyTopology(3)
    : { schema_version: "research.topology.v1", topology_digest: "c".repeat(64) });
  const snapshot = {
    snapshot_id: "dss_0123456789abcdef0123456789abcdef",
    snapshot_content_hash: "b".repeat(64),
    source_manifest_digest: "d".repeat(64),
  };
  return {
    preflightToken: options.token ?? "rpft_w1_manifest",
    requestedSpecDigest,
    effectiveSpecDigest: sha256ResearchJson(effectiveSpec),
    datasetBindingDigest: sha256ResearchJson(datasetBinding),
    manifestDigest: sha256ResearchJson({ requestedSpecDigest, effectiveSpec, datasetBinding, topology, snapshot }),
    requestedSpec: spec as unknown as Record<string, unknown>,
    effectiveSpec,
    datasetBinding,
    topology,
    resourceEstimate: { schema_version: "research.resource-estimate.v1", trial_count: spec.optuna_trials },
    snapshot,
    expiresAt: new Date("2026-09-24T01:00:00.000Z"),
    createdAt: new Date("2026-09-24T00:00:00.000Z"),
  };
}

export function admissionRepository(
  manifest: ResearchPreflightManifestRecord,
  eligibility: Record<string, unknown> | null = {
    alphaId: P04_DELTA_BINDING.alphaId,
    alphaVersionId: P04_DELTA_BINDING.alphaVersionId,
    lifecycleState: "ACTIVE",
    declaredContract: {},
    binding: {
      alphaId: P04_DELTA_BINDING.alphaId,
      alphaVersionId: P04_DELTA_BINDING.alphaVersionId,
      adapterId: "p04.delta-rsi.v1",
      contractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST,
    },
  },
) {
  return {
    loadPreflightManifest: vi.fn().mockResolvedValue(manifest),
    assertPreflightManifestFresh: vi.fn().mockResolvedValue(manifest),
    loadRunAdapterEligibility: vi.fn().mockResolvedValue(eligibility),
  };
}

export function flagConfig(wfo: boolean) {
  return {
    FEATURE_RESEARCH_RUN_PRODUCER: "true",
    FEATURE_RESEARCH_WFO_PROFILE: wfo ? "true" : "false",
    RESEARCH_RUN_PRODUCER_LEASE_SECONDS: 15,
  };
}
