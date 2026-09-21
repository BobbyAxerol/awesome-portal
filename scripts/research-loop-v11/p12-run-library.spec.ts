import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "../../apps/control-api/node_modules/pg";

import type { ControlApiConfig } from "../../apps/control-api/src/config";
import type { ResearchScope } from "../../apps/control-api/src/research/contracts";
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

const config = testConfig({
  FEATURE_RESEARCH_RUN_LIBRARY: "true",
  QUERY_CURSOR_ACTIVE_KEY_ID: "p12-k1",
  QUERY_CURSOR_KEYS_JSON: '{"p12-k1":"p12-query-signing-key-which-is-longer-than-thirty-two-bytes"}',
}) as ControlApiConfig;

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

function progressSnapshot(runId: string, workerAttemptId: string, sequence: number, status: "RUNNING" | "COMPLETED") {
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
    claim: {
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
  state: "RUNNING" | "READY" | "FAILED";
  runKind?: "PRIMARY" | "AUDIT";
  relationshipKind?: "PRIMARY" | "AUDIT_OF_SELECTION";
  parentRunId?: string | null;
  parentAttemptId?: string | null;
  retryOrdinal?: number;
  withProgress?: boolean;
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
        JSON.stringify(progressSnapshot(input.runId, latestWorkerId, 1, status)), DIGEST_C, input.createdAt],
    );
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
    expect(first.items[0].stats.map((metric) => metric.availability.reason_code)).toEqual([
      "P12_DOES_NOT_INFER_FINAL_METRICS_FROM_PROGRESS_OR_ARTIFACTS",
      "P12_DOES_NOT_INFER_FINAL_METRICS_FROM_PROGRESS_OR_ARTIFACTS",
      "P12_DOES_NOT_INFER_FINAL_METRICS_FROM_PROGRESS_OR_ARTIFACTS",
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
    expect(sparkline).toMatchObject({ values: [], availability: { state: "NOT_PUBLISHED" } });
    expect(sparkline.availability.reason_code).toBe("P12_DOES_NOT_READ_ARTIFACT_OR_PARQUET_SERIES");
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
      workspace_id: scope.workspaceId, q: "scale-alpha", status: [], mode: [], alpha: [], ids: [], cursor: null, before: null, limit: 50,
    });
    expect(response.items).toHaveLength(50);
    expect(response.page.filtered_rows).toBe(80);
    expect(response.items.every((item) => item.source_kind === "LEGACY_1_0_8_METADATA")).toBe(true);
    expect(response.items[0].sparkline.availability.state).toBe("LEGACY_METADATA_ONLY");
  });
});
