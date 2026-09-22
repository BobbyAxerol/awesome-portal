import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-report.openapi.json");
const generatedPath = join(ROOT, "generated", "research-report.d.ts");

describe("P18 published Research Report contract", () => {
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
