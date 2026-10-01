/**
 * W1 row H (Control API): private RS-02 current-source ingest for the Delta
 * WFO profile, the paired lane check, and the reader states it unlocks.
 */

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { PrincipalService } from "../src/auth/principal";
import {
  ResearchCurrentSourceBatchIngressSchema,
  ResearchCurrentSourceSealIngressSchema,
} from "../src/research/artifact-ingress.contract";
import { ResearchCurrentSourceIngestService } from "../src/research/current-source-ingest.service";
import {
  ResearchCurrentSourceEvidenceResponseSchema,
  ResearchCurrentSourceNotApplicableResponseSchema,
} from "../src/research/current-source.contract";
import {
  ResearchCurrentSourceRepository,
  currentSourceBatchDigest,
  currentSourceImportDigest,
  type CurrentSourceRowInput,
  type CurrentSourceSealRow,
} from "../src/research/current-source.repository";
import { ResearchCurrentSourceService } from "../src/research/current-source.service";
import { DELTA_WFO_PROFILE_DIGEST, DELTA_WFO_PROFILE_ID } from "../src/research/delta-wfo.profile";
import { P04_DELTA_ADAPTER_CONTRACT_DIGEST } from "../src/research/p04-delta.binding";
import { ResearchProgressError } from "../src/research/progress.error";
import { ResearchProgressIngressController } from "../src/research/progress-ingress.controller";
import { openApiValidator } from "./research-rf05-openapi";

const secret = "w1-private-principal-secret-0123456789";
const identity = {
  workspace_id: "ws_w1",
  run_id: "rrun_w1",
  job_id: "rjob_w1",
  worker_attempt_id: "rwa_w1",
  lease_epoch: 3,
  artifact_id: "rart_w1",
};
const lease = { workspaceId: "ws_w1", actorUserId: "usr_w1", jobId: "rjob_w1", workerAttemptId: "rwa_w1", leaseEpoch: 3 };
const manifestDigest = "a".repeat(64);
const transformDigest = "b".repeat(64);

const observationRows: CurrentSourceRowInput[] = [0, 1].map((ordinal) => ({
  sourceOrdinal: ordinal,
  sourceId: `2026-07-0${ordinal + 1}T00:00:00Z`,
  occurredAtUtcMs: Date.parse(`2026-07-0${ordinal + 1}T00:00:00Z`),
  payload: {
    source_index_utc: `2026-07-0${ordinal + 1}T00:00:00Z`,
    at_utc_ms: Date.parse(`2026-07-0${ordinal + 1}T00:00:00Z`),
    equity: String(100 + ordinal),
    return_fraction: ordinal === 0 ? "0" : "0.01",
    accepted_position: "0.5",
    drawdown_fraction: "0",
    signal_target: null,
  },
}));

function batchBody(rows: CurrentSourceRowInput[] = observationRows, overrides: Record<string, unknown> = {}) {
  return {
    ...identity,
    schema_version: "research.current-source-batch.v1",
    artifact_revision: 1,
    manifest_digest: manifestDigest,
    source_transform_digest: transformDigest,
    table_kind: "OBSERVATION",
    batch_ordinal: 0,
    batch_digest: currentSourceBatchDigest(rows),
    rows,
    ...overrides,
  };
}

const summary = {
  schema_version: "research.current-source-summary.v1",
  metrics: { initial_equity: "100", final_equity: "101", net_return_fraction: "0.01", max_drawdown_fraction: "0" },
  selection: { trial_id: "0", objective: "0.4", parameters: { window: "32" } },
  data_use: {
    warmup: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_WARMUP" },
    purge: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_PURGE" },
    embargo: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_EMBARGO" },
    strict_outer_oos_selection: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_STRICT_OOS" },
  },
  derived: {
    monthly_returns: {
      source_observation_count: 2, emitted_point_count: 0, total_period_count: 1,
      omitted_leading_period_count: 1, omitted_transport_period_count: 0, sampling: "FULL", values: [],
    },
    rolling_returns_20: {
      source_observation_count: 2, emitted_point_count: 0, window_observations: 20, sampling: "NOT_APPLICABLE", values: [],
    },
    return_distribution: {
      state: "NOT_APPLICABLE", reason_code: "QUANTBT_ADVANCED_WFO_RETURN_DISTRIBUTION_ZERO_VARIANCE",
      source_observation_count: 2, emitted_point_count: 0, sampling: "NOT_APPLICABLE", values: [],
    },
  },
};

function sealBody(overrides: Record<string, unknown> = {}) {
  return {
    ...identity,
    schema_version: "research.current-source-seal.v1",
    artifact_revision: 1,
    manifest_digest: manifestDigest,
    source_transform_digest: transformDigest,
    source_adapter_id: "rs02.quantbt-signal-notional-wfo.v1",
    profile_id: "rs02.delta-signal-notional-wfo.v1",
    retained_import_digest: "c".repeat(64),
    table_rows: { OBSERVATION: 2, FOLD: 2, TRIAL: 3, CANDIDATE: 1, SELECTION: 1 },
    total_rows: 9,
    summary,
    ...overrides,
  };
}

function signed(methods = ["research_progress_writer"]) {
  const token = new PrincipalService(secret).sign({
    principalId: "research-progress-worker",
    username: "research-progress-worker",
    accessSubject: null,
    accessEmail: null,
    role: "ADMIN",
    authnMethods: methods,
    sessionId: "research-progress-worker",
    mustChangePassword: false,
    issuedAt: new Date().toISOString(),
  });
  return { headers: { "x-portal-principal": token } } as never;
}

function controller(flags: { retained?: boolean; currentSource?: boolean } = {}) {
  const progress = { resolveIngress: vi.fn().mockResolvedValue(lease) };
  const ingest = {
    appendBatch: vi.fn().mockResolvedValue({ accepted: true }),
    seal: vi.fn().mockResolvedValue({ sealed: true }),
  };
  const instance = new ResearchProgressIngressController(
    {} as never,
    {
      INTERNAL_PRINCIPAL_SECRET: secret,
      FEATURE_RESEARCH_RETAINED_ARTIFACTS: flags.retained === false ? "false" : "true",
      FEATURE_RESEARCH_CURRENT_SOURCE: flags.currentSource === false ? "false" : "true",
    } as never,
    progress as never,
    {} as never,
    ingest as never,
  );
  return { instance, progress, ingest };
}

describe("W1 ingest wire contracts", () => {
  it("accepts exactly the camelCase rows iter_current_source_retention_batches() yields", () => {
    expect(ResearchCurrentSourceBatchIngressSchema.safeParse(batchBody()).success).toBe(true);
    const snake = { ...batchBody(), rows: [{ source_ordinal: 0, source_id: "x", occurred_at_utc_ms: null, payload: {} }] };
    expect(ResearchCurrentSourceBatchIngressSchema.safeParse(snake).success).toBe(false);
    const rows = Array.from({ length: 201 }, (_, index) => ({ ...observationRows[0]!, sourceOrdinal: index }));
    expect(ResearchCurrentSourceBatchIngressSchema.safeParse(batchBody(rows)).success).toBe(false);
    expect(ResearchCurrentSourceSealIngressSchema.safeParse(sealBody()).success).toBe(true);
    // Requested/effective/dataset digests are never accepted from the worker body.
    expect(ResearchCurrentSourceSealIngressSchema.safeParse(sealBody({ requested_spec_digest: "d".repeat(64) })).success).toBe(false);
    // Only the WFO lane pair may be sealed through this private route.
    expect(ResearchCurrentSourceSealIngressSchema.safeParse(sealBody({ source_adapter_id: "rs02.quantbt-advanced-wfo.v1" })).success).toBe(false);
  });
});

describe("W1 ingest controller", () => {
  it("resolves the exact lease before delegating either route", async () => {
    const { instance, progress, ingest } = controller();
    await instance.appendCurrentSourceBatch(signed(), batchBody());
    await instance.sealCurrentSource(signed(), sealBody());
    expect(progress.resolveIngress).toHaveBeenCalledTimes(2);
    expect(ingest.appendBatch).toHaveBeenCalledWith(lease, expect.objectContaining({ table_kind: "OBSERVATION", rows: observationRows }));
    expect(ingest.seal).toHaveBeenCalledWith(lease, expect.objectContaining({ profile_id: "rs02.delta-signal-notional-wfo.v1" }));
  });

  it("403s an unsigned or wrong-capability caller before any DB use", async () => {
    const { instance, progress } = controller();
    await expect(instance.appendCurrentSourceBatch({ headers: {} } as never, batchBody())).rejects.toMatchObject({ status: 403 });
    await expect(instance.sealCurrentSource(signed(["wrong"]), sealBody())).rejects.toMatchObject({ status: 403 });
    expect(progress.resolveIngress).not.toHaveBeenCalled();
  });

  it("503s while retained artifacts or current source is dark", async () => {
    for (const flags of [{ retained: false }, { currentSource: false }]) {
      const { instance, progress } = controller(flags);
      await expect(instance.appendCurrentSourceBatch(signed(), batchBody())).rejects.toMatchObject({ code: "RESEARCH_PROGRESS_UNAVAILABLE", status: 503 });
      await expect(instance.sealCurrentSource(signed(), sealBody())).rejects.toMatchObject({ status: 503 });
      expect(progress.resolveIngress).not.toHaveBeenCalled();
    }
  });

  it("409s a stale lease and 400s >200 rows or a body above 1,000,000 bytes", async () => {
    const stale = controller();
    stale.progress.resolveIngress.mockRejectedValue(
      new ResearchProgressError("RESEARCH_PROGRESS_STALE_LEASE", "Research progress source lease is no longer current.", 409),
    );
    await expect(stale.instance.appendCurrentSourceBatch(signed(), batchBody())).rejects.toMatchObject({ code: "RESEARCH_PROGRESS_STALE_LEASE", status: 409 });
    expect(stale.ingest.appendBatch).not.toHaveBeenCalled();
    const { instance, progress } = controller();
    const rows = Array.from({ length: 201 }, (_, index) => ({ ...observationRows[0]!, sourceOrdinal: index }));
    await expect(instance.appendCurrentSourceBatch(signed(), batchBody(rows))).rejects.toMatchObject({ status: 400 });
    const huge = { ...sealBody(), summary: { ...summary, padding: "x".repeat(1_000_001) } };
    await expect(instance.sealCurrentSource(signed(), huge)).rejects.toMatchObject({ status: 400 });
    expect(progress.resolveIngress).not.toHaveBeenCalled();
  });
});

function authority(overrides: Record<string, unknown> = {}, artifact: Record<string, unknown> = {}) {
  return {
    executionProfileId: DELTA_WFO_PROFILE_ID,
    executionProfileDigest: DELTA_WFO_PROFILE_DIGEST,
    requestedSpecDigest: "1".repeat(64),
    effectiveSpecDigest: "2".repeat(64),
    datasetBindingDigest: "3".repeat(64),
    artifact: {
      runId: identity.run_id, state: "SEALED", manifestDigest, artifactRevision: 1,
      workerAttemptId: lease.workerAttemptId, leaseEpoch: lease.leaseEpoch, ...artifact,
    },
    ...overrides,
  };
}

function ingestService(value = authority()) {
  const repository = {
    ingestAuthority: vi.fn().mockResolvedValue(value),
    append: vi.fn().mockResolvedValue({ replayed: false }),
    seal: vi.fn().mockResolvedValue({ replayed: false, retainedImportDigest: "c".repeat(64) }),
  };
  return { repository, service: new ResearchCurrentSourceIngestService(repository as never) };
}

describe("W1 ingest service authority", () => {
  it("409s a run admitted under the P04 fixed profile, even though it shares the executor digest", async () => {
    const { service, repository } = ingestService(authority({ executionProfileId: "p04.fixed-qualification.v1", executionProfileDigest: null }));
    await expect(service.appendBatch(lease, batchBody() as never)).rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_CONFLICT", status: 409 });
    await expect(service.seal(lease, sealBody() as never)).rejects.toMatchObject({ status: 409 });
    expect(repository.append).not.toHaveBeenCalled();
    expect(repository.seal).not.toHaveBeenCalled();
  });

  it("409s unless this lease's P05 artifact is SEALED with the same manifest digest and revision", async () => {
    for (const artifact of [
      { state: "WRITING" },
      { manifestDigest: "e".repeat(64) },
      { artifactRevision: 2 },
      { workerAttemptId: "rwa_other" },
      { leaseEpoch: 2 },
      { runId: "rrun_other" },
    ]) {
      const { service, repository } = ingestService(authority({}, artifact));
      await expect(service.appendBatch(lease, batchBody() as never)).rejects.toMatchObject({ status: 409 });
      expect(repository.append).not.toHaveBeenCalled();
    }
    const missing = ingestService(authority({ artifact: null }));
    await expect(missing.service.seal(lease, sealBody() as never)).rejects.toMatchObject({ status: 409 });
  });

  it("400s a row whose payload or identity does not match its table kind", async () => {
    const { service, repository } = ingestService();
    const wrongId = [{ ...observationRows[0]!, sourceId: "not-the-index" }];
    await expect(service.appendBatch(lease, batchBody(wrongId) as never)).rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
    await expect(service.appendBatch(lease, batchBody(observationRows, { table_kind: "TRIAL" }) as never))
      .rejects.toMatchObject({ status: 400 });
    expect(repository.append).not.toHaveBeenCalled();
  });

  it("seals with requested/effective/dataset digests taken from run_producers, never from the body", async () => {
    const { service, repository } = ingestService();
    const receipt = await service.seal(lease, sealBody() as never);
    expect(receipt).toMatchObject({ sealed: true, replayed: false, retained_import_digest: "c".repeat(64) });
    expect(repository.seal).toHaveBeenCalledWith({ workspaceId: lease.workspaceId, actorUserId: lease.actorUserId }, expect.objectContaining({
      sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1",
      profileId: "rs02.delta-signal-notional-wfo.v1",
      requestedSpecDigest: "1".repeat(64),
      effectiveSpecDigest: "2".repeat(64),
      datasetBindingDigest: "3".repeat(64),
      expectedRetainedImportDigest: "c".repeat(64),
    }));
    const incompatible = ingestService();
    await expect(incompatible.service.seal(lease, sealBody({ summary: { schema_version: "other" } }) as never))
      .rejects.toMatchObject({ status: 400 });
  });
});

/** A tiny in-memory PoolClient: enough SQL to exercise append/seal custody rules. */
function memoryRepository() {
  const batches: Array<Record<string, unknown>> = [];
  const rows: Array<Record<string, unknown>> = [];
  let sealRow: Record<string, unknown> | null = null;
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL|SELECT set_config|SELECT pg_advisory)/.test(sql.trim())) return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT manifest_digest, source_transform_digest")) {
        const first = batches[0];
        return first ? { rows: [first], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT batch_digest, row_count")) {
        const found = batches.find((batch) => batch.table_kind === params[3] && batch.batch_ordinal === params[4]);
        return found ? { rows: [found], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.includes("INSERT INTO research.current_source_import_batches_v1")) {
        batches.push({
          manifest_digest: params[3], source_transform_digest: params[4], table_kind: params[5],
          batch_ordinal: params[6], batch_digest: params[7], row_count: params[8],
        });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO research.current_source_rows_v1")) {
        for (const row of JSON.parse(String(params[4])) as Array<Record<string, unknown>>) rows.push({ ...row, table_kind: params[3] });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("FROM research.current_source_seals_v1")) {
        return sealRow ? { rows: [sealRow], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.includes("GROUP BY table_kind")) {
        const kinds = [...new Set(rows.map((row) => row.table_kind as string))];
        return {
          rows: kinds.map((kind) => {
            const ordinals = rows.filter((row) => row.table_kind === kind).map((row) => Number(row.source_ordinal));
            return { table_kind: kind, count: ordinals.length, minimum_ordinal: Math.min(...ordinals), maximum_ordinal: Math.max(...ordinals) };
          }),
          rowCount: kinds.length,
        };
      }
      if (sql.includes("SELECT table_kind, batch_ordinal, batch_digest, row_count")) return { rows: batches, rowCount: batches.length };
      if (sql.includes("INSERT INTO research.current_source_seals_v1")) {
        sealRow = {
          run_id: params[1], artifact_revision: params[2], source_adapter_id: params[3], profile_id: params[4],
          manifest_digest: params[5], source_transform_digest: params[6], requested_spec_digest: params[7],
          effective_spec_digest: params[8], dataset_binding_digest: params[9], retained_import_digest: params[10],
          table_rows: params[11], total_rows: params[12], summary: params[13], retained_at_utc_ms: 1,
        };
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unexpected SQL in memory repository: ${sql.slice(0, 80)}`);
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn().mockResolvedValue(client) };
  return { repository: new ResearchCurrentSourceRepository(pool as never), batches, pool };
}

describe("W1 retention custody through the real repository rules", () => {
  it("appends idempotently, 409s a conflicting batch and 400s a digest mismatch", async () => {
    const { repository, batches, pool } = memoryRepository();
    const service = new ResearchCurrentSourceIngestService(repository);
    vi.spyOn(repository, "ingestAuthority").mockResolvedValue(authority() as never);
    await expect(service.appendBatch(lease, batchBody() as never)).resolves.toMatchObject({ accepted: true, replayed: false, row_count: 2 });
    await expect(service.appendBatch(lease, batchBody() as never)).resolves.toMatchObject({ replayed: true });
    expect(batches).toHaveLength(1);
    const changed = [{ ...observationRows[0]! }, { ...observationRows[1]!, payload: { ...observationRows[1]!.payload, equity: "999" } }];
    await expect(service.appendBatch(lease, batchBody(changed) as never))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_CONFLICT", status: 409 });
    const connects = pool.connect.mock.calls.length;
    await expect(service.appendBatch(lease, batchBody(observationRows, { batch_digest: "f".repeat(64), batch_ordinal: 1 }) as never))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
    expect(pool.connect.mock.calls.length).toBe(connects);
  });

  it("the batch digest is the sha256 of the camelCase row array in canonical form (Python twin)", () => {
    const pythonCanonical = JSON.stringify(observationRows.map((row) => ({
      occurredAtUtcMs: row.occurredAtUtcMs,
      payload: Object.fromEntries(Object.entries(row.payload).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
      sourceId: row.sourceId,
      sourceOrdinal: row.sourceOrdinal,
    })));
    expect(currentSourceBatchDigest(observationRows)).toBe(createHash("sha256").update(pythonCanonical).digest("hex"));
  });
});

describe("W1 assertSeal accepts exactly the two RS-02 lane pairs", () => {
  const base = {
    runId: "rrun_w1", artifactRevision: 1, manifestDigest, sourceTransformDigest: transformDigest,
    requestedSpecDigest: "1".repeat(64), effectiveSpecDigest: "2".repeat(64), datasetBindingDigest: "3".repeat(64),
    tableRows: { OBSERVATION: 2, FOLD: 2, TRIAL: 3, CANDIDATE: 1, SELECTION: 1 }, totalRows: 9, summary,
  };
  const scope = { workspaceId: "ws_w1", actorUserId: "usr_w1" };

  it("refuses both mixed pairs before a connection and admits both valid pairs to custody", async () => {
    for (const pair of [
      { sourceAdapterId: "rs02.quantbt-advanced-wfo.v1", profileId: "rs02.delta-signal-notional-wfo.v1" },
      { sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1", profileId: "rs02.delta-wfo-global.v1" },
    ]) {
      const pool = { connect: vi.fn() };
      await expect(new ResearchCurrentSourceRepository(pool as never).seal(scope, { ...base, ...pair } as never))
        .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
      expect(pool.connect).not.toHaveBeenCalled();
    }
    for (const pair of [
      { sourceAdapterId: "rs02.quantbt-advanced-wfo.v1", profileId: "rs02.delta-wfo-global.v1" },
      { sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1", profileId: "rs02.delta-signal-notional-wfo.v1" },
    ]) {
      const pool = { connect: vi.fn().mockRejectedValue(new Error("no database in unit lane")) };
      await expect(new ResearchCurrentSourceRepository(pool as never).seal(scope, { ...base, ...pair } as never))
        .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_UNAVAILABLE" });
      expect(pool.connect).toHaveBeenCalledTimes(1);
    }
  });

  it("seals through custody, recomputes the import digest and rejects a worker digest that disagrees", async () => {
    const { repository } = memoryRepository();
    const service = new ResearchCurrentSourceIngestService(repository);
    vi.spyOn(repository, "ingestAuthority").mockResolvedValue(authority() as never);
    const kinds = {
      OBSERVATION: observationRows,
      FOLD: [0, 1].map((ordinal) => ({
        sourceOrdinal: ordinal, sourceId: `fold_${ordinal}`, occurredAtUtcMs: null,
        payload: { fold_id: `fold_${ordinal}`, train_start_utc_ms: 1, train_end_utc_ms: 2, test_start_utc_ms: 3, test_end_utc_ms: 4 },
      })),
      TRIAL: [0, 1, 2].map((ordinal) => ({
        sourceOrdinal: ordinal, sourceId: String(ordinal), occurredAtUtcMs: null,
        payload: { trial_id: String(ordinal), state: "COMPLETE", objective: "0.4", parameters: { window: "32" } },
      })),
      CANDIDATE: [{ sourceOrdinal: 0, sourceId: "c0", occurredAtUtcMs: null, payload: { candidate_id: "c0", objective: "0.4", parameters: { window: "32" } } }],
      SELECTION: [{ sourceOrdinal: 0, sourceId: "global", occurredAtUtcMs: null, payload: { selection_role: "global", trial_id: "0", objective: "0.4", parameters: { window: "32" } } }],
    } as Record<string, CurrentSourceRowInput[]>;
    const receipts = [];
    for (const [kind, rows] of Object.entries(kinds)) {
      await service.appendBatch(lease, batchBody(rows, { table_kind: kind }) as never);
      receipts.push({ table_kind: kind, batch_ordinal: 0, batch_digest: currentSourceBatchDigest(rows), row_count: rows.length });
    }
    const expected = currentSourceImportDigest(receipts as never);
    await expect(service.seal(lease, sealBody({ retained_import_digest: "0".repeat(64) }) as never))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
    await expect(service.seal(lease, sealBody({ retained_import_digest: expected }) as never))
      .resolves.toMatchObject({ sealed: true, replayed: false, retained_import_digest: expected });
    await expect(service.seal(lease, sealBody({ retained_import_digest: expected }) as never))
      .resolves.toMatchObject({ replayed: true });
    // Append-after-seal is refused by the 051 PostgreSQL trigger (RS-02 PG lane).
  });
});

const readerConfig = {
  FEATURE_RESEARCH_CURRENT_SOURCE: "true",
  QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
  QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}',
  QUERY_CURSOR_TTL_SECONDS: 900,
};

describe("W1 current-source readers by execution profile", () => {
  it("publishes a sealed WFO run with signal-notional provenance valid in Zod and OpenAPI", async () => {
    const seal: CurrentSourceSealRow = {
      runId: "rrun_w1", artifactRevision: 1,
      sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1", profileId: "rs02.delta-signal-notional-wfo.v1",
      manifestDigest, sourceTransformDigest: transformDigest, retainedImportDigest: "c".repeat(64),
      requestedSpecDigest: "1".repeat(64), effectiveSpecDigest: "2".repeat(64), datasetBindingDigest: "3".repeat(64),
      tableRows: { OBSERVATION: 2, FOLD: 2, TRIAL: 3, CANDIDATE: 1, SELECTION: 1 }, totalRows: 9,
      summary, retainedAtUtcMs: 1_727_000_000_000,
    };
    // W3: evidence also reads the (pre-W3, fact-less) fold and candidate rows.
    const rows = vi.fn().mockImplementation((_scope, _runId, _revision, kind: string) => {
      const table: Record<string, Array<{ sourceOrdinal: number; sourceId: string; occurredAtUtcMs: null; payload: Record<string, unknown> }>> = {
        FOLD: [0, 1].map((ordinal) => ({
          sourceOrdinal: ordinal, sourceId: `fold_${ordinal}`, occurredAtUtcMs: null,
          payload: { fold_id: `fold_${ordinal}`, train_start_utc_ms: 1, train_end_utc_ms: 2, test_start_utc_ms: 3, test_end_utc_ms: 4 },
        })),
        CANDIDATE: [{ sourceOrdinal: 0, sourceId: "c0", occurredAtUtcMs: null, payload: { candidate_id: "c0", objective: "0.4", parameters: { window: "32" } } }],
      };
      const found = table[kind] ?? [];
      return { rows: found, hasMore: false, hasPrevious: false, totalRows: found.length };
    });
    const service = new ResearchCurrentSourceService({ sealForRead: vi.fn().mockResolvedValue(seal), runState: vi.fn(), poolFrozenAt: vi.fn().mockResolvedValue(null), rows } as never, readerConfig as never);
    const evidence = await service.evidence({ workspaceId: "ws_w1", actorUserId: "usr_w1" }, "rrun_w1");
    expect(ResearchCurrentSourceEvidenceResponseSchema.safeParse(evidence).success).toBe(true);
    expect((evidence as { provenance: Record<string, unknown> }).provenance).toMatchObject({
      source_adapter_id: "rs02.quantbt-signal-notional-wfo.v1",
      profile_id: "rs02.delta-signal-notional-wfo.v1",
      requested_spec_digest: "1".repeat(64),
    });
    openApiValidator("research-current-source.openapi.json", "Evidence").assert(evidence);
    const mixed = { ...(evidence as Record<string, unknown>), provenance: { ...(evidence as { provenance: Record<string, unknown> }).provenance, profile_id: "rs02.delta-wfo-global.v1" } };
    expect(ResearchCurrentSourceEvidenceResponseSchema.safeParse(mixed).success).toBe(false);
    expect(openApiValidator("research-current-source.openapi.json", "Evidence").check(mixed)).toBe(false);
  });

  it("answers a WFO run without a seal as PENDING_SOURCE / PENDING_RETENTION, never NOT_APPLICABLE", async () => {
    for (const [status, laneState] of [["RUNNING", "PENDING_SOURCE"], ["COMPLETED", "PENDING_RETENTION"]] as const) {
      const service = new ResearchCurrentSourceService({
        sealForRead: vi.fn().mockResolvedValue(null),
        runState: vi.fn().mockResolvedValue({
          sourceKind: "RESEARCH_DURABLE", effectiveStatus: status,
          adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST, executionProfileId: DELTA_WFO_PROFILE_ID,
        }),
      } as never, readerConfig as never);
      await expect(service.split({ workspaceId: "ws_w1", actorUserId: "usr_w1" }, "rrun_w1"))
        .rejects.toMatchObject({ status: 409, details: { lane_state: laneState } });
    }
  });

  it("keeps the P04 NOT_APPLICABLE answer byte-identical to the pre-W1 release", async () => {
    const service = new ResearchCurrentSourceService({
      sealForRead: vi.fn().mockResolvedValue(null),
      runState: vi.fn().mockResolvedValue({
        sourceKind: "RESEARCH_DURABLE", effectiveStatus: "COMPLETED",
        adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST, executionProfileId: "p04.fixed-qualification.v1",
      }),
    } as never, readerConfig as never);
    const answer = await service.split({ workspaceId: "w1-workspace", actorUserId: "w1-admin" }, "rrun_w1_p04");
    expect(ResearchCurrentSourceNotApplicableResponseSchema.safeParse(answer).success).toBe(true);
    expect((answer as { lane: { retainable_profile_id: string } }).lane.retainable_profile_id).toBe("rs02.delta-wfo-global.v1");
    // Pinned from the pre-W1 current-source.service.ts on the same input.
    expect(createHash("sha256").update(JSON.stringify(answer)).digest("hex"))
      .toBe("aa9b7d1d2629cbe3d545ec55f395c9343623604e0ba1e974958c61362db989cc");
  });
});
