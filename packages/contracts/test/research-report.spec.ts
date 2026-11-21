import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-report.openapi.json");
const generatedPath = join(ROOT, "generated", "research-report.d.ts");

describe("P18 published Research Report contract", () => {
  it("§54 adds a discriminated typed absence without inventing a native frozen Report", () => {
    const document = JSON.parse(readFileSync(openApiPath, "utf8"));
    const schemas = document.components.schemas;
    expect(document.paths["/api/v1/quantbt/runs/{runId}/report"].get.responses["200"].content["application/json"].schema)
      .toEqual({ $ref: "#/components/schemas/ReportRead" });
    expect(schemas.ReportRead.oneOf).toEqual([
      { $ref: "#/components/schemas/ReportDetail" }, { $ref: "#/components/schemas/ReportUnavailable" },
    ]);
    expect(schemas.ReportUnavailable.properties.availability.properties.reason_code.const).toBe("NATIVE_REPORT_NOT_DELIVERED");
    expect(schemas.ReportUnavailable.properties).not.toHaveProperty("frozen_core");
    const etag = new RegExp(document.components.headers.ReportEtag.schema.pattern);
    expect(etag.test(`"p18a1_${"a".repeat(64)}"`)).toBe(true);
    expect(etag.test(`"p18r1_${"a".repeat(64)}"`)).toBe(true);
    const fixture = JSON.parse(readFileSync(join(ROOT, "fixtures/research-report.native-unavailable.valid.json"), "utf8"));
    expect(fixture).toMatchObject({ schema_version: "research.report-unavailable.v1", may_export: false });
    expect(readFileSync(generatedPath, "utf8")).toContain('ReportRead: components["schemas"]["ReportDetail"] | components["schemas"]["ReportUnavailable"]');
  });

  it("publishes only the immutable report and caller-bound bounded-export operations", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      paths: Record<string, Record<string, unknown>>;
    };
    expect(Object.entries(openApi.paths).map(([path, operations]) => [path, Object.keys(operations)])).toEqual([
      ["/api/v1/quantbt/runs/{runId}/report", ["get"]],
      ["/api/v1/quantbt/runs/{runId}/report/exports", ["post"]],
      ["/api/v1/quantbt/runs/{runId}/report/exports/{jobId}", ["get"]],
      ["/api/v1/quantbt/runs/{runId}/report/exports/{jobId}/download", ["get"]],
    ]);
  });

  it("keeps every Screen 09 panel fact typed rather than degrading nested report shapes", () => {
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      "researchReportDetailGetV1", "researchReportExportCreateV1",
      "researchReportExportStatusGetV1", "researchReportExportDownloadGetV1",
      "FrozenCore", "Folds", "FoldRow", "Stage", "Artifact", "Warning",
      "Promotion", "Provenance", "ExportCapabilities", "UnavailableExportFormat",
      "P13_P17_FIXED_PROFILE", "REPORT_JSON", "REPORT_CSV", "PARQUET", "ARCHIVE",
      "PENDING_SOURCE_CALLBACK", "PORTAL_PERSISTED_RESEARCH",
    ]) expect(generated).toContain(needle);
    expect(generated).not.toContain("folds: Record<string, never>");
    expect(generated).not.toContain("stages: Record<string, never>[]");
    expect(generated).not.toContain("artifacts: Record<string, never>[]");
  });

  it("W6a: frozen core v2 is an additive, versioned union and GET never declares 409 (CG-P18-10)", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown>; description?: string }>>;
      components: { schemas: Record<string, { oneOf?: unknown[] }> };
    };
    expect(openApi.components.schemas.FrozenCore!.oneOf).toEqual([
      { $ref: "#/components/schemas/FrozenCoreV1" },
      { $ref: "#/components/schemas/FrozenCoreV2" },
      // X2 · spec 09 T06: a failed/cancelled run's sheet, sealed from the P11 terminal snapshot.
      { $ref: "#/components/schemas/FrozenCoreFailedV1" },
    ]);
    const get = openApi.paths["/api/v1/quantbt/runs/{runId}/report"]!.get!;
    expect(Object.keys(get.responses)).not.toContain("409");
    expect(get.description).toContain("RESEARCH_REPORT_NOT_FOUND");
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      "FrozenCoreV2", "ReportFactV2", "FoldRowV2", "StageCheck", "ArtifactV2", "ReportTitle", "Certification",
      "RS02_RETAINED_CURRENT_SOURCE", "RS02_STITCHED_OUTER_TEST_WINDOWS", "GLOBAL_SELECTION_APPLIES_TO_EVERY_FOLD",
      "FrozenCoreFailedV1", "P11_TERMINAL_FAILURE", "FinalAudit", "REUSED_ORIGINAL", "LINKED_CHILD",
    ]) expect(generated).toContain(needle);
  });

  it("does not expose a source relation/cursor, worker lease, artifact path or compute control", () => {
    const document = readFileSync(openApiPath, "utf8");
    for (const forbidden of [
      "relation_name", "source_cursor", "lease_epoch", "lease_token", "worker_attempt_id",
      "artifact_store_path", "source_path", "raw_ohlcv", "broker_url", "private_key",
      "retry/CLI", "execute-command",
    ]) expect(document).not.toContain(forbidden);
    expect(document).toContain("same-origin");
    expect(document).toContain("512 KiB");
  });
});
