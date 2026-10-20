/**
 * The Alpha view over the two bodies (R-3): the legacy view equals what the screen drew before, and the scoped view states each
 * member the contract states and leaves every other member absent, with no inference. Lane FIXTURE_LAB.
 */
import { describe, expect, it } from "vitest";

import { ALPHA_DOUBLE_ID, ALPHA_V2_WORKSPACE, answerAlpha } from "../../../../../e2e/bffDoubleAlpha";
import { readProfileEnvelope } from "../../../api/profileRead";
import { readAlphaResourceScoped } from "../../readers/alphaResourceScoped";
import { chooseEnv } from "./model";
import { alphaViewOf, legacyResource, rowEnv, type AlphaView } from "./view";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const scopedBody = (mutate?: (body: Json) => void): Json => {
  const body = structuredClone(answerAlpha("GET", `/resources/alphas/${ALPHA_DOUBLE_ID}`, new URLSearchParams(`workspace_id=${ALPHA_V2_WORKSPACE}`))!.body) as Json;
  mutate?.(body);
  return body;
};
const scopedView = (mutate?: (body: Json) => void): AlphaView => {
  const read = readAlphaResourceScoped(scopedBody(mutate));
  expect(read).not.toBeNull();
  return alphaViewOf({ variant: "scoped", scoped: read! }, ALPHA_DOUBLE_ID);
};
const legacyView = (): AlphaView => {
  const envelope = readProfileEnvelope(answerAlpha("GET", `/resources/alphas/${ALPHA_DOUBLE_ID}`, new URLSearchParams(""))!.body)!;
  return alphaViewOf(legacyResource(envelope), ALPHA_DOUBLE_ID);
};

describe("the legacy view is the V1 view", () => {
  it("states the alpha as the V1 screen read it: id as title, no name or version, the owner, current Live stage, four deployments, money", () => {
    const view = legacyView();
    expect(view).toMatchObject({ variant: "legacy", present: true, title: ALPHA_DOUBLE_ID, name: null, version: null, current: "live", scope: null, withheld: null });
    expect(view.owner).toEqual({ kind: "value", value: "asmith" });
    expect(view.rows.map((r) => r.id)).toEqual(["dep_paper_01", "dep_sandbox_01", "dep_canary_01", "dep_live_01"]);
    expect(view.money).toMatchObject({ published: true, netPnl: [{ currency: "USDT", value: "1120.80" }], exposure: [{ currency: "USDT", value: "126500.00" }] });
    expect(view.envs).toEqual(["live", "paper", "sandbox"]);
    expect(view.venueOf("live")).toBe("BINANCE");
    expect(view.positions.map((p) => p.symbol)).toEqual(["BTCUSDT", "BTCUSDT"]);
    expect(view.rows.every((r) => r.env === undefined)).toBe(true);
  });
});

describe("the scoped view", () => {
  it("states the authority and the population exactly as the body does, and the money as absent with the body's own reason", () => {
    const view = scopedView();
    expect(view).toMatchObject({ variant: "scoped", present: true, alphaId: ALPHA_DOUBLE_ID, state: "partial", freshness: "AGING", completeness: "PARTIAL", asOfMs: null, workspaceId: ALPHA_V2_WORKSPACE, withheld: null });
    expect(view.money).toEqual({ published: false, reason: "SCOPED_RAW_FACTS_ONLY_NO_IMPLIED_TOTALS" });
    expect(view.scope).toMatchObject({
      workspaceId: ALPHA_V2_WORKSPACE, visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", totalsScope: "VISIBLE_ROWS_ONLY", isFullPortfolio: false, completeness: "PARTIAL",
    });
    expect(view.scope!.readScope.map((s) => [s.book, s.policyRevision])).toEqual([["paper", "TEST_ONLY-policy-paper-4"], ["sandbox", "TEST_ONLY-policy-sandbox-4"], ["live", "TEST_ONLY-policy-live-4"]]);
    expect(view.scope!.population.find((p) => p.relation === "deployments")).toMatchObject({ returned: 3, sourceTotal: "3", state: "PARTIAL" });
    expect(view.scope!.population.find((p) => p.relation === "orders")).toMatchObject({ returned: 0, sourceTotal: "0" });
    expect(view.scope!.population.some((p) => p.relation === "broker_sync")).toBe(false);
  });

  it("states no name, version, owner or current stage: each is absent with a reason, and the producer's literal is not a name", () => {
    const view = scopedView();
    expect(view).toMatchObject({ name: null, version: null, current: null, title: ALPHA_DOUBLE_ID, titleWithVersion: ALPHA_DOUBLE_ID });
    expect(view.owner).toMatchObject({ kind: "not-published", id: "FE-030", reason: "The source owner is not mapped to a Portal user" });
    expect(view.nameReason).toBe("The source has no alpha name");
    expect(view.versionReason).toBe("The source has no alpha version");
    expect(view.currentNote).toBe("The source publishes no stage");
    // The strategies relation states `stage: LIVE` per strategy and per book; it is not the alpha's stage and is not read as one.
    expect(JSON.stringify(scopedBody().data.strategies)).toContain('"stage":"LIVE"');
    expect(view.current).toBeNull();
  });

  it("a version the summary states is the version; with no typed absence the older sentence stands; a stated name needs no reason", () => {
    const stated = scopedView((b) => { b.data.alpha.version = "3"; b.data.alpha.name = "Trend Name"; b.data.alpha.identity_absences = [{ member: "owner", reason_code: "ALPHA_OWNER_NOT_MAPPED_TO_PORTAL_USER" }, { member: "stage", reason_code: "ALPHA_STAGE_NOT_PUBLISHED_BY_SOURCE" }]; });
    expect(stated).toMatchObject({ name: "Trend Name", version: "3", title: "Trend Name", titleWithVersion: "Trend Name v3" });
    const none = scopedView((b) => { delete b.data.alpha.identity_absences; });
    expect(none.nameReason).toBe("execution.alpha-resource.v2 states no alpha name");
    expect(none.currentNote).toContain("no alpha-level stage");
  });

  it("deployment financials: one snapshot row per deployment of its book, matched on book and id, with the body's reason in words; none for a deployment the body names no entry for", () => {
    const view = scopedView();
    const byId = (id: string) => view.rows.find((r) => r.id === id)!;
    expect(byId("dep_paper_01").financial).toEqual({ state: "AVAILABLE", reason: null, netPnl: "184.2000", equity: "20184.2000", currency: "USDT", atMs: expect.any(Number) });
    expect(byId("dep_live_01").financial).toMatchObject({ state: "UNAVAILABLE", reason: "No snapshot is bound for this book", netPnl: null, equity: null, atMs: null });
    const cut = scopedView((b) => { b.data.alpha.deployment_financials[0] = { ...b.data.alpha.deployment_financials[0], state: "PARTIAL", reason_code: "DEPLOYMENT_FINANCIAL_WINDOW_TRUNCATED" }; });
    expect(cut.rows.find((r) => r.id === "dep_paper_01")!.financial).toMatchObject({ state: "PARTIAL", reason: "The window was cut; a later row may exist", netPnl: "184.2000" });
    // An entry for the same id in another book is not this deployment's.
    const wrongBook = scopedView((b) => { b.data.alpha.deployment_financials[0].profile_environment = "sandbox"; });
    expect(wrongBook.rows.find((r) => r.id === "dep_paper_01")!.financial).toBeUndefined();
    expect(scopedView((b) => { delete b.data.alpha.deployment_financials; }).rows.every((r) => r.financial === undefined)).toBe(true);
  });

  it("a PUBLISHED name is the title: summary display_name, then name, then a resource label that is not the producer's literal", () => {
    expect(scopedView((b) => { b.data.alpha.display_name = "Trend Alpha"; b.data.alpha.name = "other"; }).title).toBe("Trend Alpha");
    expect(scopedView((b) => { b.data.alpha.name = "Trend Name"; }).title).toBe("Trend Name");
    expect(scopedView((b) => { b.resource.label = "Resource label"; }).title).toBe("Resource label");
    expect(scopedView((b) => { b.resource.label = "Unnamed alpha"; }).name).toBeNull();
    expect(scopedView((b) => { delete b.resource.label; }).name).toBeNull();
  });

  it("a deployment sits in the book it was read from; the stage inside the Live book is not named, and Canary is never picked over Live", () => {
    const view = scopedView();
    expect(view.rows.map((r) => [r.id, r.stage, r.stageLabel, r.env])).toEqual([
      ["dep_paper_01", "paper", "Paper", "paper"], ["dep_sandbox_01", "sandbox", "Sandbox", "sandbox"], ["dep_live_01", null, "Live book", "live"],
    ]);
    expect(view.rows.map(rowEnv)).toEqual(["paper", "sandbox", "live"]);
    expect(view.rows.find((r) => r.id === "dep_live_01")!.href).toBe("/deployments/live/dep_live_01");
    expect(view.rows.find((r) => r.id === "dep_paper_01")!.href).toBe("/deployments/paper/dep_paper_01");
    expect(view.envs).toEqual(["live", "paper", "sandbox"]);
    expect(chooseEnv("sandbox", view.envs)).toBe("sandbox");
    expect(view.venueOf("live")).toBe("BINANCE");
    for (const row of view.rows) expect([row.netPnl, row.exposure, row.health]).toEqual([null, null, null]);
  });

  it("an allocation is the ONE stated allocated_capital row of that deployment; none or two is absent, never a sum", () => {
    expect(scopedView().rows.find((r) => r.id === "dep_live_01")!.allocation).toBe("40000.00");
    expect(scopedView().rows.find((r) => r.id === "dep_paper_01")!.allocation).toBeNull();
    const two = scopedView((b) => {
      const row = structuredClone(b.data.portfolio_allocations[0]);
      row.allocated_capital = "10.00";
      b.data.portfolio_allocations.push(row);
    });
    expect(two.rows.find((r) => r.id === "dep_live_01")!.allocation).toBeNull();
    const nullAllocation = scopedView((b) => { b.data.portfolio_allocations[0].allocated_capital = null; });
    expect(nullAllocation.rows.find((r) => r.id === "dep_live_01")!.allocation).toBeNull();
  });

  it("a portfolio is a stated name joined on its id; with no name the id stands, and with no id nothing", () => {
    expect(scopedView().rows.every((r) => r.portfolio === "Core")).toBe(true);
    expect(scopedView().portfolioNames).toEqual(["Core"]);
    expect(scopedView((b) => { b.data.portfolios = []; b.data.alpha.portfolios = []; }).rows[0]!.portfolio).toBe("pf_core");
    expect(scopedView((b) => { for (const r of b.data.deployments) delete r.portfolio_id; }).rows[0]!.portfolio).toBeNull();
  });

  it("a row with no deployment id, or a repeated one in the same book, is counted as unplaced, not shown and not dropped silently", () => {
    const view = scopedView((b) => {
      delete b.data.deployments[0].deployment_id;
      b.data.deployments.push(structuredClone(b.data.deployments[1]));
    });
    expect(view.unplaced.deployments).toBe(2);
    expect(view.rows).toHaveLength(2);
  });

  it("positions are as stated: the instrument id is not split, a missing mark is null, a position with no instrument is unplaced", () => {
    const view = scopedView((b) => { delete b.data.positions[1].instrument_id; });
    expect(view.positions.map((p) => [p.symbol, p.side, p.quantity, p.mark])).toEqual([["BTCUSDT", "Long", "0.91", "67410.00"]]);
    expect(view.unplaced.positions).toBe(1);
    expect(scopedView().positions[1]).toMatchObject({ side: "Short", mark: null, unrealized: null, currency: null, notional: "35053.05" });
  });

  it("reconciliation rows carry the result, venue, finding id and type, and the resolution instant when the body states them; a member it omits stays null, not 'Unknown' and not now", () => {
    const rows = scopedView().reconciliation;
    expect(rows.map((r) => [r.status.label, r.venue, r.kind, r.resolvedAt, r.findingId])).toEqual([
      ["Resolved", "BINANCE", "POSITION_MISMATCH", Date.UTC(2026, 9, 17, 9, 48), "find_001"], ["Open", "BINANCE", "BALANCE_MISMATCH", null, "find_002"],
    ]);
    const bare = scopedView((b) => { for (const row of b.data.reconciliation) { delete row.finding_id; delete row.finding_type; delete row.resolved_at_ms; } }).reconciliation;
    expect(bare.map((r) => [r.kind, r.resolvedAt, r.findingId])).toEqual([[null, null, null], [null, null, null]]);
    expect(scopedView((b) => { delete b.data.reconciliation[0].status; }).reconciliation[0]!.status).toEqual({ kind: "unknown", label: "Not published" });
  });

  it("the empty body is not present; the bounded body is present with no rows and says why", () => {
    const empty = alphaViewOf({ variant: "scoped", scoped: readAlphaResourceScoped(answerAlpha("GET", "/resources/alphas/alpha_empty", new URLSearchParams(`workspace_id=${ALPHA_V2_WORKSPACE}`))!.body)! }, "alpha_empty");
    expect(empty).toMatchObject({ present: false, state: "empty", rows: [], positions: [], withheld: null });
    const bounded = alphaViewOf({ variant: "scoped", scoped: readAlphaResourceScoped(answerAlpha("GET", "/resources/alphas/alpha_bounded", new URLSearchParams(`workspace_id=${ALPHA_V2_WORKSPACE}`))!.body)! }, "alpha_bounded");
    expect(bounded).toMatchObject({ present: true, withheld: "EDS04_RESOURCE_RESPONSE_BYTE_BOUND", rows: [], envs: [] });
    expect(bounded.scope).not.toBeNull();
  });
});
