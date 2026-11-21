/**
 * FE-CAT-3 · `environment: ALL` of the Manager dataset: the reader, the request encoding and the answers-this-question guard, from the
 * PUBLISHED canonical fixtures (`all-environments` valid + its negative cases). Lane BFF_DOUBLE for the port cases: `fetch` is stubbed.
 * This proves the strict side: a read asked for ALL is accepted only as an ALL-shaped body, a read of one environment is never accepted as
 * ALL, and every producer refusal of the ALL shape is a refusal of the reader. It is not a live Edge and not a source acceptance.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clone, datasetViolations, fixtureValue, FIXTURE_ALL_ENVIRONMENTS, FIXTURE_ALL_ENVIRONMENTS_CASES, FIXTURE_LIFECYCLE_LIVE, FIXTURE_ROWS, type Draft,
} from "../v2/readers/managerDataset.testbase";
import { loadCanonical } from "../v2/testkit/loadCanonical";
import { readManagerDataset, allRowKey, type ManagerDataset } from "../v2/readers/managerDataset";
import type { DeliveryPolicy } from "../profile";
import { createHttpApi } from "./httpApi";
import { datasetAnswersQuery, datasetQueryMismatch, encodeManagerDatasetQuery, managerDatasetPath, type ManagerDatasetQuery } from "./managerDatasetQuery";

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true, paperCommandsEnabled: true,
  sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};
afterEach(() => vi.unstubAllGlobals());

const ALL_QUERY: ManagerDatasetQuery = { surface: "FLEET", environment: "ALL" };
const read = (raw: unknown): ManagerDataset | null => {
  const result = readManagerDataset(raw);
  return result !== null && result.kind === "dataset" ? result.dataset : null;
};
const base = (): Draft => fixtureValue(FIXTURE_ALL_ENVIRONMENTS);

function applyOps(body: Draft, ops: readonly Draft[]): Draft {
  const out = clone(body);
  const at = (path: readonly (string | number)[]) => path.reduce((node: Draft, key) => node[key], out);
  for (const op of ops) {
    const parent = at(op.path.slice(0, -1));
    const key = op.path.at(-1);
    if (op.op === "set") parent[key] = clone(op.value);
    else if (op.op === "delete") delete parent[key];
    else throw new Error(`unknown op ${op.op}`);
  }
  return out;
}

describe("the ALL fixture, verbatim", () => {
  it("validates against the published schema and is read: two labelled rows, three typed environments, no total", () => {
    expect(datasetViolations(base())).toEqual([]);
    const dataset = read(base())!;
    expect(dataset.environment).toBe("ALL");
    expect(dataset.selectedWindow).toBeNull();
    expect(dataset.items.map((row) => [row.environment, row.rowKey])).toEqual([
      ["paper", allRowKey("paper", { alphaId: "TEST_ONLY:alpha", alphaVersionId: "TEST_ONLY:av", portfolioId: "TEST_ONLY:portfolio" })],
      ["live", allRowKey("live", { alphaId: "TEST_ONLY:alpha", alphaVersionId: "TEST_ONLY:av", portfolioId: "TEST_ONLY:portfolio" })],
    ]);
    expect(dataset.items.map((row) => row.economicPartitions.map((p) => [p.partition.economicDomain, p.partition.currency]))).toEqual([[["PAPER", "USDT"]], [["ACTUAL", "USDT"]]]);
    expect(dataset.environmentCoverage!.map((entry) => [entry.environment, entry.availability])).toEqual([["paper", "INCLUDED"], ["sandbox", "UNAVAILABLE"], ["live", "INCLUDED"]]);
    const sandbox = dataset.environmentCoverage![1]!;
    expect(sandbox).toEqual({ environment: "sandbox", availability: "UNAVAILABLE", reasonCode: "PUBLICATION_NOT_QUALIFIED" });
    expect(dataset.quality.completeness).toBe("PARTIAL");
    expect(dataset.page).toMatchObject({ authorizedFilteredCount: 2, returnedCount: 2 });
  });

  it("every producer refusal of the ALL shape is a refusal of the reader, and the schema judges each as the case states", () => {
    const cases = loadCanonical<{ cases: { id: string; refused_by: string; ops: Draft[] }[] }>(FIXTURE_ALL_ENVIRONMENTS_CASES).cases;
    expect(cases.length).toBeGreaterThanOrEqual(12);
    for (const c of cases) {
      const body = applyOps(base(), c.ops);
      expect(read(body), c.id).toBeNull();
      expect(datasetViolations(body).length > 0, c.id).toBe(c.refused_by === "SCHEMA_AND_PRODUCER");
    }
  });
});

describe("what only the reader holds against an ALL body", () => {
  it("a Live row that carries a Paper partition, or a row key of another environment, voids the whole read", () => {
    const wrongDomain = base();
    wrongDomain.items[1].economic_partitions[0].partition.economic_domain = "PAPER";
    expect(read(wrongDomain)).toBeNull();
    const wrongKey = base();
    wrongKey.items[1].row_key = wrongKey.items[0].row_key;
    expect(read(wrongKey)).toBeNull();
  });

  it("the coverage list must add up: counts, rows per environment, an unavailable environment holds no row, a lost environment is never COMPLETE", () => {
    const counts = base();
    counts.environment_coverage[0].authorized_filtered_count = 2;
    expect(read(counts)).toBeNull();
    const rowsOfSandbox = base();
    rowsOfSandbox.items[0].environment = "sandbox";
    rowsOfSandbox.items[0].row_key = JSON.stringify(["sandbox", "TEST_ONLY:alpha", "TEST_ONLY:av", "TEST_ONLY:portfolio"]);
    expect(read(rowsOfSandbox)).toBeNull();
    const complete = base();
    complete.quality = { completeness: "COMPLETE", freshness: "FRESH", reasons: [] };
    expect(read(complete)).toBeNull();
    const reason = base();
    reason.environment_coverage[1].reason_code = "MADE_UP";
    expect(read(reason)).toBeNull();
    const order = base();
    order.environment_coverage.reverse();
    expect(read(order)).toBeNull();
    const short = base();
    short.environment_coverage.pop();
    expect(read(short)).toBeNull();
    const extra = base();
    extra.environment_coverage[0].profile_id = "x";
    expect(read(extra)).toBeNull();
  });

  it("a counted zero is an INCLUDED environment with 0, not an absence; the sums still add up", () => {
    const body = base();
    body.environment_coverage[1] = clone(body.environment_coverage[0]);
    body.environment_coverage[1].environment = "sandbox";
    body.environment_coverage[1].authorized_filtered_count = 0;
    body.environment_coverage[1].returned_count = 0;
    body.quality = { completeness: "PARTIAL", freshness: "STALE", reasons: [] };
    const dataset = read(body)!;
    expect(dataset.environmentCoverage![1]).toMatchObject({ availability: "INCLUDED", authorizedFilteredCount: 0, returnedCount: 0 });
  });

  it("a single-environment body never carries an ALL key, and the reader says no to the ALL keys on it", () => {
    const single = clone(fixtureValue(FIXTURE_ROWS));
    expect(read(single)!.environment).toBe("paper");
    expect(read(single)!.environmentCoverage).toBeUndefined();
    expect(read(single)!.items[0]!.environment).toBeUndefined();
    const withCoverage = { ...clone(single), environment_coverage: base().environment_coverage };
    expect(read(withCoverage)).toBeNull();
    const withRowEnvironment = clone(single);
    withRowEnvironment.items[0].environment = "paper";
    expect(read(withRowEnvironment)).toBeNull();
    const claimsAll = clone(single);
    claimsAll.environment = "ALL";
    expect(read(claimsAll)).toBeNull();
  });
});

describe("encoding ALL, and the guard that a body answers THAT question", () => {
  it("encodes ALL for the Fleet only, without a window; any stage may narrow it", () => {
    expect(encodeManagerDatasetQuery(ALL_QUERY)!.wire).toEqual({ environment: "ALL" });
    expect(managerDatasetPath(encodeManagerDatasetQuery({ ...ALL_QUERY, stageFilter: ["PAPER", "LIVE"], limit: 25 })!)).toBe("/manager/fleet?environment=ALL&stage_filter=PAPER%2CLIVE&limit=25");
    expect(encodeManagerDatasetQuery({ ...ALL_QUERY, window: "30D" })).toBeNull();
    expect(encodeManagerDatasetQuery({ ...ALL_QUERY, window: { fromMs: 1, toMs: 2 } })).toBeNull();
    for (const surface of ["PORTFOLIO", "ALPHA", "ACCOUNT", "DEPLOYMENT"] as const) expect(encodeManagerDatasetQuery({ surface, id: "x", environment: "ALL" }), surface).toBeNull();
    expect(encodeManagerDatasetQuery({ surface: "FUND", environment: "ALL" })).toBeNull();
    expect(encodeManagerDatasetQuery({ surface: "FLEET", environment: "EVERYWHERE" as never })).toBeNull();
    // a single environment still refuses a stage of another one
    expect(encodeManagerDatasetQuery({ surface: "FLEET", environment: "paper", stageFilter: ["LIVE"] })).toBeNull();
  });

  it("a read asked for ALL is refused if the body is not ALL-shaped, and a single-environment read is never accepted as ALL", () => {
    const all = read(base())!;
    expect(datasetQueryMismatch(all, ALL_QUERY)).toBeNull();
    expect(datasetAnswersQuery(all, ALL_QUERY)).toBe(true);
    // ALL asked, a one-environment body answered (even a clean one)
    const single = read(clone(fixtureValue(FIXTURE_LIFECYCLE_LIVE)))!;
    expect(datasetQueryMismatch(single, ALL_QUERY)).toBe("environment");
    // one environment asked, the ALL body answered
    for (const environment of ["paper", "sandbox", "live"] as const) expect(datasetQueryMismatch(all, { surface: "FLEET", environment }), environment).toBe("environment");
    // ALL asked with a stage narrowing the body ignored
    expect(datasetQueryMismatch(all, { ...ALL_QUERY, stageFilter: ["PAPER"] })).toBe("stage_filter");
    expect(datasetQueryMismatch(all, { ...ALL_QUERY, stageFilter: ["PAPER", "LIVE"] })).toBeNull();
    // the same guards as any dataset: surface, workspace, page size, groups
    expect(datasetQueryMismatch(all, { ...ALL_QUERY, limit: 25 })).toBe("limit");
    expect(datasetQueryMismatch(all, { ...ALL_QUERY, workspaceId: "someone-else" })).toBe("workspace");
  });

  it("through the real HTTP client: ALL is requested on the fleet route and a one-environment answer is unavailable", async () => {
    const calls: string[] = [];
    let body: unknown = base();
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    const api = createHttpApi({ policy: OPEN, readScope: {} });
    const ok = await api.getManagerDataset({ ...ALL_QUERY, limit: 100 });
    expect(ok.ok).toBe(true);
    expect(new URL(calls[0]!, "http://portal.test").pathname + new URL(calls[0]!, "http://portal.test").search).toBe("/api/v1/execution/manager/fleet?environment=ALL&limit=100");
    body = fixtureValue(FIXTURE_LIFECYCLE_LIVE);
    const refused = await api.getManagerDataset({ ...ALL_QUERY, limit: 100 });
    expect(refused).toMatchObject({ ok: false, status: "unavailable" });
    expect(!refused.ok && refused.reason).toContain("MANAGER_DATASET_ANSWERS_ANOTHER_QUERY environment");
    // the other way: a one-environment question answered with the ALL body
    body = base();
    const wrong = await api.getManagerDataset({ surface: "FLEET", environment: "paper" });
    expect(!wrong.ok && wrong.reason).toContain("MANAGER_DATASET_ANSWERS_ANOTHER_QUERY environment");
    // an ALL request with a window is never sent
    calls.length = 0;
    expect(await api.getManagerDataset({ ...ALL_QUERY, window: "30D" })).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });
});
