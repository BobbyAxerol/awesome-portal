/** Synthetic contract coverage, never substituted for the real P17 receipt. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { windowExecutionOpenApi } from "../tooling/generate-research-window-execution.mjs";

const root = join(__dirname, "..");
const document = JSON.parse(readFileSync(join(root, "openapi/research-window-execution.openapi.json"), "utf8"));
const fixture = JSON.parse(readFileSync(join(root, "fixtures/research-window-execution.holdout.synthetic.valid.json"), "utf8"));
const validator = () => new Ajv2020({ strict: false, allErrors: true }).compile(JSON.parse(JSON.stringify({
  ...document.components.schemas.WindowExecutionPage, $defs: document.components.schemas,
}).replaceAll("#/components/schemas/", "#/$defs/")));

describe("completed-window and native execution public contract", () => {
  it("generates deterministically from the backend's closed Zod source", () => {
    expect(windowExecutionOpenApi()).toEqual(document);
  });
  it("publishes exactly four authenticated same-origin reads, not worker ingress", () => {
    expect(document.servers).toEqual([{ url: "/" }]);
    expect(document.security).toEqual([{ portalSession: [] }]);
    const operations = Object.values(document.paths) as Array<Record<string, any>>;
    expect(operations).toHaveLength(4);
    expect(operations.every(operation => Object.keys(operation).join() === "get")).toBe(true);
    expect(operations.map(operation => operation.get.operationId)).toEqual([
      "researchWindowAnalyticsGetV1", "researchWindowObservationsGetV1",
      "researchNativeExecutionRecordsGetV1", "researchWindowCompareGetV1",
    ]);
    for (const forbidden of ["worker_attempt_id", "lease_epoch", "artifact_manifest_json", "source_document_json"])
      expect(JSON.stringify(document)).not.toContain(forbidden);
  });
  it("admits the complete Three Window Holdout shape with exact decimal values", () => {
    const validate = validator();
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
    const invalid = structuredClone(fixture);
    invalid.rows[0].payload.metrics.return_fraction.value = 0;
    expect(validate(invalid)).toBe(false);
    const oversized = structuredClone(fixture);
    oversized.rows = Array.from({ length: 201 }, () => fixture.rows[0]);
    expect(validate(oversized)).toBe(false);
  });
  it("exposes individual records and nullable source fields rather than a made-up order tree", () => {
    const schema = document.components.schemas.NativeExecutionRecord;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.record_kind.enum).toEqual(["ORDER", "FILL", "TRADE", "COMMAND", "ORDER_REPORT", "LIFECYCLE"]);
    for (const field of ["fill_price", "fill_qty", "stop_price", "take_profit_price", "parent_order_id", "oco_group_id",
      "activated_at_utc_ms", "cancelled_at_utc_ms", "filled_at_utc_ms", "exit_reason"])
      expect(schema.properties[field].anyOf).toContainEqual({ type: "null" });
    expect(schema.properties.missing_fields.additionalProperties).toEqual({ const: "SOURCE_FIELD_NOT_PUBLISHED" });
    const generated = readFileSync(join(root, "generated/research-window-execution.d.ts"), "utf8");
    for (const type of ["WindowAnalytics", "WindowDescriptor", "WindowExecutionPage", "NativeExecutionRecord", "WindowCompare"])
      expect(generated).toContain(type);
  });
});
