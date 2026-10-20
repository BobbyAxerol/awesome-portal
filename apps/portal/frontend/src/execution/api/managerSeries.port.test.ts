/**
 * `ExecutionApi.getManagerSeries` through the real HTTP client (lane: BFF_DOUBLE: `fetch` is stubbed and serves the published
 * contract fixtures; this proves the route, the JSON-encoded query values and the fail-closed mapping, not a live Edge).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadCanonical } from "../v2/testkit/loadCanonical";
import type { DeliveryPolicy } from "../profile";
import { createHttpApi } from "./httpApi";
import { createFixtureApi } from "./fixtureApi";

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true, paperCommandsEnabled: true,
  sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};
const fixture = (name: string): Record<string, unknown> => loadCanonical<{ value: Record<string, unknown> }>(`execution-manager-series.${name}.synthetic`).value;

afterEach(() => vi.unstubAllGlobals());

function serve(body: unknown, status = 200): string[] {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return calls;
}
const api = () => createHttpApi({ policy: OPEN, readScope: {} });
const QUERY = {
  environment: "paper", metric: "NAV", window: "30D",
  subjects: [{ subjectType: "PORTFOLIO", subjectId: "TEST_ONLY:portfolio-a" }, { subjectType: "PORTFOLIO", subjectId: "TEST_ONLY:portfolio-b" }],
} as const;

describe("getManagerSeries", () => {
  it("GETs /manager/series with subjects and window JSON-encoded, and returns the typed read", async () => {
    const calls = serve(fixture("populated"));
    const result = await api().getManagerSeries(QUERY);
    if (!result.ok) throw new Error(result.reason);
    const url = new URL(calls[0]!, "http://portal.test");
    expect(url.pathname).toBe("/api/v1/execution/manager/series");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      environment: "paper", metric: "NAV", window: "\"30D\"",
      subjects: JSON.stringify([{ subject_type: "PORTFOLIO", subject_id: "TEST_ONLY:portfolio-a" }, { subject_type: "PORTFOLIO", subject_id: "TEST_ONLY:portfolio-b" }]),
    });
    expect(result.value.comparison.state).toBe("ALIGNED");
    expect(result.value.series).toHaveLength(2);
  });

  it("encodes a custom window and a pinned economic partition as JSON, and the fund as a subject without an id", async () => {
    const calls = serve(fixture("empty"));
    await api().getManagerSeries({
      environment: "live", metric: "RETURN", window: { fromMs: 10, toMs: 20 }, subjects: [{ subjectType: "FUND" }], workspaceId: "ws 1",
      economicPartition: { economicDomain: "ACTUAL", currency: "USDT", basis: "b", nativeProfileRef: "n", domainProofRef: "d" },
    });
    const query = new URL(calls[0]!, "http://portal.test").searchParams;
    expect(JSON.parse(query.get("window")!)).toEqual({ from_ms: 10, to_ms: 20 });
    expect(JSON.parse(query.get("subjects")!)).toEqual([{ subject_type: "FUND" }]);
    expect(JSON.parse(query.get("economic_partition")!)).toEqual({ economic_domain: "ACTUAL", currency: "USDT", basis: "b", native_profile_ref: "n", domain_proof_ref: "d" });
    expect(query.get("workspace_id")).toBe("ws 1");
  });

  it("the unavailable answer is a 200 that the reader keeps typed (nothing is turned into a series)", async () => {
    serve(fixture("unavailable"));
    const result = await api().getManagerSeries({ ...QUERY, subjects: [{ subjectType: "FUND" }, { subjectType: "PORTFOLIO", subjectId: "TEST_ONLY:portfolio-a" }] });
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.seriesSource.state).toBe("NOT_PUBLISHED");
    expect(result.value.series.every((entry) => entry.state === "UNAVAILABLE")).toBe(true);
  });

  it.each([400, 401, 403, 404, 409, 422, 500, 503])("a %i is a typed failure, never a series", async (status) => {
    serve({ error: { code: "SOME_CODE", message: "refused" } }, status);
    const result = await api().getManagerSeries(QUERY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });

  it("a network failure is unavailable", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); });
    const result = await api().getManagerSeries(QUERY);
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
  });

  it("a body the reader refuses is unavailable: not JSON, wrong schema, a lying comparison, a zero where a value is unknown", async () => {
    const lying = fixture("currency-mixed") as Record<string, Record<string, unknown>>;
    lying.comparison = { ...lying.comparison, state: "ALIGNED", reason_code: null };
    const badValue = fixture("populated") as { series: { points: { value: unknown }[] }[] };
    badValue.series[0]!.points[0]!.value = 0;
    for (const body of ["<html>not json</html>", "", { schema_version: "portal.execution.manager-series.v2" }, { schema_version: "portal.execution.manager-dataset.v1" }, lying, badValue, null, [], 5]) {
      serve(body);
      const result = await api().getManagerSeries(QUERY);
      expect(result.ok, JSON.stringify(body)?.slice(0, 40)).toBe(false);
    }
  });

  it("a request the server would refuse is refused without a fetch", async () => {
    const calls = serve(fixture("populated"));
    const pf = (id: string) => ({ subjectType: "PORTFOLIO", subjectId: id }) as const;
    for (const subjects of [[], [pf("1"), pf("1")], [pf("1"), pf("2"), pf("3"), pf("4"), pf("5")], [pf("")]]) {
      const result = await api().getManagerSeries({ ...QUERY, subjects });
      expect(result.ok).toBe(false);
    }
    expect((await api().getManagerSeries({ ...QUERY, window: { fromMs: 9, toMs: 1 } })).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("the fixture api answers unavailable (the series is not part of the fixture set)", async () => {
    const result = await createFixtureApi().getManagerSeries(QUERY);
    expect(result.ok).toBe(false);
  });
});
