// @vitest-environment node
/**
 * WP-K slice 1 (FIXTURE_LAB): the review lane serves ALPHA subjects and the DRAWDOWN metric through the same HTTP route and the unmodified strict reader.
 * Every figure here is simulated (register section 2k); nothing claims a real source.
 */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { answerReviewManager, type ReviewManagerProfile } from "../../../fixture-bff/review-manager";
import { answerManagerSeries } from "../../e2e/bffDoubleManager";
import { scaled, setFixtureNow, setFixtureScale } from "../../e2e/bffScale";
import { createHttpApi } from "../execution/api/httpApi";
import type { ExecutionApi } from "../execution/api/ports";
import type { DeliveryPolicy } from "../execution/profile";
import { disposeSchemaCheck, violationsOf } from "./schemaCheck";

const OPEN: DeliveryPolicy = { policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: false, sseEnabled: false,
  governanceWriteEnabled: false, paperCommandsEnabled: false, sandboxCommandsEnabled: false,
  liveProtectiveCommandsEnabled: false, liveRiskIncreasingCommandsEnabled: false };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const prepare = (): void => { setFixtureScale("medium"); setFixtureNow("2026-10-22T12:00:00Z"); };
const ask = (metric: string, subjects: unknown[], extra: Record<string, string> = {}, profile: ReviewManagerProfile = "populated"): Body => {
  prepare();
  return answerReviewManager("GET", "/manager/series", new URLSearchParams({ environment: "paper", metric, subjects: JSON.stringify(subjects), window: JSON.stringify("30D"), ...extra }), profile);
};
function client(): ExecutionApi {
  prepare();
  vi.stubGlobal("fetch", async (input: string) => {
    const url = new URL(String(input), "http://fixture.test");
    const response = answerReviewManager("GET", url.pathname, url.searchParams, "populated");
    return new Response(JSON.stringify(response?.body ?? { error: { code: "FIXTURE_GAP" } }), { status: response?.status ?? 501, headers: { "content-type": "application/json", "x-fixture-lane": "FIXTURE_LAB" } });
  });
  return createHttpApi({ policy: OPEN, readScope: {} });
}
const schema = (body: unknown): void => expect(violationsOf({ file: "execution-manager-series.v1", ptr: "" }, body).violations).toEqual([]);
const alphaWithPaper = (index: number): string => (prepare(), scaled()).alphas.filter((alpha) => alpha.deployments.some((deployment) => deployment.environment === "paper"))[index]!.id;
afterEach(() => { vi.unstubAllGlobals(); setFixtureScale("small"); setFixtureNow("2026-08-22T13:00:00Z"); });
afterAll(disposeSchemaCheck);

describe("WP-K FIXTURE_LAB: ALPHA subjects", () => {
  it("an alpha NAV series conforms to the schema, names the alpha and carries the fixture labels", () => {
    const id = alphaWithPaper(0);
    const result = ask("NAV", [{ subject_type: "ALPHA", subject_id: id }]);
    expect(result.status).toBe(200);
    schema(result.body);
    const entry = result.body.series[0];
    expect(entry.subject).toEqual({ subject_type: "ALPHA", subject_id: id });
    expect(entry).toMatchObject({ state: "AVAILABLE", unit: "MONEY" });
    expect(entry.calculation_revision).toContain("FIXTURE_LAB");
    expect(entry.methodology_ref).toContain("FIXTURE_LAB");
    expect(entry.points.every((point: Body) => typeof point.value === "string")).toBe(true);
  });
  it("two alphas of one currency are ALIGNED; an alpha next to a portfolio of the same partition too; unknown alphas are a typed absence", async () => {
    const [a, b] = [alphaWithPaper(0), alphaWithPaper(1)];
    const pair = ask("NET_PNL", [{ subject_type: "ALPHA", subject_id: a }, { subject_type: "ALPHA", subject_id: b }]);
    schema(pair.body);
    expect(pair.body.comparison.state === "ALIGNED" || pair.body.comparison.reason_code === "CURRENCY_MIXED").toBe(true);
    const unknown = ask("NAV", [{ subject_type: "ALPHA", subject_id: "alpha_does_not_exist" }]);
    schema(unknown.body);
    expect(unknown.body.series[0]).toMatchObject({ state: "UNAVAILABLE", reason_code: "SUBJECT_HAS_NO_ACTIVE_MEMBERS", points: [] });
    const api = client();
    const parsed = await api.getManagerSeries({ environment: "paper", metric: "NAV", window: "30D", subjects: [{ subjectType: "ALPHA", subjectId: a }] });
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  });
  it("the series ends on the alpha's own dataset figure (the same rows the Fleet reads serve)", () => {
    const id = alphaWithPaper(0);
    const nav = ask("NAV", [{ subject_type: "ALPHA", subject_id: id }]).body.series[0];
    const pnl = ask("NET_PNL", [{ subject_type: "ALPHA", subject_id: id }]).body.series[0];
    expect(pnl.points[0].value).toBe("0");
    expect(nav.points.length).toBe(pnl.points.length);
  });
});

describe("WP-K FIXTURE_LAB: DRAWDOWN", () => {
  it("is a RATIO on FRACTION with no currency, never above zero, exact decimals, zero at a new high", () => {
    const id = alphaWithPaper(0);
    const result = ask("DRAWDOWN", [{ subject_type: "ALPHA", subject_id: id }, { subject_type: "FUND" }]);
    expect(result.status).toBe(200);
    schema(result.body);
    expect(result.body.metric).toBe("DRAWDOWN");
    for (const entry of result.body.series) {
      expect(entry).toMatchObject({ state: "AVAILABLE", unit: "RATIO", currency: null, ratio_scale: "FRACTION" });
      for (const point of entry.points) expect(point.value === "0" || /^-(?:0|[1-9][0-9]*)\.[0-9]{1,8}$/.test(point.value)).toBe(true);
      expect(entry.points[0].value).toBe("0");
    }
  });
  it("is derived from the NAV walk of the same subject (running peak), so its zero is the NAV's new high", () => {
    const id = alphaWithPaper(0);
    const nav = ask("NAV", [{ subject_type: "ALPHA", subject_id: id }]).body.series[0].points as Body[];
    const dd = ask("DRAWDOWN", [{ subject_type: "ALPHA", subject_id: id }]).body.series[0].points as Body[];
    expect(dd.map((p) => p.ts_ms)).toEqual(nav.map((p) => p.ts_ms));
    let peak = -1n;
    nav.forEach((p, i) => {
      const [whole, fraction = ""] = (p.value as string).split(".");
      const value = BigInt(whole + fraction.padEnd(18, "0"));
      if (value > peak) peak = value;
      if (value === peak) expect(dd[i].value).toBe("0");
      else expect(dd[i].value.startsWith("-")).toBe(true);
    });
  });
  it("the strict reader accepts it through the unmodified HTTP port, for alphas and portfolios together", async () => {
    const api = client();
    const portfolio = scaled().portfolios.find((entry) => entry.base === "USDT")!.id;
    const parsed = await api.getManagerSeries({ environment: "paper", metric: "DRAWDOWN", window: "30D",
      subjects: [{ subjectType: "ALPHA", subjectId: alphaWithPaper(0) }, { subjectType: "PORTFOLIO", subjectId: portfolio }] });
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (parsed.ok) expect(parsed.value.series.map((entry) => entry.state)).toEqual(["AVAILABLE", "AVAILABLE"]);
  });
  it("the layout-stress profile serves 1440 drawdown points", () => {
    const result = ask("DRAWDOWN", [{ subject_type: "ALPHA", subject_id: alphaWithPaper(0) }], {}, "layout-stress");
    expect(result.status).toBe(200);
    expect(result.body.series[0].points).toHaveLength(1440);
  });
});

describe("WP-K FIXTURE_LAB: the L0 double", () => {
  it("answers ALPHA and DRAWDOWN additively and refuses what it does not know", () => {
    const get = (query: Record<string, string>) => answerManagerSeries("GET", "/manager/series", new URLSearchParams({ environment: "paper", window: JSON.stringify("30D"), ...query }));
    const ok = get({ metric: "DRAWDOWN", subjects: JSON.stringify([{ subject_type: "ALPHA", subject_id: "a1" }]) });
    expect(ok?.status).toBe(200);
    expect((ok!.body as Body).metric).toBe("DRAWDOWN");
    expect(get({ metric: "SHARPE", subjects: JSON.stringify([{ subject_type: "FUND" }]) })?.status).toBe(400);
    expect(get({ metric: "NAV", subjects: JSON.stringify([{ subject_type: "STRATEGY", subject_id: "x" }]) })?.status).toBe(400);
    expect(get({ metric: "NAV", subjects: JSON.stringify([{ subject_type: "ALPHA", subject_id: "x" }, { subject_type: "ALPHA", subject_id: "x" }]) })?.status).toBe(400);
  });
});
