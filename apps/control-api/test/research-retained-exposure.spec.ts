import { describe, expect, it, vi } from "vitest";
import { appendRetainedExposure, retainedExposureAuthority, RetainedExecutionObservationSchema } from "../src/research/retained-exposure";
import { ResearchCurrentSourceRepository } from "../src/research/current-source.repository";

const scope = { workspaceId: "ws_exp", actorUserId: "usr_exp" };
const fact = { schema_version: "research.execution-observation.v1", basis: "PORTAL_ADAPTER_ENGINE_CALL_COMPLETED",
  started_at_utc_ms: 1_700_000_000_000, completed_at_utc_ms: 1_700_000_001_000,
  range_start_utc_ms: 1_600_000_000_000, range_end_exclusive_utc_ms: 1_600_086_400_000, evaluation_role: "SELECTION_INPUT" };
describe("Retained actual execution exposure", () => {
  it("does not call an observation an engine first-read timestamp", () => {
    expect(RetainedExecutionObservationSchema.safeParse(fact).success).toBe(true);
    expect(RetainedExecutionObservationSchema.safeParse({ ...fact, basis: "ENGINE_FIRST_READ" }).success).toBe(false);
    expect(RetainedExecutionObservationSchema.safeParse({ ...fact, completed_at_utc_ms: fact.started_at_utc_ms - 1 }).success).toBe(false);
  });
  it("locks and rejects cancelled, expired or replaced worker authority", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }) };
    await expect(retainedExposureAuthority(client as never, scope, "rrun_exp", { workerAttemptId: "rwa_exp", leaseEpoch: 4 })).rejects.toMatchObject({ status: 409 });
    const [sql, args] = client.query.mock.calls[0]!;
    expect(sql).toContain("worker.expires_at > clock_timestamp()");
    expect(sql).toContain("FOR UPDATE OF producer, job, worker");
    expect(sql).toContain("job.state='RUNNING'");
    expect(args).toEqual([scope.workspaceId, "rrun_exp", "rwa_exp", 4]);
  });
  it("binds the fact and one audit row to the source snapshot, not a browser body", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }) };
    const input = { runId: "rrun_exp", artifactRevision: 1, manifestDigest: "a".repeat(64), snapshotDigest: "b".repeat(64), observation: fact };
    await appendRetainedExposure(client as never, scope, input);
    expect(client.query.mock.calls).toHaveLength(2);
    const [sql, params] = client.query.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO research.exposure_facts");
    expect(params[4]).toBe(input.snapshotDigest);
    expect(params[7]).toBe("SELECTION_INPUT");
    expect(params[8]).toContain("PORTAL_ADAPTER_ENGINE_CALL_COMPLETED");
    expect(params[9]).toEqual(new Date(fact.completed_at_utc_ms));
    expect(client.query.mock.calls[1]![0]).toContain("research.audit_log");
  });
  it("an immutable retry returns without writing another exposure or audit", async () => {
    const input = { runId: "rrun_exp", artifactRevision: 1, sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1" as const,
      profileId: "rs02.delta-signal-notional-wfo.v1" as const, manifestDigest: "a".repeat(64), sourceTransformDigest: "b".repeat(64),
      requestedSpecDigest: "c".repeat(64), effectiveSpecDigest: "d".repeat(64), datasetBindingDigest: "e".repeat(64),
      tableRows: { OBSERVATION: 1, FOLD: 2, TRIAL: 3, CANDIDATE: 1, SELECTION: 1 }, totalRows: 8,
      summary: { execution_observation: fact }, lease: { workerAttemptId: "rwa_exp", leaseEpoch: 1 } };
    const client = { query: vi.fn(async (sql: string) => {
      if (sql.includes("SELECT producer.snapshot_content_hash")) return { rowCount: 1, rows: [{ snapshot_content_hash: "f".repeat(64) }] };
      if (sql.includes("FROM research.current_source_seals_v1")) return { rowCount: 1, rows: [{
        run_id: input.runId, artifact_revision: 1, source_adapter_id: input.sourceAdapterId, profile_id: input.profileId,
        manifest_digest: input.manifestDigest, source_transform_digest: input.sourceTransformDigest, retained_import_digest: "f".repeat(64),
        requested_spec_digest: input.requestedSpecDigest, effective_spec_digest: input.effectiveSpecDigest,
        dataset_binding_digest: input.datasetBindingDigest, table_rows: input.tableRows, total_rows: input.totalRows,
        summary: input.summary, retained_at_utc_ms: 1_700_000_001_000,
      }] };
      return { rowCount: 0, rows: [] };
    }), release: vi.fn() };
    const repository = new ResearchCurrentSourceRepository({ connect: vi.fn().mockResolvedValue(client) } as never);
    expect((await repository.seal(scope, input)).replayed).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO research.exposure_facts"))).toBe(false);
  });
});
