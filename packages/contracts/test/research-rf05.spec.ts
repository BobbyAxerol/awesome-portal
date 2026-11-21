import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("RF-05 additive Split / Search / current-source contract", () => {
  it("publishes projection-time as-of, the bound bar interval and one absence authority on Split", () => {
    const generated = read("generated/research-split.d.ts");
    for (const needle of [
      "as_of_basis", "P14_PROJECTION_RECEIVED_AT", "DatasetFact", "bar_interval_ms", "P08_DATASET_BINDING",
      "AbsenceIndexEntry", "absence_authority", "FIELD_LOCAL", "bars_absence", "@deprecated",
    ]) expect(generated, needle).toContain(needle);
    const document = JSON.parse(read("openapi/research-split.openapi.json"));
    expect(document.components.schemas.AbsentFact.properties.state.enum).toEqual(["NOT_PUBLISHED", "NOT_ASSERTED", "NOT_APPLICABLE"]);
    expect(document.components.headers.CacheControl.schema.const).toBe("private, no-cache");
  });

  it("publishes the Search claim row and a fold-bound representation validator", () => {
    const generated = read("generated/research-search.d.ts");
    for (const needle of ["claim_row", "ClaimRow", "OosColumn", "REPORT_ONLY", "ScoringBackend", "declared_value", "researchEngineAtlasGetV1", "as_of_basis"]) {
      expect(generated, needle).toContain(needle);
    }
    const document = JSON.parse(read("openapi/research-search.openapi.json"));
    expect(document.components.headers.Etag.description).toMatch(/requested fold|per requested fold/);
  });

  it("publishes the current-source not-applicable answer as a 200 and the typed 409 lane state", () => {
    const document = JSON.parse(read("openapi/research-current-source.openapi.json"));
    for (const name of ["Evidence", "EvidenceSeries", "Split", "Search", "Freeze", "Replay"]) {
      const schema = document.components.responses[name].content["application/json"].schema;
      expect(schema.oneOf.map((entry: { $ref: string }) => entry.$ref)).toContain("#/components/schemas/LaneNotApplicable");
    }
    expect(document.components.schemas.LaneState.enum).toEqual(["PENDING_SOURCE", "PENDING_RETENTION", "NOT_RETAINED_LEGACY", "NOT_RETAINED_TERMINAL"]);
    const generated = read("generated/research-current-source.d.ts");
    for (const needle of ["LaneNotApplicable", "research.current-source-not-applicable.v1", "P04_FIXED_QUALIFICATION", "lane_state"]) {
      expect(generated, needle).toContain(needle);
    }
  });
});
