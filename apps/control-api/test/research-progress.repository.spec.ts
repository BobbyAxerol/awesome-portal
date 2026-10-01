import { describe, expect, it, vi } from "vitest";

import { ResearchProgressRepository } from "../src/research/progress.repository";

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
