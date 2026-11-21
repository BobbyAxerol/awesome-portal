import { describe, expect, it, vi } from "vitest";

import { ResearchProgressRepository } from "../src/research/progress.repository";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE } from "../src/research/contracts";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

function subject(row: Record<string, unknown>) {
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes("SELECT producer.run_id")) return { rows: [row], rowCount: 1 };
      if (sql.includes("SELECT wa.ordinal")) return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT table_kind")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn().mockResolvedValue(client) };
  return { repository: new ResearchProgressRepository(pool as never), client, queries };
}

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    run_id: "run_terminal_truth",
    attempt_id: "attempt_terminal_truth",
    job_id: "job_terminal_truth",
    worker_attempt_id: null,
    lease_epoch: null,
    job_state: "CANCELLED",
    queue_class: "INTERACTIVE",
    job_created_at: new Date("2026-09-24T00:00:00.000Z"),
    retry_not_before: null,
    created_at: new Date("2026-09-24T00:00:00.000Z"),
    snapshot: null,
    source_latest_sequence: null,
    retention_floor_sequence: null,
    received_at: null,
    terminal_materialized: false,
    source_terminal_event: false,
    ...overrides,
  };
}

describe("ResearchProgressRepository terminal materialisation requirement", () => {
  const scope = { workspaceId: "research-workspace", actorUserId: "research-owner" };

  it("BR-S02-16 reads only the matching native sidecar in the existing scoped transaction", async () => {
    const native = JSON.parse(readFileSync(resolve(process.env.PORTAL_CONTRACTS_DIR
      ?? resolve(__dirname, "../../../packages/contracts"), "fixtures/research-native-route-result.valid.json"), "utf8"));
    const { repository, queries } = subject(runRow({native_execution:native,spec_route:"reactive"}));
    expect((await repository.readRun(scope, "run_terminal_truth")).nativeExecution).toEqual(native);
    const query = queries.find(q => q.includes("SELECT producer.run_id"))!;
    for (const fence of ["evidence.workspace_id = producer.workspace_id", "evidence.run_id = producer.run_id",
      "evidence.worker_attempt_id = producer.worker_attempt_id", "evidence.source_event_sequence = snapshot.source_latest_sequence",
      "evidence.source_evidence_digest = latest_event.event_payload->>'evidence_digest'"]) expect(query).toContain(fence);
    expect(queries.filter(q => q.includes("SELECT producer.run_id"))).toHaveLength(1);
    expect((await subject(runRow()).repository.readRun(scope, "run_terminal_truth"))).not.toHaveProperty("nativeExecution");
    for (const value of [{...native,clock:"KNOWN_CLOSE_NEXT_BAR_INTRABAR"},native]) {
      await expect(subject(runRow({native_execution:value,spec_route:"intrabar_bracket"})).repository.readRun(scope,"run_terminal_truth"))
        .rejects.toMatchObject({code:"RESEARCH_PROGRESS_CONFLICT",status:409});
    }
  });

  it("sets all five exact transaction-local budgets/scopes in one round trip before reads", async () => {
    const { repository, client } = subject(runRow());
    await repository.readRun(scope, "run_terminal_truth");
    const calls = client.query.mock.calls as unknown as Array<[string, unknown[]?]>;
    expect(calls[0]?.[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(calls[1]?.[0]).toBe(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
    const settings = calls.filter(([sql]) => sql.includes("set_config("));
    expect(settings).toHaveLength(1);
    expect(settings[0]?.[0].match(/set_config\(/g)).toHaveLength(5);
    expect(settings[0]?.[0].match(/, true\)/g)).toHaveLength(5);
    expect(settings[0]?.[1]).toEqual([
      `${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`, `${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`,
      `${RESEARCH_DB_BUDGET.idleTransactionTimeoutMs}ms`, scope.workspaceId, scope.actorUserId,
    ]);
    expect(calls[2]).toEqual(settings[0]);
    expect(calls[3]?.[0]).toContain("SELECT producer.run_id");
  });

  it("marks a control cancellation before source as NOT_REQUIRED, not permanently PENDING", async () => {
    const { repository, queries } = subject(runRow());
    const result = await repository.readRun(scope, "run_terminal_truth");

    expect(result.jobState).toBe("CANCELLED");
    expect(result.terminalMaterialization).toBe("NOT_REQUIRED");
    expect(queries.some((sql) => sql.includes("latest_event.event_type IN ('run_completed', 'run_failed')"))).toBe(true);
  });

  it("fails closed for SUCCEEDED lifecycle without a source terminal event", async () => {
    const { repository } = subject(runRow({ job_state: "SUCCEEDED" }));
    const result = await repository.readRun(scope, "run_terminal_truth");

    expect(result.terminalMaterialization).toBe("PENDING");
  });

  it("keeps a terminal source event pending until its immutable checkpoint exists", async () => {
    const { repository } = subject(runRow({
      job_state: "RUNNING",
      source_latest_sequence: 9,
      source_terminal_event: true,
      terminal_materialized: false,
    }));
    const result = await repository.readRun(scope, "run_terminal_truth");

    expect(result.terminalMaterialization).toBe("PENDING");
  });

  it("marks the source terminal checkpoint ready only after it is persisted", async () => {
    const { repository } = subject(runRow({
      job_state: "SUCCEEDED",
      source_latest_sequence: 9,
      source_terminal_event: true,
      terminal_materialized: true,
    }));
    const result = await repository.readRun(scope, "run_terminal_truth");

    expect(result.terminalMaterialization).toBe("READY");
  });

  it("CG-FG-S03-01: projects bounded P08 planned windows, including the source fold_000 convention", async () => {
    const { repository, queries } = subject(runRow({
      alpha_id: "alpha_delta", alpha_version_id: "av_delta_1", requested_spec_digest: "e".repeat(64),
      declared_fold_count: 2,
      planned_folds: [
        { fold_id: "fold_000", outer_oos: { start_utc_ms: 1_700_000_000_000, end_exclusive_utc_ms: 1_700_086_400_000 } },
        { fold_id: "fold_001", outer_oos: { start_utc_ms: 1_700_086_400_000, end_exclusive_utc_ms: 1_700_172_800_000 } },
      ],
    }));
    const read = await repository.readRun(scope, "run_terminal_truth");
    expect(queries.some((sql) => sql.includes("preflight.topology->'folds' END AS planned_folds"))).toBe(true);
    expect(read.identity?.plannedFolds).toEqual([
      { fold: 1, testStartUtcMs: 1_700_000_000_000, testEndUtcMs: 1_700_086_400_000 },
      { fold: 2, testStartUtcMs: 1_700_086_400_000, testEndUtcMs: 1_700_172_800_000 },
    ]);
  });

  it("CG-FG-S03-01: refuses a malformed or count-mismatched immutable P08 plan", async () => {
    for (const planned_folds of ["not-json", [{ fold_id: "fold_000", outer_oos: {
      start_utc_ms: 1_700_000_000_000, end_exclusive_utc_ms: 1_700_086_400_000,
    } }]]) {
      const { repository } = subject(runRow({
        alpha_id: "alpha_delta", alpha_version_id: "av_delta_1", requested_spec_digest: "e".repeat(64),
        declared_fold_count: 2, planned_folds,
      }));
      await expect(repository.readRun(scope, "run_terminal_truth")).rejects.toMatchObject({
        code: "RESEARCH_PROGRESS_CONFLICT", status: 409,
      });
    }
  });
});
