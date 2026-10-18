/**
 * Overview model, L0 to L3 on the command-center snapshot (five canonical
 * variants) and the Fleet summary it reads current facts from.
 */
import { describe, expect, it } from "vitest";

import { readAlphaFleet } from "../../../api/profileRead";
import { readCommandCenter } from "../../../commandCenter";
import { INITIAL_SUBSCRIPTION } from "../../../subscription";
import { canonicalDigest, loadCanonical } from "../../testkit/loadCanonical";
import { ABSENT, dimension, pairwise, coverage, describeCoverage, type Draft } from "../../testkit/matrix";
import { decimalCases, enumCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases } from "../../testkit/negative";
import { cloneRows, pad, timed } from "../../testkit/scale";
import {
  ROW_CAP, ageLabel, currencyFacts, fleetCells, modeOf, needsAttention, openIncidents, ownRows, stageCounts, streamSentence, todayRows, triageRows,
} from "./overviewModel";

const VARIANTS = ["busy", "empty", "partial", "stale", "unavailable"] as const;
const NAMES = VARIANTS.map((v) => `execution-command-center.${v}`);
const FLEET = "execution-alpha-fleet-list.v2";
const digests = [...NAMES, FLEET].map((n) => [n, canonicalDigest(n)] as const);
const snapshotOf = (v: (typeof VARIANTS)[number]) => readCommandCenter(loadCanonical(`execution-command-center.${v}`))!;
const stamp = (iso: string) => iso;

describe("L0 canonical snapshots", () => {
  it("reads all five", () => {
    for (const v of VARIANTS) expect(snapshotOf(v), v).not.toBeNull();
  });
  it("leaves the files as it found them", () => {
    for (const [name, digest] of digests) expect(canonicalDigest(name), name).toBe(digest);
  });
});

describe("triage", () => {
  it("keeps the server's order and adds no second ranking", () => {
    const rows = triageRows(snapshotOf("busy").needsYou, stamp);
    expect(rows.map((r) => r.id)).toEqual(["inc_44", "op_1251", "AP-352"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    const shuffled = snapshotOf("busy").needsYou!;
    const reversed = { ...shuffled, items: [...shuffled.items].reverse() };
    expect(triageRows(reversed, stamp).map((r) => r.id)).toEqual(["AP-352", "op_1251", "inc_44"]);
  });
  it("words the deadline with the server's state and time, never a ticking clock", () => {
    const [first] = triageRows(snapshotOf("busy").needsYou, (iso) => `T(${iso})`);
    expect(first!.sla).toBe("Overdue (since T(2026-08-22T11:58:00.000Z))");
    expect(first!.age).toBe("10 min");
  });
  it("an item with no deadline says none was published", () => {
    const base = snapshotOf("busy").needsYou!;
    const [row] = triageRows({ ...base, items: [{ ...base.items[0]!, slaState: null, slaDueAt: null }] }, stamp);
    expect(row!.sla).toBe("No deadline published");
  });
  it("age labels are coarse words with units and never negative", () => {
    expect(ageLabel(30)).toBe("1 min");
    expect(ageLabel(7200)).toBe("2 h");
    expect(ageLabel(172800)).toBe("2 d");
    expect(ageLabel(-5)).toBeNull();
    expect(ageLabel(null)).toBeNull();
  });
  it("is empty for no panel", () => {
    expect(triageRows(null, stamp)).toEqual([]);
  });
});

describe("counts keep their exactness", () => {
  it("busy: the panel's own sentence, and a window is 'at least'", () => {
    const needs = snapshotOf("busy").needsYou;
    expect(needsAttention(needs)).toEqual({ text: "3 of 214", approximate: true });
    expect(openIncidents(needs)).toEqual({ value: 1, atLeast: true });
  });
  it("quiet: an exact zero is a zero", () => {
    const needs = snapshotOf("empty").needsYou;
    expect(needsAttention(needs)).toEqual({ text: "0", approximate: false });
    expect(openIncidents(needs)).toEqual({ value: 0, atLeast: false });
  });
  it("partial: a floor keeps its tilde", () => {
    const needs = snapshotOf("partial").needsYou;
    expect(needsAttention(needs).text).toBe("~1 seen");
    expect(openIncidents(needs)).toEqual({ value: 0, atLeast: true });
  });
  it("unavailable: not counted, never 0", () => {
    const needs = snapshotOf("unavailable").needsYou;
    expect(needsAttention(needs)).toEqual({ text: null, approximate: false });
    expect(openIncidents(needs)).toEqual({ value: null, atLeast: false });
    expect(needsAttention(null)).toEqual({ text: null, approximate: false });
    expect(openIncidents(null).value).toBeNull();
  });
});

describe("mode", () => {
  it("busy only with ranked items; quiet only when the server says so and the list is empty", () => {
    expect(modeOf(snapshotOf("busy").needsYou, "BUSY")).toBe("busy");
    expect(modeOf(snapshotOf("empty").needsYou, "QUIET")).toBe("quiet");
    expect(modeOf(snapshotOf("partial").needsYou, "DEGRADED")).toBe("degraded");
    expect(modeOf(snapshotOf("stale").needsYou, "BUSY")).toBe("degraded");
    expect(modeOf(snapshotOf("unavailable").needsYou, "DEGRADED")).toBe("degraded");
    expect(modeOf(null, null)).toBe("unknown");
  });
  it("an empty list the server did not call quiet is not called quiet", () => {
    const base = snapshotOf("empty").needsYou!;
    expect(modeOf({ ...base, state: "ok", items: [] }, null)).toBe("unknown");
    expect(modeOf({ ...base, state: "ok", items: [] }, "QUIET")).toBe("quiet");
  });
});

describe("fleet cells and today", () => {
  it("keeps a null cell null", () => {
    expect(fleetCells(snapshotOf("unavailable").fleet).every((c) => c.value === null)).toBe(true);
    expect(fleetCells(snapshotOf("busy").fleet).find((c) => c.label === "Live")!.value).toBe(42);
    expect(fleetCells(null)).toEqual([]);
  });
  it("today is the panel's items in order", () => {
    expect(todayRows(snapshotOf("busy").today).map((i) => i.kind)).toEqual(["REVIEW_DUE", "CONDITION_EXPIRY", "VERIFIED_OPERATION"]);
    expect(todayRows(null)).toEqual([]);
  });
});

describe("current facts per currency", () => {
  const summary = (over: Draft = {}) => {
    const raw = loadCanonical<Draft>(FLEET);
    raw.summary = { ...raw.summary, ...over };
    return readAlphaFleet(raw)!.summary!;
  };
  it("one row per currency present in any list, sorted, a missing cell stays missing", () => {
    const rows = currencyFacts(summary({
      allocation_by_currency: [{ currency: "USDT", value: "1000.50" }],
      exposure_by_currency: [{ currency: "USD", value: "20" }, { currency: "USDT", value: "5" }],
      current_position_pnl_by_currency: [{ currency: "VND", realized: "1", unrealized: "0", net: "1" }],
    }));
    expect(rows.map((r) => r.currency)).toEqual(["USD", "USDT", "VND"]);
    expect(rows[0]).toMatchObject({ allocation: null, exposure: { full: "20" }, netPositionPnl: null });
    expect(rows[1]!.allocation).toMatchObject({ full: "1000.50", display: "1,000.50" });
    expect(rows[2]!.exposure).toBeNull();
  });
  it("has no total row and no cross-currency sum", () => {
    const rows = currencyFacts(summary({ allocation_by_currency: [{ currency: "USDT", value: "10" }, { currency: "USD", value: "10" }] }));
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.currency.toLowerCase().includes("total"))).toBe(false);
    expect(rows.every((r) => r.allocation!.full === "10")).toBe(true);
  });
  it("a digit the display would hide stays on the full string", () => {
    const [row] = currencyFacts(summary({ current_position_pnl_by_currency: [{ currency: "USD", realized: "0", unrealized: "0", net: "0.00001234" }], allocation_by_currency: [], exposure_by_currency: [] }));
    expect(row!.netPositionPnl).toMatchObject({ display: "0.00001234", full: "0.00001234" });
  });
  it("a string longer than any real amount is refused before it reaches BigInt arithmetic", () => {
    const [row] = currencyFacts(summary({ allocation_by_currency: [{ currency: "USDT", value: "9".repeat(70_000) }], exposure_by_currency: [], current_position_pnl_by_currency: [] }));
    expect(row!.allocation).toBeNull();
  });
  it("no summary, no rows", () => {
    expect(currencyFacts(null)).toEqual([]);
  });
  it("stage counts follow the lifecycle order, unknown stages after", () => {
    expect(stageCounts(summary({ stage_counts: { LIVE: 2, ZED: 1, PAPER: 5, CANARY: 3 } })).map((s) => s.stage)).toEqual(["PAPER", "CANARY", "LIVE", "ZED"]);
    expect(stageCounts(null)).toEqual([]);
  });
});

describe("the stream in words", () => {
  const at = (over: Partial<typeof INITIAL_SUBSCRIPTION>) => streamSentence({ ...INITIAL_SUBSCRIPTION, ...over });
  it("only a delivering stream says Live", () => {
    expect(at({ phase: "live", freshness: "OK" })).toEqual({ text: "Live, ok", tone: "live" });
    for (const phase of ["idle", "snapshotting", "reconnecting", "gap", "epoch_changed", "auth_expired", "source_lost", "failed"] as const) {
      expect(at({ phase }).text, phase).not.toMatch(/^Live/);
    }
  });
  it("a gap and a rebuild say the values are the last good read", () => {
    for (const phase of ["gap", "epoch_changed"] as const) expect(at({ phase }).text).toContain("last good read, not the current state");
  });
  it("auth expiry and source loss keep the server's note and the last good time", () => {
    expect(at({ phase: "auth_expired", note: "Session expired (401)." }).text).toBe("Session expired (401).");
    expect(at({ phase: "source_lost", note: "Source gone.", lastGoodAsOf: "2026-10-17T11:00:00Z" }).text).toBe("Source gone. Last good as of 2026-10-17T11:00:00Z.");
  });
});

describe("researcher rows", () => {
  it("one row per alpha with its own currencies, capped at the DOM budget", () => {
    const raw = loadCanonical<Draft>(FLEET);
    raw.page.rows = cloneRows(raw.page.rows[0], 260, (row, i) => { row.alpha_id = `a_${pad(i)}`; });
    const items = readAlphaFleet(raw)!.page.rows;
    const { value, ms } = timed(() => ownRows(items));
    expect(value).toHaveLength(ROW_CAP);
    expect(ms).toBeLessThan(500);
    expect(value[0]!.allocations[0]!.currency).toBe("USDT");
  });
});

describe("L1 matrix: panel states x counts x truncation", () => {
  const base = loadCanonical<Draft>("execution-command-center.busy");
  const dims = [
    dimension("state", ["panels", "needs_you", "panel_state"], ["ready", "empty", "partial", "stale", "unavailable"]),
    dimension("exact", ["panels", "needs_you", "exact_total"], [true, false, ABSENT]),
    dimension("total", ["panels", "needs_you", "total_count"], [214, 0, null]),
    dimension("truncated", ["panels", "needs_you", "truncated"], [true, false, null]),
    dimension("mode", ["mode"], ["BUSY", "QUIET", "DEGRADED", ABSENT]),
  ];
  const states = pairwise(base, dims);
  it(describeCoverage("overview needs-you", coverage(dims, states)), () => {
    expect(states.length).toBeGreaterThan(8);
  });
  it("never invents a zero or a total, and never calls a degraded panel quiet", () => {
    for (const s of states) {
      const snap = readCommandCenter(s.value)!;
      const needs = snap.needsYou!;
      const count = needsAttention(needs);
      if (needs.state === "unavailable") expect(count.text, s.name).toBeNull();
      if (count.text === "0") expect(needs.counts.exactTotal && needs.counts.total === 0, s.name).toBe(true);
      const mode = modeOf(needs, snap.mode);
      if (needs.state === "partial" || needs.state === "stale" || needs.state === "unavailable") expect(mode, s.name).toBe("degraded");
      if (mode === "quiet") expect(needs.items.length, s.name).toBe(0);
      const incidents = openIncidents(needs);
      if (incidents.value !== null && !incidents.atLeast) expect(needs.counts.exactTotal && needs.counts.truncated === false, s.name).toBe(true);
    }
  });
});

describe("L3 negative", () => {
  const base = loadCanonical<Draft>(FLEET);
  const cases = [
    ...decimalCases(base, ["summary", "allocation_by_currency", 0, "value"]),
    ...decimalCases(base, ["summary", "current_position_pnl_by_currency", 0, "net"]),
    ...enumCases(base, ["summary", "metric_basis"], ["CURRENT_SOURCE_FACTS"]),
    ...requiredCases(base, [["summary"], ["summary", "stage_counts"], ["summary", "allocation_by_currency"]]),
    ...pollutionCases(base, [[], ["summary"], ["summary", "stage_counts"]]),
    ...rootCases(),
  ];
  it("a refused summary shows no currency rather than a wrong one", () => {
    for (const c of cases) {
      let facts: ReturnType<typeof currencyFacts> = [];
      expect(() => { facts = currencyFacts(readAlphaFleet(c.value)?.summary ?? null); }, c.name).not.toThrow();
      expect(leaked(facts, c.probe), c.name).toBe(false);
      for (const row of facts) for (const cell of [row.allocation, row.exposure, row.netPositionPnl]) if (cell) expect(cell.full, c.name).toMatch(/^-?(0|[1-9]\d*)(\.\d+)?$/);
    }
    expect(prototypeIsClean()).toBe(true);
  });
  it("a body that is not an object reads as no snapshot, and an object with no panels counts nothing", () => {
    for (const c of rootCases()) {
      const snap = readCommandCenter(c.value);
      if (snap === null) continue;
      // A bare object is a snapshot with no panels: nothing is counted, nothing is quiet.
      expect(snap.needsYou, c.name).toBeNull();
      expect(needsAttention(snap.needsYou).text, c.name).toBeNull();
      expect(modeOf(snap.needsYou, snap.mode), c.name).toBe("unknown");
    }
  });
});
