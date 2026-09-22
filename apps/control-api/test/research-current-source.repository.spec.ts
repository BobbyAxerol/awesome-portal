import { describe, expect, it, vi } from "vitest";

import {
  currentSourceBatchDigest,
  ResearchCurrentSourceRepository,
  type CurrentSourceAppendBatch,
  type CurrentSourceSealWrite,
} from "../src/research/current-source.repository";

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
