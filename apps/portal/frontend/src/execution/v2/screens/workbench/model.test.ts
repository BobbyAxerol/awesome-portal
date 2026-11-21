/**
 * Paper workbench models: the facts the screen is allowed to state and the ones
 * it must leave out. L1 matrices over the page state, the equity read and the
 * gate; the closed word tables; the 200-row cap; the figures.
 */
import { describe, expect, it } from "vitest";

import { readUtcEpochMs } from "../../../screenDataContract";
import { resolveTab } from "../../tabAliases";
import { ABSENT, cartesian, coverage, describeCoverage, dimension, dimensionOf, pairwise, setPath, type Draft } from "../../testkit/matrix";
import {
  DEFAULT_ROUTES, GATE_FLAG, MAX_TEXT, PAGE_CAP, WB_TABS, buildWorkbench, capLabel, code, count, exitReviewReason, figure, freshnessOf, humanize,
  instantMs, isWbTab, orderState, pageState, readDeployment, readEquity, readFills, readGate, readOrders, readPositions, readQuality, text,
} from "./model";
import { ACCOUNT, DEP, PORTFOLIO, STRATEGY, envelopeOf, paperWire, qualityOf, qualityWire } from "./workbench.harness.fixtures";

const model = (wire: Draft = paperWire(), quality: Draft = null) => buildWorkbench(envelopeOf(wire), quality);

describe("tabs", () => {
  it("are the five hi-fi tabs, and every id is a key the alias table knows", () => {
    expect(WB_TABS.map((t) => t.id)).toEqual(["overview", "orders", "fills", "positions", "sessions"]);
    for (const tab of WB_TABS) {
      const resolved = resolveTab("paper", tab.id);
      expect(resolved.target.tab, tab.id).toBe(tab.id);
      expect(resolved.legacy, tab.id).toBe(false);
      expect(resolved.notice, tab.id).toBeNull();
    }
    expect(WB_TABS.every((t) => isWbTab(t.id))).toBe(true);
    expect(isWbTab("accounting")).toBe(false);
  });
});

describe("primitives", () => {
  it.each([["alpha_TEST_ONLY", "alpha_TEST_ONLY"], [7, "7"], [0, "0"]])("text(%j) is %j", (raw, shown) => expect(text(raw)).toBe(shown));
  it.each([
    ["empty", ""], ["blank", "   "], ["control", "a\u0000b"], ["bidi override", `${String.fromCharCode(0x202e)}evil`], ["isolate", `x${String.fromCharCode(0x2066)}y`], ["too long", "x".repeat(MAX_TEXT + 1)],
    ["unsafe integer", 2 ** 53], ["float", 1.5], ["object", {}], ["array", ["x"]], ["null", null], ["boolean", true],
  ])("text refuses %s whole, never a cut or repaired copy", (_name, raw) => expect(text(raw)).toBeNull());
  it("text keeps an id exactly at the bound", () => expect(text("x".repeat(MAX_TEXT))).toHaveLength(MAX_TEXT));

  it.each([[0, 0], [12, 12], ["14", 14], ["0", 0]])("count(%j) is %j", (raw, n) => expect(count(raw)).toBe(n));
  it.each([-1, 1.5, "01", "-1", "1e3", "", " 1", NaN, Infinity, 2 ** 53, "99999999999999999", true, null, {}, []])("count refuses %j", (raw) => expect(count(raw)).toBeNull());

  it("figure: absent, unreadable and value are three different answers, and a gap is never zero", () => {
    expect(figure(undefined, "money")).toEqual({ kind: "absent" });
    expect(figure(null, "money")).toEqual({ kind: "absent" });
    expect(figure("101800.00", "money")).toMatchObject({ kind: "value", decimal: { display: "101,800.00", full: "101800.00" } });
    expect(figure("0.00", "money")).toMatchObject({ kind: "value", decimal: { zero: true } });
    for (const bad of [101800, "1e5", "-0", "01", "", {}, [], true]) expect(figure(bad, "money"), String(bad)).toEqual({ kind: "unreadable" });
    // A count is digits: a fraction is not rounded into one.
    for (const bad of ["2.5", "-2", "1e3", "01", " 2", 2.5, -1, "9".repeat(17)]) expect(figure(bad, "count"), String(bad)).toEqual({ kind: "unreadable" });
  });

  it("figure: a count may be an integer number, money may not", () => {
    expect(figure(2, "count")).toMatchObject({ kind: "value", decimal: { display: "2" } });
    expect(figure(2.5, "count")).toEqual({ kind: "unreadable" });
    expect(figure(-2, "count")).toEqual({ kind: "unreadable" });
    expect(figure(2, "money")).toEqual({ kind: "unreadable" });
    expect(figure(2, "qty")).toEqual({ kind: "unreadable" });
  });

  it("instantMs reads an ISO instant or an epoch and nothing else", () => {
    expect(instantMs("2026-10-17T09:14:00Z")).toBe(Date.UTC(2026, 9, 17, 9, 14));
    expect(instantMs(Date.UTC(2026, 9, 17))).toBe(Date.UTC(2026, 9, 17));
    for (const bad of ["yesterday", "17 Oct", "", "2026-13-45T00:00:00Z", null, undefined, {}, 1.5, NaN, "2026-10-17T09:14:00Z".repeat(4)]) expect(instantMs(bad), String(bad)).toBeNull();
    expect(readUtcEpochMs(instantMs("2026-10-17T09:14:00Z"))).not.toBeNull();
  });

  it("humanize and code", () => {
    expect(humanize("SOURCE_GAP")).toBe("Source gap");
    expect(code("N23_LATENCY_NOT_ACTIVATED")).toBe("N23_LATENCY_NOT_ACTIVATED");
    for (const bad of ["", " x", "a b", "x".repeat(129), 1, null]) expect(code(bad)).toBeNull();
  });
});

describe("deployment", () => {
  it("reads the identity the profile publishes, ids only (FE-066)", () => {
    const d = readDeployment(envelopeOf(paperWire()));
    expect(d).toMatchObject({ deploymentId: DEP, strategyId: STRATEGY, portfolioId: PORTFOLIO, accountId: ACCOUNT, venue: "binance", mode: "paper", sourceActive: true });
    expect(d?.updatedAtMs).toBe(Date.UTC(2026, 9, 17, 9, 14));
  });

  it.each([[true, true], [false, false], ["true", null], [1, null], [0, null], [null, null], [undefined, null], [{}, null]])("active %j reads as %j (typeof, never a truthy cast)", (raw, expected) => {
    const wire = paperWire();
    setPath(wire, ["data", "deployment", "active"], raw === undefined ? ABSENT : raw);
    expect(readDeployment(envelopeOf(wire))?.sourceActive).toBe(expected);
  });

  it("falls back to the first of `deployments` when `deployment` is absent, and is null with neither", () => {
    const wire = paperWire();
    setPath(wire, ["data", "deployment"], ABSENT);
    expect(readDeployment(envelopeOf(wire))?.deploymentId).toBe(DEP);
    setPath(wire, ["data", "deployments"], []);
    expect(readDeployment(envelopeOf(wire))).toBeNull();
  });
});

describe("page state (L1 matrix: state x freshness x completeness x deployment)", () => {
  const dims = [
    dimension("state", ["state"], ["ready", "partial", "stale", "empty", "unavailable", "denied", "terminal"]),
    dimension("freshness", ["freshness"], ["FRESH", "AGING", "STALE", "UNKNOWN", ABSENT]),
    dimension("completeness", ["completeness"], ["COMPLETE", "PARTIAL", ABSENT]),
    dimensionOf("deployment", [
      { label: "present", apply: () => undefined },
      { label: "absent", apply: (d: Draft) => { delete d.data.deployment; d.data.deployments = []; } },
    ]),
  ];
  const states = cartesian(paperWire(), dims);

  it("builds the whole matrix", () => {
    expect(states).toHaveLength(7 * 5 * 3 * 2);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => {
    const envelope = envelopeOf(s.value);
    const page = pageState(envelope, readDeployment(envelope));
    const state = s.picks.state;
    // Three states replace the body; "terminal" is not a word the profile may send, so it is unknown and replaces too.
    if (state === "denied") expect(page.replace?.status).toBe("denied");
    else if (state === "unavailable") {
      // The source is not qualified (hi-fi "nq"): the frame stays, the figures go; it is not a replaced body.
      expect(page.replace).toBeNull();
      expect(page.nq).not.toBeNull();
    }
    else if (state === "terminal") expect(page.replace?.status).toBe("unavailable");
    else if (state === "empty") expect(page.replace?.status).toBe("empty");
    else if (s.picks.deployment === "absent") expect(page.replace?.status).toBe("empty");
    else {
      expect(page.replace).toBeNull();
      // Partial and stale keep the body, worded; nothing is demoted silently and nothing is demoted for no reason.
      expect(page.partial !== null).toBe(state === "partial" || s.picks.completeness === "PARTIAL");
      expect(page.stale !== null).toBe(state === "stale" || s.picks.freshness === "STALE");
    }
  });

  it("pairwise covers every pair of values with far fewer states", () => {
    const small = pairwise(paperWire(), dims);
    const c = coverage(dims, small);
    expect(c.pairsCovered).toBe(c.pairsPossible);
    expect(small.length).toBeLessThan(states.length / 4);
    // Printed once so a reviewer can see what was not multiplied out.
    expect(describeCoverage("page state", c)).toMatch(/pairs/);
  });

  it("nq: an unavailable profile keeps its frame, carries the codes it published, and draws no figure it carried", () => {
    const wire = paperWire({ orders: 3, fills: 2, positions: 2, equity: 6 });
    wire.state = "unavailable";
    wire.capabilities = [
      { capability_id: "paper.equity", state: "UNAVAILABLE", reason_code: "SOURCE_NOT_QUALIFIED", retryable: false },
      { capability_id: "paper.orders", state: "UNAVAILABLE", reason_code: "SOURCE_NOT_QUALIFIED", retryable: false },
      { capability_id: "paper.fills", state: "UNAVAILABLE", reason_code: "second code", retryable: false },
    ];
    const m = buildWorkbench(envelopeOf(wire), qualityOf());
    expect(m.page.replace).toBeNull();
    expect(m.page.nq).toEqual({ reasons: ["SOURCE_NOT_QUALIFIED"] });
    expect(m.deployment?.strategyId).toBe(STRATEGY);
    expect(m.orders.published).toBe(false);
    expect(m.fills.published).toBe(false);
    expect(m.positions.table.published).toBe(false);
    expect(m.equity.points).toEqual([]);
    expect(m.equity.accounting.equity).toEqual({ kind: "absent" });
    expect(m.gate.verdict).toBe("none");
    expect(m.sessionsCounted).toEqual({ kind: "absent" });
    expect((m.equity.state as { reason: string }).reason).toContain("not qualified");
  });

  it("nq with no deployment at all is still nq, not an empty page", () => {
    const wire = paperWire();
    wire.state = "unavailable";
    wire.data.deployment = null;
    wire.data.deployments = [];
    const envelope = envelopeOf(wire);
    expect(pageState(envelope, readDeployment(envelope)).nq).not.toBeNull();
  });

  it("a body that is not a paper-workbench profile is terminal, whatever else it says", () => {
    const wire = paperWire();
    wire.schema_version = "execution.portfolio-resource.v1";
    const envelope = envelopeOf(wire);
    expect(pageState(envelope, readDeployment(envelope)).replace?.status).toBe("terminal");
  });

  it("the VN market profile is a paper-workbench profile too", () => {
    const wire = paperWire();
    wire.schema_version = "execution.paper-workbench-vnm.v1";
    const envelope = envelopeOf(wire);
    expect(pageState(envelope, readDeployment(envelope)).replace).toBeNull();
  });
});

describe("freshness is the source's word, never an age", () => {
  it.each([
    ["FRESH", "fresh", "Fresh"], ["fresh", "unknown", "Freshness unknown"], ["FRESH ", "unknown", "Freshness unknown"], ["STALE", "stale", "Stale"], ["AGING", "aging", "Aging"], ["PAUSED", "paused", "Paused"],
    ["UNKNOWN", "unknown", "Freshness unknown"], ["SOMETHING_NEW", "unknown", "Freshness unknown"], [null, "not-published", "No freshness published"],
  ])("%s -> %s", (word, kind, label) => {
    const wire = paperWire();
    setPath(wire, ["freshness"], word === null ? ABSENT : word);
    expect(freshnessOf(envelopeOf(wire))).toMatchObject({ kind, label });
  });

  it("carries the as-of and no minutes", () => {
    const facts = freshnessOf(envelopeOf(paperWire()));
    expect(facts).not.toHaveProperty("ageMinutes");
    expect(JSON.stringify(facts)).not.toMatch(/\d+m\b/);
  });

  it("an unknown word is not kept or printed", () => {
    const wire = paperWire();
    wire.freshness = "NEVER_PRINT_THIS";
    expect(JSON.stringify(freshnessOf(envelopeOf(wire)))).not.toContain("NEVER_PRINT_THIS");
  });
});

describe("the observation gate: the verdict is the server's", () => {
  it.each([
    ["MET", "met"], ["AVAILABLE", "available"], ["PARTIAL", "partial"], ["BLOCKED", "blocked"], ["NOT_MET", "not-met"], ["met", "unknown"], ["", "unknown"], ["WHATEVER", "unknown"],
  ])("%s is %s", (word, verdict) => {
    const wire = paperWire();
    setPath(wire, ["data", "observation_gate", "state"], word);
    expect(readGate(envelopeOf(wire)).verdict).toBe(verdict);
  });

  it("is `none` with no gate, and the counts are the published ones, not re-judged", () => {
    const wire = paperWire();
    expect(readGate(envelopeOf(wire))).toMatchObject({ verdict: "partial", observedDays: 3, minimumDays: 14, trades: 2, minimumTrades: 20, sessions: 1, windowBounded: true, policyStage: "PAPER_OBSERVATION", policyVersion: "paper.v1" });
    // Counts that look sufficient do not turn a PARTIAL gate into a MET one.
    setPath(wire, ["data", "observation_gate", "observed_days"], 99);
    setPath(wire, ["data", "observation_gate", "trade_count"], 99);
    expect(readGate(envelopeOf(wire)).verdict).toBe("partial");
    setPath(wire, ["data", "observation_gate"], ABSENT);
    expect(readGate(envelopeOf(wire))).toMatchObject({ verdict: "none", observedDays: null, windowBounded: null });
  });

  it.each([[true, true], [false, false], ["yes", null], [1, null], [null, null]])("window_bounded %j reads %j", (raw, expected) => {
    const wire = paperWire();
    setPath(wire, ["data", "observation_gate", "window_bounded"], raw);
    expect(readGate(envelopeOf(wire)).windowBounded).toBe(expected);
  });

  it("each verdict has a flag, an unknown one is never a success", () => {
    expect(Object.keys(GATE_FLAG).sort()).toEqual(["available", "blocked", "met", "none", "not-met", "partial", "unknown"]);
    expect(GATE_FLAG.unknown.kind).toBe("unknown");
    // AVAILABLE is not MET: it is neutral and worded as what it says, never the green "Met".
    expect(GATE_FLAG.available).toEqual({ kind: "neutral", label: "Available" });
    expect(GATE_FLAG.met).toEqual({ kind: "ok", label: "Met" });
    expect(GATE_FLAG.none.kind).toBe("unknown");
  });

  it("the exit-review reason is one line: the gate's word when it blocks, FE-028 otherwise", () => {
    const gate = (verdict: string) => ({ ...readGate(envelopeOf(paperWire())), verdict } as never);
    expect(exitReviewReason(gate("partial"))).toBe("Blocked: the observation gate is partial.");
    expect(exitReviewReason(gate("blocked"))).toBe("Blocked: the observation gate is blocked.");
    expect(exitReviewReason(gate("not-met"))).toBe("Blocked: the observation gate is not met.");
    expect(exitReviewReason(gate("met"))).toBe("Not offered from this screen yet.");
    expect(exitReviewReason(gate("available"))).toBe("Not offered from this screen yet.");
    expect(exitReviewReason(gate("none"))).toBe("Not offered from this screen yet.");
    for (const v of ["partial", "met", "none", "unknown"]) expect(exitReviewReason(gate(v)).includes("\n")).toBe(false);
  });
});

describe("equity and accounting", () => {
  it("reads the series oldest first, the head from the latest snapshot, money as published strings", () => {
    const equity = readEquity(envelopeOf(paperWire({ equity: 6 })), pageState(envelopeOf(paperWire()), null));
    expect(equity.points).toHaveLength(6);
    expect(equity.points[0].t).toBeLessThan(equity.points[5].t);
    expect(equity.points[5].v).toBe("101800.00");
    expect(equity.accounting.equity).toMatchObject({ kind: "value", decimal: { full: "101800.00" } });
    expect(equity.accounting.netPnl).toMatchObject({ kind: "value", decimal: { full: "1800.00" } });
    expect(equity.accounting.fees).toMatchObject({ kind: "value", decimal: { display: "12.40" } });
    expect(equity.accounting.currency).toBe("USDT");
    expect(equity.accounting.digest).toBe("9c1e04b7a2f1ffff");
    expect(equity.state).toEqual({ kind: "ready" });
    expect(equity.segments).toEqual([{ kind: "simulated", from: equity.points[0].t, to: equity.points[5].t }]);
  });

  it("an unpublished funding is absent, not zero; a published zero stays a value", () => {
    const wire = paperWire();
    expect(model(wire).equity.accounting.funding).toEqual({ kind: "absent" });
    setPath(wire, ["data", "account_equity", 5, "funding_pnl"], "0.00");
    expect(model(wire).equity.accounting.funding).toMatchObject({ kind: "value", decimal: { zero: true } });
  });

  it("the snapshots may arrive in any order; the series is still oldest first and the head is the latest", () => {
    const wire = paperWire({ equity: 5 });
    wire.data.account_equity.reverse();
    const equity = model(wire).equity;
    expect(equity.points.map((p) => p.v)).toEqual(["100000.00", "100360.00", "100720.00", "101080.00", "101440.00"]);
    expect(equity.accounting.equity).toMatchObject({ decimal: { full: "101440.00" } });
  });

  it("two snapshots at one instant draw the later one and say so; a time the chart refuses is not drawn", () => {
    const wire = paperWire({ equity: 3 });
    wire.data.account_equity[2].ts = wire.data.account_equity[1].ts;
    wire.data.account_equity[0].ts = "last Tuesday";
    const equity = model(wire).equity;
    expect(equity.points).toHaveLength(1);
    expect(equity.state.kind).toBe("unavailable");
    const wide = paperWire({ equity: 6 });
    wide.data.account_equity[3].ts = wide.data.account_equity[2].ts;
    wide.data.account_equity[0].ts = "last Tuesday";
    const partial = model(wide).equity;
    expect(partial.state).toMatchObject({ kind: "partial" });
    expect((partial.state as { reason: string }).reason).toMatch(/1 snapshot shares an instant.*1 snapshot has no readable time/);
  });

  it("an equity value the boundary refuses is a gap and a word, never a zero", () => {
    const wire = paperWire({ equity: 6 });
    wire.data.account_equity[2].equity = 12345;
    wire.data.account_equity[3].equity = "1e5";
    const equity = model(wire).equity;
    expect(equity.points[2].v).toBeNull();
    expect(equity.points[3].v).toBeNull();
    expect(equity.points.filter((p) => p.v === "0" || p.v === "0.00")).toEqual([]);
    expect(equity.state).toMatchObject({ kind: "partial" });
    expect((equity.state as { reason: string }).reason).toContain("2 snapshots have an equity value that could not be read");
  });

  it.each([[0, /No equity snapshot published/], [1, /1 drawable equity snapshot; a line needs 2/]])("%i snapshots draw nothing and say why", (n, reason) => {
    const equity = model(paperWire({ equity: n })).equity;
    expect(equity.state).toMatchObject({ kind: "unavailable", copy: "Not available" });
    expect((equity.state as { reason: string }).reason).toMatch(reason);
  });

  it("stale and partial pages demote the chart and keep it", () => {
    const stale = paperWire(); stale.freshness = "STALE";
    expect(model(stale).equity.state).toMatchObject({ kind: "stale" });
    const partial = paperWire(); partial.completeness = "PARTIAL";
    expect(model(partial).equity.state).toMatchObject({ kind: "partial" });
    const both = paperWire(); both.completeness = "PARTIAL"; both.freshness = "STALE";
    expect((model(both).equity.state as { reason: string }).reason).toMatch(/also stale/);
  });

  it("the server's own downsample is repeated verbatim and never claims extrema", () => {
    expect(model(paperWire({ history: false })).equity.serverEnvelope).toBeUndefined();
    expect(model(paperWire({ history: true, equity: 6 })).equity.serverEnvelope).toEqual({ sourceCount: 1438, shownCount: 6, method: "PER_SERIES_BUCKET_EXTREMA", keepsExtrema: true });
    // any other method name keeps the "does not guarantee extrema" flag (only the published name may claim the extrema)
    const other = paperWire({ history: true, equity: 6 });
    (other.data as { history_windows: { account_equity: { downsample: { method: string } } } }).history_windows.account_equity.downsample.method = "LAST_VALUE_PER_BUCKET";
    expect(model(other as never).equity.serverEnvelope).toMatchObject({ method: "LAST_VALUE_PER_BUCKET", keepsExtrema: false });
    const smaller = paperWire({ history: true, equity: 6 });
    smaller.data.history_windows.account_equity.source_rows = 3;
    expect(model(smaller).equity.serverEnvelope).toBeUndefined();
  });

  it("cash is two figures, each its own", () => {
    const wire = paperWire();
    wire.data.account_equity[5].cash_locked = "10 600";
    const a = model(wire).equity.accounting;
    expect(a.cashFree.kind).toBe("value");
    expect(a.cashLocked.kind).toBe("unreadable");
  });

  it("a deployment with no snapshot has an accounting of absences", () => {
    const a = model(paperWire({ equity: 0 })).equity.accounting;
    for (const f of [a.equity, a.netPnl, a.fees, a.funding, a.cashFree, a.cashLocked, a.fillsCounted]) expect(f).toEqual({ kind: "absent" });
    expect(a.currency).toBeNull();
    expect(a.digest).toBeNull();
  });
});

describe("closed word tables", () => {
  it.each([
    ["FILLED", "applied", "Filled"], ["PARTIALLY_FILLED", "partial", "Partly filled"], ["REJECTED", "rejected", "Rejected"], ["DENIED", "rejected", "Denied"],
    ["CANCELED", "na", "Canceled"], ["EXPIRED", "na", "Expired"], ["SUBMITTED", "pending", "Submitted"], ["PENDING_CANCEL", "pending", "Pending cancel"],
    ["TRIGGERED", "operation", "Triggered"], ["UNKNOWN", "unknown", "Unknown"],
  ])("order state %s", (word, kind, label) => expect(orderState(word)).toEqual({ kind, label }));

  it.each(["filled", "OK", "SUCCESS", "NEW_THING", "", " FILLED", "__proto__", "constructor", "toString", 1, null, undefined, {}, ["FILLED"]])("an order state the table does not know (%j) is Unknown", (word) => {
    expect(orderState(word)).toEqual({ kind: "unknown", label: "Unknown" });
  });
});

describe("orders, fills, positions", () => {
  it("orders: newest first, the client id first, the source's own words, prices as strings", () => {
    const table = readOrders(envelopeOf(paperWire({ orders: 4 })), null);
    expect(table.rows.map((r) => r.orderId)).toEqual(["ord_00003", "ord_00002", "ord_00001", "ord_00000"]);
    expect(table.rows[0]).toMatchObject({ clientOrderId: "c-0044-0003", side: "sell", state: { label: "Submitted" } });
    expect(table.rows[3]).toMatchObject({ side: "buy", state: { label: "Filled" }, quantity: { kind: "value" }, price: { kind: "value" } });
    expect(table.published).toBe(true);
  });

  it("a missing branch is not an empty branch", () => {
    const wire = paperWire({ orders: 0 });
    expect(readOrders(envelopeOf(wire), null)).toMatchObject({ published: true, rows: [], label: "0 orders" });
    setPath(wire, ["data", "orders"], ABSENT);
    expect(readOrders(envelopeOf(wire), null).published).toBe(false);
  });

  it("an order id that arrives as a number is an id", () => {
    const wire = paperWire({ orders: 1 });
    wire.data.orders[0].order_id = 70123;
    expect(readOrders(envelopeOf(wire), null).rows[0].orderId).toBe("70123");
  });

  it("two rows with one id get two keys", () => {
    const wire = paperWire({ orders: 3 });
    for (const row of wire.data.orders) row.order_id = "same";
    const keys = readOrders(envelopeOf(wire), null).rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(3);
  });

  it("a side the source did not say plainly is not drawn", () => {
    const wire = paperWire({ orders: 3 });
    wire.data.orders[0].side = "buy"; wire.data.orders[1].side = "LONG"; wire.data.orders[2].side = 1;
    expect(readOrders(envelopeOf(wire), null).rows.map((r) => r.side)).toEqual([null, null, null]);
  });

  it("fills: newest first, fee with its own currency", () => {
    const table = readFills(envelopeOf(paperWire({ fills: 3 })), null);
    expect(table.rows.map((r) => r.clientOrderId)).toEqual(["c-0044-0002", "c-0044-0001", "c-0044-0000"]);
    expect(table.rows[0]).toMatchObject({ fee: { kind: "value", decimal: { display: "12.40" } }, feeCurrency: "USDT" });
    const odd = paperWire({ fills: 1 });
    odd.data.fills[0].commission_currency = "not a currency!";
    expect(readFills(envelopeOf(odd), null).rows[0].feeCurrency).toBeNull();
  });

  it("positions: open means LONG or SHORT; FLAT and an unreadable side are counted apart", () => {
    const wire = paperWire({ positions: 4 });
    wire.data.positions[0].side = "SHORT"; wire.data.positions[1].side = "FLAT"; wire.data.positions[2].side = "sideways"; wire.data.positions[3].side = "LONG";
    const p = readPositions(envelopeOf(wire));
    expect(p.open).toBe(2);
    expect(p.unreadableSide).toBe(1);
    expect(p.table.rows.map((r) => r.side).sort()).toEqual(["flat", "long", "short", "unknown"]);
  });
});

describe("a flat position has no entry price", () => {
  const flat = (avg: unknown, side = "FLAT") => {
    const wire = paperWire({ positions: 1 });
    Object.assign(wire.data.positions[0], { side, quantity: "0", avg_px_open: avg, unrealized_pnl: "0" });
    return readPositions(envelopeOf(wire)).table.rows[0];
  };
  it("a null or missing entry is absent, never 0.00; the quantity keeps its exact published zero", () => {
    expect(flat(null).entry).toEqual({ kind: "absent" });
    const wire = paperWire({ positions: 1 });
    Object.assign(wire.data.positions[0], { side: "FLAT", quantity: "0" });
    delete (wire.data.positions[0] as Record<string, unknown>).avg_px_open;
    const row = readPositions(envelopeOf(wire)).table.rows[0];
    expect(row.entry).toEqual({ kind: "absent" });
    expect(row.quantity).toMatchObject({ kind: "value", decimal: { full: "0" } });
  });
  it("the server's zero placeholder on a FLAT row is absent too, while a zero on an open row is still printed", () => {
    expect(flat("0").entry).toEqual({ kind: "absent" });
    expect(flat("0.00").entry).toEqual({ kind: "absent" });
    expect(flat("0", "LONG").entry).toMatchObject({ kind: "value", decimal: { zero: true } });
    expect(flat("152.30").entry).toMatchObject({ kind: "value", decimal: { full: "152.30" } });
  });
});

describe("the 200-row cap says what it did", () => {
  it.each([
    [200, 200, 1247, "orders", "Showing 200 of 1,247 orders"],
    [200, 1250, 1250, "orders", "Showing 200 of 1,250 orders"],
    [200, 1250, 900, "orders", "Showing 200 of 1,250 orders"],
    [2, 2, 2, "orders", "2 orders"],
    [1, 1, 1, "fills", "1 fill"],
    [0, 0, 0, "orders", "0 orders"],
    [200, 200, null, "orders", "Showing the first 200 orders; the total is not published"],
    [200, 1250, null, "orders", "Showing 200 of at least 1,250 orders"],
    [7, 7, null, "positions", "7 positions"],
    [1, 1, null, "positions", "1 position"],
  ] as const)("shown %i, loaded %i, population %j -> %s", (shown, loaded, population, noun, label) => {
    expect(capLabel(shown, loaded, population, noun)).toBe(label);
  });

  it("never draws more than PAGE_CAP rows", () => {
    const table = readOrders(envelopeOf(paperWire({ orders: PAGE_CAP + 55 })), null);
    expect(table.rows).toHaveLength(PAGE_CAP);
    expect(table.loaded).toBe(PAGE_CAP + 55);
    expect(table.label).toBe("Showing 200 of at least 255 orders");
  });

  it("the quality read's population is the total when it is bigger", () => {
    const q = qualityOf(qualityWire({ data: { ...qualityWire().data, order_population: "1247", fill_population: "10" } }));
    const m = buildWorkbench(envelopeOf(paperWire({ orders: 200, fills: 3 })), q);
    expect(m.orders.label).toBe("Showing 200 of 1,247 orders");
    expect(m.orders.total).toBe(1247);
    expect(m.fills.label).toBe("Showing 3 of 10 fills");
  });
});

describe("execution quality", () => {
  it("reads the counts as published and is partial while latency is not published", () => {
    const facts = readQuality(qualityOf());
    expect(facts.sessions).toMatchObject({ kind: "value", decimal: { display: "1" } });
    expect(facts.rejected).toMatchObject({ kind: "value", decimal: { display: "0", zero: true } });
    expect(facts.submitted).toMatchObject({ kind: "value", decimal: { display: "2" } });
    expect(facts.partial).toBe(true);
    expect(facts.latencyReason).toBe("BROKER_TIMESTAMPS_NOT_PUBLISHED");
    expect(facts.status).toEqual({ kind: "ok" });
  });

  const dims = [
    dimension("state", ["state"], ["READY", "PARTIAL", "EMPTY", "UNAVAILABLE", "DENIED", "SOMETHING_NEW"]),
    dimension("latency", ["data", "latency_state"], ["AVAILABLE", "UNAVAILABLE", ABSENT]),
  ];
  it.each(cartesian(qualityWire(), dims).map((s) => [s.name, s] as const))("%s", (_name, s) => {
    const facts = readQuality(qualityOf(s.value));
    const state = s.picks.state;
    if (state === "READY" || state === "PARTIAL") expect(facts.status.kind).toBe("ok");
    else if (state === "EMPTY") expect(facts.status.kind).toBe("empty");
    else if (state === "DENIED") expect(facts.status.kind).toBe("denied");
    else expect(facts.status.kind).toBe("unavailable");
    // Partial whenever the derivation says so or the latency is anything but published.
    expect(facts.partial).toBe(state === "PARTIAL" || s.picks.latency !== "AVAILABLE");
    // An unknown state word never reaches the status text.
    expect(JSON.stringify(facts.status)).not.toContain("SOMETHING_NEW");
  });
});

describe("the whole model", () => {
  it("sessions counted come from the quality read and are absent without it", () => {
    expect(model(paperWire(), null).sessionsCounted).toEqual({ kind: "absent" });
    expect(buildWorkbench(envelopeOf(paperWire()), qualityOf()).sessionsCounted).toMatchObject({ kind: "value", decimal: { display: "1" } });
  });

  it("holds no field that could be an age, a band, a drawdown or a stage history", () => {
    expect(Object.keys(model())).toEqual(["deployment", "page", "freshness", "gate", "equity", "orders", "fills", "positions", "sessionsCounted", "identity", "facts", "sides", "calendar"]);
    expect(Object.keys(model().freshness)).toEqual(["kind", "label", "asOfMs"]);
    expect(Object.keys(model().gate)).not.toContain("criteria");
    expect(Object.keys(model().deployment ?? {})).not.toContain("runtime");
  });

  it("the default routes are the registry's canonical ones", () => {
    expect(DEFAULT_ROUTES.alpha("a b")).toBe("/deployments/alphas/a%20b");
    expect(DEFAULT_ROUTES.blotter("d1", "o 1")).toBe("/deployments/blotter?deployment=d1&env=paper&order=o%201");
    expect(DEFAULT_ROUTES.blotter("d1")).toBe("/deployments/blotter?deployment=d1&env=paper");
    expect(DEFAULT_ROUTES.exitReviews).toBe("/governance/exit-reviews");
  });
});
