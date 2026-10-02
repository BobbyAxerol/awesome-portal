import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { RESEARCH_DB_BUDGET } from "../src/research/contracts";
import { ResearchEvidenceRepository } from "../src/research/evidence.repository";

const scope = { workspaceId: "ws-evidence", actorUserId: "usr-evidence" };

function harness(member: boolean, legacy = false, durableRow?: Record<string, unknown>) {
  const calls: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const client = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("FROM workspace_members")) return { rows: member ? [{ one: 1 }] : [], rowCount: member ? 1 : 0 };
      if (sql.includes("FROM research.run_producers producer")) return { rows: durableRow ? [durableRow] : [], rowCount: durableRow ? 1 : 0 };
      if (sql.includes("FROM public.run_read_models")) return legacy
        ? { rows: [{ run_id: "rrun-evidence", as_of_utc_ms: "1234" }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn().mockResolvedValue(client) };
  return { repository: new ResearchEvidenceRepository(pool as never), client, calls };
}

function retainedRow(): Record<string, unknown> {
  return {
    run_id: "rrun-evidence", run_state: "READY", run_created_at_utc_ms: "1200", as_of_utc_ms: "1234",
    alpha_id: null, alpha_name: null, alpha_version_id: null, requested_spec: null,
    preflight_snapshot: null, preflight_topology: null, progress_snapshot: null,
    requested_spec_digest: "1".repeat(64), effective_spec_digest: "2".repeat(64),
    dataset_binding_digest: "3".repeat(64), manifest_digest: "4".repeat(64), job_state: "SUCCEEDED",
    projection_revision: null, projection: null, readiness: null, source_evidence_digest: null, received_at: null,
    display_profile_id: null, display_ordinal: null,
    retained_run_id: "rrun-evidence", retained_source_adapter_id: "rs02.quantbt-signal-notional-wfo.v1",
    retained_profile_id: "rs02.delta-signal-notional-wfo.v1", retained_artifact_revision: "2",
    retained_import_digest: "5".repeat(64), retained_manifest_digest: "6".repeat(64),
    retained_artifact_manifest_digest: "6".repeat(64), retained_artifact_sealed_revision: "2", retained_artifact_state: "SEALED",
    retained_requested_spec_digest: "1".repeat(64), retained_effective_spec_digest: "2".repeat(64),
    retained_dataset_binding_digest: "3".repeat(64), lifecycle_status: "COMPLETED", terminal_materialized: true,
  };
}

const compactSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("P23 W06 · Evidence transaction setup", () => {
  it("keeps five RLS/time budget values transaction-local in one parameterized round trip", async () => {
    const { repository, client, calls } = harness(true);
    await expect(repository.hub(scope, "rrun-evidence")).resolves.toBeNull();

    const setup = calls.filter(({ sql }) => sql.includes("set_config("));
    expect(setup).toHaveLength(1);
    expect(setup[0]?.values).toEqual([
      String(RESEARCH_DB_BUDGET.statementTimeoutMs) + "ms",
      String(RESEARCH_DB_BUDGET.lockTimeoutMs) + "ms",
      String(RESEARCH_DB_BUDGET.idleTransactionTimeoutMs) + "ms",
      scope.workspaceId,
      scope.actorUserId,
    ]);
    expect(setup[0]?.sql.match(/set_config\(/g)).toHaveLength(5);
    expect(setup[0]?.sql.match(/, true\)/g)).toHaveLength(5);
    expect(calls[0]?.sql).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(calls[1]?.sql).toContain("SET LOCAL ROLE");
    expect(calls.indexOf(setup[0]!)).toBeLessThan(calls.findIndex(({ sql }) => sql.includes("FROM workspace_members")));
    expect(calls.at(-1)?.sql).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("keeps the DB transaction timestamp in matched rows without a standalone SQL trip", async () => {
    const { repository, calls } = harness(true, true);
    const hub = await repository.hub(scope, "rrun-evidence");
    expect(hub).toMatchObject({ kind: "LEGACY", asOfUtcMs: 1234 });
    expect(calls).toHaveLength(7);
    expect(calls.filter(({ sql }) => sql.includes("transaction_timestamp()"))).toHaveLength(2);
    expect(calls.filter(({ sql }) => sql.includes("transaction_timestamp()")).every(({ sql }) =>
      sql.includes("FROM research.run_producers producer") || sql.includes("FROM public.run_read_models"))).toBe(true);
    expect(calls.at(-1)?.sql).toBe("COMMIT");
  });

  it("still denies nonmembers before reading a run and rolls back", async () => {
    const { repository, client, calls } = harness(false);
    await expect(repository.hub(scope, "rrun-evidence")).rejects.toMatchObject({
      code: "RESEARCH_EVIDENCE_FORBIDDEN", status: 403,
    });
    expect(calls.some(({ sql }) => sql.includes("FROM research.run_producers producer"))).toBe(false);
    expect(calls.at(-1)?.sql).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("binds retained authority to the current worker's exact head and checkpoint plus latest same-run seal", async () => {
    const { repository, calls } = harness(true, false, retainedRow());
    const hub = await repository.hub(scope, "rrun-evidence");
    const read = calls.find(({ sql }) => sql.includes("FROM research.run_producers producer"))!;
    const sql = compactSql(read.sql);
    expect(read.values).toEqual([scope.workspaceId, "rrun-evidence"]);
    expect(sql).toContain("LEFT JOIN research.run_progress_snapshots snapshot ON snapshot.workspace_id = producer.workspace_id AND snapshot.run_id = producer.run_id AND snapshot.worker_attempt_id = producer.worker_attempt_id");
    expect(sql).toContain("LEFT JOIN research.run_progress_events head ON head.workspace_id = snapshot.workspace_id AND head.run_id = snapshot.run_id AND head.worker_attempt_id = snapshot.worker_attempt_id AND head.source_sequence = snapshot.source_latest_sequence");
    expect(sql).toContain("LEFT JOIN research.run_terminal_materializations_v1 checkpoint ON checkpoint.workspace_id = head.workspace_id AND checkpoint.run_id = head.run_id AND checkpoint.worker_attempt_id = head.worker_attempt_id AND checkpoint.source_sequence = head.source_sequence");
    expect(sql).toContain("research.run_lifecycle_status_v1(job.state, durable_run.state, true, snapshot.snapshot->>'status', head.event_type IN ('run_completed','run_failed'), checkpoint.source_sequence IS NOT NULL) AS lifecycle_status");
    expect(sql).toContain("(head.event_type = 'run_completed' AND checkpoint.source_sequence IS NOT NULL) AS terminal_materialized");
    expect(sql).toContain("FROM research.current_source_seals_v1 WHERE workspace_id = producer.workspace_id AND run_id = producer.run_id ORDER BY artifact_revision DESC LIMIT 1 ) retained ON true");
    expect(sql).toContain("FROM research.artifacts WHERE workspace_id = producer.workspace_id AND run_id = producer.run_id AND artifact_revision = retained.artifact_revision AND manifest_digest = retained.manifest_digest AND state = 'SEALED' ORDER BY artifact_id ASC LIMIT 1 ) sealed_artifact ON true");
    expect(sql).toContain("WHERE producer.workspace_id = $1 AND producer.run_id = $2");
    // An old/cross-worker or non-head event cannot satisfy these compound joins.
    // Observation/receipt timestamps never substitute for a completion checkpoint.
    expect(sql).not.toMatch(/materialized_at|head\.received_at|snapshot\.received_at|now\(\)/);
    expect(calls[0]!.sql).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(calls.findIndex(({ sql }) => sql.includes("FROM workspace_members"))).toBeLessThan(calls.indexOf(read));
    expect(calls.filter(({ sql }) => sql.includes("FROM (SELECT $1::text AS workspace_id,$2::text AS run_id) wanted"))).toHaveLength(1);
    expect(calls.at(-1)!.sql).toBe("COMMIT");
    expect(hub?.retainedSource).toEqual({
      runId: "rrun-evidence", sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1", profileId: "rs02.delta-signal-notional-wfo.v1",
      artifactRevision: 2, retainedImportDigest: "5".repeat(64), manifestDigest: "6".repeat(64),
      sealedArtifact: { manifestDigest: "6".repeat(64), artifactRevision: 2, state: "SEALED" },
      requestedSpecDigest: "1".repeat(64), effectiveSpecDigest: "2".repeat(64), datasetBindingDigest: "3".repeat(64),
      lifecycleStatus: "COMPLETED", terminalMaterialized: true,
    });
    expect(hub?.asOfUtcMs).toBe(1234);
    expect(hub?.retainedSource?.manifestDigest).not.toBe(hub?.manifestDigest);
  });

  it.each([false, null, undefined, "true"])("does not coerce a missing/non-boolean terminal checkpoint (%s) into authority", async (terminalMaterialized) => {
    const row = retainedRow();
    row.terminal_materialized = terminalMaterialized;
    const hub = await harness(true, false, row).repository.hub(scope, "rrun-evidence");
    expect(hub?.retainedSource?.terminalMaterialized).toBe(false);
  });

  it("does not create retained proof when no seal was joined", async () => {
    const row = retainedRow();
    row.retained_run_id = null;
    const hub = await harness(true, false, row).repository.hub(scope, "rrun-evidence");
    expect(hub?.retainedSource).toBeUndefined();
    expect(hub?.kind).toBe("DURABLE");
  });

  it("keeps artifact proof absent when an exact SEALED revision/manifest artifact was not joined", async () => {
    const row = retainedRow();
    row.retained_artifact_manifest_digest = null;
    row.retained_artifact_sealed_revision = null;
    row.retained_artifact_state = null;
    const hub = await harness(true, false, row).repository.hub(scope, "rrun-evidence");
    expect(hub?.retainedSource?.sealedArtifact).toBeNull();
    expect(hub?.retainedSource?.manifestDigest).toBe("6".repeat(64));
  });

  it("pins the immutable composite event/checkpoint keys and ordered seal revision supporting the join", () => {
    const migration = (filename: string) => compactSql(readFileSync(join(__dirname, "../migrations", filename), "utf8"));
    const progress = migration("1723680000044_research-progress-v1.sql");
    const checkpoint = migration("1723680000050_research-terminal-materialization-v1.sql");
    const retained = migration("1723680000051_research-current-source-retention-v1.sql");
    expect(progress).toContain("PRIMARY KEY (workspace_id, run_id, worker_attempt_id, source_sequence)");
    expect(progress).toContain("PRIMARY KEY (workspace_id, run_id, worker_attempt_id)");
    expect(checkpoint).toContain("PRIMARY KEY (workspace_id, run_id, worker_attempt_id, source_sequence)");
    expect(checkpoint).toContain("FOREIGN KEY (workspace_id, run_id, worker_attempt_id, source_sequence) REFERENCES research.run_progress_events(workspace_id, run_id, worker_attempt_id, source_sequence)");
    expect(checkpoint).toContain("BEFORE UPDATE OR DELETE ON research.run_terminal_materializations_v1 FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation()");
    expect(retained).toContain("PRIMARY KEY (workspace_id, run_id, artifact_revision)");
    expect(retained).toContain("ON research.current_source_seals_v1 (workspace_id, run_id, artifact_revision DESC)");
    expect(retained).toContain("BEFORE UPDATE OR DELETE ON research.current_source_seals_v1 FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation()");
  });
});
