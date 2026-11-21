import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { executionRecipe } from "../src/research/execution-recipes";
import { ResearchReportReadResponseSchema } from "../src/research/report.contract";
import { ResearchReportService } from "../src/research/report.service";
import { openApiValidator } from "./research-rf05-openapi";

const scope = { workspaceId: "ws_native_report", actorUserId: "usr_native_report" };
const recipe = executionRecipe("p10.delta-event-driven-limit-oco-search-1h.v1");
function subject() {
  const repository = {
    read: vi.fn().mockResolvedValue(null),
    runContext: vi.fn().mockResolvedValue({ runId: "rrun_native_report", state: "READY", displayLabel: "R-NAT-001",
      profileId: recipe.profile_id, profileDigest: recipe.profile_digest, updatedAtUtcMs: 1_790_000_000_000 }),
    claimMissingWfo: vi.fn().mockResolvedValue(false), repairStatus: vi.fn().mockResolvedValue(null),
    requestExport: vi.fn(), auditRelation: vi.fn().mockResolvedValue(null),
  };
  const reader = { bundle: vi.fn(), detail: vi.fn() };
  const service = new ResearchReportService(repository as never, reader as never, reader as never,
    reader as never, reader as never, reader as never, reader as never, {
      FEATURE_RESEARCH_REPORTS: "true", FEATURE_RESEARCH_CURRENT_SOURCE: "true",
    } as never);
  return { service, repository, reader };
}

describe("§54 authorized native Report absence", () => {
  it("returns typed absence rather than a fake seal, repair or engine invocation", async () => {
    const value = subject();
    const body = await value.service.read(scope, "rrun_native_report");
    expect(body).toMatchObject({ schema_version: "research.report-unavailable.v1", run_state: "READY",
      availability: { state: "NOT_PUBLISHED", reason_code: "NATIVE_REPORT_NOT_DELIVERED" }, may_export: false });
    expect(body).not.toHaveProperty("frozen_core");
    expect(body).not.toHaveProperty("report_revision");
    expect(body).not.toHaveProperty("sealed_at_utc_ms");
    expect(ResearchReportReadResponseSchema.safeParse(body).success).toBe(true);
    openApiValidator("research-report.openapi.json", "ReportRead").assert(body);
    expect(value.repository.runContext).toHaveBeenCalledWith(scope, "rrun_native_report");
    expect(value.repository.claimMissingWfo).not.toHaveBeenCalled();
    expect(value.reader.bundle).not.toHaveBeenCalled();
    expect(value.reader.detail).not.toHaveBeenCalled();
    expect((await value.service.read(scope, "rrun_native_report")).etag).toBe(body.etag);
    const context = await value.repository.runContext();
    value.repository.runContext.mockResolvedValue({ ...context, state: "FAILED" });
    expect((await value.service.read(scope, "rrun_native_report")).etag).not.toBe(body.etag);
  });

  it("cannot turn unknown/foreign runs into an absence response", async () => {
    const value = subject();
    value.repository.runContext.mockResolvedValue(null as never);
    await expect(value.service.read(scope, "rrun_unknown")).rejects.toMatchObject({ code: "RESEARCH_REPORT_NOT_FOUND", status: 404 });
    value.repository.runContext.mockRejectedValue({ code: "RESEARCH_REPORT_FORBIDDEN", status: 403 });
    await expect(value.service.read(scope, "rrun_native_report")).rejects.toMatchObject({ status: 403 });
  });

  it("requires the exact historical recipe digest and rejects incompatible storage", async () => {
    const value = subject();
    const context = await value.repository.runContext();
    for (const profileDigest of ["a".repeat(64), null]) {
      value.repository.runContext.mockResolvedValue({ ...context, profileDigest } as never);
      await expect(value.service.read(scope, "rrun_native_report")).rejects.toMatchObject({ code: "RESEARCH_REPORT_UNAVAILABLE", status: 503 });
    }
  });

  it("keeps exports fail-closed without queuing a job for absent native bytes", async () => {
    const value = subject();
    await expect(value.service.requestExport(scope, "rrun_native_report", "REPORT_JSON"))
      .rejects.toMatchObject({ code: "NATIVE_REPORT_NOT_DELIVERED", status: 409 });
    expect(value.repository.requestExport).not.toHaveBeenCalled();
  });

  it("publishes a canonical fixture and rejects accidental frozen-core/worker leakage", () => {
    const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
    const fixture = JSON.parse(readFileSync(resolve(root, "fixtures/research-report.native-unavailable.valid.json"), "utf8"));
    expect(ResearchReportReadResponseSchema.safeParse(fixture).success).toBe(true);
    openApiValidator("research-report.openapi.json", "ReportRead").assert(fixture);
    for (const property of ["frozen_core", "lease_token", "artifact_path", "report_revision"])
      expect(ResearchReportReadResponseSchema.safeParse({ ...fixture, [property]: {} }).success).toBe(false);
  });
});
