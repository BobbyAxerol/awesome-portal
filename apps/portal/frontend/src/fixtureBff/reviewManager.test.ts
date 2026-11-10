// @vitest-environment node
/** Explicit SYNTHETIC review lane, judged by schemas AND the unmodified production HTTP port. */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { answerReviewManager, wpWorldAlphas, type ReviewManagerProfile } from "../../../fixture-bff/review-manager";
import { answerManagerFleet, answerManagerSeries } from "../../e2e/bffDoubleManager";
import { fixtureNowMs, scaled, setFixtureNow, setFixtureScale } from "../../e2e/bffScale";
import { costInWindow, costOverRun } from "../../e2e/bffWorldBooks";
import { fromCents, toCents } from "../../e2e/bffWorld";
import { createHttpApi } from "../execution/api/httpApi";
import type { ExecutionApi } from "../execution/api/ports";
import type { DeliveryPolicy } from "../execution/profile";
import { disposeSchemaCheck, violationsOf } from "./schemaCheck";
import { resetScenario, setScenario } from "../../../fixture-bff/scenario";

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
  resetScenario();
  vi.unstubAllGlobals();
  setFixtureScale("small");
  setFixtureNow("2026-08-22T13:00:00Z");
});
afterAll(disposeSchemaCheck);

describe("opt-in review Manager series", () => {
  it.each(["NAV", "RETURN", "NET_PNL"])("%s: exact strings, deterministic 240 complete points and no future clock", async (metric) => {
    prepare();
    const result = series(metric);
    expect(result.status).toBe(200);
    schema(result.body, "execution-manager-series.v1");
    const entry = result.body.series[0];
    expect(entry.points).toHaveLength(240);
    expect(entry.points.every((point: Body) => typeof point.value === "string" && point.ts_ms <= fixtureNowMs())).toBe(true);
    expect(entry.gaps).toEqual([]);
    expect(entry.points.every((point: Body, index: number) => index === 0 || point.ts_ms > entry.points[index - 1].ts_ms)).toBe(true);
    expect(result.body.as_of_ms).toBe(fixtureNowMs());
    expect(result.body.recorded_through_ms).toBe(fixtureNowMs());
    expect(entry.calculation_revision).toContain("FIXTURE_LAB");
    expect(series(metric)).toEqual(result);
    if (metric !== "NAV") expect(entry.points[0].value).toBe("0");
    if (metric === "NAV") expect(Number(entry.points[0].value)).toBeGreaterThan(0);
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
    expect(portfolios.every((entry) => entry.base === "USDT")).toBe(true); // the scale world publishes USDT only (WP-4)
    const other = { id: "pf_TEST_ONLY_yen" }; // the TEST_ONLY yen book carries the one non-USDT currency
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
    expect(raw.body.items.every((row: Body) => (wpWorldAlphas("FUND", undefined) ?? scaled().alphas).some((alpha) => alpha.id === row.alpha_id))).toBe(true); // WP-P: the positive world holds the native books too
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
    expect(all.body.capital_statements.length).toBeGreaterThanOrEqual(1); // USDT-only scale world (WP-4): one statement per economic domain
    for (const row of all.body.items as Body[]) {
      expect(row.metrics.net_pnl.availability).toBe("AVAILABLE");
      expect(row.metrics.unrealized_pnl.availability).toBe("AVAILABLE");
    }
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
    expect(statements.length).toBeGreaterThanOrEqual(1); // USDT-only scale world (WP-4)
    for (const { partition, metrics } of statements) {
      const original = Object.fromEntries(Object.entries<Body>(metrics).filter(([kind]) => !["net_pnl", "return_30d_pct", "max_drawdown_pct", "allocation", "headroom", "net_external_flows", "recalling"].includes(kind))); // the last four are WP-F1's (reviewCapital.test.ts)
      expect(Object.keys(original).sort()).toEqual(["added_funds", "current_budget", "current_nav", "initial_funds", "pending_amount", "returned_capital"]);
      for (const [kind, entry] of Object.entries<Body>(original)) {
        expect(entry).toMatchObject({ currency: partition.currency, unit: "MONEY", window: null,
          denominator: null, source_confidence: "VERIFIED", calculation_revision: "FIXTURE_LAB:capital-review.v1" });
        expect(entry.quality.reasons).toContain("FIXTURE_LAB_SYNTHETIC");
        expect(entry.provenance_refs).toHaveLength(1);
        expect(entry.provenance_refs[0]).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(entry.availability).toBe(entry.value === null ? "UNAVAILABLE" : "AVAILABLE");
        expect(entry.reason_code).toBe(entry.value === null ? "SOURCE_FACTS_NOT_PUBLISHED" : null);
        if (kind !== "pending_amount") expect(typeof entry.value).toBe("string");
      }
      expect(metrics.added_funds).toMatchObject({ value: "0", availability: "AVAILABLE", reason_code: null });
      // Capital comes from the linked deployment graph, not a decorative
      // fractional sentinel unrelated to accounts/portfolios.
      const members = (wpWorldAlphas("FUND", undefined) ?? scaled().alphas).flatMap(alpha => alpha.deployments).filter(d => d.environment === "live" && d.currency === partition.currency);
      expect(Number(metrics.initial_funds.value)).toBe(members.reduce((n, d) => n + Number(d.allocation), 0));
      expect(Number(metrics.current_nav.value)).toBeCloseTo(members.reduce((n, d) => n + Number(d.allocation) + Number(d.realized), 0), 6);
    }
    expect(statements[0].metrics.pending_amount).toMatchObject({ value: "0", availability: "AVAILABLE", reason_code: null });
    const last = statements[statements.length - 1]; // USDT-only scale world (WP-4): one statement per economic domain, so first and last may be the same line
    expect(last.metrics.pending_amount).toMatchObject({ value: "0", availability: "AVAILABLE" });
    expect(Number(last.metrics.current_nav.value)).toBeGreaterThan(0);
    expect(raw.body.statement_scope).toBe("AUTHORIZED_RESOURCE_SELECTED_STAGES_BEFORE_TABLE_FILTERS");
    // Smaller pages and a table search do not alter the capital source/population.
    const filtered = ask("/manager/fund-overview", { environment: "live", q: "not-in-the-synthetic-book", limit: "1" }, profile);
    expect(filtered.body.items).toEqual([]);
    expect(filtered.body.capital_statements).toEqual(statements);
    const parsed = await api.getManagerDataset({ surface: "FUND", environment: "live", limit: 1 });
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.capitalStatements).toHaveLength(statements.length);
    expect(parsed.value.capitalStatements[0]!.metrics.get("pending_amount")).toMatchObject({ kind: "value", exact: "0" });
    expect(parsed.value.capitalStatements[statements.length - 1]!.metrics.get("current_nav")).toMatchObject({ kind: "value", exact: last.metrics.current_nav.value });
  });

  it("does not inject rich capital statements into the existing sparse fixture", () => {
    setFixtureScale("small");
    setFixtureNow(NOW);
    const query = new URLSearchParams({ environment: "paper" });
    const before = structuredClone(answerManagerFleet("GET", "/manager/fleet", query));
    expect((before?.body as { capital_statements?: unknown } | undefined)?.capital_statements).toBeDefined();
    ask("/manager/fund-overview");
    expect(answerManagerFleet("GET", "/manager/fleet", query)).toEqual(before);
  });

  it("keeps explicit sparse zero, absence and negative balance cases outside the positive default", () => {
    prepare();
    const sparse = answerManagerFleet("GET", "/manager/fleet", new URLSearchParams({ environment: "paper" }))!.body as Body;
    schema(sparse, "execution-manager-dataset.v1");
    expect(sparse.items[0].metrics.net_pnl).toMatchObject({ value: "0", availability: "AVAILABLE" });
    expect(sparse.items[0].metrics.unrealized_pnl).toMatchObject({ value: null, availability: "UNAVAILABLE", reason_code: "METHODOLOGY_NOT_PUBLISHED" });
    expect(sparse.capital_statements[1].metrics.balance_total).toMatchObject({ value: "-12.5", availability: "AVAILABLE" });
    for (const [workspace, state] of [["ws_TEST_SERIES_EMPTY", "EMPTY"], ["ws_TEST_SERIES_UNAVAILABLE", "UNAVAILABLE"]]) {
      const response = series("NAV", "populated", { workspace_id: workspace });
      schema(response.body, "execution-manager-series.v1");
      expect(response.body.series.every((entry: Body) => entry.state === state)).toBe(true);
      expect(response.body.series.every((entry: Body) => entry.points.length === 0)).toBe(true);
    }
  });

  it("refuses unsupported query options explicitly and preserves the old default body", () => {
    prepare();
    const query = new URLSearchParams({ environment: "paper" });
    const old = answerManagerFleet("GET", "/manager/fleet", query);
    ask("/manager/fleet");
    expect(answerManagerFleet("GET", "/manager/fleet", query)).toEqual(old);
    const unsupported: Record<string, string>[] = [{ window: JSON.stringify({ from_ms: 1, to_ms: 2 }) }, { sort: JSON.stringify([{ field: "net_pnl", direction: "asc" }]) },
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

/** SIMULATED derived keys (fixture-bff README): exact strings, bigint rules, one partition at a time. */
describe("simulated Manager metrics (row, capital statement, group)", () => {
  const SCALE = 18;
  const big = (value: string): bigint => {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = value.replace("-", "").split(".");
    const n = BigInt(whole + fraction.padEnd(SCALE, "0"));
    return negative ? -n : n;
  };
  const text = (value: bigint, places: number): string => {
    const negative = value < 0n;
    const raw = (negative ? -value : value).toString().padStart(places + 1, "0");
    return `${negative ? "-" : ""}${raw.slice(0, -places)}.${raw.slice(-places)}`;
  };
  const same = (a: string, b: bigint): boolean => big(a) === b;
  const ID = (partition: Body): string => JSON.stringify([partition.economic_domain, partition.currency, partition.basis, partition.native_profile_ref]);
  const read = (extra: Record<string, string>, profile: ReviewManagerProfile, environment = "live"): Body => {
    prepare(profile);
    const result = ask("/manager/fleet", { environment, limit: "100", ...extra }, profile);
    expect(result.status).toBe(200);
    schema(result.body, "execution-manager-dataset.v1");
    return result.body;
  };
  const NEW = ["balance_total", "equity_30d_end_value", "return_30d_pct"];

  it.each(["populated", "layout-stress"] as const)("%s: row keys are offered, exact and consistent with allocation and net PnL of the SAME partition", (profile) => {
    for (const environment of ["paper", "live"]) {
      const body = read({}, profile, environment);
      for (const key of NEW) {
        expect(body.query_options.metric_keys).toContain(key);
        expect(body.query_options.sort_fields).toContain(key);
      }
      expect(body.page.next_cursor).toBeNull();
      let zeroReturn = 0;
      let absentEquity = 0;
      for (const row of body.items as Body[]) {
        expect(Object.keys(row.metrics).sort()).toEqual([...body.query_options.metric_keys].sort());
        for (const entry of row.economic_partitions as Body[]) {
          const m = entry.metrics;
          for (const key of ["balance_total", "equity_30d_end_value"]) expect(m[key]).toMatchObject({ unit: "MONEY", currency: entry.partition.currency });
          expect(m.return_30d_pct).toMatchObject({ unit: "PERCENT", currency: null });
          for (const key of NEW) expect(m[key].provenance_refs[0]).toContain("FIXTURE_LAB");
          const [A, N, U] = ["allocation", "net_pnl", "unrealized_pnl"].map((key) => (m[key].availability === "AVAILABLE" ? m[key].value : null));
          if (A !== null && N !== null) {
            expect(same(m.balance_total.value, big(A) + big(N))).toBe(true);
            expect(m.balance_total.methodology_ref).toContain("FIXTURE_LAB");
            if (big(N) === 0n) { expect(m.return_30d_pct.value).toBe("0"); zeroReturn += 1; }
          } else {
            expect(m.balance_total).toMatchObject({ value: null, availability: "UNAVAILABLE", reason_code: "SOURCE_FACTS_NOT_PUBLISHED" });
            expect(m.return_30d_pct).toMatchObject({ value: null, availability: "UNAVAILABLE" });
          }
          if (A !== null && N !== null && U === null) { expect(m.equity_30d_end_value).toMatchObject({ value: null, availability: "UNAVAILABLE", reason_code: "SOURCE_FACTS_NOT_PUBLISHED" }); absentEquity += 1; }
          if (A !== null && N !== null && U !== null) expect(same(m.equity_30d_end_value.value, big(A) + big(N) + big(U))).toBe(true);
        }
        // A single-partition headline IS the partition's figure; several partitions leave no single headline.
        for (const key of NEW) {
          if (row.economic_partitions.length === 1) expect(row.metrics[key]).toEqual(row.economic_partitions[0].metrics[key]);
          else expect(row.metrics[key]).toMatchObject({ value: null, availability: "UNAVAILABLE" });
        }
      }
      expect(zeroReturn).toBe(body.items.filter((row: Body) => row.metrics.net_pnl.value === "0").length);
      expect(absentEquity).toBe(0);
    }
  });

  it.each(["populated", "layout-stress"] as const)("%s: capital statements add net_pnl, return_30d_pct and max_drawdown_pct inside each partition", (profile) => {
    const body = read({}, profile);
    const statements = body.capital_statements as Body[];
    expect(statements.length).toBeGreaterThanOrEqual(1); // USDT-only scale world (WP-4); the cross-currency refusal lives in the TEST_ONLY yen series test above
    // net_pnl of a partition = the sum of THIS partition's rows' net_pnl; nothing crosses a currency or domain.
    const sums = new Map<string, bigint>();
    for (const row of body.items as Body[]) for (const entry of row.economic_partitions as Body[]) {
      sums.set(ID(entry.partition), (sums.get(ID(entry.partition)) ?? 0n) + big(entry.metrics.net_pnl.value));
    }
    for (const [index, { partition, metrics }] of statements.entries()) {
      expect(metrics.net_pnl).toMatchObject({ unit: "MONEY", currency: partition.currency, window: null, availability: "AVAILABLE" });
      expect(big(metrics.net_pnl.value)).toBe(sums.get(ID(partition)));
      expect(metrics.max_drawdown_pct).toMatchObject({ unit: "PERCENT", currency: null });
      // WP-P: the positive world has no exact-zero drawdown; the former index-0 "0" is the `missing` scenario (positiveWorld.test.ts)
      expect(metrics.max_drawdown_pct.value, `partition ${index}`).toMatch(/^-\d+(\.\d\d?)?$/);
      {
        expect(metrics.return_30d_pct.denominator).toBe(metrics.initial_funds.value);
        const expected = big(metrics.net_pnl.value) * 100n * 1_000_000n / big(metrics.initial_funds.value);
        expect(big(metrics.return_30d_pct.value)).toBe(expected * 10n ** 12n);
      }
    }
    expect(new Set(statements.map(({ partition }) => ID(partition))).size).toBe(statements.length);
  });

  it.each(["populated", "layout-stress"] as const)("%s: portfolio groups add current_nav, return_30d_pct, max_drawdown_pct and concentration_hhi per partition", (profile) => { setScenario("missing"); // WP-P: asserts the former default (an exact-zero drawdown, a null second return, a typed absence)
    // The layout profile is bounded (1 MiB): a smaller page keeps the body valid; totals still cover the whole query, so the row cross-checks need the whole population.
    const body = read(profile === "layout-stress" ? { group_by: "portfolio_id", limit: "30" } : { group_by: "portfolio_id" }, profile);
    const complete = body.page.next_cursor === null;
    const groups = body.groups as Body[];
    expect(groups.length).toBeGreaterThan(1);
    const rows = body.items as Body[];
    let absentDrawdown = 0;
    for (const group of groups) {
      const id = group.key[0].value;
      for (const entry of group.economic_partitions as Body[]) {
        const m = entry.metrics;
        const members = rows.filter((row) => row.portfolio_id === id).flatMap((row) => row.economic_partitions as Body[]).filter((part) => ID(part.partition) === ID(entry.partition));
        if (complete) expect(members.length).toBeGreaterThan(0);
        for (const key of ["current_nav", "return_30d_pct", "max_drawdown_pct", "concentration_hhi"]) expect(m[key].provenance_refs[0]).toContain("FIXTURE_LAB");
        expect(m.current_nav).toMatchObject({ unit: "MONEY", currency: entry.partition.currency });
        expect(m.concentration_hhi).toMatchObject({ unit: "RATIO", currency: null });
        // NAV = the partition's own balances added; allocation shares are of this partition only.
        const known = members.every((part) => part.metrics.balance_total.availability === "AVAILABLE");
        if (!complete) { if (m.max_drawdown_pct.availability !== "AVAILABLE") absentDrawdown += 1; continue; }
        if (known) expect(big(m.current_nav.value)).toBe(members.reduce((total, part) => total + big(part.metrics.balance_total.value), 0n));
        else expect(m.current_nav).toMatchObject({ value: null, availability: "UNAVAILABLE" });
        if (m.concentration_hhi.availability === "AVAILABLE") {
          const shares = members.map((part) => big(part.metrics.allocation.value));
          const total = shares.reduce((a, b) => a + b, 0n);
          const expected = shares.reduce((a, b) => a + b * b, 0n) * 1_000_000n / (total * total);
          expect(big(m.concentration_hhi.value)).toBe(expected * 10n ** 12n);
          expect(expected).toBeLessThanOrEqual(1_000_000n);
          if (members.length === 1) expect(m.concentration_hhi.value).toBe("1");
        } else expect(members.some((part) => part.metrics.allocation.availability !== "AVAILABLE")).toBe(true);
        if (m.max_drawdown_pct.availability === "AVAILABLE") expect(m.max_drawdown_pct.value).toMatch(/^-\d+(\.\d\d?)?$/);
        else { expect(m.max_drawdown_pct.reason_code).toBe("SOURCE_FACTS_NOT_PUBLISHED"); absentDrawdown += 1; }
      }
      // One partition per (domain, currency, basis, profile): never merged.
      expect(new Set(group.economic_partitions.map((entry: Body) => ID(entry.partition))).size).toBe(group.economic_partitions.length);
    }
    expect(absentDrawdown).toBeGreaterThan(0);
  });

  it("the unchanged production reader and port accept the new keys", async () => {
    const api = client("populated");
    const parsed = await api.getManagerDataset({ surface: "FLEET", environment: "live", limit: 200, groupBy: ["portfolio_id"] });
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.queryOptions.metricKeys).toEqual(expect.arrayContaining(NEW));
    const metric = parsed.value.items[0]!.economicPartitions[0]!.metrics.get("return_30d_pct")!;
    expect(metric.unit).toBe("PERCENT");
    expect(text(5n, 2)).toBe("0.05");
  });
});

/** SIMULATED window presets on every dataset surface: bare and JSON-quoted, answered per contract and accepted by the unchanged port. */
describe("simulated Manager window presets", () => {
  const DAY = 86_400_000;
  const SURFACES: readonly [string, string][] = [
    ["FUND", "/manager/fund-overview"], ["FLEET", "/manager/fleet"],
  ];
  const get = (path: string, window: string | null, extra: Record<string, string> = {}): Body => {
    prepare("populated");
    return ask(path, { environment: "live", limit: "50", ...(window === null ? {} : { window }), ...extra });
  };
  const firstNet = (body: Body): Body => (body.items as Body[]).map((row) => row.economic_partitions[0].metrics.net_pnl).find((m) => m.availability === "AVAILABLE" && m.value !== "0");

  it.each(SURFACES)("%s: 7D, 30D, 90D in bare and JSON-quoted form resolve to a window ending at FIXTURE_NOW, stamped on windowed metrics", (_surface, path) => {
    for (const [name, days] of [["7D", 7], ["30D", 30], ["90D", 90]] as const) {
      for (const form of [name, JSON.stringify(name)]) {
        const result = get(path, form);
        expect(result.status, `${name} ${form}`).toBe(200);
        schema(result.body, "execution-manager-dataset.v1");
        expect(result.body.selected_window).toEqual({ requested: name, resolved: { from_ms: fixtureNowMs() - days * DAY, to_ms: fixtureNowMs() }, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: null });
        const net = firstNet(result.body);
        expect(net.window).toEqual(result.body.selected_window.resolved);
        const allocation = result.body.items[0].economic_partitions[0].metrics.allocation;
        expect(allocation.window).toBeNull();
        for (const statement of result.body.capital_statements as Body[]) {
          expect(statement.metrics.net_pnl.window).toEqual(result.body.selected_window.resolved);
          expect(statement.metrics.current_nav.window).toBeNull();
        }
      }
    }
  });

  it("scales net PnL deterministically with the preset (7D = 1/4 and 90D = 5/2 of 30D), keeping a true zero and the typed absences", () => { setScenario("missing"); // WP-P: keeps a true zero and the typed absences, the former default
    const base = get("/manager/fleet", JSON.stringify("30D"));
    const short = get("/manager/fleet", JSON.stringify("7D"));
    const long = get("/manager/fleet", JSON.stringify("90D"));
    const big18 = (value: string): bigint => { const neg = value.startsWith("-"); const [w, f = ""] = value.replace("-", "").split("."); const n = BigInt(w + f.padEnd(18, "0")); return neg ? -n : n; };
    let compared = 0;
    for (const [index, row] of (base.body.items as Body[]).entries()) {
      const b = row.economic_partitions[0].metrics;
      const s = short.body.items[index].economic_partitions[0].metrics;
      const l = long.body.items[index].economic_partitions[0].metrics;
      if (b.net_pnl.availability !== "AVAILABLE") { expect(s.net_pnl.availability).toBe(b.net_pnl.availability); continue; }
      if (b.net_pnl.value === "0") { expect(s.net_pnl.value).toBe("0"); expect(l.net_pnl.value).toBe("0"); expect(s.return_30d_pct.value).toBe("0"); continue; }
      expect(big18(s.net_pnl.value)).toBe(big18(b.net_pnl.value) / 4n);
      expect(big18(l.net_pnl.value)).toBe(big18(b.net_pnl.value) * 5n / 2n);
      expect(big18(s.net_pnl.value) * big18(l.net_pnl.value) >= 0n).toBe(true);
      // The derived keys follow the scaled figure, not the base one.
      if (b.balance_total.availability === "AVAILABLE") expect(big18(s.balance_total.value)).toBe(big18(b.allocation.value) + big18(s.net_pnl.value));
      if (b.equity_30d_end_value.availability !== "AVAILABLE" && b.net_pnl.availability === "AVAILABLE" && b.balance_total.availability === "AVAILABLE") expect(s.equity_30d_end_value.availability).toBe("UNAVAILABLE");
      compared += 1;
    }
    expect(compared).toBeGreaterThan(0);
    // Capital statement drawdown keeps its true zero; the others scale by the same fraction.
    const dd = (body: Body, i: number): string => body.body.capital_statements[i].metrics.max_drawdown_pct.value;
    expect(dd(short, 0)).toBe("0");
    expect(dd(long, 0)).toBe("0");
    // The USDT-only world has one statement per environment, so the non-zero drawdown scaling is read on the first row that has one.
    const rowDd = (body: Body, i: number): string => body.body.items[i].economic_partitions[0].metrics.max_drawdown_pct.value;
    const at = (base.body.items as Body[]).findIndex((_row, i) => rowDd(base, i) !== null && rowDd(base, i) !== "0");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(big18(rowDd(short, at)) * 4n).toBeLessThanOrEqual(0n);
    expect(big18(rowDd(long, at)) * 2n).toBe(big18(rowDd(base, at)) * 5n);
  });

  it.each(SURFACES)("%s: ALL is the typed window gap, not a 400 and not a number", (_surface, path) => {
    const result = get(path, JSON.stringify("ALL"));
    expect(result.status).toBe(200);
    schema(result.body, "execution-manager-dataset.v1");
    expect(result.body.selected_window).toEqual({ requested: "ALL", resolved: null, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: "ALL_HISTORY_WINDOW_NOT_PUBLISHED" });
    expect(result.body.scores.reason_code).toBe("ALL_HISTORY_WINDOW_NOT_PUBLISHED");
    for (const row of result.body.items as Body[]) for (const entry of row.economic_partitions as Body[]) {
      for (const key of ["net_pnl", "return_30d_pct", "max_drawdown_pct", "equity_30d_end_value"]) {
        const m = entry.metrics[key];
        if (!m) continue;
        expect(m.value, key).toBeNull();
        expect(m.availability).toBe("UNAVAILABLE");
        expect([ "ALL_HISTORY_WINDOW_NOT_PUBLISHED", "SOURCE_FACTS_NOT_PUBLISHED" ]).toContain(m.reason_code);
      }
      expect(entry.metrics.allocation.window).toBeNull();
    }
  });

  it("every other unsupported option is still the explicit 400, with or without a window", () => {
    prepare("populated");
    const cases: Record<string, string>[] = [{ lifecycle_filter: "" }, { filters: JSON.stringify([{ field: "net_pnl", op: "GTE", value: "1" }]) }, { sort: JSON.stringify([{ field: "net_pnl", direction: "asc" }]) }, { window: JSON.stringify({ from_ms: 1, to_ms: 2 }) }, { window: "1W" }];
    for (const extra of cases) {
      const result = ask("/manager/fleet", { environment: "live", ...(extra.window === undefined ? { window: JSON.stringify("30D") } : {}), ...extra });
      expect(result.status, JSON.stringify(extra)).toBe(400);
    }
  });

  it("the unchanged port accepts the answer to the window it asked (every surface, each preset and ALL)", async () => {
    const api = client("populated");
    for (const window of ["7D", "30D", "90D", "ALL"] as const) {
      for (const query of [
        { surface: "FUND" as const }, { surface: "FLEET" as const },
        { surface: "PORTFOLIO" as const, id: scaled().portfolios[0]!.id }, { surface: "ALPHA" as const, id: scaled().alphas[0]!.id },
      ]) {
        const parsed = await api.getManagerDataset({ ...query, environment: "paper", window, limit: 5 });
        expect(parsed.ok, `${query.surface} ${window} ${JSON.stringify(parsed)}`).toBe(true);
        if (parsed.ok) expect(parsed.value.selectedWindow?.requested).toBe(window);
      }
    }
  });
});

/** The small-scale review universe is the e2e suite's own ids (alpha_a..d, alpha_btc_trend; Main, Satellite, Core), one single-book partition per row. */
describe("simulated suite universe (small scale)", () => {
  const small = (path: string, extra: Record<string, string> = {}): Body => {
    setFixtureScale("small");
    setFixtureNow(NOW);
    const result = ask(path, { limit: "50", ...extra });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    schema(result.body, "execution-manager-dataset.v1");
    return result.body;
  };

  it("answers the ALPHA surface of alpha_btc_trend with its own portfolio id and exact figures, one USDT partition of the asked book", () => {
    const body = small("/manager/alphas/alpha_btc_trend/overview", { environment: "live" });
    expect(body.surface).toBe("ALPHA");
    expect(body.items).toHaveLength(1);
    const row = body.items[0];
    expect([row.alpha_id, row.portfolio_id]).toEqual(["alpha_btc_trend", "pf_core"]);
    expect(row.economic_partitions).toHaveLength(1);
    expect(row.economic_partitions[0].partition).toMatchObject({ economic_domain: "ACTUAL", currency: "USDT" });
    const m = row.economic_partitions[0].metrics;
    expect(m.allocation.value).toBe("80000");
    expect(m.net_pnl.value).toBe("1120.8");
    expect(m.balance_total.value).toBe("81120.8");
    expect(m.equity_30d_end_value.value).toBe("81176.2");
    expect(m.return_30d_pct.value).toBe("1.401");
    // QA6 R2-06: the world's fee model (a live run is under 30 days, so the 30D figure is its whole-run cost: 10 bp fees, 4 bp funding); it was 5 bp and 2 bp of the allocation per 30 days
    expect(m.cost_drag_fees).toMatchObject({ value: fromCents(costOverRun(toCents("80000"), "fees")).replace(/\.?0+$/, ""), unit: "MONEY", currency: "USDT" });
    expect(m.cost_drag_funding.value).toBe(fromCents(costOverRun(toCents("80000"), "funding")).replace(/\.?0+$/, ""));
    expect(m.max_drawdown_pct).toMatchObject({ unit: "PERCENT", currency: null });
    expect(m.max_drawdown_pct.value).toMatch(/^-\d+(\.\d+)?$/);
    expect(m.forward_observation_days).toMatchObject({ unit: "DAYS", currency: null });
    expect(m.forward_observation_days.value).toMatch(/^\d+$/);
    // UXM-07 WP-1: the Fleet's Winrate (open partition key): a percent with one place, 35.0 to 74.9, no window
    expect(m.win_rate_pct).toMatchObject({ unit: "PERCENT", currency: null, window: null, availability: "AVAILABLE" });
    expect(m.win_rate_pct.value).toMatch(/^(3[5-9]|[4-6]\d|7[0-4])(\.\d)?$/);
  });

  it("publishes win_rate_pct per row partition, deterministic from the row key, 35.0 to 74.9, never on a group", () => {
    const first = small("/manager/fleet", { environment: "live" });
    const again = small("/manager/fleet", { environment: "live" });
    expect(first.items.length).toBeGreaterThan(1);
    const rates = (body: Body): (string | null)[] => (body.items as Body[]).flatMap((row) => (row.economic_partitions as Body[]).map((entry) => (entry.metrics.win_rate_pct.availability === "AVAILABLE" ? entry.metrics.win_rate_pct.value : null)));
    expect(rates(first)).toEqual(rates(again));
    for (const rate of rates(first)) expect(rate, "a missing value is a typed absence, never a made-up one").toMatch(/^(3[5-9]|[4-6]\d|7[0-4])(\.\d)?$/);
    // two rows do not all share one value (the seed is the row key)
    expect(new Set(rates(first)).size).toBeGreaterThan(1);
    // a portfolio group aggregates other keys but a win rate is not a sum: it carries none
    const grouped = small("/manager/fleet", { environment: "live", group_by: "portfolio_id" });
    for (const group of (grouped.groups ?? []) as Body[]) for (const entry of group.economic_partitions as Body[]) expect(entry.metrics).not.toHaveProperty("win_rate_pct");
  });

  it("scales the cost drag with the window (the world's fee model: 10 bp of allocation over the whole run, pro rata to the part of the run inside the window; bigint) and gives the other alpha ids their own rows", () => {
    // QA6 R2-06: one fee model. The window figure is the world's, not a rate restated here (was 5 bp x days / 30, which paid MORE fees in 15 days on the Live page than in 30 on Alpha 360).
    const week = small("/manager/alphas/alpha_btc_trend/overview", { environment: "live", window: JSON.stringify("7D") });
    expect(week.items[0].economic_partitions[0].metrics.cost_drag_fees.value).toBe(fromCents(costInWindow("dep_live_01", "fees", 7, toCents("80000"))!).replace(/\.?0+$/, ""));
    expect(week.items[0].economic_partitions[0].metrics.cost_drag_fees.window).toEqual(week.selected_window.resolved);
    expect(week.items[0].economic_partitions[0].metrics.forward_observation_days.window).toBeNull();
    const live = small("/manager/fleet", { environment: "live" });
    expect((live.items as Body[]).map((row) => [row.alpha_id, row.portfolio_id])).toEqual([
      ["alpha_b", "pf_main"], ["alpha_b", "pf_sat"], ["alpha_btc_trend", "pf_core"], ["alpha_c", "pf_sat"],
    ]);
    const unknown = ask("/manager/alphas/alpha_nobody/overview", { environment: "live" });
    expect(unknown.status).toBe(404);
  });

  it("keeps complete linked row values (paper), partitions of the same book only", () => {
    const body = small("/manager/fleet", { environment: "paper" });
    const parts = (body.items as Body[]).flatMap((row) => row.economic_partitions as Body[]);
    expect(new Set(parts.map((entry) => `${entry.partition.economic_domain}|${entry.partition.currency}`))).toEqual(new Set(["PAPER|USDT"]));
    for (const row of body.items as Body[]) expect(row.economic_partitions).toHaveLength(1);
    for (const part of parts) {
      expect(part.metrics.return_30d_pct.availability).toBe("AVAILABLE");
      expect(part.metrics.equity_30d_end_value.availability).toBe("AVAILABLE");
    }
    expect(parts.some((entry) => entry.metrics.cost_drag_slippage.availability === "UNAVAILABLE") || parts.length < 4).toBe(true);
  });
});
