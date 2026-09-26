import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "../../apps/control-api/node_modules/pg";

import type { ControlApiConfig } from "../../apps/control-api/src/config";
import type { ResearchScope } from "../../apps/control-api/src/research/contracts";
import { ResearchEvidenceRepository } from "../../apps/control-api/src/research/evidence.repository";
import { ResearchEvidenceService } from "../../apps/control-api/src/research/evidence.service";
import { ResearchRunLibraryError } from "../../apps/control-api/src/research/run-library.error";
import { ResearchRunLibraryRepository } from "../../apps/control-api/src/research/run-library.repository";
import { ResearchRunLibraryService } from "../../apps/control-api/src/research/run-library.service";
import { migrateTestDatabase, truncateAll, testConfig } from "../../apps/control-api/test/harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const scope: ResearchScope = { workspaceId: "p12-workspace", actorUserId: "p12-admin" };
const otherWorkspace = "p12-other-workspace";
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const DIGEST_D = "d".repeat(64);
const ALPHA_ID = "p12-delta-alpha";
const ALPHA_VERSION_ID = "av_p12_delta_1_0_0";
const PREFLIGHT_TOKEN = "rpft_p12_manifest";
const ADAPTER_ID = "p04.delta-rsi.v1";

const baseConfig = testConfig({
  FEATURE_RESEARCH_RUN_LIBRARY: "true",
  QUERY_CURSOR_ACTIVE_KEY_ID: "p12-k1",
  QUERY_CURSOR_KEYS_JSON: '{"p12-k1":"p12-query-signing-key-which-is-longer-than-thirty-two-bytes"}',
}) as ControlApiConfig;
// RF-05 joins the persisted P13 projection and P21 relations; each is gated
// by its own reader flag.  The cross-flag bundle rules (RC needs reports and
// lineage) are deployment validation, not what this reader test exercises.
const config = {
  ...baseConfig,
  FEATURE_RESEARCH_EVIDENCE: "true",
  FEATURE_RESEARCH_RELEASE_CANDIDATES: "true",
} as ControlApiConfig;

/** Rows captured read-only from the isolated QuantBT 1.1.1 preview on 2026-09-24. */
const LIVE = JSON.parse(readFileSync(join(__dirname, "../../apps/control-api/test/research-run-library.live-preview.fixture.json"), "utf8")) as {
  projection_revision: string;
  projection: Record<string, unknown>;
  equity_oos: {
    source_observation_count: number;
    emitted_point_count: number;
    sampling: string;
    series_digest: string;
    payload: Array<{ at_utc_ms: number; equity: string; drawdown_fraction: string }>;
  };
  progress_claim: { state: "NOT_ISSUED"; text: string; cursor: null; methodology_certificate: Record<string, unknown> };
  hub_trade_count: { value: string; definition_id: string };
};

function requestedSpec() {
  return {
    schema_version: "research.requested-spec.v1",
    alpha_binding: { alpha_id: ALPHA_ID, alpha_version_id: ALPHA_VERSION_ID },
    not_publishable: false,
    strategy_id: ALPHA_ID,
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
    optuna_trials: 4,
    early_stopping: null,
    random_seed: null,
    optimization_config: {},
    client: { engine_release_id: "er_quantbt_111", config_digest: DIGEST_D },
  };
}

function progressSnapshot(
  runId: string,
  workerAttemptId: string,
  sequence: number,
  status: "RUNNING" | "COMPLETED",
  claimOverride?: Record<string, unknown>,
) {
  return {
    schema_version: "research.progress-snapshot.v1",
    run_id: runId,
    attempt_id: workerAttemptId,
    lease_epoch: 2,
    status,
    created_at_utc_ms: 1_725_000_000_000,
    updated_at_utc_ms: 1_725_000_000_000 + sequence,
    latest_sequence: sequence,
    retention_floor_sequence: 0,
    stages: ["S1", "S2", "S3", "S4", "S5"].map((key) => ({
      key,
      state: status === "COMPLETED" ? "DONE" : key === "S1" ? "RUNNING" : "PENDING",
      started_at_utc_ms: key === "S1" ? 1_725_000_000_000 : null,
      completed_at_utc_ms: status === "COMPLETED" ? 1_725_000_000_100 : null,
    })),
    overall: {
      pct: status === "COMPLETED" ? 100 : 50,
      elapsed_s: sequence,
      eta_s: status === "COMPLETED" ? null : 10,
      trials_done: status === "COMPLETED" ? 4 : 2,
      trials_declared: 4,
      tqdm_line: status === "COMPLETED" ? "sealed" : "running",
    },
    budget: { used: "1.25", cap: "2.50", unit: "core-min", pct: 50 },
    folds: [],
    artifacts: [],
    claim: claimOverride ?? {
      state: status === "COMPLETED" ? "ISSUED" : "NOT_ISSUED",
      text: status === "COMPLETED" ? "STRICT_OUTER_OOS_AFTER_FROZEN_SELECTION" : "claim pending",
      cursor: status === "COMPLETED" ? "claim-p12" : null,
      methodology_certificate: status === "COMPLETED"
        ? { state: "ISSUED", grade: "B", issued_at_utc_ms: 1_725_000_000_200, reason_code: null }
        : { state: "NOT_PUBLISHED", grade: null, issued_at_utc_ms: null, reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE" },
    },
    readiness: { mandatory: status === "COMPLETED" ? "SEALED" : "PENDING", optional: "NOT_APPLICABLE" },
    failure: null,
    source: { kind: "DURABLE_P10", coverage: "ACTUAL_HOOKS", partial: false },
    ...(status === "COMPLETED" ? { mandatory_bundle: { digest: DIGEST_C, size: "42" } } : {}),
  };
}

async function seedIdentity(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
     VALUES ($1, 'p12-admin', 'P12 Admin', 'ADMIN', 'ACTIVE', false),
            ('p12-outsider', 'p12-outsider', 'P12 Outsider', 'USER', 'ACTIVE', false)`,
    [scope.actorUserId],
  );
  await pool.query(
    `INSERT INTO workspaces (workspace_id, name, owner_user_id)
     VALUES ($1, 'P12 Workspace', $2), ($3, 'P12 Other', 'p12-outsider')`,
    [scope.workspaceId, scope.actorUserId, otherWorkspace],
  );
  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, 'OWNER'), ($3, 'p12-outsider', 'OWNER')`,
    [scope.workspaceId, scope.actorUserId, otherWorkspace],
  );
  await pool.query(
    `INSERT INTO research.alphas (workspace_id, alpha_id, name, owner_user_id, execution_subject_id)
     VALUES ($1, $2, 'P12 Delta Alpha', $3, 'portal.p12.delta:1.0.0')`,
    [scope.workspaceId, ALPHA_ID, scope.actorUserId],
  );
  await pool.query(
    `INSERT INTO research.alpha_versions (
       workspace_id, alpha_version_id, alpha_id, code_digest, entrypoint, dependency_ref,
       declared_contract, lifecycle_state, registered_by_user_id
     ) VALUES ($1, $2, $3, $4, 'strategy.p12:signals', 'portal.p12:quantbt-engine==1.1.1',
       $5::jsonb, 'ACTIVE', $6)`,
    [scope.workspaceId, ALPHA_VERSION_ID, ALPHA_ID, DIGEST_A, JSON.stringify({ version: "1.0.0" }), scope.actorUserId],
  );
  await pool.query(
    `UPDATE research.alphas SET active_version_id = $3 WHERE workspace_id = $1 AND alpha_id = $2`,
    [scope.workspaceId, ALPHA_ID, ALPHA_VERSION_ID],
  );
  await pool.query(
    `INSERT INTO research.execution_adapter_bindings (
       workspace_id, alpha_version_id, adapter_id, contract_digest, installed_by_user_id
     ) VALUES ($1, $2, $3, $4, $5)`,
    [scope.workspaceId, ALPHA_VERSION_ID, ADAPTER_ID, DIGEST_B, scope.actorUserId],
  );
  const spec = requestedSpec();
  await pool.query(
    `INSERT INTO research.preflight_manifests (
       workspace_id, preflight_token, actor_user_id, requested_spec_digest, effective_spec_digest,
       dataset_binding_digest, manifest_digest, requested_spec, effective_spec, dataset_binding,
       topology, resource_estimate, snapshot, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb,
       $11::jsonb, $12::jsonb, $13::jsonb, now() + interval '1 hour')`,
    [
      scope.workspaceId, PREFLIGHT_TOKEN, scope.actorUserId, DIGEST_A, DIGEST_B, DIGEST_C, DIGEST_D,
      JSON.stringify(spec),
      JSON.stringify({ schema_version: "research.effective-spec.v1" }),
      JSON.stringify({ schema_version: "research.dataset-binding.v1" }),
      JSON.stringify({ schema_version: "research.topology.v1" }),
      JSON.stringify({ schema_version: "research.resource-estimate.v1" }),
      JSON.stringify({ snapshot_id: "dss_0123456789abcdef0123456789abcdef", snapshot_content_hash: DIGEST_B, source_manifest_digest: DIGEST_C }),
    ],
  );
}

async function insertDurable(pool: Pool, input: {
  runId: string;
  attemptId: string;
  jobId: string;
  createdAt: string;
  state: "RUNNING" | "READY" | "FAILED" | "CANCELLED";
  runKind?: "PRIMARY" | "AUDIT";
  relationshipKind?: "PRIMARY" | "AUDIT_OF_SELECTION";
  parentRunId?: string | null;
  parentAttemptId?: string | null;
  retryOrdinal?: number;
  withProgress?: boolean;
  claim?: Record<string, unknown>;
}): Promise<void> {
  const runKind = input.runKind ?? "PRIMARY";
  const relationshipKind = input.relationshipKind ?? "PRIMARY";
  const parentRunId = input.parentRunId ?? null;
  const parentAttemptId = input.parentAttemptId ?? null;
  const retryOrdinal = input.retryOrdinal ?? 1;
  await pool.query(
    `INSERT INTO research.attempts (
      workspace_id, attempt_id, alpha_version_id, parent_attempt_id, client_intent_id,
      request_payload_digest, intent_kind, state, created_by_user_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'NEW', $7, $8, $9::timestamptz, $9::timestamptz)`,
    [scope.workspaceId, input.attemptId, ALPHA_VERSION_ID, parentAttemptId, `intent-${input.attemptId}`, DIGEST_A,
      input.state === "READY" ? "READY" : input.state, scope.actorUserId, input.createdAt],
  );
  await pool.query(
    `INSERT INTO research.runs (
      workspace_id, run_id, attempt_id, run_kind, relationship_kind, logical_run_key, parent_run_id,
      request_spec_digest, effective_spec_digest, engine_release_id, dataset_binding_digest, state,
      submitted_by_user_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'er_quantbt_111', $10, $11, $12, $13::timestamptz, $13::timestamptz)`,
    [scope.workspaceId, input.runId, input.attemptId, runKind, relationshipKind, `logical-${input.runId}`, parentRunId,
      DIGEST_A, DIGEST_B, DIGEST_C, input.state, scope.actorUserId, input.createdAt],
  );
  const jobState = input.state === "READY" ? "SUCCEEDED" : input.state;
  await pool.query(
    `INSERT INTO research.jobs (
      workspace_id, job_id, run_id, command_id, job_kind, queue_class, cost_estimate,
      resource_class, state, logical_work_key, work_digest, requested_by_user_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, 'INTERACTIVE', '{"memory_bytes":1}'::jsonb,
      'small', $6, $7, $8, $9, $10::timestamptz, $10::timestamptz)`,
    [scope.workspaceId, input.jobId, input.runId, `command-${input.jobId}`,
      runKind === "AUDIT" ? "AUDIT" : "PRIMARY", jobState, `work-${input.runId}`, DIGEST_D,
      scope.actorUserId, input.createdAt],
  );
  let latestWorkerId: string | null = null;
  for (let ordinal = 1; ordinal <= retryOrdinal; ordinal += 1) {
    latestWorkerId = `worker-${input.runId}-${ordinal}`;
    await pool.query(
      `INSERT INTO research.worker_attempts (
         workspace_id, worker_attempt_id, job_id, ordinal, worker_id, lease_epoch,
         expires_at, state, created_at, updated_at
       ) VALUES ($1, $2, $3, $4::integer, $5, $4::bigint, now() + interval '1 hour', $6, $7::timestamptz, $7::timestamptz)`,
      [scope.workspaceId, latestWorkerId, input.jobId, ordinal, `worker-p12-${ordinal}`,
        input.state === "READY" ? "SUCCEEDED" : input.state, input.createdAt],
    );
  }
  await pool.query(
    `UPDATE research.jobs
        SET current_worker_attempt_id = $3, current_lease_epoch = $4
      WHERE workspace_id = $1 AND job_id = $2`,
    [scope.workspaceId, input.jobId, latestWorkerId, retryOrdinal],
  );
  await pool.query(
    `INSERT INTO research.run_producers (
       workspace_id, run_id, attempt_id, job_id, actor_user_id, client_intent_id, intent_kind,
       preflight_token, alpha_id, alpha_version_id, execution_adapter_id, adapter_contract_digest,
       requested_spec_digest, effective_spec_digest, dataset_binding_digest, manifest_digest, snapshot_id,
       snapshot_content_hash, work_digest, legacy_request, dispatch_state, worker_attempt_id, lease_epoch,
       portal_receipt, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'NEW', $7, $8, $9, $10, $11, $12, $13, $14, $15,
       'dss_0123456789abcdef0123456789abcdef', $16, $17, $18::jsonb, 'PENDING', NULL, NULL, NULL,
       $19::timestamptz, $19::timestamptz)`,
    [scope.workspaceId, input.runId, input.attemptId, input.jobId, scope.actorUserId, `producer-${input.runId}`,
      PREFLIGHT_TOKEN, ALPHA_ID, ALPHA_VERSION_ID, ADAPTER_ID, DIGEST_B, DIGEST_A, DIGEST_B, DIGEST_C,
      DIGEST_D, DIGEST_B, DIGEST_D,
      JSON.stringify({ protocol: "three_window_decay", strategy_id: ALPHA_ID }), input.createdAt],
  );
  if (input.withProgress && latestWorkerId) {
    const status = input.state === "READY" ? "COMPLETED" : "RUNNING";
    await pool.query(
      `INSERT INTO research.run_progress_snapshots (
        workspace_id, run_id, worker_attempt_id, lease_epoch, source_latest_sequence,
        retention_floor_sequence, snapshot, snapshot_digest, received_at
      ) VALUES ($1, $2, $3, $4, 1, 0, $5::jsonb, $6, $7::timestamptz)`,
      [scope.workspaceId, input.runId, latestWorkerId, retryOrdinal,
        JSON.stringify(progressSnapshot(input.runId, latestWorkerId, 1, status, input.claim)), DIGEST_C, input.createdAt],
    );
    if (input.state === "READY") {
      // E10: a completed P10 run has its source terminal event and RS-01
      // checkpoint. Without them the one lifecycle function reads FINISHING
      // (a SUCCEEDED job with no source terminal fact is fail-closed) — the
      // same answer Run Progress always gave for such a row.
      await pool.query(
        `INSERT INTO research.run_progress_events (
           workspace_id, run_id, worker_attempt_id, source_sequence, lease_epoch,
           event_type, occurred_at_utc_ms, event_payload, event_digest
         ) VALUES ($1, $2, $3, 1, $4, 'run_completed', 1790000000000, '{}'::jsonb, $5)`,
        [scope.workspaceId, input.runId, latestWorkerId, retryOrdinal, DIGEST_C],
      );
      await pool.query(
        `INSERT INTO research.run_terminal_materializations_v1 (
           workspace_id, run_id, worker_attempt_id, source_sequence, event_digest, materialization_revision
         ) VALUES ($1, $2, $3, 1, $4, 'research.terminal-materialization.v1')`,
        [scope.workspaceId, input.runId, latestWorkerId, DIGEST_C],
      );
    }
  }
}

async function seedLibrary(pool: Pool): Promise<void> {
  await seedIdentity(pool);
  // Same timestamp deliberately proves the second keyset component (`run_id`)
  // rather than relying on insertion ordering.
  await insertDurable(pool, {
    runId: "run_p12_z", attemptId: "attempt_p12_z", jobId: "job_p12_z",
    createdAt: "2026-09-21T10:00:00.000Z", state: "READY", retryOrdinal: 2, withProgress: true,
  });
  await insertDurable(pool, {
    runId: "run_p12_a", attemptId: "attempt_p12_a", jobId: "job_p12_a",
    createdAt: "2026-09-21T10:00:00.000Z", state: "RUNNING", withProgress: true,
  });
  await insertDurable(pool, {
    runId: "run_p12_child", attemptId: "attempt_p12_child", jobId: "job_p12_child",
    createdAt: "2026-09-21T09:00:00.000Z", state: "FAILED", runKind: "AUDIT",
    relationshipKind: "AUDIT_OF_SELECTION", parentRunId: "run_p12_z", parentAttemptId: "attempt_p12_z",
  });
  await pool.query(
    `INSERT INTO public.run_read_models (
      run_id, workspace_id, owner_user_id, status, protocol, strategy_id, dataset_id, created_at, updated_at
    ) VALUES ('legacy_p12', $1, $2, 'COMPLETED', 'mode_5', 'legacy-delta', 'BTCUSDT_1h',
      '2026-09-21T08:00:00.000Z', '2026-09-21T08:00:00.000Z')`,
    [scope.workspaceId, scope.actorUserId],
  );
  await pool.query(
    `INSERT INTO public.run_read_models (
      run_id, workspace_id, owner_user_id, status, protocol, strategy_id, dataset_id
    ) VALUES ('other_p12', $1, 'p12-outsider', 'COMPLETED', 'mode_1', 'other-alpha', 'OTHER')`,
    [otherWorkspace],
  );
}


const LIVE_RUN = "run_p12_live";
const LIVE_WORKER = `worker-${LIVE_RUN}-1`;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function ulidSuffix(seed: string): string {
  const digest = createHash("sha256").update(seed).digest();
  return Array.from({ length: 26 }, (_, index) => CROCKFORD[digest[index]! % 32]).join("");
}

function canonical(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, normalize(nested)]));
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

/**
 * Seed one COMPLETED durable run with the P11 snapshot claim, P13 projection
 * and EQUITY_OOS series exactly as the preview persisted them for
 * rrun_34a6beaa… (QuantBT 1.1.1 over historical BTCUSDT 1h).
 */
async function seedLiveEvidence(pool: Pool): Promise<void> {
  await insertDurable(pool, {
    runId: LIVE_RUN, attemptId: "attempt_p12_live", jobId: "job_p12_live",
    createdAt: "2026-09-21T11:00:00.000Z", state: "READY", withProgress: true, claim: LIVE.progress_claim,
  });
  await pool.query(
    `UPDATE research.run_producers SET worker_attempt_id = $3, lease_epoch = 1
      WHERE workspace_id = $1 AND run_id = $2`,
    [scope.workspaceId, LIVE_RUN, LIVE_WORKER],
  );
  await pool.query(
    `INSERT INTO research.run_evidence_sources_v1 (
       workspace_id, run_id, worker_attempt_id, source_event_sequence, source_evidence_digest, source_payload
     ) VALUES ($1, $2, $3, 25, $4, '{"fixture":"p12-live-preview"}'::jsonb)`,
    [scope.workspaceId, LIVE_RUN, LIVE_WORKER, "8".repeat(64)],
  );
  await pool.query(
    `INSERT INTO research.run_evidence_projections_v1 (
       workspace_id, run_id, worker_attempt_id, projection_revision, source_event_sequence,
       source_evidence_digest, projection_version, projection_digest, readiness, projection
     ) VALUES ($1, $2, $3, $4, 25, $5, 'research.evidence-projection.v1', $6, 'COMPLETE', $7::jsonb)`,
    [scope.workspaceId, LIVE_RUN, LIVE_WORKER, LIVE.projection_revision, "8".repeat(64),
      LIVE.projection_revision.slice("p13r1_".length), JSON.stringify(LIVE.projection)],
  );
  await pool.query(
    `INSERT INTO research.run_evidence_series_v1 (
       workspace_id, run_id, worker_attempt_id, projection_revision, series_kind, availability_state,
       reason_code, source_observation_count, emitted_point_count, sampling, series_payload, series_digest
     ) VALUES ($1, $2, $3, $4, 'EQUITY_OOS', 'AVAILABLE', NULL, $5, $6, $7, $8::jsonb, $9)`,
    [scope.workspaceId, LIVE_RUN, LIVE_WORKER, LIVE.projection_revision, LIVE.equity_oos.source_observation_count,
      LIVE.equity_oos.emitted_point_count, LIVE.equity_oos.sampling, JSON.stringify(LIVE.equity_oos.payload),
      LIVE.equity_oos.series_digest],
  );
}

async function seedReleaseCandidate(pool: Pool, runId: string, sealed: boolean): Promise<{ draftId: string; rcId: string }> {
  const draftId = `rcd_${ulidSuffix(`draft-${runId}`)}`;
  const rcId = `rc_${ulidSuffix(`rc-${runId}`)}`;
  await pool.query(
    `INSERT INTO research.release_candidate_drafts_v1 (
       workspace_id, run_id, actor_user_id, draft_id, source_fingerprint, known_limitations
     ) VALUES ($1, $2, $3, $4, $5, 'P12 fixture limitation')`,
    [scope.workspaceId, runId, scope.actorUserId, draftId, DIGEST_A],
  );
  if (!sealed) return { draftId, rcId };
  await pool.query(
    `INSERT INTO research.release_candidates (
       workspace_id, release_candidate_id, run_id, selection_id, final_audit_run_id,
       manifest_digest, schema_version, lifecycle_state
     ) VALUES ($1, $2, $3, NULL, $3, $4, 'research.release-candidate-pack.v1', 'SEALED')`,
    [scope.workspaceId, rcId, runId, DIGEST_B],
  );
  await pool.query(
    `INSERT INTO research.release_candidate_packs_v1 (
       workspace_id, release_candidate_id, run_id, draft_id, pack_digest, source_fingerprint,
       schema_version, frozen_core, sealed_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, 'research.release-candidate-pack.v1', '{}'::jsonb, $7)`,
    [scope.workspaceId, rcId, runId, draftId, DIGEST_B, DIGEST_A, scope.actorUserId],
  );
  await pool.query(
    `INSERT INTO research.release_candidate_delivery_states_v1 (
       workspace_id, release_candidate_id, delivery_state, approval_state
     ) VALUES ($1, $2, 'NOT_DELIVERED', 'NOT_APPROVED')`,
    [scope.workspaceId, rcId],
  );
  return { draftId, rcId };
}

const ALL = { workspace_id: scope.workspaceId, q: undefined, status: [], mode: [], alpha: [], ids: [], cursor: null, before: null, limit: 50 };

describe("Research Loop P12 · Run Library persisted reader", () => {
  let pool: Pool;
  let repository: ResearchRunLibraryRepository;
  let service: ResearchRunLibraryService;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    pool = new Pool({ connectionString: DATABASE_URL });
    repository = new ResearchRunLibraryRepository(pool);
    service = new ResearchRunLibraryService(repository, config);
  }, 60_000);

  afterEach(async () => { await truncateAll(pool); });
  afterAll(async () => { await pool?.end(); });

  it("P12-T01/T08/T11: keyset ties, exact counters and typed historical absences remain truthful", async () => {
    await seedLibrary(pool);
    const first = await service.list(scope, {
      workspace_id: scope.workspaceId, q: undefined, status: [], mode: [], alpha: [], ids: [], cursor: null, before: null, limit: 1,
    });
    expect(first.items.map((item) => item.run_id)).toEqual(["run_p12_z"]);
    expect(first.page.total_rows).toBe(4);
    expect(first.page.filtered_rows).toBe(4);
    expect(first.page.next_cursor).toBeTruthy();
    expect(first.page.has_more).toBe(true);
    expect(first.page.has_previous).toBe(false);
    expect(first.as_of_utc_ms).toBeGreaterThan(0);
    expect(first.counters).toEqual({ logical_runs: 3, worker_children: 1, technical_retries: 1, legacy_metadata_rows: 1 });
    expect(first.items[0].stats.map((metric) => metric.value)).toEqual([null, null, null]);
    // RF-05: COMPLETED stats come only from a persisted P13 projection; this
    // fixture run has none, so every cell is the Hub's typed absence.
    expect(first.items[0].stats.map((metric) => metric.availability.reason_code)).toEqual([
      "P13_SOURCE_EVIDENCE_NOT_PUBLISHED",
      "P13_SOURCE_EVIDENCE_NOT_PUBLISHED",
      "P13_SOURCE_EVIDENCE_NOT_PUBLISHED",
    ]);
    expect(first.items[0].relationship.technical_retry_count).toBe(1);
    expect(first.items[0].certificate).toMatchObject({ grade: "B", availability: { state: "AVAILABLE" } });

    const second = await service.list(scope, {
      workspace_id: scope.workspaceId, q: undefined, status: [], mode: [], alpha: [], ids: [], cursor: first.page.next_cursor, before: null, limit: 1,
    });
    expect(second.items.map((item) => item.run_id)).toEqual(["run_p12_a"]);
    expect(second.page.prev_cursor).toBeTruthy();
    expect(second.page.has_more).toBe(true);
    expect(second.page.has_previous).toBe(true);
    const previous = await service.list(scope, {
      workspace_id: scope.workspaceId, q: undefined, status: [], mode: [], alpha: [], ids: [], cursor: null, before: second.page.prev_cursor, limit: 1,
    });
    expect(previous.items.map((item) => item.run_id)).toEqual(["run_p12_z"]);
    expect(previous.page.has_previous).toBe(false);
    expect(previous.page.has_more).toBe(true);

    await expect(service.list(scope, {
      workspace_id: scope.workspaceId, q: undefined, status: [], mode: [], alpha: [], ids: [], cursor: first.page.next_cursor, before: null, limit: 2,
    })).rejects.toMatchObject({ code: "RESEARCH_RUN_LIBRARY_CURSOR_INVALID" });
  });

  it("CG-P12-08: before cursor from page 3 returns exactly page 2 with microsecond timestamps", async () => {
    await seedIdentity(pool);
    // Real Portal rows carry PostgreSQL microseconds (e.g. 11:29:27.198356).
    // A millisecond-truncated boundary makes `created_at > boundary` admit the
    // boundary row itself, so "newer" repeated one row and skipped another.
    for (let index = 0; index < 12; index += 1) {
      const second = String(59 - index).padStart(2, "0");
      await pool.query(
        `INSERT INTO public.run_read_models (
           run_id, workspace_id, owner_user_id, status, protocol, strategy_id, dataset_id, created_at, updated_at
         ) VALUES ($1, $2, $3, 'COMPLETED', 'three_window_decay', 'paging-alpha', 'BTCUSDT_1h',
           $4::timestamptz, $4::timestamptz)`,
        [`page_p12_${String(index).padStart(2, "0")}`, scope.workspaceId, scope.actorUserId,
          `2026-09-21T10:00:${second}.${String(123457 + index * 111).padStart(6, "0")}Z`],
      );
    }
    const base = { workspace_id: scope.workspaceId, q: undefined, status: [], mode: [], alpha: [], ids: [], limit: 4 };
    const page1 = await service.list(scope, { ...base, cursor: null, before: null });
    const page2 = await service.list(scope, { ...base, cursor: page1.page.next_cursor, before: null });
    const page3 = await service.list(scope, { ...base, cursor: page2.page.next_cursor, before: null });
    const ids = (page: typeof page1) => page.items.map((item) => item.run_id);
    expect(ids(page1)).toEqual(["page_p12_00", "page_p12_01", "page_p12_02", "page_p12_03"]);
    expect(ids(page2)).toEqual(["page_p12_04", "page_p12_05", "page_p12_06", "page_p12_07"]);
    expect(ids(page3)).toEqual(["page_p12_08", "page_p12_09", "page_p12_10", "page_p12_11"]);
    expect(page3.page.has_more).toBe(false);
    const newer = await service.list(scope, { ...base, cursor: null, before: page3.page.prev_cursor });
    expect(ids(newer)).toEqual(ids(page2));
    expect(newer.page.has_previous).toBe(true);
    expect(newer.page.has_more).toBe(true);
    const newest = await service.list(scope, { ...base, cursor: null, before: newer.page.prev_cursor });
    expect(ids(newest)).toEqual(ids(page1));
    expect(newest.page.has_previous).toBe(false);
    // And forward again from the "newer" page lands on page 3 exactly.
    const again = await service.list(scope, { ...base, cursor: newer.page.next_cursor, before: null });
    expect(ids(again)).toEqual(ids(page3));
  });

  it("P12-T02/T03/T04/T05/T09: scope, indexed search, bounded polling and comparison facts do not become client authority", async () => {
    await seedLibrary(pool);
    // Keep this direct probe beside the service assertion: if a future view,
    // privilege or search-projection migration drifts, PostgreSQL's exact
    // error is surfaced here instead of being intentionally sanitised by the
    // public BFF error boundary.
    await expect(pool.query(
      `SELECT library.run_id
         FROM research.run_library_search_documents search
         JOIN research.run_library_rows_v1 library
           ON library.workspace_id = search.workspace_id
          AND library.source_kind = search.source_kind
          AND library.run_id = search.run_id
        WHERE library.workspace_id = $1
          AND search.search_document ILIKE $2 ESCAPE '\\'
        ORDER BY library.created_at DESC, library.run_id DESC
        LIMIT 51`,
      [scope.workspaceId, "%P12 Delta%"],
    )).resolves.toMatchObject({ rowCount: 3 });
    await pool.query("BEGIN");
    try {
      await pool.query("SET LOCAL ROLE portal_research_runtime");
      await expect(pool.query(
        `SELECT library.run_id
           FROM research.run_library_search_documents search
           JOIN research.run_library_rows_v1 library
             ON library.workspace_id = search.workspace_id
            AND library.source_kind = search.source_kind
            AND library.run_id = search.run_id
          WHERE library.workspace_id = $1
            AND search.search_document ILIKE $2 ESCAPE '\\'
          ORDER BY library.created_at DESC, library.run_id DESC
          LIMIT 51`,
        [scope.workspaceId, "%P12 Delta%"],
      )).resolves.toMatchObject({ rowCount: 3 });
    } finally {
      await pool.query("ROLLBACK");
    }
    const searched = await service.list(scope, {
      workspace_id: scope.workspaceId, q: "P12 Delta", status: [], mode: [], alpha: [], ids: [], cursor: null, before: null, limit: 50,
    });
    expect(searched.items.map((item) => item.run_id)).toEqual(["run_p12_z", "run_p12_a", "run_p12_child"]);
    expect(searched.items.every((item) => item.comparison.key !== null)).toBe(true);
    expect(new Set(searched.items.map((item) => item.comparison.key)).size).toBe(1);

    const polled = await service.list(scope, {
      workspace_id: scope.workspaceId, q: undefined, status: [], mode: [], alpha: [], ids: ["run_p12_a", "run_p12_z"], cursor: null, before: null, limit: 50,
    });
    // The server preserves its documented created/run-ID order.  The client
    // patches these two rows in place; it never receives a metric ordering.
    expect(polled.items.map((item) => item.run_id)).toEqual(["run_p12_z", "run_p12_a"]);
    expect(polled.items.every((item) => item.stats.length === 3)).toBe(true);

    await expect(service.list(
      { workspaceId: otherWorkspace, actorUserId: scope.actorUserId },
      { workspace_id: otherWorkspace, q: undefined, status: [], mode: [], alpha: [], ids: [], cursor: null, before: null, limit: 50 },
    )).rejects.toMatchObject({ code: "RESEARCH_RUN_LIBRARY_FORBIDDEN" });

    const sparkline = await service.sparkline(scope, "run_p12_z");
    expect(sparkline).toMatchObject({ values: [], availability: { state: "NOT_PUBLISHED" }, source: null });
    expect(sparkline.availability.reason_code).toBe("P13_SOURCE_EVIDENCE_NOT_PUBLISHED");
  });

  it("P12-T11: a draft historical row never receives an OOS curve or final metric by default", async () => {
    await seedLibrary(pool);
    await pool.query(
      `INSERT INTO public.run_read_models (
         run_id, workspace_id, owner_user_id, status, protocol, strategy_id, dataset_id
       ) VALUES ('legacy_p12_draft', $1, $2, 'DRAFT', 'mode_1', 'draft-alpha', 'BTCUSDT_1h')`,
      [scope.workspaceId, scope.actorUserId],
    );
    const response = await service.list(scope, {
      workspace_id: scope.workspaceId, q: undefined, status: [], mode: [], alpha: [],
      ids: ["legacy_p12_draft"], cursor: null, before: null, limit: 50,
    });
    const draft = response.items[0];
    expect(draft).toMatchObject({
      run_id: "legacy_p12_draft",
      status: "DRAFT",
      sparkline: { kind: null, availability: { state: "LEGACY_METADATA_ONLY" } },
    });
    expect(draft.stats.every((metric) => metric.value === null)).toBe(true);
    expect(draft.stats.every((metric) => metric.availability.state === "LEGACY_METADATA_ONLY")).toBe(true);
  });

  it("P12-T03/T06: search projection is trigger-maintained, indexable and does not grant the reader write authority", async () => {
    await seedLibrary(pool);
    const document = await pool.query<{ search_document: string }>(
      `SELECT search_document FROM research.run_library_search_documents
        WHERE workspace_id = $1 AND source_kind = 'RESEARCH_DURABLE' AND run_id = 'run_p12_z'`,
      [scope.workspaceId],
    );
    expect(document.rows[0]?.search_document).toContain("P12 Delta Alpha");

    // P10's allowed metadata update remains able to fire the privileged
    // trigger, but the scoped reader itself cannot write the derived index.
    await pool.query("BEGIN");
    try {
      await pool.query("SET LOCAL ROLE portal_research_runtime");
      await pool.query(
        `UPDATE research.run_producers SET updated_at = updated_at
          WHERE workspace_id = $1 AND run_id = 'run_p12_z'`,
        [scope.workspaceId],
      );
      await expect(pool.query(
        `UPDATE research.run_library_search_documents SET search_document = 'tamper'
          WHERE workspace_id = $1`,
        [scope.workspaceId],
      )).rejects.toMatchObject({ code: "42501" });
    } finally {
      await pool.query("ROLLBACK");
    }

    // DELETE and key-changing UPDATE are deliberately exercised rather than
    // assumed from the trigger source. PostgreSQL leaves NEW unassigned for a
    // DELETE trigger; this catches the exact stale-document failure that a
    // TRUNCATE-based test would miss because TRUNCATE does not fire row
    // triggers.
    await pool.query(
      `INSERT INTO public.run_read_models (
         run_id, workspace_id, owner_user_id, status, protocol, strategy_id, dataset_id
       ) VALUES ('legacy_p12_move', $1, $2, 'COMPLETED', 'mode_1', 'move-alpha', 'BTCUSDT_1h')`,
      [scope.workspaceId, scope.actorUserId],
    );
    await pool.query(
      `UPDATE public.run_read_models SET run_id = 'legacy_p12_moved'
        WHERE workspace_id = $1 AND run_id = 'legacy_p12_move'`,
      [scope.workspaceId],
    );
    const moved = await pool.query<{ run_id: string }>(
      `SELECT run_id FROM research.run_library_search_documents
        WHERE workspace_id = $1 AND source_kind = 'LEGACY_1_0_8_METADATA'
          AND run_id IN ('legacy_p12_move', 'legacy_p12_moved')
        ORDER BY run_id`,
      [scope.workspaceId],
    );
    expect(moved.rows).toEqual([{ run_id: "legacy_p12_moved" }]);
    await pool.query(
      `DELETE FROM public.run_read_models
        WHERE workspace_id = $1 AND run_id = 'legacy_p12_moved'`,
      [scope.workspaceId],
    );
    const removed = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM research.run_library_search_documents
        WHERE workspace_id = $1 AND source_kind = 'LEGACY_1_0_8_METADATA'
          AND run_id = 'legacy_p12_moved'`,
      [scope.workspaceId],
    );
    expect(removed.rows[0]?.count).toBe("0");

    await pool.query("SET enable_seqscan = off");
    try {
      const plan = await pool.query<{ "QUERY PLAN": string }>(
        `EXPLAIN (COSTS OFF)
         SELECT 1 FROM research.run_library_search_documents
          WHERE search_document ILIKE '%P12 Delta%'`,
      );
      expect(plan.rows.map((row) => row["QUERY PLAN"]).join("\n")).toMatch(/research_run_library_search_documents_trgm_idx/);

      // Pin the actual Library join shape too.  Checking the projection alone
      // is insufficient: a correlated view predicate could otherwise fall
      // back to scanning history even though the standalone GIN index exists.
      const libraryPlan = await pool.query<{ "QUERY PLAN": string }>(
        `EXPLAIN (COSTS OFF)
         SELECT library.run_id
           FROM research.run_library_search_documents search
           JOIN research.run_library_rows_v1 library
             ON library.workspace_id = search.workspace_id
            AND library.source_kind = search.source_kind
            AND library.run_id = search.run_id
          WHERE library.workspace_id = $1
            AND search.search_document ILIKE '%P12 Delta%'
          ORDER BY library.created_at DESC, library.run_id DESC
          LIMIT 51`,
        [scope.workspaceId],
      );
      const renderedLibraryPlan = libraryPlan.rows.map((row) => row["QUERY PLAN"]).join("\n");
      // At this tiny fixture PostgreSQL may correctly choose the projection
      // primary key (workspace first) instead of the trigram index; the
      // standalone probe above pins trigram capability. What must never
      // happen in the actual reader is a sequential legacy-history scan.
      expect(renderedLibraryPlan).toMatch(/Index (?:Only )?Scan|Bitmap Index Scan/);
      expect(renderedLibraryPlan).toContain("run_library_search_documents");
      expect(renderedLibraryPlan).not.toMatch(/Seq Scan on run_read_models/);
    } finally {
      await pool.query("RESET enable_seqscan");
    }
  });

  it("P12-T03/T06: page query count remains fixed as rows grow, with no worker/artifact fan-out", async () => {
    await seedIdentity(pool);
    // P12 deliberately uses ordinary legacy rows for scale proof: they are
    // metadata only, so this test cannot accidentally perform QuantBT work or
    // become financial evidence.  The response stays capped at fifty cards.
    for (let index = 0; index < 80; index += 1) {
      await pool.query(
        `INSERT INTO public.run_read_models (
           run_id, workspace_id, owner_user_id, status, protocol, strategy_id, dataset_id, created_at, updated_at
         ) VALUES ($1, $2, $3, 'COMPLETED', 'mode_1', 'scale-alpha', 'BTCUSDT_1h',
           now() - ($4::text || ' seconds')::interval, now())`,
        [`scale_p12_${String(index).padStart(3, "0")}`, scope.workspaceId, scope.actorUserId, index],
      );
    }
    const response = await service.list(scope, {
      // Search v2 (CG-P12-10): a legacy row is found by run id or recorded
      // protocol, not by its 1.0.8 strategy_id.
      workspace_id: scope.workspaceId, q: "scale_p12", status: [], mode: [], alpha: [], ids: [], cursor: null, before: null, limit: 50,
    });
    expect(response.items).toHaveLength(50);
    expect(response.page.filtered_rows).toBe(80);
    expect(response.items.every((item) => item.source_kind === "LEGACY_1_0_8_METADATA")).toBe(true);
    expect(response.items[0].sparkline.availability.state).toBe("LEGACY_METADATA_ONLY");
  });
  it("CG-P12-02/03/04/09: live-shaped COMPLETED card joins the persisted P13 projection and matches the Hub claim", async () => {
    await seedLibrary(pool);
    await seedLiveEvidence(pool);
    const response = await service.list(scope, { ...ALL, ids: [LIVE_RUN] });
    const item = response.items[0]!;
    expect(item.status).toBe("COMPLETED");
    expect(item.evidence_revision).toBe(LIVE.projection_revision);
    // CG-P12-04: mode · schedule, the mode key only, protocol carried apart.
    expect(item.mode).toEqual({
      display: "mode_1_decay · global", key: "mode_1_decay", schedule: "global",
      protocol: "three_window_decay", availability: { state: "AVAILABLE", reason_code: null },
    });
    // CG-P12-02: trades from the projection (the Hub's TRADE_COUNT), with
    // its registry scope; Sharpe/decay stay typed until CG-P13-03 lands.
    const [sharpe, decay, trades] = item.stats;
    expect(trades).toMatchObject({
      role: "TRADE_COUNT", value: LIVE.hub_trade_count.value, scope: "CHILD_TAPE",
      definition_id: LIVE.hub_trade_count.definition_id, availability: { state: "AVAILABLE", reason_code: null },
    });
    expect(trades!.value).toBe("45");
    expect(sharpe).toMatchObject({ role: "OOS_SHARPE", value: null, availability: { state: "NOT_PUBLISHED" } });
    // The captured preview projection predates CG-P13-03 `oos_analytics`.
    expect(sharpe!.availability.reason_code).toMatch(/^P13_(SOURCE_PREDATES_OOS_ANALYTICS|METRIC_REGISTRY_DOES_NOT_DEFINE_OOS_SHARPE)$/);
    expect(decay).toMatchObject({ role: "DECAY", value: null, availability: { state: "NOT_PUBLISHED" } });
    // CG-P12-03: the card knows a persisted OOS curve exists.
    expect(item.sparkline).toEqual({ kind: "oos_equity", availability: { state: "AVAILABLE", reason_code: null } });

    // CG-P12-09: the Library carries the Hub's claim state and sentence.
    const hub = await new ResearchEvidenceService(new ResearchEvidenceRepository(pool), config).hub(scope, LIVE_RUN);
    expect(item.claim).toEqual({
      state: "NOT_ISSUED", text: LIVE.progress_claim.text, availability: { state: "AVAILABLE", reason_code: null },
    });
    expect(item.claim.state).toBe(hub.claim.state);
    expect(item.claim.text).toBe(hub.claim.text);

    // CG-P12-03: <=24 extrema-preserving points from the persisted series.
    const sparkline = await service.sparkline(scope, LIVE_RUN);
    const equities = LIVE.equity_oos.payload.map((point) => point.equity);
    const numeric = equities.map(Number);
    expect(sparkline.availability).toEqual({ state: "AVAILABLE", reason_code: null });
    expect(sparkline.values).toHaveLength(24);
    expect(sparkline.values[0]).toBe(equities[0]);
    expect(sparkline.values[23]).toBe(equities[equities.length - 1]);
    expect(sparkline.values).toContain(equities[numeric.indexOf(Math.min(...numeric))]);
    expect(sparkline.values).toContain(equities[numeric.indexOf(Math.max(...numeric))]);
    expect(sparkline.values.every((value) => equities.includes(value))).toBe(true);
    expect(sparkline.source_revision).toBe(LIVE.projection_revision);
    expect(sparkline.source).toEqual({
      series_kind: "EQUITY_OOS", value_field: "equity", projection_revision: LIVE.projection_revision,
      series_digest: LIVE.equity_oos.series_digest, source_observation_count: 744,
      source_sampling: "EXTREMA_BUCKET_V1", persisted_point_count: 25, display_sampling: "EXTREMA_BUCKET_24_V1",
      first_at_utc_ms: LIVE.equity_oos.payload[0]!.at_utc_ms,
      last_at_utc_ms: LIVE.equity_oos.payload[24]!.at_utc_ms,
    });
    expect(createHash("sha256").update(canonical(LIVE.equity_oos.payload)).digest("hex")).toBe(LIVE.equity_oos.series_digest);

    // P13 rollback is its reader flag: the Library then shows typed absence.
    const dark = new ResearchRunLibraryService(repository, { ...config, FEATURE_RESEARCH_EVIDENCE: "false" } as ControlApiConfig);
    const darkItem = (await dark.list(scope, { ...ALL, ids: [LIVE_RUN] })).items[0]!;
    expect(darkItem.evidence_revision).toBeNull();
    expect(darkItem.stats.every((cell) => cell.availability.reason_code === "P13_EVIDENCE_READER_DISABLED")).toBe(true);
    expect((await dark.sparkline(scope, LIVE_RUN)).availability.reason_code).toBe("P13_EVIDENCE_READER_DISABLED");
  });

  it("CG-P12-04/05/07: ledger partitions rows; cancelled and legacy rows are not pending; legacy is not scratch", async () => {
    await seedLibrary(pool);
    await insertDurable(pool, {
      runId: "run_p12_cancel", attemptId: "attempt_p12_cancel", jobId: "job_p12_cancel",
      createdAt: "2026-09-21T07:00:00.000Z", state: "CANCELLED",
    });
    await insertDurable(pool, {
      runId: "run_p12_wait", attemptId: "attempt_p12_wait", jobId: "job_p12_wait",
      createdAt: "2026-09-21T06:00:00.000Z", state: "RUNNING",
    });
    await pool.query(
      `INSERT INTO public.run_read_models (
         run_id, workspace_id, owner_user_id, status, protocol, strategy_id, dataset_id, created_at, updated_at
       ) VALUES ('legacy_p12_queued', $1, $2, 'QUEUED', 'three_window_decay', $3, 'crypto-binance-1m',
         '2026-09-21T05:00:00.123456Z', '2026-09-21T05:00:00.123456Z')`,
      [scope.workspaceId, scope.actorUserId, ALPHA_ID],
    );
    const response = await service.list(scope, ALL);
    expect(response.claim_ledger).toEqual({
      issued: 1, not_issued: 1, pending_source: 1, failed: 1, cancelled_before_source: 1, legacy_metadata_only: 2,
    });
    const ledgerTotal = Object.values(response.claim_ledger).reduce((sum, count) => sum + count, 0);
    expect(ledgerTotal).toBe(response.page.filtered_rows);

    const byId = new Map(response.items.map((item) => [item.run_id, item]));
    const cancelled = byId.get("run_p12_cancel")!;
    expect(cancelled.claim).toEqual({
      state: null, text: null, availability: { state: "NOT_PUBLISHED", reason_code: "CANCELLED_BEFORE_SOURCE" },
    });
    expect(cancelled.stages.every((stage) => stage.availability.reason_code === "CANCELLED_BEFORE_SOURCE")).toBe(true);
    expect(byId.get("run_p12_wait")!.claim.availability.state).toBe("PENDING_SOURCE_CALLBACK");

    const legacy = byId.get("legacy_p12_queued")!;
    expect(legacy).toMatchObject({
      status: "QUEUED",
      status_basis: {
        kind: "LEGACY_RECORDED_STATUS",
        availability: { state: "LEGACY_METADATA_ONLY", reason_code: "LEGACY_1_0_8_NON_TERMINAL_STATUS_NOT_MONITORED" },
      },
      binding: null,
      binding_availability: { state: "LEGACY_METADATA_ONLY", reason_code: "LEGACY_1_0_8_DOES_NOT_PUBLISH_ALPHA_BINDING" },
      mode: { display: "three_window_decay", key: null, schedule: null, protocol: "three_window_decay" },
      rc: null,
      rc_availability: { state: "LEGACY_METADATA_ONLY" },
      sparkline: { kind: null },
    });
    expect(byId.get("run_p12_z")!.status_basis).toEqual({
      kind: "DURABLE_LIFECYCLE", availability: { state: "AVAILABLE", reason_code: null },
    });

    // Facets: modes are optimization modes only; legacy never makes scratch available.
    expect(response.filter_catalog.modes).toEqual([{ key: "mode_1_decay", display: "mode_1_decay" }]);
    expect(response.filter_catalog.scratch_available).toBe(false);
    const scratch = await service.list(scope, { ...ALL, alpha: ["scratch"] });
    expect(scratch.items).toEqual([]);
    const protocolAsMode = await service.list(scope, { ...ALL, mode: ["three_window_decay"] });
    expect(protocolAsMode.items).toEqual([]);
    const mode = await service.list(scope, { ...ALL, mode: ["mode_1_decay"] });
    expect(mode.items.every((item) => item.source_kind === "RESEARCH_DURABLE")).toBe(true);
    expect(mode.page.filtered_rows).toBe(5);
  });

  it("CG-P12-10: q matches mode, schedule and protocol; an unbound legacy row does not match an alpha", async () => {
    await seedLibrary(pool);
    // The 1.0.8 strategy id equals the alpha id, exactly as on the preview.
    await pool.query(
      `INSERT INTO public.run_read_models (
         run_id, workspace_id, owner_user_id, status, protocol, strategy_id, dataset_id
       ) VALUES ('legacy_p12_alpha_named', $1, $2, 'QUEUED', 'three_window_decay', $3, 'crypto-binance-1m')`,
      [scope.workspaceId, scope.actorUserId, ALPHA_ID],
    );
    const ids = async (q: string) => (await service.list(scope, { ...ALL, q })).items.map((item) => item.run_id);
    expect(await ids("three_window")).toEqual(["legacy_p12_alpha_named", "run_p12_z", "run_p12_a", "run_p12_child"]);
    expect(await ids("mode_1_decay")).toEqual(["run_p12_z", "run_p12_a", "run_p12_child"]);
    expect(await ids("GLOBAL")).toEqual(["run_p12_z", "run_p12_a", "run_p12_child"]);
    expect(await ids("p12-delta")).toEqual(["run_p12_z", "run_p12_a", "run_p12_child"]);
    expect(await ids("P12 Delta")).toEqual(["run_p12_z", "run_p12_a", "run_p12_child"]);
    expect(await ids("legacy_p12_alpha")).toEqual(["legacy_p12_alpha_named"]);
    // Instrument is durable-only (legacy dataset ids declare no symbol/timeframe).
    expect(await ids("BTCUSDT")).toEqual(["run_p12_z", "run_p12_a", "run_p12_child"]);
  });

  it("CG-P12-06: rc comes only from persisted P21 relations; otherwise a typed absence", async () => {
    await seedLibrary(pool);
    const sealed = await seedReleaseCandidate(pool, "run_p12_z", true);
    const draft = await seedReleaseCandidate(pool, "run_p12_a", false);
    const response = await service.list(scope, ALL);
    const byId = new Map(response.items.map((item) => [item.run_id, item]));
    expect(byId.get("run_p12_z")).toMatchObject({
      rc: {
        kind: "LOCAL_SEAL", release_candidate_id: sealed.rcId, draft_id: null,
        delivery_state: "NOT_DELIVERED", approval_state: "NOT_APPROVED",
      },
      rc_availability: { state: "AVAILABLE", reason_code: null },
    });
    expect(byId.get("run_p12_z")!.rc!.sealed_at_utc_ms).toBeGreaterThan(0);
    expect(byId.get("run_p12_a")).toMatchObject({
      rc: { kind: "ACTOR_DRAFT", release_candidate_id: null, draft_id: draft.draftId, approval_state: null },
      rc_availability: { state: "AVAILABLE" },
    });
    expect(byId.get("run_p12_child")).toMatchObject({
      rc: null, rc_availability: { state: "NOT_PUBLISHED", reason_code: "P21_NO_PERSISTED_RELEASE_CANDIDATE" },
    });
    // A pack insert refreshes the search document: rc_id is searchable.
    expect((await service.list(scope, { ...ALL, q: sealed.rcId })).items.map((item) => item.run_id)).toEqual(["run_p12_z"]);

    // Another member sees the workspace seal but not someone else's draft.
    await pool.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, 'p12-outsider', 'MEMBER')",
      [scope.workspaceId],
    );
    const other = await service.list({ workspaceId: scope.workspaceId, actorUserId: "p12-outsider" }, ALL);
    const otherById = new Map(other.items.map((item) => [item.run_id, item]));
    expect(otherById.get("run_p12_z")!.rc?.kind).toBe("LOCAL_SEAL");
    expect(otherById.get("run_p12_a")!.rc).toBeNull();

    const dark = new ResearchRunLibraryService(repository, { ...config, FEATURE_RESEARCH_RELEASE_CANDIDATES: "false" } as ControlApiConfig);
    const darkZ = (await dark.list(scope, { ...ALL, ids: ["run_p12_z"] })).items[0]!;
    expect(darkZ).toMatchObject({ rc: null, rc_availability: { reason_code: "P21_RELEASE_CANDIDATE_READER_DISABLED" } });
  });
});
