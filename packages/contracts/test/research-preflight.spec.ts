import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-preflight.openapi.json");
const generatedPath = join(ROOT, "generated", "research-preflight.d.ts");
const packagedRequestedSpecPath = join(ROOT, "schemas", "research-requested-spec.v1.schema.json");
const p02FrozenRequestedSpecPath = join(
  ROOT,
  "..",
  "..",
  "upgrade",
  "research_loop",
  "evidence",
  "P02",
  "requested-spec.v1.schema.json",
);

describe("P08 published Research preflight contract", () => {
  it("packages the P02 frozen requested_spec schema without a divergent copy", () => {
    expect(JSON.parse(readFileSync(packagedRequestedSpecPath, "utf8"))).toEqual(
      JSON.parse(readFileSync(p02FrozenRequestedSpecPath, "utf8")),
    );
  });

  it("publishes exactly the two same-origin metadata operations", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as { paths: Record<string, unknown> };
    expect(Object.keys(openApi.paths)).toEqual([
      "/api/v1/research/preflights",
      "/api/v1/research/preflights/{preflight_token}",
    ]);
    const generated = readFileSync(generatedPath, "utf8");
    expect(generated).toContain("researchPreflightCreateV1");
    expect(generated).toContain("researchPreflightGetV1");
    expect(generated).toContain("RESEARCH_PREFLIGHT_STALE");
    expect(generated).toContain("CLOSED_BARS_ONLY");
    expect(generated).toContain("may_create_run: boolean");
    const requestedSpec = generated.slice(
      generated.indexOf('"research-requested-spec.v1.schema": {'),
      generated.indexOf("    };\n    responses:", generated.indexOf('"research-requested-spec.v1.schema": {')),
    );
    expect(requestedSpec).not.toContain("$defs:");
    expect(requestedSpec).toContain("schema_version:");
    for (const typedPanelField of ["Topology", "ResourceEstimate", "DatasetBinding", "Quality", "Warmup"]) {
      expect(generated).toContain(typedPanelField);
    }
    expect(generated).not.toContain('effective_spec: components["schemas"]["Metadata"]');
  });

  it("does not turn immutable snapshot metadata into a raw market-data or worker API", () => {
    const document = readFileSync(openApiPath, "utf8");
    for (const forbidden of ["source_path", "frame.parquet", "market_rows", "broker", "worker_claim", "command"]) {
      expect(document).not.toContain(forbidden);
    }
    expect(document).toContain("sealed-holdout values");
    expect(document).toContain("PREFLIGHT_ONLY");
    expect(document).toContain("may_create_run");
    expect(document).toContain("P10 may return true only");
    expect(document).not.toContain("private_dsn");
    expect(document).toContain("propertyNames");
  });
});
