import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-attempt-lineage.openapi.json");
const generatedPath = join(ROOT, "generated", "research-attempt-lineage.d.ts");

describe("P19 published Research Attempt Lineage contract", () => {
  it("publishes exactly one same-origin read operation", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as { paths: Record<string, Record<string, unknown>> };
    expect(Object.keys(openApi.paths)).toEqual(["/api/v1/research/alphas/{alphaId}/lineage"]);
    expect(Object.keys(openApi.paths["/api/v1/research/alphas/{alphaId}/lineage"]!)).toEqual(["get"]);
  });

  it("generates typed graph, diff, exposure, bounded coverage and source-pick absence facts", () => {
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      "researchAttemptLineageGetV1", "AttemptLineageResponse", "AttemptNode", "SemanticDiff",
      "PromotionPick", "PARENT_OUTSIDE_RETURNED_GRAPH", "ChildRunsCoverage",
      "technical_retry_count", "OUTER_OOS", "PORTAL_PERSISTED_RESEARCH",
    ]) expect(generated).toContain(needle);
    const document = readFileSync(openApiPath, "utf8");
    expect(document).toContain('"maximum": 128');
    expect(document).toContain("P19_BOUNDED_GRAPH_LIMIT_REACHED");
    expect(document).toContain("P19_CHILD_RUNS_BOUNDED_PER_ATTEMPT");
    expect(document).toContain("P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK");
  });

  it("W6b 1.1.0: revalidation, an opaque older-page cursor and the additive P19 facts are published", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      info: { version: string };
      paths: Record<string, { get: { responses: Record<string, unknown>; parameters: Array<{ $ref: string }> } }>;
    };
    expect(openApi.info.version).toBe("1.1.0");
    const get = openApi.paths["/api/v1/research/alphas/{alphaId}/lineage"]!.get;
    expect(Object.keys(get.responses)).toContain("304");
    expect(get.parameters.map((parameter) => parameter.$ref)).toContain("#/components/parameters/LineageCursor");
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      "lineage_revision", "older_cursor", "presentation_kind", "promotion_state", "spec_label", "ReleaseCandidateRef",
      "RunFacts", "RS02_RETAINED_SELECTED_TRIAL", "exercised", "untried", "supersession", "counts_definitions",
      "P22_RELEASE_CANDIDATE_APPROVAL", "execution_profile_id",
    ]) expect(generated).toContain(needle);
  });

  it("CG-P19-01 publishes healthy/partial/empty/bounded fixtures and typed problems", () => {
    const fixture = (name: string) => JSON.parse(readFileSync(join(ROOT, "fixtures", `research-attempt-lineage.${name}.valid.json`), "utf8"));
    expect(fixture("healthy").coverage.state).toBe("COMPLETE");
    expect(fixture("partial").coverage).toMatchObject({ state: "PARTIAL", window: "OLDER_PAGE" });
    expect(fixture("empty").attempts).toEqual([]);
    expect(fixture("bounded").counts).toMatchObject({ returned_attempts: 128, total_attempts: 140 });
    expect(Object.keys(fixture("problems"))).toEqual(["400", "401", "403", "404", "503"]);
  });

  it("does not expose a write, source/worker transport or promotion heuristic", () => {
    const document = readFileSync(openApiPath, "utf8");
    for (const forbidden of [
      "artifact_store_path", "source_path", "worker_attempt_id", "lease_epoch", "source_cursor",
      "private_key", "delegated_jwt", "execute-command", "best_sharpe", "max_sharpe",
    ]) expect(document).not.toContain(forbidden);
    expect(document).toContain("same-origin");
    expect(document).toContain("never be replaced by best/newest/ACTIVE logic");
  });
});
