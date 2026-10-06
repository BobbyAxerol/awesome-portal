import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { RESEARCH_DB_BUDGET } from "../src/research/contracts";

import {
  currentSourceBatchDigest,
  currentSourceSummaryWithinBudget,
  ResearchCurrentSourceRepository,
  CURRENT_SOURCE_STAGE_EVENTS_SQL,
  type CurrentSourceAppendBatch,
  type CurrentSourceSealWrite,
} from "../src/research/current-source.repository";
import { DELTA_WFO_PROFILE_ID, DELTA_WFO_PROFILE_DIGEST } from "../src/research/delta-wfo.profile";
import { DELTA_WFO_V2_PROFILE_ID, DELTA_WFO_V2_PROFILE_DIGEST } from "../src/research/delta-wfo-v2.profile";
import { p11StageEvents, P11_STAGE_BINDING_ABSENT } from "../src/research/p11-stage-events";
import { executionRecipes } from "../src/research/execution-recipes";

const scope = { workspaceId: "rs02-workspace", actorUserId: "rs02-user" };
const digest = (character: string) => character.repeat(64);

function appendInput(): CurrentSourceAppendBatch {
  const rows = [
    { sourceOrdinal: 0, sourceId: "row-0", occurredAtUtcMs: 1_704_067_200_000, payload: { value: "1" } },
    { sourceOrdinal: 1, sourceId: "row-1", occurredAtUtcMs: 1_704_153_600_000, payload: { value: "2" } },
  ];
  return {
    runId: "run-rs02", artifactRevision: 1, manifestDigest: digest("a"), sourceTransformDigest: digest("b"),
    tableKind: "OBSERVATION", batchOrdinal: 0, batchDigest: currentSourceBatchDigest(rows), rows,
  };
}

function sealInput(): CurrentSourceSealWrite {
  return {
    runId: "run-rs02", artifactRevision: 1, sourceAdapterId: "rs02.quantbt-advanced-wfo.v1", profileId: "rs02.delta-wfo-global.v1",
    manifestDigest: digest("a"), sourceTransformDigest: digest("b"), requestedSpecDigest: digest("c"),
    effectiveSpecDigest: digest("d"), datasetBindingDigest: digest("e"),
    tableRows: { OBSERVATION: 1, FOLD: 2, TRIAL: 2, CANDIDATE: 1, SELECTION: 1 }, totalRows: 7,
    summary: {},
  };
}

function stageRow() {
  return { worker_attempt_id: "worker-attempt-exact", lease_epoch: 3, artifact_id: "artifact-exact",
    execution_profile_id: DELTA_WFO_PROFILE_ID, execution_profile_digest: DELTA_WFO_PROFILE_DIGEST,
    s3_completed_utc_ms: 10, s4_started_utc_ms: 11, s4_completed_utc_ms: 42,
    requested_spec: { random_seed: 42 } };
}

function fakeRepository(respond: (sql: string, params: readonly unknown[]) => { rowCount?: number; rows?: unknown[] }) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      return { rowCount: 0, rows: [], ...respond(sql, params) };
    }),
    release: vi.fn(),
  };
  return { repository: new ResearchCurrentSourceRepository({ connect: vi.fn().mockResolvedValue(client) } as never), calls, client };
}

describe("RS-02 retained-current-source custody writes", () => {
  it("BR-F3-02 scopes one finite guard witness to the actor, run and artifact revision", async () => {
    const { repository, calls } = fakeRepository(sql => sql.includes("FROM workspace_members")
      ? { rowCount: 1, rows: [{}] } : sql.includes("count(*) AS row_count")
        ? { rows: [{ row_count: "12", first_ordinal: "0", last_ordinal: "11" }] }
        : sql.includes("occurred_at_utc_ms=ANY")
          ? { rows: [{ source_ordinal: "3", occurred_at_utc_ms: "1000" }, { source_ordinal: "8", occurred_at_utc_ms: "2000" }] } : {});
    const seal = sealInput() as never;
    expect(await repository.temporalGuardWitness(scope, seal, [1000, 2000])).toEqual({ rowCount: 12,
      firstOrdinal: 0, lastOrdinal: 11, points: [{ ordinal: 3, atUtcMs: 1000 }, { ordinal: 8, atUtcMs: 2000 }] });
    const query = calls.find(row => row.sql.includes("occurred_at_utc_ms=ANY"))!;
    expect(query.params).toEqual([scope.workspaceId, "run-rs02", 1, [1000, 2000], 3]);
    expect(calls.filter(row => row.sql.startsWith("BEGIN"))).toEqual([{ sql: "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", params: [] }]);
    expect(calls.some(row => row.sql === "SET LOCAL ROLE portal_research_runtime")).toBe(true);
    expect(calls.some(row => /INSERT|UPDATE|DELETE/.test(row.sql))).toBe(false);
  });

  it("BR-F3-02 refuses unbounded/duplicate endpoints and foreign actor membership before source read", async () => {
    const { repository, calls } = fakeRepository(() => ({}));
    const seal = sealInput() as never;
    await expect(repository.temporalGuardWitness(scope, seal, Array.from({ length: 2561 }, (_, n) => n)))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID" });
    await expect(repository.temporalGuardWitness(scope, seal, [1, 1]))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID" });
    expect(calls).toHaveLength(0);
    await expect(repository.temporalGuardWitness(scope, seal, [1000])).rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_FORBIDDEN" });
    expect(calls.some(row => row.sql.includes("FROM research.current_source_rows_v1"))).toBe(false);
  });

  it("reads S06 seal and bounded inputs in one authorized snapshot without unrelated B6 reads", async () => {
    const input = sealInput();
    const row = { run_id: input.runId, artifact_revision: 1,
      source_adapter_id: input.sourceAdapterId, profile_id: input.profileId,
      manifest_digest: input.manifestDigest, source_transform_digest: input.sourceTransformDigest,
      retained_import_digest: digest("f"), requested_spec_digest: input.requestedSpecDigest,
      effective_spec_digest: input.effectiveSpecDigest, dataset_binding_digest: input.datasetBindingDigest,
      table_rows: input.tableRows, total_rows: input.totalRows, summary: {}, retained_at_utc_ms: 100 };
    const kindRows = ["TRIAL", "TRIAL", "CANDIDATE", "FOLD", "FOLD"].map((kind, index) => ({
      table_kind: kind, source_ordinal: index, source_id: `row-${index}`, occurred_at_utc_ms: null, payload: {},
    }));
    const { repository, calls } = fakeRepository(sql => sql.includes("FROM workspace_members")
      ? { rowCount: 1, rows: [{}] } : sql.includes("FROM research.current_source_seals_v1 seal")
        ? { rowCount: 1, rows: [row] } : sql.includes("WITH bounds") ? { rows: kindRows }
          : sql === CURRENT_SOURCE_STAGE_EVENTS_SQL ? { rows: [stageRow()] } : {});
    expect(await repository.searchForRead(scope, input.runId)).toMatchObject({
      seal: { runId: input.runId, artifactRevision: 1 },
      inputs: { trials: [{}, {}], candidates: [{}], folds: [{}, {}], requestedSpec: { random_seed: 42 } },
    });
    expect(calls.filter(({ sql }) => sql.startsWith("BEGIN"))).toHaveLength(1);
    expect(calls.filter(({ sql }) => sql.includes("FROM workspace_members"))).toHaveLength(1);
    expect(calls.some(({ sql }) => sql.includes("enriched_analysis_v1"))).toBe(false);
    expect(calls.at(-1)!.sql).toBe("COMMIT");
    const missing = fakeRepository(sql => sql.includes("FROM workspace_members") ? { rowCount: 1, rows: [{}] } : {});
    expect(await missing.repository.searchForRead(scope, input.runId)).toBeNull();
    expect(missing.calls.some(({ sql }) => sql.includes("WITH bounds"))).toBe(false);
    const denied = fakeRepository(() => ({}));
    await expect(denied.repository.searchForRead(scope, input.runId)).rejects.toMatchObject({ status: 403 });
    expect(denied.calls.some(({ sql }) => sql.includes("FROM research.current_source_seals_v1 seal"))).toBe(false);
    expect(denied.calls.at(-1)!.sql).toBe("ROLLBACK");
  });
  it("reads finite S06 inputs in one scoped snapshot and binds seed to the sealed request", async () => {
    const seal = { ...sealInput(), retainedImportDigest: digest("f"), retainedAtUtcMs: 100 };
    const kindRows = ["TRIAL", "TRIAL", "CANDIDATE", "FOLD", "FOLD"].map((kind, index) => ({
      table_kind: kind, source_ordinal: index, source_id: `row-${index}`, occurred_at_utc_ms: null, payload: {},
    }));
    const { repository, calls } = fakeRepository(sql => sql.includes("FROM workspace_members")
      ? { rowCount: 1, rows: [{}] } : sql.includes("WITH bounds") ? { rows: kindRows }
        : sql === CURRENT_SOURCE_STAGE_EVENTS_SQL ? { rows: [stageRow()] } : {});
    const result = await repository.searchInputs(scope, seal);
    expect(result).toMatchObject({ trials: [{}, {}], candidates: [{}], folds: [{}, {}],
      stageEvents: { s3_completed_utc_ms: 10, s4_started_utc_ms: 11, s4_completed_utc_ms: 42 }, requestedSpec: { random_seed: 42 } });
    expect(calls.filter(({ sql }) => sql.startsWith("BEGIN"))).toHaveLength(1);
    expect(calls.filter(({ sql }) => sql.includes("FROM workspace_members"))).toHaveLength(1);
    expect(calls.find(({ sql }) => sql.includes("WITH bounds"))!.params).toEqual([scope.workspaceId, seal.runId, 1, 64, 64]);
    expect(calls.find(({ sql }) => sql === CURRENT_SOURCE_STAGE_EVENTS_SQL)!.params).toEqual([
      scope.workspaceId, seal.runId, seal.artifactRevision, seal.manifestDigest,
      seal.requestedSpecDigest, seal.effectiveSpecDigest, seal.datasetBindingDigest,
    ]);
    expect(calls.at(-1)!.sql).toBe("COMMIT");
    const short = fakeRepository(sql => sql.includes("FROM workspace_members") ? { rowCount: 1, rows: [{}] } : {});
    await expect(short.repository.searchInputs(scope, seal)).rejects.toMatchObject({ status: 503 });
    expect(short.calls.at(-1)!.sql).toBe("ROLLBACK");
    const denied = fakeRepository(() => ({}));
    await expect(denied.repository.searchInputs(scope, seal)).rejects.toMatchObject({ status: 403 });
    expect(denied.calls.some(({ sql }) => sql.includes("WITH bounds"))).toBe(false);
  });

  it("reads an already sealed 400-trial history with new long-job admission disabled", async () => {
    const seal = { ...sealInput(), retainedImportDigest: digest("f"), retainedAtUtcMs: 100,
      tableRows: { OBSERVATION: 1, FOLD: 2, TRIAL: 400, CANDIDATE: 1, SELECTION: 1 }, totalRows: 405 };
    const kindRows = [...Array.from({ length: 400 }, (_, index) => ({
      table_kind: "TRIAL", source_ordinal: index, source_id: `trial-${index}`, occurred_at_utc_ms: null, payload: {},
    })), ...["CANDIDATE", "FOLD", "FOLD"].map((kind, index) => ({
      table_kind: kind, source_ordinal: index, source_id: `${kind}-${index}`, occurred_at_utc_ms: null, payload: {},
    }))];
    const { repository, calls } = fakeRepository(sql => sql.includes("FROM workspace_members")
      ? { rowCount: 1, rows: [{}] } : sql.includes("WITH bounds") ? { rows: kindRows }
        : sql === CURRENT_SOURCE_STAGE_EVENTS_SQL ? { rows: [stageRow()] } : {});
    expect((await repository.searchInputs(scope, seal)).trials).toHaveLength(400);
    expect(calls.find(({ sql }) => sql.includes("WITH bounds"))!.params.slice(-2)).toEqual([400, 64]);
    expect(calls.some(({ sql }) => /INSERT|UPDATE|DELETE/.test(sql))).toBe(false);
    // The reader correction must not qualify a new long optimizer seal.
    await expect(repository.seal(scope, seal)).rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID" });
    expect(calls.some(({ sql }) => /INSERT|UPDATE|DELETE/.test(sql))).toBe(false);
    const excess = { ...seal, tableRows: { ...seal.tableRows, TRIAL: 401 } };
    await expect(repository.searchInputs(scope, excess)).rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_UNAVAILABLE" });
    expect(calls.filter(({ sql }) => sql.includes("WITH bounds")).at(-1)!.params.slice(-2)).toEqual([400, 64]);
  });
  it("keeps exact expanded fold-local and candidate census readable without widening legacy or foreign pairs", async () => {
    const recipe = executionRecipes.find(r => r.descriptor.schema_version === "research.expanded-trial-profile.v1"
      && "max_total_trials" in r.public_profile && r.public_profile.max_total_trials === 6400)!;
    const pair = (recipe.descriptor as {current_source: {profile_id: string; source_adapter_id: string}}).current_source;
    const seal = { ...sealInput(), profileId: pair.profile_id, sourceAdapterId: pair.source_adapter_id,
      retainedImportDigest: digest("f"), retainedAtUtcMs: 100,
      tableRows: { OBSERVATION: 1, FOLD: 16, TRIAL: 6400, CANDIDATE: 400, SELECTION: 1 }, totalRows: 6818 };
    const rows = Object.entries({TRIAL: 6400, CANDIDATE: 400, FOLD: 16}).flatMap(([kind, count]) =>
      Array.from({length: count}, (_, n) => ({table_kind: kind, source_ordinal: n, source_id: `${kind}-${n}`, occurred_at_utc_ms: null, payload: {}})));
    const {repository, calls} = fakeRepository(sql => sql.includes("FROM workspace_members") ? {rowCount: 1, rows: [{}]}
      : sql.includes("WITH bounds") ? {rows} : {});
    expect((await repository.searchInputs(scope, seal)).trials).toHaveLength(6400);
    expect(calls.find(r => r.sql.includes("WITH bounds"))!.params.slice(-2)).toEqual([6400, 400]);
    await expect(repository.searchInputs(scope, {...seal, sourceAdapterId: "foreign.v2"})).rejects.toMatchObject({status: 503});
    await expect(repository.searchInputs(scope, {...seal, tableRows: {...seal.tableRows, TRIAL: 6401}})).rejects.toMatchObject({status: 503});
    expect(calls.some(r => /INSERT|UPDATE|DELETE/.test(r.sql))).toBe(false);
  });
  it("binds P11 clocks to the exact SEALED artifact attempt, lease, request/effective/data and historical profile", async () => {
    const seal = { ...sealInput(), retainedImportDigest: digest("f"), retainedAtUtcMs: 100 };
    const { repository, calls } = fakeRepository(sql => sql.includes("FROM workspace_members")
      ? { rowCount: 1, rows: [{}] } : sql === CURRENT_SOURCE_STAGE_EVENTS_SQL ? { rows: [stageRow()] } : {});
    const clocks = await repository.stageEventClocks(scope, seal);
    expect(clocks).toMatchObject({ s3_completed_utc_ms: 10, s4_started_utc_ms: 11, s4_completed_utc_ms: 42,
      reason_codes: { s3_completed: null, s4_started: null, s4_completed: null } });
    expect(clocks.source_binding_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(clocks).not.toHaveProperty("worker_attempt_id");
    expect(clocks).not.toHaveProperty("search_completed_utc_ms");
    expect(CURRENT_SOURCE_STAGE_EVENTS_SQL).toContain("artifact.worker_attempt_id=producer.worker_attempt_id AND artifact.lease_epoch=producer.lease_epoch");
    expect(CURRENT_SOURCE_STAGE_EVENTS_SQL).toContain("artifact.state='SEALED' AND artifact.artifact_revision=$3 AND artifact.manifest_digest=$4");
    expect(CURRENT_SOURCE_STAGE_EVENTS_SQL).toContain("producer.requested_spec_digest=$5 AND producer.effective_spec_digest=$6");
    expect(CURRENT_SOURCE_STAGE_EVENTS_SQL).toContain("producer.dataset_binding_digest=$7");
    expect(CURRENT_SOURCE_STAGE_EVENTS_SQL).toContain("(SELECT count(*) FROM bound_producer)=1");
    expect(CURRENT_SOURCE_STAGE_EVENTS_SQL).not.toContain("ORDER BY created_at");
    expect(calls.find(({ sql }) => sql === CURRENT_SOURCE_STAGE_EVENTS_SQL)!.params).toEqual([
      scope.workspaceId, seal.runId, 1, seal.manifestDigest, seal.requestedSpecDigest, seal.effectiveSpecDigest, seal.datasetBindingDigest,
    ]);
    expect(calls.findIndex(({ sql }) => sql.includes("FROM workspace_members"))).toBeLessThan(
      calls.findIndex(({ sql }) => sql === CURRENT_SOURCE_STAGE_EVENTS_SQL));
    const v2 = fakeRepository(sql => sql.includes("FROM workspace_members") ? { rowCount: 1, rows: [{}] }
      : sql === CURRENT_SOURCE_STAGE_EVENTS_SQL ? { rows: [{ ...stageRow(), execution_profile_id: DELTA_WFO_V2_PROFILE_ID,
        execution_profile_digest: DELTA_WFO_V2_PROFILE_DIGEST }] } : {});
    const temporal = await v2.repository.stageEventClocks(scope, seal);
    expect(temporal.s4_completed_utc_ms).toBe(42);
    expect(temporal.source_binding_digest).not.toBe(clocks.source_binding_digest);
  });
  it("cannot lend clocks from absent, ambiguous or mismatched profiles; missing events have individual reasons", async () => {
    const seal = { ...sealInput(), retainedImportDigest: digest("f"), retainedAtUtcMs: 100 };
    for (const rows of [[], [stageRow(), stageRow()], [{ ...stageRow(), execution_profile_digest: digest("0") }],
      [{ ...stageRow(), execution_profile_id: DELTA_WFO_PROFILE_ID, execution_profile_digest: DELTA_WFO_V2_PROFILE_DIGEST }]]) {
      const { repository } = fakeRepository(sql => sql.includes("FROM workspace_members") ? { rowCount: 1, rows: [{}] }
        : sql === CURRENT_SOURCE_STAGE_EVENTS_SQL ? { rows } : {});
      expect(await repository.stageEventClocks(scope, seal)).toEqual(p11StageEvents());
      expect((await repository.stageEventClocks(scope, seal)).reason_codes.s4_completed).toBe(P11_STAGE_BINDING_ABSENT);
    }
    const partial = fakeRepository(sql => sql.includes("FROM workspace_members") ? { rowCount: 1, rows: [{}] }
      : sql === CURRENT_SOURCE_STAGE_EVENTS_SQL ? { rows: [{ ...stageRow(), s3_completed_utc_ms: null, s4_started_utc_ms: null }] } : {});
    expect(await partial.repository.stageEventClocks(scope, seal)).toMatchObject({ s3_completed_utc_ms: null, s4_started_utc_ms: null,
      s4_completed_utc_ms: 42, reason_codes: { s3_completed: "P11_S3_COMPLETED_EVENT_NOT_RETAINED",
        s4_started: "P11_S4_STARTED_EVENT_NOT_RETAINED", s4_completed: null } });
  });
  it("counts sparse keyset edges with the total in one scoped query, including empty windows", async () => {
    const { repository, calls } = fakeRepository(sql => sql.includes("FROM workspace_members")
      ? { rowCount: 1, rows: [{}] } : sql.includes("SELECT source_ordinal")
        ? { rows: [{ source_ordinal: 15, source_id: "row-15", occurred_at_utc_ms: null, payload: {} }] }
        : sql.includes("FILTER (WHERE") ? { rows: [{ count: 3, previous_count: 1, following_count: 1 }] } : {});
    expect(await repository.rows(scope, "run-rs02", 1, "OBSERVATION", { afterOrdinal: 10, limit: 1 }))
      .toMatchObject({ hasMore: true, hasPrevious: true, totalRows: 3 });
    const counts = calls.filter(({ sql }) => sql.includes("count(*)"));
    expect(counts).toHaveLength(1);
    expect(counts[0]!.params).toEqual([scope.workspaceId, "run-rs02", 1, "OBSERVATION", 15, 15]);
    const empty = fakeRepository(sql => sql.includes("FROM workspace_members") ? { rowCount: 1, rows: [{}] }
      : sql.includes("FILTER (WHERE") ? { rows: [{ count: 3, previous_count: 0, following_count: 0 }] } : {});
    expect(await empty.repository.rows(scope, "run-rs02", 1, "OBSERVATION", { afterOrdinal: 99, limit: 1 }))
      .toEqual({ rows: [], totalRows: 3, hasMore: false, hasPrevious: false });
    expect(empty.calls.find(({ sql }) => sql.includes("FILTER (WHERE"))!.params.slice(-2)).toEqual([null, null]);
  });
  it("sets the same five transaction-local bounds in one query before individual membership and retained reads", async () => {
    const { repository, calls } = fakeRepository(sql => sql.includes("FROM workspace_members")
      ? { rowCount: 1, rows: [{}] } : {});
    expect(await repository.sealForRead(scope, "run-rs02")).toBeNull();
    const settings = calls.filter(({ sql }) => sql.includes("set_config("));
    expect(settings).toHaveLength(1);
    expect(settings[0]!.params).toEqual([
      `${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`, `${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`,
      `${RESEARCH_DB_BUDGET.idleTransactionTimeoutMs}ms`, scope.workspaceId, scope.actorUserId,
    ]);
    expect(settings[0]!.sql.match(/set_config\(/g)).toHaveLength(5);
    expect(settings[0]!.sql.match(/, true\)/g)).toHaveLength(5);
    expect(calls.findIndex(({ sql }) => sql.includes("set_config("))).toBeLessThan(
      calls.findIndex(({ sql }) => sql.includes("FROM workspace_members")));
    expect(calls.at(-1)!.sql).toBe("COMMIT");
    const denied = fakeRepository(() => ({}));
    await expect(denied.repository.sealForRead(scope, "run-rs02")).rejects.toMatchObject({ status: 403 });
    expect(denied.calls.some(({ sql }) => sql.includes("FROM research.current_source_seals_v1"))).toBe(false);
    expect(denied.calls.at(-1)!.sql).toBe("ROLLBACK");
  });
  it("budgets immutable core/enrichment separately using JSONB spacing", () => {
    expect(currentSourceSummaryWithinBudget({ authority: "x".repeat(60_000),
      enriched_analysis: { authority: "y".repeat(70_000) } })).toBe(true);
    expect(currentSourceSummaryWithinBudget({ authority: "x".repeat(65_536) })).toBe(false);
    expect(currentSourceSummaryWithinBudget({ enriched_analysis: { authority: "y".repeat(73_728) } })).toBe(false);
    const crowded = { values: Array.from({ length: 3000 }, () => ({ a: "x", b: "y" })) };
    expect(Buffer.byteLength(JSON.stringify(crowded))).toBeLessThan(65_536);
    expect(currentSourceSummaryWithinBudget(crowded)).toBe(false);
    // These commas/colons/escaped quotes belong to string values, not JSONB
    // structural spacing; a near-boundary core must not be falsely refused.
    expect(currentSourceSummaryWithinBudget({ text: ':,"'.repeat(10_000) })).toBe(true);
    expect(currentSourceSummaryWithinBudget({ enriched_analysis: null })).toBe(false);
  });

  it("BR-F6: companion digest and import binding are verified in the scoped read", async () => {
    const distributions = JSON.parse(readFileSync(join(process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts"), "fixtures/research-all-time-distributions.valid.json"), "utf8"));
    const input = sealInput();
    const row = {
      run_id: input.runId, artifact_revision: 1,
      source_adapter_id: input.sourceAdapterId, profile_id: input.profileId,
      manifest_digest: input.manifestDigest, source_transform_digest: input.sourceTransformDigest,
      retained_import_digest: digest("f"), requested_spec_digest: input.requestedSpecDigest,
      effective_spec_digest: input.effectiveSpecDigest, dataset_binding_digest: input.datasetBindingDigest,
      table_rows: { ...input.tableRows, OBSERVATION: 4 }, total_rows: 10,
      summary: {}, retained_at_utc_ms: 1_725_000_000_000,
      distributions, distributions_digest: sha256ResearchJson(distributions),
      distributions_retained_import_digest: digest("f"), distributions_source_rows_digest: digest("9"),
    };
    const make = (overrides: Record<string, unknown>) => fakeRepository((sql) => {
      if (sql.includes("FROM workspace_members")) return { rowCount: 1, rows: [{}] };
      if (sql.includes("FROM research.current_source_seals_v1")) return { rowCount: 1, rows: [{ ...row, ...overrides }] };
      return {};
    }).repository;
    expect((await make({}).sealForRead(scope, input.runId))?.distributionsSidecar?.digest).toBe(row.distributions_digest);
    for (const malformed of [
      { distributions_digest: digest("0") },
      { distributions_retained_import_digest: digest("0") },
      { distributions_source_rows_digest: null },
      { table_rows: input.tableRows },
    ]) {
      await expect(make(malformed).sealForRead(scope, input.runId)).rejects.toMatchObject({
        code: "RESEARCH_CURRENT_SOURCE_UNAVAILABLE", status: 503,
      });
    }
  });
  it("uses one shared custody lock and one JSON recordset insert per admitted batch", async () => {
    const { repository, calls, client } = fakeRepository((sql) => {
      if (sql.includes("FROM research.current_source_import_batches_v1")) return { rowCount: 0, rows: [] };
      return {};
    });

    await repository.append(scope, appendInput());

    const lock = calls.find(({ sql }) => sql.includes("pg_advisory_xact_lock"));
    expect(lock?.params[0]).toBe("rs02-workspace:run-rs02:1:rs02-custody");
    const rowInserts = calls.filter(({ sql }) => sql.includes("INSERT INTO research.current_source_rows_v1"));
    expect(rowInserts).toHaveLength(1);
    expect(rowInserts[0]!.sql).toContain("jsonb_to_recordset");
    expect(JSON.parse(String(rowInserts[0]!.params[4]))).toEqual([
      { source_id: "row-0", source_ordinal: 0, occurred_at_utc_ms: 1_704_067_200_000, payload: { value: "1" } },
      { source_id: "row-1", source_ordinal: 1, occurred_at_utc_ms: 1_704_153_600_000, payload: { value: "2" } },
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("fails closed when an append tries to mix a different sealed source identity", async () => {
    const { repository, calls } = fakeRepository((sql) => {
      if (sql.includes("FROM research.current_source_import_batches_v1") && sql.includes("LIMIT 1")) {
        return { rowCount: 1, rows: [{ manifest_digest: digest("f"), source_transform_digest: digest("b") }] };
      }
      return {};
    });

    await expect(repository.append(scope, appendInput())).rejects.toMatchObject({
      code: "RESEARCH_CURRENT_SOURCE_CONFLICT", status: 409,
    });
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO research.current_source_rows_v1"))).toBe(false);
  });

  it("does not turn an immutable retry with a changed spec binding into success", async () => {
    const input = sealInput();
    const { repository } = fakeRepository((sql) => {
      if (sql.includes("FROM research.current_source_seals_v1")) {
        return {
          rowCount: 1,
          rows: [{
            run_id: input.runId, artifact_revision: input.artifactRevision,
            source_adapter_id: input.sourceAdapterId, profile_id: input.profileId,
            manifest_digest: input.manifestDigest, source_transform_digest: input.sourceTransformDigest,
            retained_import_digest: digest("f"), requested_spec_digest: digest("9"),
            effective_spec_digest: input.effectiveSpecDigest, dataset_binding_digest: input.datasetBindingDigest,
            table_rows: input.tableRows, total_rows: input.totalRows, summary: input.summary,
            retained_at_utc_ms: 1_725_000_000_000,
          }],
        };
      }
      return {};
    });

    await expect(repository.seal(scope, input)).rejects.toMatchObject({
      code: "RESEARCH_CURRENT_SOURCE_CONFLICT", status: 409,
    });
  });
});
