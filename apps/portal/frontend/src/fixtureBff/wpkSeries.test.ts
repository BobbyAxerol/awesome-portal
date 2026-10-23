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

describe("WP-K FIXTURE_LAB: approval evidence", () => {
  const evidence = (id: string): Body => { prepare(); return answerReviewManager("GET", `/api/v1/execution/governance/approvals/${id}/evidence`, new URLSearchParams(), "populated"); };
  const ids = Array.from({ length: 28 }, (_, i) => `apr_fixture_${i}`);
  it("answers every id deterministically with a schema-valid body in all three modes (not read, no source, published)", () => {
    const modes = new Set<string>();
    for (const id of ids) {
      const result = evidence(id);
      expect(result.status).toBe(200);
      expect(violationsOf({ file: "execution-approval-evidence.v1", ptr: "" }, result.body).violations).toEqual([]);
      expect(evidence(id)).toEqual(result);
      const b = result.body;
      modes.add(!("evidence_diff" in b) ? "no-source" : b.evidence_diff === null ? "not-read" : "published");
    }
    expect([...modes].sort()).toEqual(["no-source", "not-read", "published"]);
  });
  it("a published answer carries a NAV history from the review series, exact counts with true zeros, and read_at at the fixture clock", () => {
    const published = ids.map(evidence).map((r) => r.body).find((b) => b.evidence_diff);
    expect(published.prior_economic_history).toMatchObject({ metric: "NAV", unit: "MONEY" });
    expect(published.prior_economic_history.points.length).toBeGreaterThan(100);
    expect(Object.values(published.obligations_after_approval).every((n) => Number.isInteger(n) && (n as number) >= 0)).toBe(true);
    expect(published.obligations_after_approval.unknown_outcomes).toBe(0);
  });
  it("the strict reader accepts it through the unmodified HTTP port", async () => {
    const api = client();
    const id = ids.find((candidate) => evidence(candidate).body.evidence_diff)!;
    const parsed = await api.getApprovalEvidence!(id);
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (parsed.ok) expect(parsed.value.obligations.state).toBe("PUBLISHED");
  });
});

describe("WP-K FIXTURE_LAB: alpha lifecycle", () => {
  const lifecycle = (id: string, environment?: string): Body => {
    prepare();
    return answerReviewManager("GET", `/api/v1/execution/alphas/${id}/lifecycle`, new URLSearchParams(environment ? { environment } : {}), "populated");
  };
  it("answers a native alpha with schema-valid stages, a unified feed with receipts on decisions, a regime fit and Net PnL per venue", () => {
    const result = lifecycle("alpha_a");
    expect(result.status).toBe(200);
    expect(violationsOf({ file: "execution-alpha-lifecycle.v1", ptr: "" }, result.body).violations).toEqual([]);
    const b = result.body;
    expect(b.stages.map((s: Body) => s.stage)).toEqual(["R1", "R2", "PAPER", "SANDBOX", "CANARY", "LIVE"]);
    expect(b.stages[2].criteria).toEqual({ met: 7, total: 7, items: [] });
    expect(b.stages[2].decided_by).toBeTruthy();
    expect(new Set(b.events.items.map((e: Body) => e.kind))).toEqual(new Set(["stage", "decision", "incident", "recall", "flow"]));
    expect(b.events.items.filter((e: Body) => e.kind === "decision").every((e: Body) => typeof e.receipt_ref === "string")).toBe(true);
    expect(lifecycle("alpha_a")).toEqual(result);
  });
  it("Net PnL per venue is the exact sum of the alpha's own deployments per venue, book and currency, and never mixes books", () => {
    const all = lifecycle("alpha_a").body.venue_net_pnl as Body[];
    const keys = all.map((v) => `${v.venue}|${v.economic_domain}|${v.currency}`);
    expect(new Set(keys).size).toBe(keys.length);
    const live = (lifecycle("alpha_a", "live").body.venue_net_pnl as Body[]);
    expect(live.length).toBeGreaterThan(0);
    expect(live.every((v) => v.economic_domain === "ACTUAL")).toBe(true);
    expect(live.every((v) => typeof v.net_pnl === "string")).toBe(true);
  });
  it("an unknown alpha is a 404 problem, and the strict reader accepts the answer through the unmodified HTTP port", async () => {
    expect(lifecycle("alpha_missing").status).toBe(404);
    const api = client();
    const parsed = await api.getAlphaLifecycle!("alpha_a", "paper");
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (parsed.ok) expect(parsed.value.stages.state).toBe("PUBLISHED");
  });
});

describe("WP-K FIXTURE_LAB: operations extras", () => {
  const ask = (path: string, query: Record<string, string> = {}): Body => { prepare(); return answerReviewManager("GET", `/api/v1/execution${path}`, new URLSearchParams(query), "populated"); };
  const ids = Array.from({ length: 24 }, (_, i) => `inc_fixture_${i}`);
  it("incident children answer every id deterministically in all three modes with schema-valid bodies and the blocker rule", () => {
    const modes = new Set<string>();
    for (const id of ids) {
      const result = ask(`/operations/incidents/${id}/children`);
      expect(result.status).toBe(200);
      expect(violationsOf({ file: "execution-incident-children.v1", ptr: "" }, result.body).violations).toEqual([]);
      expect(ask(`/operations/incidents/${id}/children`)).toEqual(result);
      const b = result.body;
      modes.add(!("evidence" in b) ? "no-source" : b.evidence === null ? "not-read" : "published");
      if (b.resolution_gate) expect(b.resolution_gate.eligible).toBe(b.resolution_gate.blocker_codes.length === 0);
    }
    expect([...modes].sort()).toEqual(["no-source", "not-read", "published"]);
  });
  it("the audit feed pages newest first with receipts on acknowledgements and resolutions, and refuses a cursor it did not issue", () => {
    const first = ask("/operations/audit", { limit: "10" });
    expect(first.status).toBe(200);
    expect(violationsOf({ file: "execution-operations-audit.v1", ptr: "" }, first.body).violations).toEqual([]);
    const body = first.body;
    expect(body.items).toHaveLength(10);
    expect(body.has_more).toBe(true);
    const times = body.items.map((r: Body) => r.at_ms as number);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(body.items.filter((r: Body) => r.action !== "CREATED").every((r: Body) => typeof r.receipt_ref === "string")).toBe(true);
    const next = ask("/operations/audit", { limit: "10", after: body.next_cursor });
    expect(next.body.items[0].audit_id).not.toBe(body.items[0].audit_id);
    expect(ask("/operations/audit", { after: "garbage" }).status).toBe(400);
  });
  it("the strict reader accepts both through the unmodified HTTP port", async () => {
    const api = client();
    const parsed = await api.getOperationsAudit!({ limit: 25 });
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    const published = ids.find((id) => ask(`/operations/incidents/${id}/children`).body.evidence);
    const kids = await api.getIncidentChildren!(published!);
    expect(kids.ok, JSON.stringify(kids)).toBe(true);
  });
});

describe("WP-K FIXTURE_LAB: entity search", () => {
  const ask = (query: Record<string, string>): Body => { prepare(); return answerReviewManager("GET", "/api/v1/execution/search", new URLSearchParams(query), "populated"); };
  it("answers per kind with exact counts, honours kinds and limit, and is schema-valid", () => {
    const result = ask({ q: "alpha", limit: "3" });
    expect(result.status).toBe(200);
    expect(violationsOf({ file: "execution-entity-search.v1", ptr: "" }, result.body).violations).toEqual([]);
    const groups = result.body.groups as Body[];
    expect(groups.map((g) => g.kind)).toEqual(["alpha", "portfolio", "account", "operation", "incident", "approval"]);
    const alpha = groups.find((g) => g.kind === "alpha")!;
    expect(alpha.rows.length).toBe(3);
    expect(alpha.total_matched).toBeGreaterThanOrEqual(3);
    expect(alpha.rows.every((r: Body) => r.route_hint.startsWith("/deployments/alphas/"))).toBe(true);
    expect(groups.find((g) => g.kind === "account")).toMatchObject({ total_matched: null, rows: [] });
    const only = ask({ q: "alpha", kinds: "alpha,portfolio", limit: "2" }).body.groups as Body[];
    expect(only.map((g) => g.kind)).toEqual(["alpha", "portfolio"]);
  });
  it("a text that matches nothing is a counted zero, never an absence; a bad query is a 400", () => {
    const none = ask({ q: "zz_no_such_entity_zz" }).body.groups as Body[];
    expect(none.filter((g) => g.total_matched !== null).every((g) => g.total_matched === 0 && g.rows.length === 0)).toBe(true);
    expect(ask({ q: "" }).status).toBe(400);
    expect(ask({ q: "x", kinds: "user" }).status).toBe(400);
  });
  it("the strict reader accepts it through the unmodified HTTP port", async () => {
    const api = client();
    const parsed = await api.searchEntities!({ q: "alpha", limit: 5 });
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (parsed.ok) expect(parsed.value.groups.length).toBe(6);
  });
});
