// @vitest-environment node
/** Explicit SYNTHETIC review lane, judged by schemas AND the unmodified production HTTP port. */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { answerReviewManager, type ReviewManagerProfile } from "../../../fixture-bff/review-manager";
import { answerManagerFleet, answerManagerSeries } from "../../e2e/bffDoubleManager";
import { fixtureNowMs, scaled, setFixtureNow, setFixtureScale } from "../../e2e/bffScale";
import { createHttpApi } from "../execution/api/httpApi";
import type { ExecutionApi } from "../execution/api/ports";
import type { DeliveryPolicy } from "../execution/profile";
import { disposeSchemaCheck, violationsOf } from "./schemaCheck";

// Merely opens the CLIENT's read branch; this synthetic fixture grants no product permission.
const OPEN: DeliveryPolicy = { policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: false, sseEnabled: false,
  governanceWriteEnabled: false, paperCommandsEnabled: false, sandboxCommandsEnabled: false,
  liveProtectiveCommandsEnabled: false, liveRiskIncreasingCommandsEnabled: false };
const NOW = "2026-10-22T12:00:00Z";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const ask = (path: string, extra: Record<string, string> = {}, profile: ReviewManagerProfile = "populated"): Body => answerReviewManager("GET", path, new URLSearchParams({ environment: "paper", ...extra }), profile);
const series = (metric = "NAV", profile: ReviewManagerProfile = "populated", extra: Record<string, string> = {}): Body => ask("/manager/series", {
  metric, subjects: JSON.stringify([{ subject_type: "FUND" }]), window: JSON.stringify("30D"), ...extra,
}, profile);
const prepare = (profile: ReviewManagerProfile = "populated"): void => {
  setFixtureScale(profile === "layout-stress" ? "large" : "medium");
  setFixtureNow(NOW);
};
function client(profile: ReviewManagerProfile = "populated"): ExecutionApi {
  prepare(profile);
  vi.stubGlobal("fetch", async (input: string) => {
    const url = new URL(String(input), "http://fixture.test");
    const response = answerReviewManager("GET", url.pathname, url.searchParams, profile);
    return new Response(JSON.stringify(response?.body ?? { error: { code: "FIXTURE_GAP" } }), {
      status: response?.status ?? 501, headers: { "content-type": "application/json", "x-fixture-lane": "FIXTURE_LAB" },
    });
  });
  return createHttpApi({ policy: OPEN, readScope: {} });
}
function schema(body: unknown, file: string): void {
  expect(violationsOf({ file, ptr: "" }, body).violations).toEqual([]);
}
afterEach(() => {
  vi.unstubAllGlobals();
  setFixtureScale("small");
  setFixtureNow("2026-08-22T13:00:00Z");
});
afterAll(disposeSchemaCheck);

describe("opt-in review Manager series", () => {
  it.each(["NAV", "RETURN", "NET_PNL"])("%s: exact strings, deterministic 240 points, explicit real hole and no future clock", async (metric) => {
    prepare();
    const result = series(metric);
    expect(result.status).toBe(200);
    schema(result.body, "execution-manager-series.v1");
    const entry = result.body.series[0];
    expect(entry.points).toHaveLength(240);
    expect(entry.points.every((point: Body) => typeof point.value === "string" && point.ts_ms <= fixtureNowMs())).toBe(true);
    expect(entry.gaps).toHaveLength(1);
    expect(entry.points.some((point: Body) => point.ts_ms === entry.gaps[0].from_ms)).toBe(false);
    expect(result.body.as_of_ms).toBe(fixtureNowMs());
    expect(result.body.recorded_through_ms).toBe(fixtureNowMs());
    expect(entry.calculation_revision).toContain("FIXTURE_LAB");
    expect(series(metric)).toEqual(result);
    if (metric !== "NAV") expect(entry.points[0].value).toBe("0");
    if (metric === "NAV") expect(entry.points[0].value).toBe("100000.000000000000000001");
    const api = client();
    const parsed = await api.getManagerSeries({ environment: "paper", metric: metric as "NAV" | "RETURN" | "NET_PNL", window: "30D", subjects: [{ subjectType: "FUND" }] });
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (parsed.ok && parsed.value.series[0]?.state === "AVAILABLE") expect(parsed.value.series[0].points).toHaveLength(240);
  });

  it("layout-stress returns 1440 points per subject, aligned only for genuinely common synthetic partitions", async () => {
    const api = client("layout-stress");
    const portfolios = scaled().portfolios.filter((entry) => entry.base === "USDT").slice(0, 4);
    expect(portfolios).toHaveLength(4);
    const query = { environment: "paper" as const, metric: "NET_PNL" as const, window: "90D" as const,
      subjects: portfolios.map((entry) => ({ subjectType: "PORTFOLIO" as const, subjectId: entry.id })) };
    const parsed = await api.getManagerSeries(query);
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.comparison.state).toBe("ALIGNED");
    expect(parsed.value.series.every((entry) => entry.state === "AVAILABLE" && entry.points.length === 1440)).toBe(true);
    const raw = series("NET_PNL", "layout-stress", { subjects: JSON.stringify(query.subjects.map((entry) => ({ subject_type: entry.subjectType, subject_id: entry.subjectId }))), window: JSON.stringify("90D") });
    schema(raw.body, "execution-manager-series.v1");
    expect(JSON.stringify(raw.body).length).toBeLessThan(1_048_576);
  });

  it.each(["paper", "sandbox", "live"])("%s series preserves the published economic-domain vocabulary", async (environment) => {
    const api = client();
    const raw = series("NAV", "populated", { environment });
    schema(raw.body, "execution-manager-series.v1");
    expect(raw.body.series[0].partition.economic_domain).toBe(environment === "live" ? "ACTUAL" : environment.toUpperCase());
    const parsed = await api.getManagerSeries({ environment: environment as "paper" | "sandbox" | "live", metric: "NAV", window: "7D", subjects: [{ subjectType: "FUND" }] });
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  });

  it("keeps currency partitions incomparable, unknown subjects absent, ALL absent, and a mismatched pin absent", async () => {
    const api = client();
    const portfolios = scaled().portfolios;
    const usdt = portfolios.find((entry) => entry.base === "USDT")!;
    const other = portfolios.find((entry) => entry.base !== "USDT")!;
    const mixed = await api.getManagerSeries({ environment: "paper", metric: "NAV", window: "30D", subjects: [usdt, other].map((entry) => ({ subjectType: "PORTFOLIO", subjectId: entry.id })) });
    expect(mixed.ok && mixed.value.comparison).toMatchObject({ state: "INCOMPARABLE", reasonCode: "CURRENCY_MIXED" });
    const unknown = await api.getManagerSeries({ environment: "paper", metric: "NAV", window: "30D", subjects: [{ subjectType: "PORTFOLIO", subjectId: "pf_missing" }] });
    expect(unknown.ok && unknown.value.series[0]).toMatchObject({ state: "UNAVAILABLE", reasonCode: "SUBJECT_HAS_NO_ACTIVE_MEMBERS" });
    const all = await api.getManagerSeries({ environment: "paper", metric: "NAV", window: "ALL", subjects: [{ subjectType: "FUND" }] });
    expect(all.ok && all.value.selectedWindow).toMatchObject({ kind: "gap", reasonCode: "ALL_HISTORY_WINDOW_NOT_PUBLISHED" });
    const pinned = series("NAV", "populated", { economic_partition: JSON.stringify({ economic_domain: "PAPER", currency: "EUR", basis: "different", native_profile_ref: "different", domain_proof_ref: "different" }) });
    expect(pinned.body.series[0]).toMatchObject({ state: "UNAVAILABLE", reason_code: "ECONOMIC_PARTITION_REQUIRED" });
    schema(pinned.body, "execution-manager-series.v1");
  });

  it("reuses original validation and does not rewrite L0 or the named sparse/state cases", () => {
    prepare();
    const query = new URLSearchParams({ environment: "paper", metric: "NAV", subjects: JSON.stringify([{ subject_type: "FUND" }]), window: JSON.stringify("30D") });
    const old = answerManagerSeries("GET", "/manager/series", query);
    series();
    expect(answerManagerSeries("GET", "/manager/series", query)).toEqual(old);
    query.set("workspace_id", "ws_TEST_SERIES_EMPTY");
    expect(answerReviewManager("GET", "/manager/series", query, "populated")).toEqual(answerManagerSeries("GET", "/manager/series", query));
    query.set("extra", "ignored?");
    expect(answerReviewManager("GET", "/manager/series", query, "populated")?.status).toBe(400);
    expect(series("NAV", "populated", { window: JSON.stringify({ from_ms: fixtureNowMs(), to_ms: fixtureNowMs() + 300 }) }).status).toBe(400);
    expect(answerReviewManager("POST", "/manager/series", query, "populated")).toBeNull();
  });
});

describe("six opt-in review Manager datasets", () => {
  it.each(["paper", "sandbox", "live"])("%s Fleet is schema-valid, scope-correct and rich under the real HTTP reader", async (environment) => {
    const api = client();
    const raw = ask("/manager/fleet", { environment, limit: "200" });
    expect(raw.status).toBe(200);
    schema(raw.body, "execution-manager-dataset.v1");
    expect(raw.body.items.length).toBeGreaterThan(2);
    expect(raw.body.items.every((row: Body) => scaled().alphas.some((alpha) => alpha.id === row.alpha_id))).toBe(true);
    const parsed = await api.getManagerDataset({ surface: "FLEET", environment: environment as "paper" | "sandbox" | "live", limit: 200, workspaceId: "fixture-workspace" });
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    expect(parsed.ok && parsed.value.workspaceId).toBe("fixture-workspace");
    expect(raw.body.scores.raw).toEqual({ value: null, status: "policy_pending" });
  });

  it("answers FUND and each known linked resource; missing resources are typed 404, never another scope", async () => {
    const api = client();
    const deployment = scaled().alphas.flatMap((alpha) => alpha.deployments).find((entry) => entry.environment === "paper")!;
    const cases = [
      { surface: "FUND" as const, path: "/manager/fund-overview" },
      { surface: "PORTFOLIO" as const, id: deployment.portfolioId, path: `/manager/portfolios/${deployment.portfolioId}/overview` },
      { surface: "ALPHA" as const, id: deployment.alphaId, path: `/manager/alphas/${deployment.alphaId}/overview` },
      { surface: "ACCOUNT" as const, id: deployment.accountId, path: `/manager/accounts/${deployment.accountId}/overview` },
      { surface: "DEPLOYMENT" as const, id: deployment.id, path: `/manager/deployments/${deployment.id}/overview` },
    ];
    for (const entry of cases) {
      const raw = ask(entry.path);
      expect(raw.status, entry.path).toBe(200);
      schema(raw.body, "execution-manager-dataset.v1");
      const parsed = await api.getManagerDataset({ ...entry, environment: "paper", workspaceId: "ws_review" });
      expect(parsed.ok, `${entry.surface}: ${JSON.stringify(parsed)}`).toBe(true);
      expect(parsed.ok && parsed.value.items.length).toBeGreaterThan(0);
      expect(raw.body.quality.reasons).toContain("FIXTURE_LAB_SYNTHETIC");
    }
    for (const kind of ["portfolios", "alphas", "accounts", "deployments"]) expect(ask(`/manager/${kind}/missing/overview`)).toMatchObject({ status: 404, body: { error: { code: "EXECUTION_READ_NOT_AVAILABLE" } } });
  });

  it("applies text search/filter/sort, lifecycle, groups over the FULL result, and opaque forward/back pages", async () => {
    const api = client("layout-stress");
    const query = { surface: "FLEET" as const, environment: "live" as const, limit: 3, groupBy: ["portfolio_id" as const], sort: [{ field: "name" as const, direction: "desc" as const }] };
    const first = await api.getManagerDataset(query);
    expect(first.ok, JSON.stringify(first)).toBe(true);
    if (!first.ok) return;
    expect(first.value.page.authorizedFilteredCount).toBeGreaterThan(3);
    expect(first.value.groups.reduce((total, group) => total + group.uniqueRowCount, 0)).toBe(first.value.page.authorizedFilteredCount);
    const nextCursor = first.value.page.nextCursor!;
    expect(nextCursor).not.toBeNull();
    const second = await api.getManagerDataset({ ...query, after: nextCursor });
    expect(second.ok, JSON.stringify(second)).toBe(true);
    if (!second.ok) return;
    expect(second.value.items.map((row) => row.rowKey)).not.toEqual(first.value.items.map((row) => row.rowKey));
    const previous = await api.getManagerDataset({ ...query, before: second.value.page.previousCursor! });
    expect(previous.ok && previous.value.items.map((row) => row.rowKey)).toEqual(first.value.items.map((row) => row.rowKey));
    const row = first.value.items[0]!;
    const exact = await api.getManagerDataset({ surface: "FLEET", environment: "live", q: row.name!, qMode: "PREFIX", lifecycleFilter: row.lifecycle!, filters: [{ field: "alpha_id", op: "EQ", value: row.alphaId }] });
    expect(exact.ok, JSON.stringify(exact)).toBe(true);
    expect(exact.ok && exact.value.items.every((entry) => entry.alphaId === row.alphaId)).toBe(true);
    const changed = await api.getManagerDataset({ ...query, after: nextCursor, q: "different" });
    expect(changed.ok).toBe(false);
    const crossProfile = ask("/manager/fleet", { environment: "live", limit: "3", after: nextCursor }, "populated");
    expect(crossProfile.status).toBe(409);
  });

  it("does not sum currency partitions, replace null with zero, or change capital statements after a table filter", () => {
    prepare("layout-stress");
    const all = ask("/manager/fleet", { environment: "live", limit: "200" }, "layout-stress");
    expect(all.status).toBe(200);
    expect(all.body.capital_statements.length).toBeGreaterThan(1);
    const zero = all.body.items.find((row: Body) => row.metrics.net_pnl.value === "0");
    const missing = all.body.items.find((row: Body) => row.metrics.unrealized_pnl.value === null);
    expect(zero.metrics.net_pnl.availability).toBe("AVAILABLE");
    expect(missing.metrics.unrealized_pnl.availability).toBe("UNAVAILABLE");
    const filtered = ask("/manager/fleet", { environment: "live", q: "does-not-exist", q_mode: "PREFIX" }, "layout-stress");
    expect(filtered.body.items).toEqual([]);
    expect(filtered.body.capital_statements).toEqual(all.body.capital_statements);
    schema(filtered.body, "execution-manager-dataset.v1");
    expect(all.body.as_of_ms).toBeLessThanOrEqual(fixtureNowMs());
  });

  it.each(["populated", "layout-stress"] as const)("%s serves explicit capital facts through the unchanged FUND reader", async (profile) => {
    const api = client(profile);
    const raw = ask("/manager/fund-overview", { environment: "live", limit: "200" }, profile);
    expect(raw.status).toBe(200);
    schema(raw.body, "execution-manager-dataset.v1");
    const statements = raw.body.capital_statements as Body[];
    expect(statements.length).toBeGreaterThan(1);
    for (const { partition, metrics } of statements) {
      expect(Object.keys(metrics).sort()).toEqual(["added_funds", "current_budget", "current_nav", "initial_funds", "pending_amount", "returned_capital"]);
      for (const [kind, entry] of Object.entries<Body>(metrics)) {
        expect(entry).toMatchObject({ currency: partition.currency, unit: "MONEY", window: null,
          denominator: null, source_confidence: "PROVISIONAL", calculation_revision: "FIXTURE_LAB:capital-review.v1" });
        expect(entry.quality.reasons).toContain("FIXTURE_LAB_SYNTHETIC");
        expect(entry.provenance_refs).toHaveLength(1);
        expect(entry.provenance_refs[0]).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(entry.availability).toBe(entry.value === null ? "UNAVAILABLE" : "AVAILABLE");
        expect(entry.reason_code).toBe(entry.value === null ? "SOURCE_FACTS_NOT_PUBLISHED" : null);
        if (kind !== "pending_amount") expect(typeof entry.value).toBe("string");
      }
      expect(metrics.added_funds).toMatchObject({ value: "0", availability: "AVAILABLE", reason_code: null });
      expect(metrics.initial_funds.value).toMatch(/\.000000000000000001$/);
    }
    expect(statements[0].metrics.pending_amount).toMatchObject({ value: null, availability: "UNAVAILABLE", reason_code: "SOURCE_FACTS_NOT_PUBLISHED" });
    expect(statements[1].metrics.pending_amount).toMatchObject({ value: "0", availability: "AVAILABLE" });
    expect(statements[1].metrics.current_nav.value).toBe("-125.500000000000000001");
    expect(raw.body.statement_scope).toBe("AUTHORIZED_RESOURCE_SELECTED_STAGES_BEFORE_TABLE_FILTERS");
    // Smaller pages and a table search do not alter the capital source/population.
    const filtered = ask("/manager/fund-overview", { environment: "live", q: "not-in-the-synthetic-book", limit: "1" }, profile);
    expect(filtered.body.items).toEqual([]);
    expect(filtered.body.capital_statements).toEqual(statements);
    const parsed = await api.getManagerDataset({ surface: "FUND", environment: "live", limit: 1 });
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.capitalStatements).toHaveLength(statements.length);
    expect(parsed.value.capitalStatements[0]!.metrics.get("pending_amount")).toMatchObject({ kind: "absent", reasonCode: "SOURCE_FACTS_NOT_PUBLISHED" });
    expect(parsed.value.capitalStatements[1]!.metrics.get("current_nav")).toMatchObject({ kind: "value", exact: "-125.500000000000000001" });
  });

  it("does not inject rich capital statements into the existing sparse fixture", () => {
    setFixtureScale("small");
    setFixtureNow(NOW);
    const query = new URLSearchParams({ environment: "paper" });
    const before = structuredClone(answerManagerFleet("GET", "/manager/fleet", query));
    expect(before?.body.capital_statements).toBeDefined();
    ask("/manager/fund-overview");
    expect(answerManagerFleet("GET", "/manager/fleet", query)).toEqual(before);
  });

  it("refuses unsupported query options explicitly and preserves the old default body", () => {
    prepare();
    const query = new URLSearchParams({ environment: "paper" });
    const old = answerManagerFleet("GET", "/manager/fleet", query);
    ask("/manager/fleet");
    expect(answerManagerFleet("GET", "/manager/fleet", query)).toEqual(old);
    const unsupported: Record<string, string>[] = [{ window: JSON.stringify("30D") }, { sort: JSON.stringify([{ field: "net_pnl", direction: "asc" }]) },
      { filters: JSON.stringify([{ field: "allocation", op: "GTE", value: "0" }]) },
      { filters: JSON.stringify([{ field: "name", op: "EQ", value: "x", ignored: true }]) },
      { sort: JSON.stringify([{ field: "name", direction: "asc", ignored: true }]) },
      { sort: JSON.stringify([{ field: "name", direction: "asc" }, { field: "name", direction: "desc" }]) },
      { economic_partition: "{}" }, { unknown: "x" }, { limit: "201" }];
    for (const extra of unsupported) {
      expect(ask("/manager/fleet", extra).status).toBe(400);
    }
    expect(answerReviewManager("GET", "/manager/fleet", new URLSearchParams("environment=paper&after=a&after=b"), "populated")?.status).toBe(400);
    expect(ask("/manager/fleet", { after: "not-a-cursor" }).status).toBe(400);
    expect(answerReviewManager("POST", "/manager/fleet", query, "populated")).toBeNull();
    expect(answerReviewManager("GET", "/not-manager", query, "populated")).toBeNull();
  });
});
