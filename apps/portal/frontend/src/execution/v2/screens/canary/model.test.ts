/**
 * The Canary view-model: every sentence the screen prints about a figure.
 * Lane: bodies through the real dispatcher and reader (FIXTURE_LAB for the lit bodies).
 */
import { describe, expect, it } from "vitest";

import { readCanaryByVersion } from "../../readers/dispatch";
import { STAGE_WHY } from "../stage/reasons";
import {
  BLOCKER_SENTENCES,
  DECISIONS,
  DRAFT_ENVELOPE_BLOCKER,
  KPI_LABEL,
  ROW_CAP,
  UNTRANSLATED_BLOCKER,
  bannersOf,
  blockerItems,
  chipsOf,
  decisionReason,
  envelopeColumn,
  freshnessChip,
  guardRows,
  guardSentence,
  kpiCells,
  limitRows,
  panelLine,
  rollbackHead,
  rollbackItems,
  subtitleIds,
  trialOf,
} from "./model";
import { countLine } from "./parts";
import { readCanaryView, type CanaryView } from "./readCanary";
import { parentBody, populatedV1, v1Body } from "./canary.testbase";

function viewOf(raw: unknown): CanaryView {
  const result = readCanaryView(readCanaryByVersion(raw));
  if (result.kind !== "view") throw new Error(result.text);
  return result.view;
}

describe("header chips (D13): a source that does not publish is a request id, never a green word", () => {
  it("dark V1: Runtime FE-067, Reconciliation FE-072, freshness not available", () => {
    const chips = chipsOf(viewOf(v1Body()));
    expect(chips.runtime).toEqual({ state: "not-published", id: "FE-067" });
    expect(chips.reconciliation).toEqual({ state: "not-published", id: "FE-072" });
    expect(chips.freshness).toEqual({ state: "not-available", reason: "Broker source unavailable" });
  });

  it("a lit broker: Fresh with its own time; stale is a warn dot, not a green one", () => {
    expect(freshnessChip(viewOf(populatedV1()))).toEqual({ state: "dot", tone: "ok", text: "Fresh · 17 Oct 12:04Z" });
    expect(freshnessChip(viewOf(populatedV1({ brokerFreshness: "STALE" })))).toEqual({ state: "dot", tone: "warn", text: "Stale · 17 Oct 12:04Z" });
    expect(freshnessChip(viewOf(populatedV1({ brokerFreshness: "AGING" })))).toMatchObject({ tone: "warn" });
    expect(freshnessChip(viewOf(populatedV1({ brokerFreshness: "UNKNOWN" })))).toEqual({ state: "not-available", reason: "Freshness is not stated" });
  });

  it("no Running chip without a published runtime word; an unknown word is a neutral dot", () => {
    expect(chipsOf(viewOf(populatedV1())).runtime.state).toBe("not-published");
    const body = populatedV1();
    body.lifecycle.runtime_state = "SPINNING";
    // The V1 reader keeps a string runtime word; the schema pins null, so this is a reader-level case.
    const view = viewOf(body);
    expect(view.runtimeState).toBe("SPINNING");
    expect(chipsOf(view).runtime).toEqual({ state: "dot", tone: "mute", text: "SPINNING" });
    body.lifecycle.runtime_state = "RUNNING";
    expect(chipsOf(viewOf(body)).runtime).toEqual({ state: "flag", kind: "ok", label: "Running" });
  });

  it("V2 body: no source panel in the response", () => {
    expect(chipsOf(viewOf(parentBody())).freshness).toEqual({ state: "not-available", reason: "No source panel in this response" });
  });
});

describe("trial", () => {
  it("day N of M only when both are stated; ticks are the duration (at most 90)", () => {
    expect(trialOf(viewOf(populatedV1()))).toEqual({ kind: "day", day: 6, total: 14, ticks: 14 });
    expect(trialOf(viewOf(v1Body()))).toEqual({ kind: "unstated", durationDays: 14, proposed: false });
    expect(trialOf(viewOf(parentBody()))).toEqual({ kind: "unstated", durationDays: 7, proposed: true });
  });
});

describe("KPI cells", () => {
  it("dark V1: five `absent` cells with a reason, none a number", () => {
    const cells = kpiCells(viewOf(v1Body()));
    expect(cells.map((c) => c.label)).toEqual(Object.values(KPI_LABEL));
    for (const cell of cells) expect(cell).toMatchObject({ kind: "absent", reason: "source unavailable" });
  });

  it("lit V1: money carries its currency, the count carries none, PnL is signed, the basis is the cap printed, never a percentage", () => {
    const cells = kpiCells(viewOf(populatedV1()));
    const byKey = Object.fromEntries(cells.map((c) => [c.key, c]));
    expect(byKey.capital_consumed).toMatchObject({ kind: "metric", suffix: "USDT", signed: false, basis: "Proposed cap 5,000.00" });
    expect(byKey.gross_notional).toMatchObject({ basis: "Proposed cap 10,000.00" });
    expect(byKey.daily_pnl).toMatchObject({ signed: true, basis: "Daily loss cap 250.00" });
    expect(byKey.open_orders).toMatchObject({ suffix: undefined, basis: "Max 20" });
    expect(JSON.stringify(cells)).not.toMatch(/\d%/);
  });

  it("a partial panel keeps its value, marked partial, and is never toned", () => {
    const body = populatedV1();
    body.kpis[2].envelope.panel_state = "partial";
    const cell = kpiCells(viewOf(body)).find((c) => c.key === "daily_pnl")!;
    expect(cell).toMatchObject({ kind: "metric", metric: { kind: "value", partial: true, tone: "neutral" } });
  });

  it("a stale panel says so in the basis", () => {
    const body = populatedV1();
    body.kpis[0].envelope.panel_state = "stale";
    expect(kpiCells(viewOf(body))[0]).toMatchObject({ basis: "Proposed cap 5,000.00 · Stale · as of 17 Oct 12:04Z" });
  });

  it("V2 body: all five are Not published (FE-072)", () => {
    for (const cell of kpiCells(viewOf(parentBody()))) expect(cell).toMatchObject({ kind: "not-published", fe: "FE-072" });
  });
});

describe("envelope", () => {
  it("a draft is Proposed, never Approved", () => {
    expect(envelopeColumn(viewOf(v1Body()))).toBe("Proposed");
    expect(envelopeColumn(viewOf(parentBody()))).toBe("Proposed");
    const body = v1Body();
    body.envelope.status = "ACTIVE";
    expect(envelopeColumn(viewOf(body))).toBe("Approved");
    body.envelope.status = "SOMETHING_NEW";
    expect(envelopeColumn(viewOf(body))).toBe("Envelope");
  });

  it("five caps in the hi-fi's order, money rows named with the published currency", () => {
    const rows = limitRows(viewOf(v1Body()));
    expect(rows.map((r) => r.label)).toEqual(["Capital cap (USDT)", "Gross notional cap (USDT)", "Daily loss cap (USDT)", "Open orders (max)", "Duration (days)"]);
    expect(rows.every((r) => r.usedRatio === undefined)).toBe(true);
  });
});

describe("what is blocking", () => {
  it("every published code has a sentence; the code is never in the sentence", () => {
    const items = blockerItems(viewOf(v1Body()));
    expect(items.length).toBeGreaterThanOrEqual(4);
    for (const item of items) {
      expect(item.code).not.toBeNull();
      expect(item.text).toBe(BLOCKER_SENTENCES[item.code!]);
      expect(item.text).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/);
    }
  });

  it("a code this build has no sentence for gets the one generic sentence and keeps its code for Provenance", () => {
    const body = v1Body();
    body.lifecycle.blocker_codes = ["SOMETHING_NEW_FROM_THE_SERVER"];
    const item = blockerItems(viewOf(body))[0];
    expect(item).toMatchObject({ text: UNTRANSLATED_BLOCKER, code: "SOMETHING_NEW_FROM_THE_SERVER" });
  });

  it("V2 body: the draft status and the closed production command, each from a published field", () => {
    expect(blockerItems(viewOf(parentBody())).map((i) => i.text)).toEqual([DRAFT_ENVELOPE_BLOCKER, BLOCKER_SENTENCES.PRODUCTION_COMMAND_INACTIVE]);
  });

  it("an empty list stays empty: it is not a claim that nothing blocks", () => {
    const view = viewOf(populatedV1());
    expect(blockerItems({ ...view, blockers: [] })).toEqual([]);
  });
});

describe("decisions (D6, D9): all four, none enabled, one reason from the dictionary", () => {
  it("Hold, Reduce, Rollback, Request scale", () => {
    expect(DECISIONS.map((d) => d.label)).toEqual(["Hold", "Reduce", "Rollback", "Request scale"]);
    for (const d of DECISIONS) expect(decisionReason(d)).toBe(STAGE_WHY.liveClosed);
  });
});

describe("rollback readiness", () => {
  it("four items; only broker data is a stated fact, the other three are Not published (FE-071)", () => {
    const items = rollbackItems(viewOf(populatedV1()));
    expect(items.map((i) => i.label)).toEqual(["Flatten plan prepared", "Paper twin running", "Broker data fresh", "Last rollback drill"]);
    expect(items.filter((i) => i.status.kind === "not-published").map((i) => i.key)).toEqual(["flatten", "twin", "drill"]);
    expect(items[2]).toMatchObject({ status: { kind: "flag", flag: "ok", label: "Fresh" }, checked: "17 Oct 12:04Z", checkedWord: "Last update" });
    for (const item of items.filter((i) => i.key !== "broker")) expect(item.checked).toBeNull();
  });

  it("stale broker is a stale flag; dark broker is not available with no date", () => {
    expect(rollbackItems(viewOf(populatedV1({ brokerFreshness: "STALE" })))[2].status).toEqual({ kind: "flag", flag: "stale", label: "Stale" });
    expect(rollbackItems(viewOf(v1Body()))[2]).toMatchObject({ status: { kind: "flag", flag: "na", label: "Not available" }, checked: null });
  });

  it("the head never says Ready: dark is Not available, a reported panel is Not published, V2 is Not published", () => {
    expect(rollbackHead(viewOf(v1Body()))).toEqual({ kind: "flag", flag: "na", label: "Not available" });
    const reported = populatedV1();
    reported.rollback_readiness.envelope.panel_state = "ok";
    expect(rollbackHead(viewOf(reported))).toEqual({ kind: "not-published" });
    expect(rollbackHead(viewOf(parentBody()))).toEqual({ kind: "not-published" });
  });
});

describe("guard rule: the asymmetry from the two groups' own flags", () => {
  it("scale-up blocked, protective allowed (the published policy)", () => {
    const [row] = guardRows(viewOf(populatedV1({ brokerFreshness: "STALE" })));
    expect(row.scaleUp).toEqual({ flag: "attention", label: "Blocked" });
    expect(row.protective).toEqual({ flag: "ok", label: "Allowed" });
    expect(row.now).toEqual({ flag: "stale", label: "Stale" });
    expect(guardSentence(viewOf(v1Body()))).toContain("blocks scale-up and does not block protective actions");
  });

  it("an unreadable flag blocks (fail closed); a missing policy is Not available", () => {
    const body = v1Body();
    delete body.command_policy.protective.broker_sync_blocks;
    const view = viewOf(body);
    expect(view.protective).toEqual({ brokerSyncBlocks: true });
    expect(guardSentence(view)).toContain("blocks every action");
    expect(guardRows(viewOf(parentBody()))[0].scaleUp).toEqual({ flag: "na", label: "Not available" });
    expect(guardSentence(viewOf(parentBody()))).toBe("The guard rule for this deployment was not published.");
  });
});

describe("banners", () => {
  it("a stale broker with the published asymmetry says what stays open", () => {
    const keys = bannersOf(viewOf(populatedV1({ brokerFreshness: "STALE" })));
    expect(keys.map((b) => b.key)).toEqual(["guarded"]);
    expect(keys[0].text).toBe("Broker data is stale. Scale-up is blocked. Protective actions stay open.");
  });

  it("a V2 body says it states the proposal only; a partial panel is worded; a clean lit body has none", () => {
    expect(bannersOf(viewOf(parentBody())).map((b) => b.key)).toEqual(["proposal"]);
    const body = populatedV1();
    body.kpis[1].envelope.panel_state = "partial";
    expect(bannersOf(viewOf(body)).map((b) => b.key)).toEqual(["partial"]);
    expect(bannersOf(viewOf(populatedV1()))).toEqual([]);
  });

  it("a deployment that does not declare Canary is told so", () => {
    const body = v1Body();
    body.deployment.declared_environment = "LIVE";
    body.lifecycle.declared_stage = "LIVE";
    expect(bannersOf(viewOf(body)).map((b) => b.key)).toContain("stage");
  });
});

describe("small words", () => {
  it("panel lines and subtitle ids", () => {
    expect(panelLine(null)).toBe("Not in this response");
    expect(panelLine(viewOf(v1Body()).series)).toBe("Source unavailable");
    expect(subtitleIds(viewOf(v1Body()))).toEqual(["BINANCE", "Portfolio pf_crypto", "Account acct_canary_grid"]);
    expect(subtitleIds(viewOf(parentBody()))).toEqual(["Portfolio pf_TEST_ONLY_parent"]);
  });

  it("'N of total': the cap is stated, an unknown total is stated, the cut is stated", () => {
    expect(ROW_CAP).toBe(200);
    expect(countLine(2, 2, 200)).toBe("2 of 2");
    expect(countLine(250, 5000, 200)).toBe("200 of 5,000");
    expect(countLine(250, null, 200)).toBe("Top 200 of 250 loaded · total not published");
    expect(countLine(3, null, 200)).toBe("3 shown · total not published");
  });
});
