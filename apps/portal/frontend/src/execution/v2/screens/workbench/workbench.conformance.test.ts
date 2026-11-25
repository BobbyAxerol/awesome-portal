/**
 * Reader conformance for the Paper workbench (DEBT-UXM07-018, Rules 9.8.3, tiers L0 to L3).
 *
 * The reader under test is the chain the screen reads a profile through: `readPaperWorkbenchProfile` (the shared envelope reader
 * plus the schema verdict of `readers/paperRead.ts`) and `buildWorkbench` (the model, with the closed readers of `stageFacts.ts` for
 * `stage_facts`, `positions_by_side`, `venue_calendar` and the five identity keys).
 *
 * Oracle: `execution-paper-read.v1.schema.json` through the testkit checker, and the six workbench bodies Codex published
 * (`execution-paper-workbench*.valid.json`), digest-checked at the end.
 *
 * What "conforms" means here, kept in one place so the suite and the reader cannot disagree:
 *   - a body the schema rejects is REFUSED (the page says "not a paper-workbench profile"), unless every violation lies inside a member
 *     that has a closed reader of its own (`stage_facts`, `positions_by_side`, `venue_calendar`, the identity keys of `deployment`):
 *     there the member is demoted ("Not published") and the rest of the body is read, as the screen always did;
 *   - a body the schema accepts is READ (not refused as terminal or unavailable; `empty` is a reading, not a refusal).
 * "Looser than the schema" = a schema-invalid body that is read; the suite counts it and requires 0. "Stricter" = a schema-valid body
 * that is refused; each kind is named below (S-n) and counted.
 *
 * Differences from the schema, all pinned here so a schema change shows up as a red test (the `ledger` block):
 *   S-1  the seven Full Blotter members are refused in a workbench body (the schema allows them; the workbench reads none).
 *   R-1  a body that names another paper-read version (overview, full blotter) is refused by the screen, not by the schema.
 * There is no looser-than-schema entry. Since FE-073 (c02f63d8) the schema lists the five members the server sends (`read_at_ms`,
 * `as_of_ms`, `panels`, `data.history_windows`, `lineage_scoped_out`) and types `account_equity` as retained history (no 200-row cap);
 * the reader checks each exactly as published, and the oracle below is the whole schema with nothing set aside.
 */
import { afterAll, describe, expect, it } from "vitest";

import { paperProfile } from "../../../../../e2e/bffDoubleStage";
import type { ProfileEnvelope } from "../../../api/profileRead";
import { BLOTTER_ONLY_MEMBERS, paperReadViolations, readPaperWorkbenchProfile } from "../../readers/paperRead";
import { canonicalDigest, loadCanonical, schemaEnum } from "../../testkit/loadCanonical";
import { cartesian, coverage, describeCoverage, dimension, type Draft } from "../../testkit/matrix";
import { mutationsOf as mutate, PROBE } from "../../testkit/mutate";
import { leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases } from "../../testkit/negative";
import { cloneRows, fillToBytes, pad, serializedBytes, timed } from "../../testkit/scale";
import { validateAgainst } from "../../testkit/schema";
import { buildWorkbench, type WorkbenchModel } from "./model";
import { paperWire, qualityOf } from "./workbench.harness.fixtures";

const SCHEMA = "execution-paper-read.v1";
const FILES = [
  "execution-paper-workbench.partial.valid.json",
  "execution-paper-workbench.identity.valid.json",
  "execution-paper-workbench-vnm.partial.valid.json",
  "execution-paper-workbench.positions-by-side.valid.json",
  "execution-paper-workbench.positions-by-side.partial.valid.json",
  "execution-paper-workbench.positions-by-side.unavailable.valid.json",
  "execution-paper-read.served-envelope.valid.json",
] as const;
const digests = Object.fromEntries(FILES.map((f) => [f, canonicalDigest(f)]));
afterAll(() => {
  for (const f of FILES) expect(canonicalDigest(f), f).toBe(digests[f]);
});

/* ═════════════════════ the oracle and the chain ═════════════════════ */

const clone = <T,>(value: T): T => structuredClone(value);
/** The schema's verdict on a body: the whole schema, nothing set aside. */
const oracle = (body: unknown): string[] => validateAgainst(SCHEMA, "", body);

type Locus = "body" | "stage_facts" | "positions_by_side" | "venue_calendar" | "identity";
/** Where the schema's complaints lie. `deployment` is a oneOf, so its complaint does not say whether it is the record or the identity keys: ask the record alone. */
function lociOf(body: Draft, violations: readonly string[]): Set<Locus> {
  const out = new Set<Locus>();
  for (const v of violations) {
    const member = /^\$\.data\.(stage_facts|positions_by_side|venue_calendar)\b/.exec(v);
    if (member) out.add(member[1] as Locus);
    else if (/^\$\.data\.deployment(?![A-Za-z_])/.test(v)) {
      const record = body?.data?.deployment;
      out.add(record === null || validateAgainst(SCHEMA, "/$defs/NarrowRecord", record).length > 0 ? "body" : "identity");
    } else out.add("body");
  }
  return out;
}

interface Read { envelope: ProfileEnvelope | null; model: WorkbenchModel | null }
function read(body: unknown): Read {
  const envelope = readPaperWorkbenchProfile(body);
  return { envelope, model: envelope === null ? null : buildWorkbench(envelope, qualityOf()) };
}
/** Refused: unreadable, or the page replaced by "terminal" or "unavailable". An `empty` page is a reading. */
const refused = (r: Read): boolean => r.model === null || (r.model.page.replace !== null && r.model.page.replace.status !== "empty");

const RICH = { orders: 3, fills: 2, positions: 2, equity: 6, history: true, identity: true, stageFacts: "published", sides: "available" } as const;
const SERVED = "execution-paper-read.served-envelope.valid.json";
/** What the server also sends (FE-073): the EDS-02 clocks, a panel envelope and the lineage counter, in the published shapes. */
function served(body: Draft): Draft {
  const canonical = loadCanonical<Draft>(SERVED);
  body.read_at_ms = Date.parse(body.read_at);
  body.as_of_ms = body.as_of === null ? null : Date.parse(body.as_of);
  body.panels = clone(canonical.panels);
  body.capabilities[0].lineage_scoped_out = clone(canonical.capabilities[0].lineage_scoped_out);
  return body;
}
const base = (): Draft => served(paperWire(RICH));

describe("D3 · both Paper profiles Core can serve are read", () => {
  it.each(["PAPER_BINANCE_USDM", "PAPER_OKX_SWAP"])("a %s workbench body conforms to the schema, passes the guard and is read", (profile) => {
    const body = base();
    body.delivery_profile = profile;
    expect(validateAgainst(SCHEMA, "", body)).toEqual([]);
    expect(paperReadViolations(body)).toEqual([]);
    expect(refused(read(body))).toBe(false);
  });
  it("names the unknown profile in the violation, and the schema agrees it is not served", () => {
    const body = base();
    body.delivery_profile = "PAPER_DNSE_VNM";
    expect(paperReadViolations(body)).toEqual([expect.stringMatching(/^delivery_profile: not one of PAPER_BINANCE_USDM, PAPER_OKX_SWAP/)]);
    expect(validateAgainst(SCHEMA, "", body).length).toBeGreaterThan(0);
    expect(refused(read(body))).toBe(true);
  });
});

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it.each(FILES)("%s conforms to the schema, is read, and its facts are the fixture's", (file) => {
    const body = loadCanonical<Draft>(file);
    expect(validateAgainst(SCHEMA, "", body), file).toEqual([]);
    expect(paperReadViolations(body)).toEqual([]);
    const r = read(body);
    expect(refused(r)).toBe(false);
    const m = r.model!;
    expect(m.deployment?.deploymentId).toBe(body.data.deployment.deployment_id);
    expect(m.page.replace).toBeNull();
    // The model draws no more rows than the body carries.
    expect(m.orders.loaded).toBe((body.data.orders ?? []).length);
    expect(m.fills.loaded).toBe((body.data.fills ?? []).length);
    expect(m.positions.table.loaded).toBe((body.data.positions ?? []).length);
  });

  it("identity: the five keys are read when they travel together", () => {
    const m = read(loadCanonical<Draft>("execution-paper-workbench.identity.valid.json")).model!;
    expect(m.identity.published).toBe(true);
  });

  it("positions_by_side: the three published states are read as themselves", () => {
    expect(read(loadCanonical<Draft>("execution-paper-workbench.positions-by-side.valid.json")).model!.sides?.state).toBe("AVAILABLE");
    expect(read(loadCanonical<Draft>("execution-paper-workbench.positions-by-side.partial.valid.json")).model!.sides?.state).toBe("PARTIAL");
    expect(read(loadCanonical<Draft>("execution-paper-workbench.positions-by-side.unavailable.valid.json")).model!.sides?.state).toBe("UNAVAILABLE");
  });

  it("VN market: the calendar is read, and stage facts are read", () => {
    const m = read(loadCanonical<Draft>("execution-paper-workbench-vnm.partial.valid.json")).model!;
    expect(m.calendar).not.toBeNull();
    expect(m.facts).not.toBeNull();
  });

  it("the harness body (derived from the canonical one, with rows, equity, history window, identity, stage facts, sides, clocks and panels) conforms", () => {
    const body = base();
    expect(oracle(body)).toEqual([]);
    expect(paperReadViolations(body)).toEqual([]);
    expect(refused(read(body))).toBe(false);
  });

  it.each(["standard", "vn-market"] as const)("the e2e double's %s workbench body (what the pixel baselines photograph) conforms", (variant) => {
    const body = paperProfile("dep_paper_01", variant);
    expect(oracle(body)).toEqual([]);
    expect(paperReadViolations(body)).toEqual([]);
    const r = read(body);
    expect(refused(r)).toBe(false);
    expect(r.model!.orders.loaded).toBe(40);
  });

  it("the closed words are the schema's, word for word", () => {
    // The reader's tables are written out in paperRead.ts; each must equal what the schema publishes.
    const states = schemaEnum(SCHEMA, "/properties/state");
    for (const state of states) {
      const body = base();
      body.state = state;
      expect(refused(read(body)), state).toBe(false);
    }
    for (const word of ["ok", "denied", "READY", "Ready"]) {
      const body = base();
      body.state = word;
      expect(refused(read(body)), word).toBe(true);
    }
  });
});

/* ═════════════ the ledger: every difference between the reader and the schema, pinned ═════════════ */
describe("the ledger · the differences are exactly the listed ones", () => {
  it("FE-073: the five served members are published; the reader reads them as published", () => {
    const body = base();
    expect(oracle(body)).toEqual([]);
    expect(paperReadViolations(body)).toEqual([]);
    for (const where of ["read_at_ms", "as_of_ms", "panels", "history_windows", "lineage_scoped_out"]) expect(JSON.stringify(body), where).toContain(where);
    const r = read(body);
    expect(refused(r)).toBe(false);
    expect(r.envelope?.asOfMs).toBe(Date.parse(body.as_of));
    expect(r.envelope?.readAtMs).toBe(Date.parse(body.read_at));
    expect(Object.keys(r.envelope?.panels ?? {})).toEqual(["orders"]);
    expect(r.model!.equity.serverEnvelope).toMatchObject({ sourceCount: 1438, method: "PER_SERIES_BUCKET_EXTREMA" });
  });

  it.each([
    ["read_at_ms is a string", (b: Draft) => { b.read_at_ms = "1792569601000"; }],
    ["read_at_ms is fractional", (b: Draft) => { b.read_at_ms = 1.5; }],
    ["read_at_ms is null", (b: Draft) => { b.read_at_ms = null; }],
    ["read_at_ms is beyond the date range", (b: Draft) => { b.read_at_ms = 8_640_000_000_000_001; }],
    ["as_of_ms is a string", (b: Draft) => { b.as_of_ms = "1"; }],
    ["panels is a number", (b: Draft) => { b.panels = 5; }],
    ["panels is an array", (b: Draft) => { b.panels = []; }],
    ["a panel name outside the grammar", (b: Draft) => { b.panels.Orders = b.panels.orders; }],
    ["35 panels", (b: Draft) => { for (let i = 0; i < 34; i += 1) b.panels[`p_${i}`] = clone(b.panels.orders); }],
    ["a panel with a lower-case state", (b: Draft) => { b.panels.orders.state = "ready"; }],
    ["a READY panel without data", (b: Draft) => { b.panels.orders.state = "READY"; b.panels.orders.data = null; }],
    ["an EMPTY panel with data", (b: Draft) => { b.panels.orders.state = "EMPTY"; }],
    ["a panel without clocks", (b: Draft) => { delete b.panels.orders.clocks; }],
    ["a panel clock that is not an instant", (b: Draft) => { b.panels.orders.clocks.as_of_ms = "x"; }],
    ["a panel without read_at_ms in its clocks", (b: Draft) => { b.panels.orders.clocks.read_at_ms = null; }],
    ["a panel with an extra member", (b: Draft) => { b.panels.orders.note = "x"; }],
    ["a panel with 201 returned rows", (b: Draft) => { b.panels.orders.coverage.returned_count = 201; }],
    ["a panel total that is not a digit string", (b: Draft) => { b.panels.orders.coverage.source_total = 3; }],
    ["a panel gap without a reason", (b: Draft) => { delete b.panels.orders.coverage.gaps[0].reason_code; }],
    ["a panel formula with a malformed digest", (b: Draft) => { b.panels.orders.formula = { formula_id: "f", formula_version: "v1", input_revision: null, input_digest: "sha256:zz", composite_read_revision: null }; }],
    ["a panel that is not retryable-typed", (b: Draft) => { b.panels.orders.retryable = "no"; }],
    ["history_windows is an array", (b: Draft) => { b.data.history_windows = []; }],
    ["history_windows is a number", (b: Draft) => { b.data.history_windows = 5; }],
    ["history_windows names another window", (b: Draft) => { b.data.history_windows.portfolio_equity = clone(b.data.history_windows.account_equity); }],
    ["a window on another basis", (b: Draft) => { b.data.history_windows.account_equity.basis = "ACCOUNT_EQUITY_SNAPSHOTS"; }],
    ["a truncated window", (b: Draft) => { b.data.history_windows.account_equity.truncated = true; }],
    ["a window without returned_rows", (b: Draft) => { delete b.data.history_windows.account_equity.returned_rows; }],
    ["a window of 0 days", (b: Draft) => { b.data.history_windows.account_equity.days = 0; }],
    ["a downsample by another method", (b: Draft) => { b.data.history_windows.account_equity.downsample.method = "bucket_last"; }],
    ["a downsample without series_count", (b: Draft) => { delete b.data.history_windows.account_equity.downsample.series_count; }],
    ["a downsample of 0 series", (b: Draft) => { b.data.history_windows.account_equity.downsample.series_count = 0; }],
    ["lineage_scoped_out is empty", (b: Draft) => { b.capabilities[0].lineage_scoped_out = {}; }],
    ["lineage_scoped_out names an unknown source", (b: Draft) => { b.capabilities[0].lineage_scoped_out = { planet: 1 }; }],
    ["lineage_scoped_out counts 0", (b: Draft) => { b.capabilities[0].lineage_scoped_out = { account: 0 }; }],
  ])("FE-073: %s is refused, because the schema refuses it", (_name, edit) => {
    const body = base();
    edit(body);
    expect(oracle(body)).not.toEqual([]);
    expect(refused(read(body))).toBe(true);
  });

  it("FE-073: the nullable and optional words of the five members are readings, not refusals", () => {
    const edits: [string, (b: Draft) => void][] = [
      ["as_of_ms null with as_of null", (b) => { b.as_of = null; b.as_of_ms = null; }],
      ["no served members at all", (b) => { delete b.read_at_ms; delete b.as_of_ms; delete b.panels; delete b.data.history_windows; delete b.capabilities[0].lineage_scoped_out; }],
      ["empty panels", (b) => { b.panels = {}; }],
      ["a window without a downsample (exact rows)", (b) => { delete b.data.history_windows.account_equity.downsample; }],
      ["empty history_windows", (b) => { b.data.history_windows = {}; }],
      ["an EMPTY panel with null data and a null formula", (b) => { b.panels.orders.state = "EMPTY"; b.panels.orders.data = null; }],
      ["a panel clock at the date range's end", (b) => { b.panels.orders.clocks.event_time_ms = -8_640_000_000_000_000; }],
    ];
    for (const [name, edit] of edits) {
      const body = base();
      edit(body);
      expect(oracle(body), name).toEqual([]);
      expect(refused(read(body)), name).toBe(false);
    }
  });

  it("FE-073: account_equity is retained history: 201 and 2500 rows are valid and all are carried, while every other branch stays capped at 200", () => {
    for (const rows of [201, 2500]) {
      const body = base();
      body.data.account_equity = cloneRows(body.data.account_equity[0], rows, (r: Draft, i: number) => {
        r.ts = new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString();
        r.equity = (100_000 + i).toFixed(2);
      });
      expect(oracle(body), String(rows)).toEqual([]);
      const r = read(body);
      expect(refused(r), String(rows)).toBe(false);
      expect(r.model!.equity.rows, "every retained row is carried, none is cut to the snapshot page").toBe(rows);
      expect(r.model!.equity.points.length).toBe(rows);
    }
    const over = base();
    over.data.fills = cloneRows(over.data.fills[0], 201, (r: Draft, i: number) => { r.fill_id = `fill_${pad(i)}`; });
    expect(oracle(over)).not.toEqual([]);
    expect(refused(read(over))).toBe(true);
  });

  it.each([
    ["page", { limit: 50, next_cursor: null, previous_cursor: null }],
    ["exact_total", 12],
    ["filtered_total", null],
    ["aggregates", { status: { FILLED: 1 } }],
    ["derived_insights", { formula_version: "derived.v1", as_of: "2026-10-17T09:14:00Z", order_funnel_7d: { total_orders: 0, status_counts: {} }, cumulative_return: [] }],
  ] as const)("S-1: %s is valid for the schema in a workbench body and refused by the reader", (key, value) => {
    const body = base();
    body.data[key] = value;
    expect(oracle(body), "the schema accepts it").toEqual([]);
    expect(refused(read(body))).toBe(true);
  });

  it("S-1: query and exact_query, taken from the published Full Blotter body", () => {
    const blotter = loadCanonical<Draft>("execution-full-blotter.partial.valid.json");
    for (const key of ["query", "exact_query"] as const) {
      const body = base();
      body.data[key] = blotter.data[key];
      expect(oracle(body), `the schema accepts ${key}`).toEqual([]);
      expect(refused(read(body)), key).toBe(true);
    }
    expect([...BLOTTER_ONLY_MEMBERS].sort()).toEqual(["aggregates", "derived_insights", "exact_query", "exact_total", "filtered_total", "page", "query"]);
  });

  it("R-1: another paper-read version is valid for the schema and is not a workbench profile", () => {
    for (const version of schemaEnum(SCHEMA, "/properties/schema_version")) {
      const body = base();
      body.schema_version = version;
      if (version.includes("workbench")) expect(refused(read(body)), version).toBe(false);
      else {
        // The schema forbids `resource` outside the workbench versions, so the body must also drop it to be schema-valid.
        delete body.resource;
        expect(oracle(body), version).toEqual([]);
        expect(refused(read(body)), version).toBe(true);
      }
    }
  });

  it("the schema's resource rule: required for the workbench versions, forbidden for the others, and the reader says the same", () => {
    const noResource = base();
    delete noResource.resource;
    expect(oracle(noResource)).not.toEqual([]);
    expect(refused(read(noResource))).toBe(true);
    const overview = base();
    overview.schema_version = "execution.paper-overview.v1";
    expect(oracle(overview)).not.toEqual([]);
    expect(refused(read(overview))).toBe(true);
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
describe("L1 · matrices", () => {
  const states = schemaEnum(SCHEMA, "/properties/state");
  const freshness = schemaEnum(SCHEMA, "/properties/freshness");
  const completeness = schemaEnum(SCHEMA, "/properties/completeness");
  const dims = [dimension("state", ["state"], states), dimension("freshness", ["freshness"], freshness), dimension("completeness", ["completeness"], completeness)];
  const matrix = cartesian(base(), dims);

  it("covers every published state x freshness x completeness (40)", () => {
    const c = coverage(dims, matrix);
    console.info(describeCoverage("workbench page state", c));
    expect(matrix).toHaveLength(states.length * freshness.length * completeness.length);
  });

  it.each(matrix.map((s) => [s.name, s] as const))("%s: read, and each word keeps its meaning", (_name, s) => {
    expect(oracle(s.value)).toEqual([]);
    const r = read(s.value);
    expect(refused(r)).toBe(false);
    const page = r.model!.page;
    const state = s.picks.state;
    if (state === "empty") expect(page.replace?.status).toBe("empty");
    else if (state === "unavailable") expect(page.nq).not.toBeNull();
    else {
      expect(page.replace).toBeNull();
      expect(page.partial !== null).toBe(state === "partial" || s.picks.completeness !== "COMPLETE");
      expect(page.stale !== null).toBe(state === "stale" || s.picks.freshness === "STALE");
    }
    // An unavailable source is not qualified: nothing it says about figures is drawn.
    if (state === "unavailable") {
      expect(r.model!.orders.rows).toEqual([]);
      expect(r.model!.fills.rows).toEqual([]);
      expect(r.model!.positions.table.rows).toEqual([]);
      expect(r.model!.sides).toBeNull();
    }
  });

  it("identity: the five keys travel together; a name is present iff its reason is null; alpha_name implies alpha_id", () => {
    const D = "data.deployment";
    const rows: [string, Draft, boolean][] = [
      ["all five, name and no reason", { alpha_id: "alpha_X", alpha_name: "Alpha X", portfolio_name: "Core", alpha_reason_code: null, portfolio_name_reason_code: null }, true],
      ["no alpha name, with reason", { alpha_id: "alpha_X", alpha_name: null, portfolio_name: "Core", alpha_reason_code: "ALPHA_NAME_NOT_PUBLISHED", portfolio_name_reason_code: null }, true],
      ["nothing known", { alpha_id: null, alpha_name: null, portfolio_name: null, alpha_reason_code: "ALPHA_MEMBERSHIP_NOT_QUALIFIED", portfolio_name_reason_code: "PORTFOLIO_NOT_ASSIGNED" }, true],
      ["a name AND a reason", { alpha_id: "alpha_X", alpha_name: "Alpha X", portfolio_name: "Core", alpha_reason_code: "ALPHA_NAME_NOT_PUBLISHED", portfolio_name_reason_code: null }, false],
      ["a name without an id", { alpha_id: null, alpha_name: "Alpha X", portfolio_name: "Core", alpha_reason_code: null, portfolio_name_reason_code: null }, false],
      ["no name and no reason", { alpha_id: "alpha_X", alpha_name: null, portfolio_name: "Core", alpha_reason_code: null, portfolio_name_reason_code: null }, false],
      ["a portfolio name and a reason", { alpha_id: "alpha_X", alpha_name: null, portfolio_name: "Core", alpha_reason_code: "ALPHA_NAME_NOT_PUBLISHED", portfolio_name_reason_code: "PORTFOLIO_NOT_ASSIGNED" }, false],
      ["no portfolio name and no reason", { alpha_id: "alpha_X", alpha_name: null, portfolio_name: null, alpha_reason_code: "ALPHA_NAME_NOT_PUBLISHED", portfolio_name_reason_code: null }, false],
      ["an unknown reason word", { alpha_id: "alpha_X", alpha_name: null, portfolio_name: "Core", alpha_reason_code: "WHATEVER", portfolio_name_reason_code: null }, false],
    ];
    for (const [name, keys, valid] of rows) {
      const body = base();
      Object.assign(body.data.deployment, keys);
      expect(oracle(body).length === 0, `${name}: the schema says ${valid ? "valid" : "invalid"} (${D})`).toBe(valid);
      const r = read(body);
      expect(refused(r), name).toBe(false);
      expect(r.model!.identity.published, name).toBe(valid);
    }
    // Four of the five is not "some of the keys": the five travel together.
    const four = base();
    delete four.data.deployment.portfolio_name_reason_code;
    expect(oracle(four)).not.toEqual([]);
    expect(read(four).model!.identity.published).toBe(false);
  });

  it("the workbench variants: the VN body carries the calendar, the plain one never reads one", () => {
    const vnm = loadCanonical<Draft>("execution-paper-workbench-vnm.partial.valid.json");
    const plain = loadCanonical<Draft>("execution-paper-workbench.partial.valid.json");
    expect(read(vnm).model!.calendar).not.toBeNull();
    expect(read(plain).model!.calendar).toBeNull();
    expect(plain.data.venue_calendar).toBeUndefined();
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · the schema's bounds", () => {
  const row = (branch: string): Draft => ({ ...(base().data[branch][0] ?? { id: "x" }) });

  it("200 rows per branch is the schema's cap: read in order, inside a budget; 201 is refused", () => {
    const body = base();
    for (const branch of ["orders", "fills", "positions", "account_equity"]) {
      const template = row(branch);
      body.data[branch] = cloneRows(template, 200, (r: Draft, i: number) => {
        if ("order_id" in r) { r.order_id = `ord_${pad(i)}`; r.client_order_id = `c_${pad(i)}`; }
        if ("fill_id" in r) { r.fill_id = `fill_${pad(i)}`; }
        if ("instrument_id" in r) r.instrument_id = `SYM${pad(i)}`;
        if ("ts" in r) r.ts = new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString();
      });
    }
    expect(oracle(body)).toEqual([]);
    const { value, ms } = timed(() => read(body));
    expect(refused(value)).toBe(false);
    expect(value.model!.orders.loaded).toBe(200);
    expect(value.model!.orders.rows.length).toBeLessThanOrEqual(200);
    expect(ms).toBeLessThan(1500);
    const over = clone(body);
    over.data.orders.push(clone(over.data.orders[0]));
    expect(oracle(over)).not.toEqual([]);
    expect(refused(read(over))).toBe(true);
  });

  it("a row of 40 members is valid, 41 is refused; a member array of 100 scalars is valid, 101 is refused", () => {
    const at = (n: number, arr: number | null): Draft => {
      const body = base();
      const record: Draft = { order_id: "ord_00000" };
      for (let i = 1; i < n; i += 1) record[`f${i}`] = i;
      if (arr !== null) record.tags = Array.from({ length: arr }, (_, i) => `t${i}`);
      body.data.orders = [record];
      return body;
    };
    for (const [n, arr, valid] of [[40, null, true], [41, null, false], [3, 100, true], [3, 101, false]] as const) {
      const body = at(n, arr);
      expect(oracle(body).length === 0, `${n} members, array ${arr}`).toBe(valid);
      expect(refused(read(body)), `${n} members, array ${arr}`).toBe(!valid);
    }
  });

  it("a scalar string of 8192 characters is valid, 8193 is refused", () => {
    for (const [length, valid] of [[8192, true], [8193, false]] as const) {
      const body = base();
      body.data.orders[0].note = "x".repeat(length);
      expect(oracle(body).length === 0).toBe(valid);
      expect(refused(read(body))).toBe(!valid);
    }
  });

  it("capabilities: 20 are valid, 21 are refused; relations: 8 valid, 9 refused", () => {
    for (const [count, valid] of [[20, true], [21, false]] as const) {
      const body = base();
      body.capabilities = Array.from({ length: count }, (_, i) => ({ capability_id: `cap.${i}`, state: "AVAILABLE", relations: ["rel_a"], reason_code: null, retryable: false }));
      expect(oracle(body).length === 0, `${count} capabilities`).toBe(valid);
      expect(refused(read(body)), `${count} capabilities`).toBe(!valid);
    }
    for (const [count, valid] of [[8, true], [9, false]] as const) {
      const body = base();
      body.capabilities[0].relations = Array.from({ length: count }, (_, i) => `rel_${i}x`);
      expect(oracle(body).length === 0, `${count} relations`).toBe(valid);
      expect(refused(read(body)), `${count} relations`).toBe(!valid);
    }
  });

  it("a profile of about 7 MiB (the size of the real one) is checked and read inside a budget", () => {
    const { value: body, bytes } = fillToBytes((factor) => {
      const b = base();
      const f = Math.min(factor, 200);
      for (const branch of ["orders", "fills", "positions", "account_equity", "deployments", "sessions", "performance", "portfolio_equity", "reconciliation", "command_journal"]) {
        const template = branch in b.data && b.data[branch].length > 0 ? b.data[branch][0] : { id: "x", n: 1 };
        b.data[branch] = cloneRows(template, f, (r: Draft, i: number) => {
          if ("order_id" in r) r.order_id = `ord_${pad(i)}`;
          r.pad = "p".repeat(Math.min(8192, 40 * factor));
        });
      }
      return b;
    }, 7 * 1024 * 1024, 1 << 20);
    expect(bytes).toBeGreaterThanOrEqual(7 * 1024 * 1024);
    expect(serializedBytes(body)).toBe(bytes);
    const { value, ms } = timed(() => read(body));
    expect(refused(value)).toBe(false);
    console.info(`workbench 7 MiB profile: ${Math.round(bytes / 1024)} KiB read in ${Math.round(ms)} ms`);
    expect(ms).toBeLessThan(4000);
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
const mutationsOf = (source: Draft) => mutate(source);

const SOURCES: [string, () => Draft][] = [
  ["the rich harness body", () => base()],
  ["the VN market body", () => loadCanonical<Draft>("execution-paper-workbench-vnm.partial.valid.json")],
  ["positions_by_side partial", () => loadCanonical<Draft>("execution-paper-workbench.positions-by-side.partial.valid.json")],
  ["the served envelope (clocks, panels, history window, lineage counter)", () => loadCanonical<Draft>(SERVED)],
];

interface Tally { total: number; schemaInvalid: number; refusedAll: number; demoted: number; looser: string[]; stricter: string[] }
const tally: Record<string, Tally> = {};

describe("L3 · generated negatives, schema as oracle", () => {
  for (const [label, make] of SOURCES) {
    const source = make();
    const cases = mutationsOf(source);
    const t: Tally = { total: cases.length, schemaInvalid: 0, refusedAll: 0, demoted: 0, looser: [], stricter: [] };
    tally[label] = t;

    it(`${label}: ${cases.length} mutations; none is read looser than the schema, none is refused although the schema accepts it`, () => {
      expect(cases.length).toBeGreaterThan(300);
      for (const c of cases) {
        let r: Read = { envelope: null, model: null };
        expect(() => { r = read(c.value); }, `throws: ${c.name}`).not.toThrow();
        expect(prototypeIsClean()).toBe(true);
        const violations = oracle(c.value);
        if (violations.length === 0) {
          // The schema accepts it: it must be read (S-n and R-n entries are not generated here).
          if (refused(r)) t.stricter.push(`${c.name} -> ${JSON.stringify(r.model?.page.replace ?? "unreadable")}`);
          continue;
        }
        t.schemaInvalid += 1;
        const loci = lociOf(c.value, violations);
        if (loci.has("body")) {
          if (refused(r)) t.refusedAll += 1;
          else t.looser.push(`${c.name} -> ${violations[0]}`);
          continue;
        }
        // Only closed members are broken: the body is read and each broken member is demoted, never half-read.
        if (refused(r)) { t.stricter.push(`${c.name} (closed member only) -> refused`); continue; }
        const m = r.model!;
        const demoted = (["stage_facts", "positions_by_side", "venue_calendar", "identity"] as const).every((member) => {
          if (!loci.has(member)) return true;
          return member === "stage_facts" ? m.facts === null
            : member === "positions_by_side" ? m.sides === null
              : member === "venue_calendar" ? m.calendar === null
                : !m.identity.published;
        });
        if (demoted) t.demoted += 1;
        else t.looser.push(`${c.name} -> ${[...loci].join("+")} not demoted: ${violations[0]}`);
      }
      console.info(`workbench L3 ${label}: ${t.total} mutations, ${t.schemaInvalid} schema-invalid (${t.refusedAll} refused, ${t.demoted} demoted), looser ${t.looser.length}, stricter ${t.stricter.length}`);
      expect(t.looser, `read although the schema rejects it:\n${t.looser.slice(0, 20).join("\n")}`).toEqual([]);
      expect(t.stricter, `refused although the schema accepts it:\n${t.stricter.slice(0, 20).join("\n")}`).toEqual([]);
    }, 120_000);
  }

  it("the probe text of an extra member never reaches the model", () => {
    for (const c of mutationsOf(base()).filter((m) => m.name.includes("extra member"))) {
      const r = read(c.value);
      expect(leaked(r.model, PROBE), c.name).toBe(false);
    }
  });

  it("enum words: an unknown or re-cased word of each published enum is refused", () => {
    for (const [path, pointer] of [["state", "/properties/state"], ["freshness", "/properties/freshness"], ["completeness", "/properties/completeness"]] as const) {
      for (const word of schemaEnum(SCHEMA, pointer)) {
        for (const bad of [word.toLowerCase() === word ? word.toUpperCase() : word.toLowerCase(), `${word} `, ` ${word}`, `${word}_X`, "", "UNKNOWN_WORD_FROM_TESTKIT"]) {
          const body = base();
          body[path] = bad;
          expect(refused(read(body)), `${path} <- ${JSON.stringify(bad)}`).toBe(true);
        }
      }
    }
    for (const bad of ["paper_binance_usdm", "paper_okx_swap", "LIVE", "PAPER_DNSE_VNM", "SANDBOX_BINANCE_USDM", "PAPER_OKX", "", null]) {
      const body = base();
      body.delivery_profile = bad;
      expect(refused(read(body)), `delivery_profile <- ${bad}`).toBe(true);
    }
  });

  it("schema_version and required members: every one is needed, and another version is not a workbench profile", () => {
    const cases = [
      ...requiredCases(base(), ["schema_version", "record_authority", "source_authority", "delivery_profile", "workspace_id", "read_at", "as_of", "state", "freshness", "completeness", "actor", "capabilities", "data", "resource"].map((k) => [k] as const)),
      ...schemaVersionCases(base(), ["schema_version"], "execution.paper-workbench.v1", ["execution.paper-workbench.v2", "execution.paper-overview.v1", "governance.approval-create.v1"]),
    ];
    for (const c of cases) {
      const r = read(c.value);
      const bad = oracle(c.value).length > 0;
      // `as_of: null` is a published word, so "null" of as_of is valid; everything else the schema rejects is refused.
      expect(refused(r), c.name).toBe(bad || /schema-swapped/.test(c.name) && !String(c.value && (c.value as Draft).schema_version).includes("workbench"));
    }
  });

  it("own __proto__, constructor and prototype members are refused or ignored and never pollute", () => {
    for (const c of pollutionCases(base(), [[], ["data"], ["data", "orders", 0], ["actor"], ["capabilities", 0]])) {
      expect(() => read(c.value)).not.toThrow();
      expect(prototypeIsClean()).toBe(true);
      const r = read(c.value);
      expect(leaked(r.model, c.probe)).toBe(false);
      if (oracle(c.value).length > 0 && lociOf(c.value, oracle(c.value)).has("body")) expect(refused(r), c.name).toBe(true);
    }
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing", (_name, c) => {
    expect(() => readPaperWorkbenchProfile(c.value)).not.toThrow();
    expect(readPaperWorkbenchProfile(c.value)).toBeNull();
  });

  it("the totals: at least a thousand schema-invalid bodies were tried, and 0 were read looser", () => {
    const tried = Object.values(tally).reduce((n, t) => n + t.schemaInvalid, 0);
    const looser = Object.values(tally).reduce((n, t) => n + t.looser.length, 0);
    console.info(`workbench L3 total: ${tried} schema-invalid bodies tried, ${looser} read looser than the schema`);
    expect(tried).toBeGreaterThan(1000);
    expect(looser).toBe(0);
  });
});
