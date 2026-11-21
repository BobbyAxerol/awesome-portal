import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { canonicalResearchJson } from "../src/research/preflight.service";
import { currentSourceReadRevision, currentSourceReadRevisions } from "../src/research/current-source.service";

// Independent pre-optimization byte oracle. No new source hash/version or
// weakened schema is permitted merely to make the read-cost gate pass.
function originalCanonical(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, nested]) => [key, normalize(nested)]));
    return input;
  };
  return JSON.stringify(normalize(value));
}
const sha = (value: unknown) => createHash("sha256").update(originalCanonical(value)).digest("hex");
const fixture = (file: string) => JSON.parse(gunzipSync(readFileSync(join(__dirname, file))).toString("utf8"));

describe("request-local canonical read-cost optimization", () => {
  it.each([
    null, true, false, 0, -0, 1e-9, "quoted\"\\\n", [null, undefined, NaN, Infinity],
    { z: 2, A: 1, a: 3, Z: { b: 2, A: 1 } },
    { "2": 2, "10": 10, "1": 1 }, { "θ": "seed", "\ud800": "lone", "🔒": "pinned" },
    JSON.parse('{"__proto__":{"locked":true},"constructor":"ordinary","toString":null}'),
    { omitted: undefined, nested: [{ empty: {}, a: [1, 2, 3] }] },
    new Date("2026-10-03T00:00:00Z"), Buffer.from([1, 2, 255]),
  ])("retains the original exact JSON bytes for case %#", value => {
    expect(canonicalResearchJson(value)).toBe(originalCanonical(value));
  });

  it("retains original hashes of large retained source and fixed/WFO report goldens", () => {
    for (const value of [fixture("research-w5b-real-replay.fixture.json.gz"),
      fixture("research-w7-real-wfo-preview.fixture.json.gz"), fixture("research-w7-release-candidate-p04.golden.json.gz")]) {
      expect(createHash("sha256").update(canonicalResearchJson(value)).digest("hex")).toBe(sha(value));
    }
  });

  it("does not mutate input or treat __proto__ as a setter", () => {
    const value = JSON.parse('{"__proto__":{"unexpected":"value"},"z":{"B":2,"a":1}}');
    const before = JSON.stringify(value);
    canonicalResearchJson(value);
    expect(JSON.stringify(value)).toBe(before);
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(({} as { unexpected?: string }).unexpected).toBeUndefined();
  });

  it("batch revisions match the independent former algorithm for every companion branch", () => {
    const base = { artifactRevision: 1, manifestDigest: "1".repeat(64), sourceTransformDigest: "2".repeat(64),
      retainedImportDigest: "3".repeat(64), tableRows: { FOLD: 1, TRIAL: 2, OBSERVATION: 3, SELECTION: 1, CANDIDATE: 2 },
      summary: fixture("research-w5b-real-replay.fixture.json.gz").summary };
    const kinds = ["evidence", "split", "search", "freeze", "replay", "evidence-monthly_returns", "evidence-return_distribution"];
    const variants = [base, { ...base, analyticsSidecar: { digest: "4".repeat(64) } },
      { ...base, distributionsSidecar: { digest: "5".repeat(64) } },
      { ...base, analyticsSidecar: { digest: "4".repeat(64) }, distributionsSidecar: { digest: "5".repeat(64) } },
      { ...base, enrichedAnalysis: { run_id: "synthetic-algorithm-only", samples: [1, 2, 3] },
        analyticsSidecar: { digest: "4".repeat(64) }, distributionsSidecar: { digest: "5".repeat(64) } }];
    for (const source of variants) {
      const seal = source as Parameters<typeof currentSourceReadRevision>[1];
      const sealDigest = sha({ artifact_revision: seal.artifactRevision, manifest_digest: seal.manifestDigest,
        source_transform_digest: seal.sourceTransformDigest, retained_import_digest: seal.retainedImportDigest,
        table_rows: seal.tableRows, summary: seal.summary });
      const result = currentSourceReadRevisions(kinds, seal);
      expect(result.sealDigest).toBe(sealDigest);
      for (const kind of kinds) {
        const companion = ["evidence", "evidence-monthly_returns", "evidence-return_distribution"].includes(kind);
        const expected = seal.enrichedAnalysis && companion ? `rs02_${kind}_${sha({ seal_digest: sealDigest, enrichment: sha(seal.enrichedAnalysis) })}`
          : seal.distributionsSidecar && companion ? `rs02_${kind}_${sha({ seal_digest: sealDigest,
            ...(kind === "evidence" && seal.analyticsSidecar ? { analytics_sidecar_digest: seal.analyticsSidecar.digest } : {}), distributions_digest: seal.distributionsSidecar.digest })}`
            : kind === "evidence" && seal.analyticsSidecar ? `rs02_evidence_${sha({ seal_digest: sealDigest, analytics_sidecar_digest: seal.analyticsSidecar.digest })}`
              : ["split", "search", "freeze"].includes(kind) ? `rs02_${kind}_${sha({ seal_digest: sealDigest, presentation_revision: "W1_SELECTED_TRIAL_ORDINAL_V1" })}`
                : `rs02_${kind}_${sealDigest}`;
        expect(result.revisions[kind]).toBe(expected);
        expect(currentSourceReadRevision(kind, seal)).toBe(expected);
      }
    }
  });
});
