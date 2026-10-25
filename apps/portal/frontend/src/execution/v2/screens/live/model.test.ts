/**
 * Live operations model (rules 9.8.3).
 *
 * L1  the state matrix of the V1 body (verdict x broker visibility x gap x freshness x qualification), each
 *     state with a stable name and an oracle written from the contract, not from the model; the V2 bodies.
 * L2  scale: ten panels of 200 records, a body of about 1 MiB, the caption of a capped list.
 * L3  negative: every refused or malformed body is an `unsupported` answer or a model, never a throw, never
 *     a leak of its probe; a flag that cannot be read never reveals a broker figure.
 *
 * Lane: FIXTURE_LAB at the view-model level for the populated V1 body (the V1 schema pins dark constants,
 * so a populated V1 body is not wire-valid); the V2 bodies are the published synthetic canonical.
 */
import { describe, expect, it } from "vitest";

import { readLiveFullByVersion } from "../../readers/dispatch";
import { LIVE_SOURCE_PANELS } from "../../readers/liveSourceOperations";
import { setPath, type Draft } from "../../testkit/matrix";
import { arrayCases, decimalCases, enumCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases } from "../../testkit/negative";
import { MIB, serializedBytes, timed } from "../../testkit/scale";
import {
  BLOCKER_FALLBACK,
  LADDER,
  ROW_CAP,
  blockerSentence,
  buildTriadRows,
  canaryHref,
  capCaption,
  liveModelOf,
  liveModelV1,
  liveModelV2,
  panelCell,
  rowsCaption,
  panelColumns,
  safeInternalHref,
  type LiveModel,
  type TriadFigure,
} from "./model";
import { BROKER_FIGURE, POPULATED_DEFAULTS, cursorFor, populatedV1, v1Of, v1Raw, v2Of, v2Populated, v2Unpublished, withRecords, withV1Rows, type PopulatedV1 } from "./live.testbase";

const model = (raw: unknown): LiveModel => liveModelV1(v1Of(raw));

/* ═════════════════════════ L1 · V1 state matrix ═════════════════════════ */

interface State extends PopulatedV1 {
  name: string;
}

function states(): State[] {
  const out: State[] = [];
  for (const state of ["UNAVAILABLE", "MISMATCH", "IN_SYNC"] as const)
    for (const visible of [true, false])
      for (const gap of [true, false, null])
        for (const freshness of ["OK", "STALE", "UNKNOWN"] as const)
          for (const sourceBacked of [true, false]) {
            // Contract: the broker figures are visible only on a verified in-sync verdict.
            if (visible && state !== "IN_SYNC") continue;
            out.push({
              ...POPULATED_DEFAULTS, state, visible, gap, freshness, sourceBacked,
              name: `verdict=${state} visible=${visible} gap=${gap} freshness=${freshness} backed=${sourceBacked}`,
            });
          }
  return out;
}
const MATRIX = states();

function oracle(s: State) {
  const mismatch = s.state === "MISMATCH";
  return {
    mismatch,
    chart: mismatch ? "mismatch" : s.gap === true ? "gap" : "unavailable",
    // MISMATCH and a visible IN_SYNC verdict keep their broker words; with neither, the published `stage_facts` speak: the dark
    // canonical states `Not published (FE-067)` with its reason (LIVE_SOURCE_UNAVAILABLE), no longer the FE's own "Not checked".
    reconciliation: mismatch ? "Mismatch" : s.state === "IN_SYNC" && s.visible ? "Matched" : null,
    blocked: mismatch || s.gap === true,
    notice: !s.sourceBacked ? "unqualified" : s.freshness === "STALE" ? "stale" : !s.visible && !mismatch ? "partial" : null,
    brokerKpi: s.visible ? "metric" : mismatch ? "hidden" : "absent",
  };
}

describe("L1 · the V1 state matrix", () => {
  it("covers every verdict x visibility x gap x freshness x qualification the contract allows", () => {
    // 1 visible state (IN_SYNC) + 3 not-visible = 4 (verdict, visible) pairs; x3 gap x3 freshness x2 backed.
    expect(MATRIX).toHaveLength(4 * 3 * 3 * 2);
    expect(new Set(MATRIX.map((s) => s.name)).size).toBe(MATRIX.length);
  });

  it.each(MATRIX)("$name", (s) => {
    const want = oracle(s);
    const m = model(populatedV1(s));
    expect(m.version).toBe("v1");
    expect(m.mismatch).toBe(want.mismatch);
    expect(m.chart.kind).toBe(want.chart);
    expect(m.spineBlocked).toBe(want.blocked);
    expect(m.notice?.kind ?? null).toBe(want.notice);
    if (want.reconciliation === null) expect(m.chips.reconciliation).toEqual({ state: "not-published", id: "FE-067", reasonCode: "LIVE_SOURCE_UNAVAILABLE" });
    else expect(m.chips.reconciliation).toMatchObject({ state: "flag", label: want.reconciliation });
    expect(m.kpis).toHaveLength(5);
    expect(m.kpis.find((k) => k.key === "broker_equity")?.kind).toBe(want.brokerKpi);
    // "Hidden while the figures disagree" is a claim of disagreement: only a MISMATCH verdict makes it.
    expect(m.triad?.suppressed).toBe(want.mismatch);
    // The broker figure reaches the model only on a visible verdict, in no other state.
    expect(JSON.stringify(m).includes(BROKER_FIGURE)).toBe(s.visible);
    // Freshness is the server's word; UNKNOWN is `not available`, never a green dot.
    if (s.freshness === "UNKNOWN") expect(m.chips.freshness).toMatchObject({ state: "not-available" });
    else expect(m.chips.freshness).toMatchObject({ state: "dot", tone: s.freshness === "OK" ? "ok" : "warn" });
    // Never a running state the source did not state.
    expect(m.chips.runtime).toEqual({ state: "not-published", id: "FE-067", reasonCode: "LIVE_SOURCE_UNAVAILABLE" });
    // The ladder is three rungs in every state: nothing the body says adds or removes one.
    expect(m.ladder).toEqual(LADDER);
    expect(m.ladder.map((r) => r.title)).toEqual(["Halt", "Reduce", "Emergency close"]);
  });

  it("a null gap is not a no-gap: continuity says it could not tell, the gap rule is Not available", () => {
    const m = model(populatedV1({ gap: null }));
    const state = m.continuity.rows.find((r) => r.key === "state")!;
    expect(state.value).toMatchObject({ t: "na" });
    expect(m.continuity.rows.find((r) => r.key === "window")!.value).toMatchObject({ t: "na" });
    expect(m.guardRules.find((r) => r.key === "gap-r4")!.now).toMatchObject({ t: "na" });
    expect(m.chart.kind).toBe("unavailable");
  });

  it("a gap says so, withholds the window as Not published (FE-072) and blocks risk-increasing actions only", () => {
    // `populatedV1` rebuilds `projection_continuity` without `gap_ranges`: a body without the member is typed absence, no reason to show.
    const m = model(populatedV1({ gap: true }));
    expect(m.continuity.rows.find((r) => r.key === "window")!.value).toEqual({ t: "np", fe: "FE-072", what: "Gap window" });
    expect(m.guardRules.find((r) => r.key === "gap-r4")).toMatchObject({ effect: { t: "text", text: "Risk-increasing actions are blocked" }, now: { t: "flag", label: "Active" } });
    expect(m.guardRules.find((r) => r.key === "gap-r3")).toMatchObject({ effect: { t: "text", text: "Protective actions stay open" }, now: { t: "flag", label: "Always" } });
    expect(m.blockers.some((b) => b.text === "Risk-increasing actions are blocked until the gap closes.")).toBe(true);
    expect(m.gapNote).toBe("A gap blocks risk-increasing actions. Protective actions stay open.");
  });

  it("the freshness chip makes no claim from a withheld or failed panel, whatever freshness word it carries", () => {
    const base = populatedV1({ freshness: "OK" });
    expect(model(base).chips.freshness).toMatchObject({ state: "dot", tone: "ok" });
    for (const [state, reason] of [["unavailable", "Source unavailable"], ["suppressed", "Withheld by the server"], ["error", "Source unavailable"]] as const) {
      const raw = JSON.parse(JSON.stringify(base));
      raw.source_panels.internal.panel_state = state;
      expect(model(raw).chips.freshness, state).toEqual({ state: "not-available", reason });
    }
  });

  it("the Triad units come from the read's own money KPIs, never a hard-coded USDT", () => {
    const rows = (unit: string | null) => {
      const raw = populatedV1();
      // The currency fallback is for a body WITHOUT `source_figures`; a body that carries them states its own unit per figure.
      delete raw.source_figures;
      for (const kpi of raw.kpis) if (kpi.key !== "open_orders") kpi.unit = unit;
      return model(raw).triad!.rows;
    };
    expect(rows("USD").filter((r) => r.suffix !== undefined).map((r) => [r.key, r.suffix])).toEqual([["equity", "USD"], ["gross", "USD"]]);
    expect(rows(null).every((r) => r.suffix === undefined)).toBe(true);
    // Two currencies: no unit is guessed.
    const raw = populatedV1();
    delete raw.source_figures;
    raw.kpis[0].unit = "USD";
    raw.kpis[1].unit = "EUR";
    expect(model(raw).triad!.rows.every((r) => r.suffix === undefined)).toBe(true);
    expect(buildTriadRows(null, true).every((r) => r.suffix === undefined)).toBe(true);
    expect(buildTriadRows(null, true, "JPY").filter((r) => r.suffix === "JPY").map((r) => r.key)).toEqual(["equity", "gross"]);
  });

  it.each(["source_side_effect_requested", "runtime_activation_requested", "promotion_execution_requested"])("%s: the notice says Not trusted and outranks every other notice", (flag) => {
    const raw = populatedV1();
    raw[flag] = true;
    expect(model(raw).notice).toMatchObject({ kind: "untrusted" });
    expect(model(raw).notice!.text).toContain("Not trusted");
    const unread = populatedV1();
    delete unread[flag];
    expect(model(unread).notice?.kind).toBe("untrusted");
    expect(model(populatedV1()).notice?.kind).not.toBe("untrusted");
  });

  it("the gap note follows the policy flags: a protective rule that blocks on a gap is never worded as open", () => {
    const raw = populatedV1({ gap: true });
    setPath(raw, ["command_policy", "protective", "source_gap_blocks"], true);
    const m = model(raw);
    expect(m.guardRules.find((r) => r.key === "gap-r3")).toMatchObject({ effect: { t: "text", text: "Protective actions are blocked" } });
    expect(m.gapNote).toBe("A gap blocks risk-increasing actions. Protective actions are blocked too.");
    expect(m.gapNote).not.toContain("stay open");
  });

  it("the gap note says 'not published' for a rule the body does not carry, not that it stays open", () => {
    const raw = populatedV1({ gap: true });
    setPath(raw, ["command_policy", "protective"], null);
    setPath(raw, ["command_policy", "risk_increasing"], null);
    const m = model(raw);
    expect(m.gapNote).toBe("A gap is open; whether it blocks risk-increasing actions is not published. Whether it blocks protective actions is not published.");
    expect(m.gapNote).not.toContain("stay open");
  });

  it("a V2 read carries no guard policy, so no guard rule states an effect: each is Not published, none says blocked or open", () => {
    const m = liveModelV2(v2Of(v2Populated()));
    expect(m.guardProvenance).toEqual(["This read carries no guard policy"]);
    for (const key of ["mismatch", "gap-r4", "gap-r3"]) {
      expect(m.guardRules.find((r) => r.key === key)!.effect).toMatchObject({ t: "np", fe: "FE-072" });
    }
    expect(JSON.stringify(m.guardRules)).not.toMatch(/stay open|are blocked|are hidden/);
  });

  it("names the stage the body states: LIVE_FULL is Live, LIVE_CANARY is Canary with a link and no redirect, anything else is unknown", () => {
    expect(model(populatedV1({ stage: "LIVE_FULL" }))).toMatchObject({ stage: "live", inCanary: false });
    expect(model(populatedV1({ stage: "LIVE_CANARY" }))).toMatchObject({ stage: "canary", inCanary: true });
    expect(model(populatedV1({ stage: "CANARY" }))).toMatchObject({ stage: "canary", inCanary: true });
    expect(model(populatedV1({ stage: "PAPER" }))).toMatchObject({ stage: null, inCanary: false });
    expect(canaryHref("dep_TEST_ONLY_live")).toBe("/deployments/live/dep_TEST_ONLY_live/canary");
    // The lineage names the canary deployment (dep_88 in the canonical body): the node goes there, not to this deployment's own canary page.
    expect(model(populatedV1()).spineTargets.canary).toBe("/deployments/live/dep_88/canary");
  });

  it("runtime (a body WITHOUT stage_facts): only a published word becomes a chip; ACTIVE is a neutral Active (activation is not liveness), RUNNING is Running, HALTED is Halted, a stranger stays Unknown-worded", () => {
    const model = (raw: Draft) => {
      delete raw.stage_facts;
      return liveModelV1(v1Of(raw));
    };
    expect(model(populatedV1({ runtimeState: "ACTIVE" })).chips.runtime).toMatchObject({ state: "flag", kind: "neutral", label: "Active" });
    expect(model(populatedV1({ runtimeState: "RUNNING" })).chips.runtime).toMatchObject({ state: "flag", kind: "ok", label: "Running" });
    expect(model(populatedV1({ runtimeState: "HALTED" })).chips.runtime).toMatchObject({ state: "flag", kind: "attention", label: "Halted" });
    expect(model(populatedV1({ runtimeState: "REDUCING" })).chips.runtime).toMatchObject({ kind: "pending", label: "Reducing" });
    expect(model(populatedV1({ runtimeState: "SOMETHING_NEW" })).chips.runtime).toMatchObject({ kind: "unknown", label: "Something new" });
  });

  it("the published dark body: nothing is a number, Runtime is Not published (FE-067), the source is not qualified", () => {
    const m = model(v1Raw());
    expect(m.notice).toEqual({ kind: "unqualified", text: "Source not qualified." });
    expect(m.kpis.map((k) => [k.key, k.kind])).toEqual([
      ["capital", "not-published"], ["gross_notional", "not-published"], ["daily_pnl", "not-published"], ["open_orders", "not-published"],
      ["broker_equity", "absent"],
    ]);
    expect(m.chips.runtime).toEqual({ state: "not-published", id: "FE-067", reasonCode: "LIVE_SOURCE_UNAVAILABLE" });
    expect(m.chips.freshness).toMatchObject({ state: "not-available" });
    expect(m.chips.reconciliation).toEqual({ state: "not-published", id: "FE-067", reasonCode: "LIVE_SOURCE_UNAVAILABLE" });
    expect(m.chart.kind).toBe("unavailable");
    // The dark body carries `source_figures`, every side `Not published`: the rows are the server's, so `rowsPublished` is true.
    expect(m.triad).toMatchObject({ suppressed: false, internal: {}, broker: null, rowsPublished: true });
    expect(m.triad!.rows.map((r) => r.key)).toEqual(["equity", "gross_notional", "positions", "open_orders", "fees"]);
    expect(m.triad!.rows[0]!.internal).toEqual({ kind: "not-published", id: "FE-072", reasonCode: "LIVE_SOURCE_UNAVAILABLE" });
    expect(m.predecessor).toMatchObject({ present: true, activeFlag: { label: "Not active for Live" } });
  });

  it("V1 rows: the dark body holds none (the panels are unavailable); a V2 body has no V1 rows at all", () => {
    expect(model(v1Raw()).v1Rows).toEqual({ positions: { kind: "withheld", text: "Not available · source unavailable" }, orders: { kind: "withheld", text: "Not available · source unavailable" } });
    expect(liveModelV2(v2Of(v2Populated())).v1Rows).toBeNull();
    const noCollection = v1Raw();
    delete noCollection.positions;
    expect(model(noCollection).v1Rows?.positions).toEqual({ kind: "none" });
  });

  it("V1 rows: a ready, execution-authored collection is the source's own members, exact text, with the server's total", () => {
    const m = model(withV1Rows(populatedV1()));
    const positions = m.v1Rows!.positions;
    if (positions.kind !== "table") throw new Error(positions.kind);
    expect(positions.table.columns.map((c) => c.label)).toEqual(["Instrument", "Side", "Qty", "Entry px", "Reduce only"]);
    expect(positions.table.rows.map((r) => r.cells)).toEqual([["BTCUSDT", "LONG", "0.0120", "64000.10", false], ["ETHUSDT", "SHORT", "1.5000", "3412.50", true]]);
    expect(positions.caption).toBe("2 of 2");
    expect(positions.line).toBeNull();
    const orders = m.v1Rows!.orders;
    if (orders.kind !== "table") throw new Error(orders.kind);
    expect(orders.caption).toBe("1 of 1");
  });

  it("V1 rows: partial and stale say so; unavailable, a failed read and a suppressed envelope hold no rows", () => {
    const line = (state: string) => {
      const p = model(withV1Rows(populatedV1(), "EXECUTION", state)).v1Rows!.positions;
      return p.kind === "table" ? p.line : p.kind === "withheld" ? p.text : p.kind;
    };
    expect(line("partial")).toBe("Partial.");
    expect(line("stale")).toBe("Stale.");
    expect(line("ready")).toBeNull();
    expect(line("empty")).toBeNull();
    expect(line("unavailable")).toBe("Not available · source unavailable");
    expect(line("error")).toBe("Not available · the source read failed");
    expect(line("suppressed")).toBe("Withheld by the server.");
    expect(line("fine")).toBe("Not available · source unavailable");
  });

  it("V1 rows: a BROKER collection is stripped while broker figures are hidden, and named; visible, it is drawn", () => {
    const hidden = liveModelV1(v1Of(withV1Rows(populatedV1({ state: "MISMATCH", visible: false }), "BROKER")));
    expect(hidden.v1Rows!.positions).toEqual({ kind: "withheld", text: "Hidden while the figures disagree." });
    expect(hidden.v1Rows!.orders).toEqual({ kind: "withheld", text: "Hidden while the figures disagree." });
    const unverified = liveModelV1(v1Of(withV1Rows(populatedV1({ state: "UNAVAILABLE", visible: false }), "BROKER")));
    expect(unverified.v1Rows!.positions).toEqual({ kind: "withheld", text: "Not available · broker state not available" });
    expect(liveModelV1(v1Of(withV1Rows(populatedV1(), "BROKER"))).v1Rows!.positions.kind).toBe("table");
    // An EXECUTION collection is the Portal's own and is never withheld by broker suppression.
    expect(liveModelV1(v1Of(withV1Rows(populatedV1({ state: "MISMATCH", visible: false }), "EXECUTION"))).v1Rows!.positions.kind).toBe("table");
  });

  it("rows caption: the server's total, or what is loaded and that the total is not published", () => {
    expect(rowsCaption(2, 2, 2)).toBe("2 of 2");
    expect(rowsCaption(200, 200, 5000)).toBe("200 of 5,000");
    expect(rowsCaption(3, 3, null)).toBe("3 shown · total not published");
    expect(rowsCaption(200, 250, null)).toBe("Top 200 of 250 loaded · total not published");
  });

  it("blockers: a published code is a sentence, the code goes to Provenance, a stranger code is generic and keeps its code", () => {
    const raw = populatedV1();
    setPath(raw, ["lifecycle", "blocker_codes"], ["CANARY_EXIT_EVIDENCE_UNAVAILABLE", "SOMETHING_UNHEARD_OF"]);
    const m = model(raw);
    // lifecycle codes first, then the realtime watch codes the canonical publishes
    expect(m.blockers.map((b) => b.text)).toEqual([
      "Commands are closed on this build.", "Canary exit evidence is not available.", BLOCKER_FALLBACK, "Realtime updates are off.", "Update continuity is not available.",
    ]);
    expect(m.blockers.map((b) => b.code)).toEqual([
      "PRODUCTION_COMMAND_INACTIVE", "CANARY_EXIT_EVIDENCE_UNAVAILABLE", "SOMETHING_UNHEARD_OF", "REALTIME_INACTIVE", "SOURCE_CONTINUITY_UNAVAILABLE",
    ]);
    for (const b of m.blockers) expect(b.text).not.toMatch(/[A-Z]{3,}_[A-Z]/);
    expect(blockerSentence("constructor")).toBe(BLOCKER_FALLBACK);
    expect(blockerSentence("__proto__")).toBe(BLOCKER_FALLBACK);
  });

  it("the predecessor envelope: exact caps, 'Not active for Live' unless the server says so, never 'no Live envelope on record'", () => {
    const m = model(populatedV1());
    if (!m.predecessor.present) throw new Error("the canonical names a predecessor envelope");
    expect(m.predecessor.rows.map((r) => r.key)).toEqual(["capital", "gross", "loss"]);
    expect(m.predecessor.rows[0]!.approved).toEqual({ t: "text", text: "5,000.00 USDT" });
    expect(m.predecessor.rows.every((r) => r.applies.t === "text" && r.applies.text === "No")).toBe(true);
    expect(m.predecessor.meta).toBe("Revision 1 · Draft");
    const raw = populatedV1();
    raw.predecessor_canary_envelope.active_for_live_full = true;
    const live = model(raw);
    if (!live.predecessor.present) throw new Error("present");
    expect(live.predecessor.activeFlag.label).toBe("Active for Live");
    const none = populatedV1();
    none.predecessor_canary_envelope = null;
    expect(model(none).predecessor).toMatchObject({ present: false, reason: "No predecessor Canary envelope was published for this deployment." });
  });

  it("spine links: Canary always; R1, R2 and Sandbox only where the lineage links them with an in-app path", () => {
    const m = model(populatedV1());
    expect(m.spineTargets).toEqual({
      canary: "/deployments/live/dep_88/canary", r1: "/governance/approvals/AP-118/r1", r2: "/governance/approvals/AP-152/r2", sandbox: "/deployments/sandbox/dep_88",
    });
    const raw = populatedV1();
    raw.lineage[1].href = "https://elsewhere.example/x";
    raw.lineage[2].href = "//elsewhere.example/x";
    expect(model(raw).spineTargets.r1).toBeUndefined();
    expect(model(raw).spineTargets.r2).toBeUndefined();
  });
});

describe("links", () => {
  it("only an in-app path is linked", () => {
    expect(safeInternalHref("/execution/operations/inc_TEST_ONLY_1")).toBe("/execution/operations/inc_TEST_ONLY_1");
    for (const bad of [null, undefined, "", "http://x.example", "https://x.example/a", "//x.example", "javascript:alert(1)", "a/b", "/a\\b", "/a\u0000b", `/${"a".repeat(600)}`]) {
      expect(safeInternalHref(bad), String(bad)).toBeNull();
    }
  });
});

/* ═════════════════════════ L1 · the Triad ═════════════════════════ */

describe("the Triad rows", () => {
  it("publishes no figure today: four labelled rows with every cell absent (prints Not available), never a zero", () => {
    const rows = buildTriadRows(null, true);
    expect(rows.map((r) => r.label)).toEqual(["Equity", "Gross exposure", "Positions", "Open orders"]);
    for (const row of rows) {
      expect(row.internal).toBeUndefined();
      expect(row.broker).toBeUndefined();
      expect(row.difference).toBeUndefined();
    }
  });

  const figures: TriadFigure[] = [
    { key: "equity", label: "Equity", suffix: "USDT", internal: { kind: "not-computed", reason: "INTERNAL_PROBE" }, broker: { kind: "not-computed", reason: "BROKER_PROBE" }, difference: { kind: "not-computed", reason: "DIFFERENCE_PROBE" } },
  ];

  it("while the broker figures are visible, all three columns carry their figure", () => {
    const rows = buildTriadRows(figures, true);
    expect(JSON.stringify(rows)).toContain("BROKER_PROBE");
    expect(JSON.stringify(rows)).toContain("DIFFERENCE_PROBE");
  });

  it("while they are not, the Broker and Difference figures are dropped before any component can print them", () => {
    const rows = buildTriadRows(figures, false);
    expect(JSON.stringify(rows)).toContain("INTERNAL_PROBE");
    expect(JSON.stringify(rows)).not.toContain("BROKER_PROBE");
    expect(JSON.stringify(rows)).not.toContain("DIFFERENCE_PROBE");
  });
});

/* ═════════════════════════ L1 · V2 ═════════════════════════ */

describe("L1 · the V2 body", () => {
  it("populated: states what it is not (no runtime, no freshness, no verdict, no figures) and says retained observations only", () => {
    const m = liveModelV2(v2Of(v2Populated()));
    expect(m.version).toBe("v2");
    expect(m.chips.runtime).toEqual({ state: "not-published", id: "FE-067", detail: "Activation not asserted" });
    expect(m.chips.freshness).toEqual({ state: "not-available", reason: "Source clock is not scoped" });
    expect(m.chips.reconciliation).toEqual({ state: "not-available", reason: "Source verdict not asserted" });
    expect(m.kpis.map((k) => k.kind)).toEqual(["not-published", "not-published", "not-published", "not-published", "not-published"]);
    expect(m.notice).toMatchObject({ kind: "retained" });
    expect(m.chart).toEqual({ kind: "unavailable" });
    expect(m.triad).toBeNull();
    expect(m.stage).toBeNull();
    expect(m.inCanary).toBe(false);
    expect(m.mismatch).toBe(false);
    expect(m.blockers.map((b) => b.code)).toEqual(["READ_NOT_COMMAND_AUTHORITY", "SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED", "FINITE_SCOPED_READ_NOT_STREAM_AUTHORITY"]);
    expect(m.blockers[0]!.text).toBe("Commands are closed on this build.");
    expect(m.ladder).toEqual(LADDER);
  });

  it("coverage lists the eleven panels in order with their published state and a sentence for the reason", () => {
    const m = liveModelV2(v2Of(v2Populated()));
    expect(m.coverage.map((c) => c.name)).toEqual([...LIVE_SOURCE_PANELS]);
    expect(m.coverage.find((c) => c.name === "broker_sync")).toMatchObject({ state: "NOT_PUBLISHED", returned: 0, reason: "The broker purpose is not commissioned." });
    expect(m.coverage.find((c) => c.name === "orders")).toMatchObject({ state: "PARTIAL", returned: 1, reason: "Retained observations you are authorized to see, not the full history." });
    for (const c of m.coverage) expect(c.reason).not.toMatch(/[A-Z]{3,}_[A-Z]/);
  });

  it("a body with no retained record is `empty`, said in one line", () => {
    const raw = v2Unpublished();
    const records = LIVE_SOURCE_PANELS.reduce((n, name) => n + raw.data[name].records.length, 0);
    const m = liveModelV2(v2Of(raw));
    expect(m.notice?.kind).toBe(records === 0 ? "empty" : "retained");
    const none = structuredClone(raw);
    for (const name of LIVE_SOURCE_PANELS) {
      none.data[name].state = "NOT_PUBLISHED";
      none.data[name].records = [];
      none.data[name].returned_count = 0;
      none.data[name].has_more = false;
      none.data[name].next_cursor = null;
      none.data[name].previous_cursor = null;
    }
    expect(liveModelV2(v2Of(none)).notice).toEqual({ kind: "empty", text: "No retained observation yet." });
  });

  it("the Canary link of a V2 body is the deployment's own", () => {
    expect(liveModelV2(v2Of(v2Populated())).spineTargets.canary).toBe(`/deployments/live/${v2Populated().deployment_id}/canary`);
  });

  it("liveModelOf: v1 and v2 are models, unsupported is passed through unchanged", () => {
    expect(liveModelOf({ kind: "v1", schemaVersion: null, value: v1Of(v1Raw()) })).toMatchObject({ kind: "model", v2: null });
    const v2 = v2Of(v2Populated());
    expect(liveModelOf({ kind: "v2", schemaVersion: "x", value: v2 })).toMatchObject({ kind: "model", v2 });
    const unsupported = { kind: "unsupported", schemaVersion: "later.v9", reason: "UNKNOWN_SCHEMA_VERSION" } as const;
    expect(liveModelOf(unsupported)).toEqual({ kind: "unsupported", read: unsupported });
  });
});

/* ═════════════════════════ L1 · V2 cells ═════════════════════════ */

describe("retained values", () => {
  const read = v2Of(v2Populated());
  const position = read.panels.positions.records[0]!;

  it("columns are the fields some row carries, in one fixed order; constants of the deployment are not columns", () => {
    const fields = panelColumns(read.panels.positions.records).map((c) => c.field);
    expect(fields.slice(0, 4)).toEqual(["instrument_id", "side", "signed_qty", "quantity"]);
    expect(fields).not.toContain("mode");
    expect(fields).not.toContain("strategy_id");
    expect(fields).not.toContain("deployment_id");
    expect(panelColumns([])).toEqual([]);
  });

  it("a decimal keeps its exact string; an absent value stays absent; a published 0 is a value", () => {
    const entry = panelCell("avg_px_open", position.values.avg_px_open);
    if (entry.kind !== "metric" || entry.metric === null || entry.metric.kind !== "value") throw new Error("a decimal reads as a metric");
    expect(entry.metric.decimal.full).toBe("9007199254740993.123456789123456789");
    expect(panelCell("avg_px_close", position.values.avg_px_close)).toEqual({ kind: "absent" });
    expect(panelCell("avg_px_close", undefined)).toEqual({ kind: "absent" });
    const zero = panelCell("realized_pnl", position.values.realized_pnl);
    if (zero.kind !== "metric" || zero.metric === null || zero.metric.kind !== "value") throw new Error("a published zero is a metric");
    expect(zero.metric.publishedZero).toBe(true);
  });

  it("a counter above 2^53 keeps every digit; a side is a word, not a colour", () => {
    const session = read.panels.sessions.records[0]!;
    const counter = panelCell("submitted_count", session.values.submitted_count);
    if (counter.kind !== "metric" || counter.metric === null || counter.metric.kind !== "value") throw new Error("a counter reads as a metric");
    expect(counter.metric.decimal.full).toBe("9007199254740993");
    expect(panelCell("side", { kind: "text", text: "LONG" })).toEqual({ kind: "side", label: "Long" });
    expect(panelCell("status", { kind: "text", text: "PARTIALLY_FILLED" })).toEqual({ kind: "text", text: "Partially filled" });
    expect(panelCell("instrument_id", { kind: "text", text: "TEST_ONLY:BTC-USDT" })).toEqual({ kind: "text", text: "TEST_ONLY:BTC-USDT" });
  });
});

/* ═════════════════════════ caption ═════════════════════════ */

describe("the caption of a capped, keyset-paged list", () => {
  it("never presents a page size as a total", () => {
    expect(capCaption({ shown: 200, loaded: 200, total: null, hasMore: true, noun: "orders" })).toBe("200 orders loaded · total not published · more available");
    expect(capCaption({ shown: 200, loaded: 400, total: null, hasMore: false, noun: "orders" })).toBe("Top 200 of 400 orders loaded · total not published · no further page");
    expect(capCaption({ shown: 1, loaded: 1, total: null, hasMore: false, noun: "positions" })).toBe("1 positions loaded · total not published · no further page");
  });

  it("with a published total: 'Top N of total', or the whole total when everything is drawn", () => {
    expect(capCaption({ shown: 200, loaded: 200, total: 340, hasMore: true, noun: "rows" })).toBe("Top 200 of 340 rows · more available");
    expect(capCaption({ shown: 40, loaded: 40, total: 40, hasMore: false, noun: "rows" })).toBe("40 rows · no further page");
    expect(ROW_CAP).toBe(200);
  });
});

/* ═════════════════════════ L2 · scale ═════════════════════════ */

const BUDGET_MODEL_MS = 600;

describe("L2 · scale", () => {
  it("ten panels of 200 records: the model and every column set stay inside the budget", () => {
    let raw = v2Populated();
    LIVE_SOURCE_PANELS.filter((name) => name !== "broker_sync").forEach((name, index) => {
      raw = withRecords(raw, name, 200, cursorFor(name, index + 1), index * 1000);
    });
    const read = v2Of(raw);
    const { value, ms } = timed(() => {
      const m = liveModelV2(read);
      for (const name of LIVE_SOURCE_PANELS) panelColumns(read.panels[name].records);
      return m;
    });
    expect(ms).toBeLessThan(BUDGET_MODEL_MS);
    expect(value.coverage.filter((c) => c.hasMore)).toHaveLength(10);
    expect(value.coverage.reduce((n, c) => n + c.returned, 0)).toBe(2000);
  });

  it("a body of about 1 MiB (long identifiers on every record) reads and models inside the budget", () => {
    let raw = v2Populated();
    raw = withRecords(raw, "orders", 200, null);
    for (const record of raw.data.orders.records) record.values.instrument_id = "X".repeat(4000);
    for (const name of ["positions", "fills"] as const) {
      raw = withRecords(raw, name, 200, null);
      for (const record of raw.data[name].records) record.values.instrument_id = "Y".repeat(4000);
    }
    expect(serializedBytes(raw)).toBeGreaterThan(MIB);
    const { value, ms } = timed(() => liveModelOf({ kind: "v2", schemaVersion: "x", value: v2Of(raw) }));
    expect(ms).toBeLessThan(BUDGET_MODEL_MS * 2);
    expect(value.kind).toBe("model");
  });
});

/* ═════════════════════════ L3 · negative ═════════════════════════ */

/** The model of whatever the dispatcher makes of a payload: it never throws and never leaks its probe. */
function modelOfBody(raw: unknown): unknown {
  const read = readLiveFullByVersion(raw);
  return liveModelOf(read);
}

describe("L3 · negative", () => {
  const V1 = v1Raw();
  const V2 = v2Populated();
  const cases = [
    ...rootCases(),
    ...schemaVersionCases(V1, ["schema_version"], "execution.live-full-operations.v1", ["portal.execution.live-source-operations.v2", "execution.canary-control-room.v1", "later.v9"]),
    ...schemaVersionCases(V2, ["schema_version"], "portal.execution.live-source-operations.v2", ["execution.live-full-operations.v1", "later.v9"]),
    ...enumCases(V1, ["broker_consistency", "state"], ["UNAVAILABLE", "MISMATCH", "IN_SYNC"]),
    ...enumCases(V1, ["source_integration_state"], ["UNAVAILABLE", "SOURCE_BACKED"]),
    ...enumCases(V1, ["projection_continuity", "state"], ["UNAVAILABLE", "CONTIGUOUS", "GAP"]),
    ...decimalCases(V1, ["predecessor_canary_envelope", "limits", "capital_cap"]),
    ...decimalCases(V1, ["kpis", 0, "value"]),
    ...requiredCases(V1, [["deployment"], ["broker_consistency"], ["command_policy"], ["kpis"], ["source_panels"], ["lifecycle"]]),
    ...arrayCases(V1, ["kpis"]),
    ...decimalCases(V2, ["data", "positions", "records", 0, "values", "avg_px_open"]),
    ...enumCases(V2, ["data", "orders", "state"], ["PARTIAL", "NOT_PUBLISHED"]),
    ...requiredCases(V2, [["data"], ["runtime"], ["commands"], ["data", "orders", "records"]]),
    ...pollutionCases(V1, [["broker_consistency"], ["kpis", 0], ["source_panels", "broker"]]),
    ...pollutionCases(V2, [["data", "orders"], ["data", "positions", "records", 0, "values"]]),
  ];

  it("generates a real number of cases", () => {
    expect(cases.length).toBeGreaterThan(60);
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    let built: unknown;
    expect(() => {
      built = modelOfBody(c.value);
    }).not.toThrow();
    expect(leaked(built, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
  });

  it("an unknown verdict or continuity word never becomes a match or a clean update stream", () => {
    const raw = populatedV1({ state: "IN_SYNC" });
    raw.broker_consistency.state = "ALMOST_IN_SYNC";
    delete raw.stage_facts;
    const m = model(raw);
    expect(m.chips.reconciliation).toMatchObject({ label: "Not checked" });
    expect(m.triad?.suppressed).toBe(false);
    raw.projection_continuity.state = "MOSTLY_FINE";
    raw.projection_continuity.gap_detected = null;
    expect(model(raw).continuity.flag).toMatchObject({ kind: "unknown", label: "Mostly fine" });
  });

  it("broker_values_visible absent or not exactly `true` never lets a broker figure through", () => {
    for (const visible of [undefined, null, "true", 1, "yes", [], {}, false]) {
      const raw = populatedV1();
      if (visible === undefined) delete raw.broker_consistency.broker_values_visible;
      else raw.broker_consistency.broker_values_visible = visible;
      const m = model(raw);
      expect(JSON.stringify(m).includes(BROKER_FIGURE), String(JSON.stringify(visible))).toBe(false);
      expect(m.kpis.find((k) => k.key === "broker_equity")!.kind).not.toBe("metric");
      expect(m.triad?.broker).toBeNull();
    }
  });

  it("a malformed decimal is 'unreadable', not a number: nothing is parsed with Number()", () => {
    const raw = populatedV1();
    raw.kpis[0].value = "1e5";
    const kpi = model(raw).kpis[0]!;
    expect(kpi.kind).toBe("metric");
    expect(kpi.metric).toBeNull();
  });

  it("a V2 body carrying the V1 version, or the reverse, is refused whole, never read as half of either", () => {
    expect(modelOfBody({ ...v2Populated(), schema_version: "execution.live-full-operations.v1" })).toMatchObject({ kind: "unsupported" });
    expect(modelOfBody({ ...v1Raw(), schema_version: "portal.execution.live-source-operations.v2" })).toMatchObject({ kind: "unsupported", read: { reason: "V2_MALFORMED" } });
  });
});
