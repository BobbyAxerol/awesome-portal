/**
 * The Canary reader: what a port answer becomes before the screen prints it.
 * Lane: BFF-shaped bodies through the real dispatcher (`readCanaryByVersion`) and the
 * V1 / V2 readers, then `readCanaryView`. The populated V1 body is FIXTURE_LAB (see canary.testbase.ts).
 */
import { describe, expect, it } from "vitest";

import { readCanaryControlRoom } from "../../../certification";
import { readCanaryByVersion, unsupportedText, type CanaryVersionRead } from "../../readers/dispatch";
import { readCanaryParentV2 } from "../../readers/governanceParents";
import { readCanaryView, type CanaryReadResult, type CanaryView } from "./readCanary";
import { validateAgainst } from "../../testkit/schema";
import { DEP, SCHEMA_V1, lit, parentBody, populatedV1, populatedWithFacts, v1Body } from "./canary.testbase";

function viewOf(result: CanaryReadResult): CanaryView {
  if (result.kind !== "view") throw new Error(`expected a view, got unsupported: ${result.text}`);
  return result.view;
}
const fromBody = (raw: unknown): CanaryView => viewOf(readCanaryView(readCanaryByVersion(raw)));

describe("V1 control room body", () => {
  it("reads the published fixture: ids, stage, envelope exact, nothing invented", () => {
    const view = fromBody(v1Body());
    expect(view).toMatchObject({
      body: "v1",
      schemaVersion: "execution.canary-control-room.v1",
      deploymentId: "dep_88",
      portfolioId: "pf_crypto",
      accountId: "acct_canary_grid",
      venue: "BINANCE",
      declaredStage: "LIVE_CANARY",
      runtimeState: null,
      dayIndex: null,
      durationDays: 14,
      proposalOnly: false,
      productionCommandActive: false,
    });
    expect(view.envelope).toMatchObject({ revision: 1, status: "DRAFT", currency: "USDT", baseRiskProfileRevision: "risk-profile-rev-12" });
    const capital = view.envelope!.limits.find((l) => l.key === "capital")!;
    expect(capital.value).toMatchObject({ kind: "value", decimal: { display: "5,000.00", full: "5000" } });
    expect(view.envelope!.limits.find((l) => l.key === "openOrders")!.value).toMatchObject({ kind: "value", decimal: { display: "20" } });
    // The used ratio is not on the wire: no limit carries one.
    expect(view.envelope!.limits.every((l) => l.usedRatio === undefined)).toBe(true);
  });

  it("the five KPIs are present and dark: no value, a count never carries the wire's currency unit", () => {
    const view = fromBody(v1Body());
    expect(Object.keys(view.kpis)).toEqual(["capital_consumed", "gross_notional", "daily_pnl", "open_orders", "broker_equity"]);
    for (const fact of Object.values(view.kpis)) {
      expect(fact).not.toBeNull();
      expect(fact!.value).toBeNull();
      expect(fact!.panel.state).toBe("unavailable");
    }
    expect(view.kpis.capital_consumed!.currency).toBe("USDT");
    // The published fixture says open_orders has unit USDT; a count is not money.
    expect(view.kpis.open_orders!.currency).toBeNull();
  });

  it("panels, policy and rows: states read, no typed rows, the asymmetry kept", () => {
    const view = fromBody(v1Body());
    for (const panel of [view.compliance, view.internal, view.broker, view.difference, view.series, view.rollback, view.positions.panel, view.orders.panel]) {
      expect(panel).toMatchObject({ state: "unavailable", freshness: "UNKNOWN", asOfMs: null });
    }
    expect(view.positions.rows).toBeNull();
    expect(view.orders.rows).toBeNull();
    expect(view.positions.total).toBeNull();
    expect(view.protective).toEqual({ brokerSyncBlocks: false });
    expect(view.scaleUp).toEqual({ brokerSyncBlocks: true });
  });

  it("blockers are the published codes, deduplicated in source order with their origin", () => {
    const view = fromBody(v1Body());
    const codes = view.blockers.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.slice(0, 4)).toEqual(["PRODUCTION_COMMAND_INACTIVE", "CANARY_OWNER_GATE_REQUIRED", "LIVE_SOURCE_UNAVAILABLE", "BASE_RISK_PROFILE_UNVERIFIED"]);
    expect(view.blockers[0].origin).toBe("lifecycle");
    expect(codes).toContain("PROTECTIVE_CAPABILITY_UNAVAILABLE");
    expect(codes).toContain("BROKER_SYNC_UNAVAILABLE");
    expect(view.blockers.every((b) => b.known)).toBe(true);
  });

  it("lineage keeps in-app links only", () => {
    const body = v1Body();
    body.lineage[0].href = "https://example.invalid/steal";
    body.lineage[1].href = "//example.invalid/steal";
    const view = fromBody(body);
    expect(view.lineage).toHaveLength(5);
    expect(view.lineage[0].href).toBeNull();
    expect(view.lineage[1].href).toBeNull();
    expect(view.lineage[2]).toMatchObject({ kind: "R2_APPROVAL", value: "AP-152", href: "/governance/approvals/AP-152/r2" });
  });

  it.each(["//evil.example", "/\\evil.example", "/\tevil", "javascript:x", "https://x"])("lineage drops the hostile href %j", (hostile) => {
    const body = v1Body();
    body.lineage[0].href = hostile;
    expect(fromBody(body).lineage[0].href).toBeNull();
  });

  it("a trial day is stated only when it is 1..duration; day 0 and a day past the end are not stated", () => {
    for (const [day, expected] of [[1, 1], [6, 6], [14, 14], [0, null], [15, null], [null, null]] as const) {
      const body = populatedV1();
      body.lifecycle.day_index = day;
      expect(fromBody(body).dayIndex, `day ${day}`).toBe(expected);
    }
  });

  it("a lit body: KPI values are exact decimals, the daily PnL keeps its sign, panels carry their own as-of", () => {
    const view = fromBody(populatedV1());
    expect(view.kpis.capital_consumed!.value).toMatchObject({ kind: "value", decimal: { display: "3,820.00", full: "3820.00", tone: "positive" } });
    expect(view.kpis.daily_pnl!.value).toMatchObject({ kind: "value", decimal: { display: "-38.60", tone: "negative" } });
    expect(view.kpis.open_orders!.value).toMatchObject({ kind: "value", decimal: { display: "1" } });
    expect(view.broker).toMatchObject({ state: "ok", freshness: "OK", asOfMs: Date.UTC(2026, 9, 17, 12, 4) });
    expect(view.dayIndex).toBe(6);
  });

  it("an unreadable figure is unreadable, never a number: exponent, a count with a fraction, a signed zero", () => {
    const body = populatedV1();
    body.kpis[0].value = "1e5";
    body.kpis[3].value = "1.5";
    body.kpis[2].value = "-0.00";
    const view = fromBody(body);
    expect(view.kpis.capital_consumed!.value).toEqual({ kind: "unreadable" });
    expect(view.kpis.open_orders!.value).toEqual({ kind: "unreadable" });
    expect(view.kpis.daily_pnl!.value).toEqual({ kind: "unreadable" });
  });

  it("a suppressed panel is `suppressed`, not unavailable", () => {
    const body = populatedV1();
    const broker = body.source_panels.find((p: { panel_id: string }) => p.panel_id === "broker");
    broker.panel_state = "suppressed";
    expect(fromBody(body).broker?.state).toBe("suppressed");
  });

  it("a schema-valid `ready` panel with `FRESH` freshness reads as ok / fresh, and that body conforms to the published envelope schema", () => {
    const body = v1Body();
    const broker = body.source_panels.find((p: { panel_id: string }) => p.panel_id === "broker");
    broker.panel_state = "ready";
    broker.freshness_state = "FRESH";
    broker.as_of = "2026-10-17T12:04:00.000Z";
    broker.source_verification_state = "VERIFIED";
    broker.data = { equity: "5112.40" };
    broker.warnings = [];
    expect(validateAgainst(SCHEMA_V1, "/$defs/SourceEnvelope", broker)).toEqual([]);
    expect(fromBody(body).broker).toMatchObject({ state: "ok", freshness: "OK", asOfMs: Date.UTC(2026, 9, 17, 12, 4) });
  });

  it("each published freshness word and each published panel word reads as itself; a word outside the schema is unavailable / not stated", () => {
    for (const [wire, freshness] of [["FRESH", "OK"], ["AGING", "AGING"], ["STALE", "STALE"], ["UNKNOWN", "UNKNOWN"]] as const) {
      const body = populatedV1();
      body.source_panels[1].freshness_state = wire;
      expect(fromBody(body).broker?.freshness, wire).toBe(freshness);
    }
    for (const [wire, state] of [["ready", "ok"], ["empty", "empty"], ["partial", "partial"], ["stale", "stale"], ["unavailable", "unavailable"], ["suppressed", "suppressed"]] as const) {
      const body = populatedV1();
      body.source_panels[1].panel_state = wire;
      expect(fromBody(body).broker?.state, wire).toBe(state);
    }
    // The FE's own words, a made-up word and a freshness no schema publishes are refused, not repaired.
    for (const word of ["ok", "OK", "error", "loading", "READY", "fine", ""]) {
      const body = populatedV1();
      body.source_panels[1].panel_state = word;
      expect(fromBody(body).broker?.state, `state ${word}`).toBe(word === "error" ? "terminal" : "unavailable");
    }
    for (const word of ["PAUSED", "VERY_FRESH", "fresh", ""]) {
      const body = populatedV1();
      body.source_panels[1].freshness_state = word;
      expect(fromBody(body).broker?.freshness, `freshness ${word}`).toBeNull();
    }
  });
});

describe("V1 body: what the shared reader used to drop (FIXTURE_LAB; the V1 schema pins these dark)", () => {
  it("the dark published fixture: ready is the schema's false, its blockers are kept, the caps are the compliance panel's own", () => {
    const view = fromBody(v1Body());
    expect(view.rollbackReady).toBe(false);
    expect(view.rollbackBlockerCodes.length).toBeGreaterThanOrEqual(1);
    expect(view.complianceFacts?.baseRiskProfileVerified).toBe(false);
    expect(view.complianceFacts?.consumed).toBeNull();
    expect(view.complianceFacts?.headroom).toBeNull();
    expect(view.complianceFacts?.limits.capital).toMatchObject({ kind: "value", decimal: { full: "5000" } });
    expect(view.complianceFacts?.limits.openOrders).toMatchObject({ kind: "value", decimal: { display: "20" } });
    // The dark panels carry no rows, and a panel that is unavailable holds none.
    expect(view.positions.published).toBeNull();
    expect(view.orders.published).toBeNull();
  });

  it("consumed and headroom: a key spelled like a cap belongs to that cap, others are listed under their own name, a number is refused", () => {
    const view = fromBody(populatedWithFacts());
    const consumed = view.complianceFacts!.consumed!;
    expect(consumed.byLimit.capital).toMatchObject({ kind: "value", decimal: { full: "3820.00" } });
    expect(consumed.byLimit.openOrders).toMatchObject({ kind: "value", decimal: { display: "1" } });
    expect(consumed.other).toEqual([{ key: "fees_paid", exact: "4.25" }]);
    expect(view.complianceFacts!.headroom!.byLimit.capital).toMatchObject({ decimal: { full: "1180.00" } });
    const numeric = populatedWithFacts();
    numeric.envelope_compliance.consumed = { capital_cap: 3820, fees_paid: 4.25 };
    const refused = fromBody(numeric).complianceFacts!.consumed!;
    expect(refused.byLimit).toEqual({});
    expect(refused.other).toEqual([]);
  });

  it("rollback: the boolean is read as published, never inferred from the panel", () => {
    expect(fromBody(populatedWithFacts()).rollbackReady).toBe(true);
    const body = populatedWithFacts();
    body.rollback_readiness.ready = "true";
    expect(fromBody(body).rollbackReady).toBeNull();
    body.rollback_readiness.ready = 1;
    expect(fromBody(body).rollbackReady).toBeNull();
    delete body.rollback_readiness.ready;
    expect(fromBody(body).rollbackReady).toBeNull();
    expect(fromBody(parentBody("canary")).rollbackReady).toBeNull();
  });

  it("rows: drawn under the source's own members, exact text, scalar cells only; a number cell is dropped, never printed", () => {
    const view = fromBody(populatedWithFacts());
    const table = view.positions.published!;
    expect(table.columns.map((c) => c.label)).toEqual(["Symbol", "Side", "Qty", "Entry price", "Hedged", "Note"]);
    expect(table.rows[0]!.cells).toEqual(["BTCUSDT", "LONG", "0.0120", "64000.10", false, null]);
    expect(table.rows[1]!.cells).toEqual(["ETHUSDT", "SHORT", "1.5000", "3412.50", true, null]);
    expect(table.total).toBe(2);
    expect(view.positions.rows).toBeNull();
    expect(view.orders.published!.columns.map((c) => c.key)).toEqual(["order_id", "price", "type"]);
    const body = populatedWithFacts();
    body.positions.rows = [{ symbol: "BTCUSDT", qty: 0.012, deep: { a: 1 }, list: [1] }];
    const only = fromBody(body).positions.published!;
    expect(only.columns.map((c) => c.key)).toEqual(["symbol"]);
  });

  it("rows are bounded: 200 rows, 12 columns, and a count of what was not kept", () => {
    const body = populatedWithFacts();
    body.positions.rows = Array.from({ length: 250 }, (_, i) => Object.fromEntries(Array.from({ length: 15 }, (_, j) => [`f${j}`, `${i}`])));
    body.positions.returned_count = 200;
    const table = fromBody(body).positions.published!;
    expect(table.rows).toHaveLength(200);
    expect(table.columns).toHaveLength(12);
    expect(table.hiddenColumns).toBe(3);
    expect(table.rowsDropped).toBe(50);
  });

  it("rows of a panel that is not holding rows are not shown: unavailable, suppressed and an unknown word", () => {
    for (const state of ["unavailable", "suppressed", "fine"]) {
      const body = populatedWithFacts();
      lit(body.positions.envelope, state, "FRESH");
      expect(fromBody(body).positions.published, state).toBeNull();
    }
    for (const state of ["partial", "stale", "empty", "ready"]) {
      const body = populatedWithFacts();
      lit(body.positions.envelope, state, "FRESH");
      expect(fromBody(body).positions.published, state).not.toBeNull();
    }
  });

  it("text a screen must not print is not a cell: control, bidi and zero-width characters", () => {
    const body = populatedWithFacts();
    const bidi = String.fromCharCode(0x202e);
    const zero = String.fromCharCode(0x200b);
    body.positions.rows = [{ symbol: `BTC${bidi}USDT`, note: `a${zero}b`, ok: "fine", tab: "a\tb" }];
    const table = fromBody(body).positions.published!;
    expect(table.columns.map((c) => c.key)).toEqual(["ok"]);
  });
});

describe("V2 following-parent body (the Canary proposal)", () => {
  it("reads the proposal exactly: caps keep every digit, the envelope is a draft, nothing runs", () => {
    const view = fromBody(parentBody("canary"));
    expect(view).toMatchObject({
      body: "v2",
      schemaVersion: "portal.execution.following-parent.v2",
      deploymentId: "dep_TEST_ONLY_parent",
      portfolioId: "pf_TEST_ONLY_parent",
      accountId: null,
      runtimeState: null,
      dayIndex: null,
      durationDays: 7,
      proposalOnly: true,
      productionCommandActive: false,
    });
    expect(view.envelope).toMatchObject({ revision: 1, status: "DRAFT", currency: "USDT" });
    const capital = view.envelope!.limits.find((l) => l.key === "capital")!;
    expect(capital.value).toMatchObject({ kind: "value", decimal: { full: "9007199254740993.123456789123456789" } });
    expect(view.envelope!.limits.find((l) => l.key === "dailyLoss")!.value).toMatchObject({ decimal: { full: "0.000000000000000001" } });
    expect(view.observedAtMs).toBe(1792281600000);
    expect(Object.values(view.kpis).every((k) => k === null)).toBe(true);
    expect(view.protective).toBeNull();
    expect(view.scaleUp).toBeNull();
  });

  it("states two blockers from published fields, and the five lineage ids with no link", () => {
    const view = fromBody(parentBody("canary"));
    expect(view.blockers).toEqual([
      { origin: "body", code: null, known: false },
      { origin: "body", code: "PRODUCTION_COMMAND_INACTIVE", known: true },
    ]);
    expect(view.lineage.map((l) => l.kind)).toEqual(["CERTIFICATION", "CANARY_PROMOTION_PLAN", "PAPER_EXIT_REVIEW", "R1_APPROVAL", "R2_APPROVAL"]);
    expect(view.lineage.every((l) => l.href === null)).toBe(true);
  });

  it("an absent proposal keeps the server's reason code and draws no caps", () => {
    const view = fromBody(parentBody("canary_absent"));
    expect(view.envelope).toBeNull();
    expect(view.proposalAbsentReason).toBe("PARENT_FIELD_PURPOSE_NOT_QUALIFIED");
    expect(view.durationDays).toBeNull();
    expect(view.lineage).toEqual([]);
  });

  it("a later revision reads its number", () => {
    expect(fromBody(parentBody("canary_revision")).envelope?.revision).toBe(2);
  });
});

describe("the two versions never read each other's body", () => {
  it("the V1 reader refuses a V2 body and the V2 reader refuses a V1 body", () => {
    expect(readCanaryControlRoom(parentBody("canary"))).toBeNull();
    expect(readCanaryParentV2(v1Body())).toBeNull();
  });

  it("the dispatcher names each body's version; a V2 body is never answered as V1", () => {
    expect(readCanaryByVersion(v1Body()).kind).toBe("v1");
    expect(readCanaryByVersion(parentBody("canary")).kind).toBe("v2");
    const v2UnderV1 = parentBody("canary");
    v2UnderV1.schema_version = "execution.canary-control-room.v1";
    expect(readCanaryByVersion(v2UnderV1).kind).toBe("unsupported");
  });

  it("a `v2` answer that is not the CANARY family, or a `v1` answer with no deployment, is refused whole", () => {
    const sandbox = { kind: "v2", schemaVersion: "portal.execution.following-parent.v2", value: { family: "SANDBOX" } } as unknown as CanaryVersionRead;
    expect(readCanaryView(sandbox).kind).toBe("unsupported");
    const noDeployment = { kind: "v1", schemaVersion: null, value: { deploymentId: null } } as unknown as CanaryVersionRead;
    expect(readCanaryView(noDeployment).kind).toBe("unsupported");
  });
});

describe("unsupported and malformed answers", () => {
  it("an `unsupported` answer is the dispatcher's own sentence", () => {
    const body = v1Body();
    body.schema_version = "execution.canary-control-room.v9";
    const read = readCanaryByVersion(body);
    expect(read.kind).toBe("unsupported");
    const result = readCanaryView(read);
    expect(result).toEqual({ kind: "unsupported", text: unsupportedText(read as Extract<typeof read, { kind: "unsupported" }>) });
    expect(result.kind === "unsupported" && result.text).toContain("execution.canary-control-room.v9");
  });

  it("never throws on anything", () => {
    for (const junk of [null, undefined, 0, "x", [], {}, { kind: "v1" }, { kind: "v2", value: null }, { kind: "v1", value: { deploymentId: "x", kpis: 7, envelope: { limits: 3 } } }]) {
      expect(() => readCanaryView(junk as never)).not.toThrow();
    }
    expect(readCanaryView(null).kind).toBe("unsupported");
  });

  it("the id of the deployment is the body's own, never the route's", () => {
    expect(fromBody(populatedV1()).deploymentId).toBe(DEP);
  });
});
