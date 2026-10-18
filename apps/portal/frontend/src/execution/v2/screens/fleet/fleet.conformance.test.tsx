/**
 * Reader conformance for the Fleet identity slice (Rules 9.8.3, L0 to L3):
 * `readAlphaFleet` (V1 reader, read only) -> `fleetModel` -> the screen.
 *
 * L0  the canonical `execution-alpha-fleet-list.v2` verbatim, and its digest
 *     unchanged when the suite ends.
 * L1  two matrices built from the published enums, each state checked against
 *     the schema first (a state the schema refuses is not an L1 state):
 *       A  envelope: freshness x completeness x source_as_of x budget x rows x paging
 *       B  row:      health x stage x deployments x owner x reasons x two metric states
 *     Reader and model are checked on every state; the screen is rendered for
 *     the pairwise subset of A and for one page holding the pairwise rows of B.
 * L2  200 rows over 4 keyset pages, 40 owners, 12 portfolios, a 1 MiB page, a
 *     time budget for the reader and the model, and the DOM-row cap on screen.
 * L3  negative payloads: never a throw, never a leak, unknown words never `ok`.
 *     Where the reader is looser than the published schema the gap is counted
 *     and printed, and the defects it implies are `it.fails` below.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import type { AlphaFleetQuery, ExecutionApi } from "../../../api/ports";
import { readAlphaFleet, readAlphaFleetItem, type AlphaFleetItem } from "../../../api/profileRead";
import { utcStamp } from "../../../time";
import { ABSENT, cartesian, coverage, describeCoverage, dimension, dimensionOf, pairwise, type Draft } from "../../testkit/matrix";
import { canonicalDigest, loadCanonical, schemaEnum } from "../../testkit/loadCanonical";
import {
  arrayCases, decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases,
  schemaVersionCases, stringCases, type NegativeCase,
} from "../../testkit/negative";
import { cloneRows, cursorFilter, fillToBytes, keysetCursor, MIB, pad, serializedBytes, splitIntoPages, timed } from "../../testkit/scale";
import { validateAgainst } from "../../testkit/schema";
import { FLEET_LENSES, PAGE_LIMIT, type FleetFilters, ROW_CAP, fleetKpis, fleetQuery, healthView, lensCounts, queryKey, toFleetRow } from "./fleetModel";
import { useFleetRead } from "./useFleetRead";
import FleetScreen from "./index";

afterEach(cleanup);

/* ── stated budgets: generous, the lane shares a machine ──────────────── */
const BUDGET_READ_200_MS = 400;
const BUDGET_READ_1MIB_MS = 600;
const BUDGET_MODEL_200_MS = 200;
const BUDGET_RENDER_200_MS = 15_000;
const BUDGET_RENDER_STATE_MS = 5_000;

const NAME = "execution-alpha-fleet-list.v2";
const SCHEMA = NAME;
const digestBefore = canonicalDigest(NAME);
afterAll(() => { expect(canonicalDigest(NAME)).toBe(digestBefore); });

const canonical = loadCanonical<Draft>(NAME);
const baseRow: Draft = canonical.page.rows[0];

const FRESHNESS = schemaEnum(SCHEMA, "/$defs/AlphaFleetResponse/properties/freshness");
const COMPLETENESS = schemaEnum(SCHEMA, "/$defs/AlphaFleetResponse/properties/completeness");
const HEALTHS = schemaEnum(SCHEMA, "/$defs/AlphaFleetItem/properties/health");
const STAGES = schemaEnum(SCHEMA, "/$defs/AlphaFleetItem/properties/stages/items");
const METRIC_STATES = schemaEnum(SCHEMA, "/$defs/MetricState/properties/state");

const violations = (value: unknown) => validateAgainst(SCHEMA, "", value);
const rowViolations = (value: unknown) => validateAgainst(SCHEMA, "/$defs/AlphaFleetItem", value);

/* ── builders: the envelope around rows, derived from the canonical one ── */
function summaryFor(rows: Draft[]): Draft {
  const summary = structuredClone(canonical.summary);
  summary.alpha_count = rows.length;
  summary.deployment_count = rows.reduce((n, r) => n + r.deployments.length, 0);
  summary.portfolio_count = new Set(rows.flatMap((r) => r.portfolios.map((p: Draft) => p.portfolio_id))).size;
  summary.needs_attention_count = rows.filter((r) => r.health === "ATTENTION").length;
  summary.research_only_count = rows.filter((r) => r.health === "RESEARCH_ONLY").length;
  const counts: Record<string, number> = {};
  for (const r of rows) for (const s of r.stages) counts[s] = (counts[s] ?? 0) + 1;
  summary.stage_counts = counts;
  return summary;
}

function envelopeOf(rows: Draft[], page: Partial<Draft> = {}, over: Partial<Draft> = {}): Draft {
  const env = structuredClone(canonical);
  env.page.rows = rows;
  env.page.total_count = rows.length;
  env.page.filtered_count = rows.length;
  Object.assign(env.page, page);
  env.summary = summaryFor(rows);
  Object.assign(env, over);
  return env;
}

/* ── api double and mount ─────────────────────────────────────────────── */
function makeApi(answer: (query: AlphaFleetQuery) => unknown) {
  const calls: AlphaFleetQuery[] = [];
  const getAlphaFleet = vi.fn(async (query: AlphaFleetQuery = {}) => {
    calls.push(query);
    const envelope = readAlphaFleet(answer(query));
    return envelope
      ? { ok: true as const, value: envelope }
      : { ok: false as const, status: "unavailable" as const, reason: "UNREADABLE_ALPHA_FLEET" };
  });
  return { api: { getAlphaFleet } as unknown as ExecutionApi, calls, getAlphaFleet };
}

const mount = (api: ExecutionApi, entry = "/execution/fleet") =>
  render(<MemoryRouter initialEntries={[entry]}><FleetScreen api={api} /></MemoryRouter>);

const waitForTable = () => screen.findByRole("table", { name: "Alpha fleet" }, { timeout: 10_000 });
const bodyRows = () => within(screen.getByRole("table", { name: "Alpha fleet" })).getAllByRole("row").slice(1);

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("passes the published schema through the testkit checker (so the checker is not vacuous)", () => {
    expect(violations(canonical)).toEqual([]);
    const broken = structuredClone(canonical);
    delete broken.freshness;
    expect(violations(broken).length).toBeGreaterThan(0);
  });

  it("reads through the real reader and the model without change", () => {
    const envelope = readAlphaFleet(canonical)!;
    expect(envelope.freshness).toBe("FRESH");
    expect(envelope.completeness).toBe("COMPLETE");
    expect(envelope.page.rows).toHaveLength(1);
    const row = toFleetRow(envelope.page.rows[0]!);
    expect(row).toMatchObject({ alphaId: "alpha_a", stageCode: "PAPER", owner: "Bobby-001", health: { kind: "ok", label: "Ready" } });
    expect(fleetKpis(envelope.summary!).map((k) => k.value)).toEqual([1, 1, 1, 0, 0]);
    expect(lensCounts(envelope.summary!).all.text).toBe("1");
  });

  it("is loaded as an independent copy each time", () => {
    const a = loadCanonical<Draft>(NAME);
    a.page.rows[0].alpha_id = "changed";
    expect(loadCanonical<Draft>(NAME).page.rows[0].alpha_id).toBe("alpha_a");
  });

  it("the v1 canonical of the same endpoint is refused by the v2 reader (schema_version is strict)", () => {
    expect(readAlphaFleet(loadCanonical("execution-alpha-fleet-list"))).toBeNull();
  });
});

/* ═════════════════════════ L1 · matrix A, envelope ═════════════════════════ */
const MORE = { has_more: true, next_cursor: "cur_after_alpha_a" };
const AXES_A = [
  dimension("freshness", ["freshness"], FRESHNESS),
  dimension("completeness", ["completeness"], COMPLETENESS),
  dimension("source_as_of", ["source_as_of"], [canonical.source_as_of, null], (v) => (v === null ? "null" : "published")),
  dimension("budget", ["freshness_budget_ms"], [canonical.freshness_budget_ms, ABSENT], (v) => (v === ABSENT ? "absent" : "published")),
  dimensionOf("rows", [
    { label: "one", apply: () => undefined },
    {
      label: "empty",
      apply: (d: Draft) => { d.page.rows = []; d.page.total_count = 0; d.page.filtered_count = 0; d.summary = summaryFor([]); },
    },
  ]),
  dimensionOf("paging", [
    { label: "single", apply: () => undefined },
    { label: "more", apply: (d: Draft) => { Object.assign(d.page, MORE); } },
    { label: "middle", apply: (d: Draft) => { Object.assign(d.page, MORE, { has_previous: true, prev_cursor: "cur_before_alpha_a" }); } },
  ]),
];
const excludeA = (p: Readonly<Record<string, string>>) => p.rows === "empty" && p.paging !== "single";

describe("L1 · matrix A · envelope states", () => {
  const all = cartesian(canonical, AXES_A, { exclude: excludeA });
  const pairs = pairwise(canonical, AXES_A, { exclude: excludeA });

  it("prints its size and proves the pairwise subset covers every possible pair", () => {
    const full = coverage(AXES_A, all, { exclude: excludeA });
    const part = coverage(AXES_A, pairs, { exclude: excludeA });
    console.info(describeCoverage("fleet matrix A cartesian", full));
    console.info(describeCoverage("fleet matrix A pairwise", part));
    expect(all).toHaveLength(3 * 3 * 2 * 2 * (3 + 1));
    expect(part.pairsCovered).toBe(part.pairsPossible);
    expect(full.pairsCovered).toBe(full.pairsPossible);
  });

  it("every state is a valid L1 state: the published schema accepts it", () => {
    const bad = all.map((s) => [s.name, violations(s.value)] as const).filter(([, v]) => v.length > 0);
    expect(bad.slice(0, 3)).toEqual([]);
  });

  it("the reader carries every state verbatim: no tier or completeness is repaired, no absence becomes a value", () => {
    const wrong: string[] = [];
    for (const { name, value } of all) {
      const d = value as Draft;
      const read = readAlphaFleet(value);
      if (read === null) { wrong.push(`${name}: refused`); continue; }
      if (read.freshness !== d.freshness || read.completeness !== d.completeness) wrong.push(`${name}: tier changed`);
      if (read.sourceAsOf !== d.source_as_of) wrong.push(`${name}: source_as_of changed`);
      if ((read.freshnessBudgetMs === null) !== (d.freshness_budget_ms === undefined)) wrong.push(`${name}: budget presence changed`);
      if (read.page.rows.length !== d.page.rows.length) wrong.push(`${name}: row count changed`);
      if (read.page.hasMore !== (d.page.has_more === true)) wrong.push(`${name}: has_more changed`);
      if (read.page.nextCursor !== d.page.next_cursor) wrong.push(`${name}: cursor changed`);
      if (read.summary?.alphaCount !== d.summary.alpha_count) wrong.push(`${name}: summary count changed`);
    }
    expect(wrong).toEqual([]);
  });

  describe.each(pairs.map((s) => [s.name, s.value] as const))("screen · %s", (_name, input) => {
    const d = input as Draft;
    it("maps the state to the documented UI state", async () => {
      const { api } = makeApi(() => input);
      const { container } = mount(api);
      const started = performance.now();
      await waitFor(() => expect(container.querySelector(".exec-fleet-fresh .exec-flag")).not.toBeNull(), { timeout: 10_000 });
      expect(performance.now() - started).toBeLessThan(BUDGET_RENDER_STATE_MS);

      // Freshness: only the exact published FRESH is success; AGING is not.
      const flag = container.querySelector(".exec-fleet-fresh .exec-flag")!;
      const wantKind = d.freshness === "FRESH" ? "ok" : d.freshness === "STALE" ? "stale" : "unknown";
      expect(flag.getAttribute("data-k")).toBe(wantKind);
      expect(flag.textContent).toContain(d.freshness === "FRESH" ? "Fresh" : d.freshness === "STALE" ? "Stale" : "Aging");

      // Completeness: anything but COMPLETE says partial and never carries a success flag.
      const banner = container.querySelector(".exec-fleet-banner");
      if (d.completeness === "COMPLETE") {
        expect(banner).toBeNull();
      } else {
        expect(banner).not.toBeNull();
        expect(banner!.querySelector('[data-k="partial"]')).not.toBeNull();
        expect(banner!.querySelector('[data-k="ok"]')).toBeNull();
        expect(banner!.textContent!.toLowerCase()).toContain(d.completeness.toLowerCase());
      }

      // An unpublished source time is said so; it is never a date, a zero or a dash.
      const fresh = container.querySelector(".exec-fleet-fresh")!.textContent!;
      if (d.source_as_of === null) expect(fresh).toContain("Source time not published");
      else expect(fresh).toContain(`As of ${utcStamp(d.source_as_of)}`);
      expect(fresh).not.toMatch(/\b0\b|N\/A|\u2014|\u2013/);

      await waitFor(() => expect(container.textContent).toMatch(d.page.rows.length === 0 ? /The fleet read published no alphas/ : /Alpha fleet|Carry A/));
      if (d.page.rows.length === 0) expect(container.querySelectorAll("tbody tr[data-key], tbody tr[tabindex]")).toHaveLength(0);
      const more = screen.queryByRole("button", { name: /Load more/ });
      expect(more !== null).toBe(d.page.has_more === true);
    });
  });
});

/* ═════════════════════════ L1 · matrix B, row ═════════════════════════ */
function depOf(health: string, i: number): Draft {
  const dep = structuredClone(baseRow.deployments[0]);
  dep.deployment_id = `dep_matrix_${i}`;
  dep.account_id = `acc_matrix_${i}`;
  dep.health = health;
  return dep;
}
const METRIC_OPTIONS: Draft[] = [
  { state: "AVAILABLE", reason_code: null },
  { state: "EMPTY", reason_code: "NO_ROWS_YET" },
  { state: "UNAVAILABLE", reason_code: "SOURCE_GAP" },
  { state: "UNAVAILABLE", reason_code: null },
];
const metricAxis = (key: string) => dimensionOf(`metric:${key}`, METRIC_OPTIONS.map((m) => ({
  label: `${m.state}/${m.reason_code ?? "null"}`,
  apply: (d: Draft) => { d.metrics_availability[key] = structuredClone(m); },
})));
const AXES_B = [
  dimension("health", ["health"], HEALTHS),
  dimensionOf("stage", [
    ...STAGES.map((stage) => ({ label: stage, apply: (d: Draft) => { d.stage = stage; d.stages = [stage]; } })),
    { label: "LIVE+CANARY", apply: (d: Draft) => { d.stage = "LIVE"; d.stages = ["LIVE", "CANARY"]; } },
  ]),
  dimensionOf("deployments", [
    { label: "none", apply: (d: Draft) => { d.deployments = []; } },
    { label: "ready", apply: (d: Draft) => { d.deployments = [depOf("READY", 0)]; } },
    { label: "finding", apply: (d: Draft) => { d.deployments = [depOf("FINDING", 0)]; } },
    { label: "mixed", apply: (d: Draft) => { d.deployments = [depOf("READY", 0), depOf("FINDING", 1), depOf("ATTENTION", 2)]; } },
  ]),
  dimension("owner", ["owner"], [baseRow.owner, null], (v) => (v === null ? "null" : "published")),
  dimensionOf("reasons", [
    { label: "none", apply: (d: Draft) => { d.attention_reasons = []; } },
    { label: "two", apply: (d: Draft) => { d.attention_reasons = ["DEPLOYMENT_ATTENTION", "RECONCILIATION_OPEN"]; } },
    { label: "three", apply: (d: Draft) => { d.attention_reasons = ["A_ONE", "B_TWO", "C_THREE"]; } },
  ]),
  metricAxis("account_balance"),
  metricAxis("equity_series_30d"),
];
/** Keeps the matrix to states a source could publish: no deployments means research only, and reasons mean attention. */
const excludeB = (p: Readonly<Record<string, string>>) => {
  const none = p.deployments === "none";
  if (none !== (p.stage === "RESEARCH" && p.health === "RESEARCH_ONLY")) return true;
  if (!none && (p.stage === "RESEARCH" || p.health === "RESEARCH_ONLY")) return true;
  return p.reasons !== "none" && p.health !== "ATTENTION";
};
const STAGE_WORD: Record<string, string> = { RESEARCH: "Research", PAPER: "Paper", SANDBOX: "Sandbox", CANARY: "Canary", LIVE: "Live" };
const HEALTH_FLAG: Record<string, [string, string]> = { READY: ["ok", "Ready"], ATTENTION: ["attention", "Needs attention"], RESEARCH_ONLY: ["neutral", "Research only"], FINDING: ["attention", "Finding open"] };
const DEP_RANK: Record<string, number> = { READY: 0, FINDING: 1, ATTENTION: 2 };

function rowProblems(raw: Draft): string[] {
  const item = readAlphaFleetItem(raw);
  if (item === null) return ["refused"];
  const row = toFleetRow(item);
  const wrong: string[] = [];
  if (row.alphaId !== raw.alpha_id || row.label !== raw.alpha_label || row.version !== raw.version) wrong.push("identity changed");
  if (row.owner !== raw.owner) wrong.push(`owner ${String(row.owner)} for ${String(raw.owner)}`);
  if (row.stageCode !== raw.stage || row.stage !== STAGE_WORD[raw.stage]) wrong.push("stage word");
  if (row.stageCodes.join() !== raw.stages.join()) wrong.push("stages");
  if (row.otherStages.join() !== raw.stages.filter((s: string) => s !== raw.stage).map((s: string) => STAGE_WORD[s]).join()) wrong.push("other stages");
  const [kind, label] = HEALTH_FLAG[raw.health]!;
  if (row.health.kind !== kind || row.health.label !== label) wrong.push(`health ${raw.health} -> ${row.health.kind}/${row.health.label}`);
  if (row.attention.map((a) => a.code).join() !== raw.attention_reasons.join()) wrong.push("attention codes");
  if (row.deployments.count !== raw.deployments.length) wrong.push("deployment count");
  const worst = raw.deployments.reduce((acc: string | null, dep: Draft) => (acc === null || DEP_RANK[dep.health]! > DEP_RANK[acc]! ? dep.health : acc), null);
  if (worst === null ? row.deployments.worst !== null : row.deployments.worst?.label !== HEALTH_FLAG[worst]![1]) wrong.push(`worst deployment ${String(worst)}`);
  for (const [key, published] of Object.entries<Draft>(raw.metrics_availability)) {
    const read = item.metricsAvailability[key];
    if (read?.state !== published.state || read?.reasonCode !== published.reason_code) wrong.push(`metric ${key} changed`);
  }
  // Identity only: no money word of the row reaches the model.
  if (JSON.stringify(row).includes(raw.deployments[0]?.net_pnl ?? "\u0000none")) wrong.push("money reached the row");
  return wrong;
}

describe("L1 · matrix B · row states", () => {
  const all = cartesian(baseRow, AXES_B, { exclude: excludeB });
  const pairs = pairwise(baseRow, AXES_B, { exclude: excludeB });

  it("prints its size and proves the pairwise subset covers every possible pair", () => {
    const full = coverage(AXES_B, all, { exclude: excludeB });
    const part = coverage(AXES_B, pairs, { exclude: excludeB });
    console.info(describeCoverage("fleet matrix B cartesian", full));
    console.info(describeCoverage("fleet matrix B pairwise", part));
    expect(part.pairsCovered).toBe(part.pairsPossible);
    expect(full.cartesianRaw).toBe(3 * 6 * 4 * 2 * 3 * 4 * 4);
    expect(pairs.length).toBeLessThan(all.length);
  });

  it("every state is a valid L1 state: the published schema accepts the row", () => {
    const bad = all.map((s) => [s.name, rowViolations(s.value)] as const).filter(([, v]) => v.length > 0);
    expect(bad.slice(0, 3)).toEqual([]);
  });

  it("the model maps every state to its documented words and flags (never an unknown health to ok, never a missing owner to a value)", () => {
    const failures = all.flatMap((s) => rowProblems(s.value).map((p) => `${s.name}: ${p}`));
    expect(failures.slice(0, 5)).toEqual([]);
  });

  it("the screen prints each pairwise row with its own words", async () => {
    expect(pairs.length).toBeLessThanOrEqual(PAGE_LIMIT);
    const rows = pairs.map((s, i) => {
      const r = structuredClone(s.value) as Draft;
      r.alpha_id = `alpha_b_${pad(i)}`;
      r.alpha_label = `Row ${pad(i)}`;
      return r;
    });
    const { api } = makeApi(() => envelopeOf(rows));
    const { container } = mount(api);
    await waitForTable();
    const dom = bodyRows();
    expect(dom).toHaveLength(rows.length);
    const cell = (tr: HTMLElement, label: string) => tr.querySelector(`td[data-l='${label}']`)!.textContent ?? "";
    const problems: string[] = [];
    rows.forEach((r, i) => {
      const tr = dom[i]!;
      const stage = cell(tr, "Stage");
      if (!stage.includes(STAGE_WORD[r.stage]!)) problems.push(`${r.alpha_label}: stage`);
      if (!stage.includes(HEALTH_FLAG[r.health]![1])) problems.push(`${r.alpha_label}: health`);
      if (cell(tr, "Owner") !== (r.owner ?? "Not available")) problems.push(`${r.alpha_label}: owner cell "${cell(tr, "Owner")}"`);
      const deployments = cell(tr, "Deployments");
      if (r.deployments.length === 0 ? !deployments.includes("None deployed") : !deployments.includes(`${r.deployments.length === 1 ? "1 deployment" : `${r.deployments.length} deployments`}`)) problems.push(`${r.alpha_label}: deployments "${deployments}"`);
      if (r.attention_reasons.length > 2 && !stage.includes("and 1 more")) problems.push(`${r.alpha_label}: hidden reasons not counted`);
      if (r.health === "READY" && tr.querySelector('.exec-fleet-stagecell [data-k="attention"], .exec-fleet-stagecell [data-k="unknown"]')) problems.push(`${r.alpha_label}: ready row carries a warning`);
    });
    expect(problems).toEqual([]);
    // Metric reasons are not drawn on this slice, and no cell is a dash, N/A or a bare zero.
    expect(container.textContent).not.toMatch(/SOURCE_GAP|NO_ROWS_YET|N\/A|\u2014|\u2013/);
    const cells = [...container.querySelectorAll("td")].map((td) => (td.textContent ?? "").trim());
    expect(cells.filter((t) => /^(-|0)?$/.test(t))).toEqual([]);
  });
});

/* ═════════════════════════ L2 · scale ═════════════════════════ */
function bigRows(count: number): Draft[] {
  return cloneRows(baseRow, count, (r: Draft, i) => {
    const stage = STAGES[i % STAGES.length]!;
    r.alpha_id = `alpha_${pad(i)}`;
    r.alpha_label = `Alpha ${pad(i)}`;
    r.owner = `owner_${pad(i % 40, 2)}`;
    r.portfolios = [{ portfolio_id: `pf_${i % 12}`, name: `Portfolio ${i % 12}`, base_currency: "USDT" }];
    r.stage = stage;
    r.stages = [stage];
    r.health = stage === "RESEARCH" ? "RESEARCH_ONLY" : i % 7 === 0 ? "ATTENTION" : "READY";
    r.attention_reasons = r.health === "ATTENTION" ? ["DEPLOYMENT_ATTENTION"] : [];
    r.deployments = stage === "RESEARCH" ? [] : [Object.assign(depOf("READY", i), { deployment_id: `dep_${pad(i)}`, stage })];
  });
}
const FILTER_ALL = "filter:all";

function pagesOf(rows: Draft[], size = PAGE_LIMIT): { pages: Draft[]; cursors: string[] } {
  return splitIntoPages(rows, size, FILTER_ALL, (r: Draft) => r.alpha_id as string, (slice, info) => {
    const env = envelopeOf(slice, {
      total_count: rows.length, filtered_count: rows.length, has_more: info.hasMore, next_cursor: info.nextCursor,
      has_previous: info.hasPrevious, prev_cursor: info.prevCursor,
    });
    env.summary = summaryFor(rows);
    return env;
  });
}

describe("L2 · scale", () => {
  const rows = bigRows(200);
  const { pages, cursors } = pagesOf(rows);

  it("builds 200 unique rows over 4 keyset pages, 40 owners, 12 portfolios, every page schema-valid", () => {
    console.info(`fleet L2: ${rows.length} rows, ${pages.length} pages, ${new Set(rows.map((r) => r.owner)).size} owners, ${new Set(rows.map((r) => r.portfolios[0].portfolio_id)).size} portfolios, ${cursors.length} cursors, page bytes ${pages.map((p) => serializedBytes(p)).join("/")}`);
    expect(pages).toHaveLength(4);
    expect(cursors).toHaveLength(3);
    expect(new Set(rows.map((r) => r.alpha_id)).size).toBe(200);
    expect(new Set(rows.map((r) => r.owner)).size).toBe(40);
    expect(new Set(rows.map((r) => r.portfolios[0].portfolio_id)).size).toBe(12);
    for (const page of pages) expect(violations(page)).toEqual([]);
    expect(cursors.every((c) => cursorFilter(c) === FILTER_ALL)).toBe(true);
  });

  it("reads all four pages and maps 200 rows inside the stated budgets", () => {
    const read = timed(() => pages.map((p) => readAlphaFleet(p)));
    expect(read.value.every((e) => e !== null)).toBe(true);
    const items = read.value.flatMap((e) => e!.page.rows);
    const model = timed(() => items.map(toFleetRow));
    console.info(`fleet L2 reader 200 rows: ${read.ms.toFixed(1)} ms (budget ${BUDGET_READ_200_MS}); model: ${model.ms.toFixed(1)} ms (budget ${BUDGET_MODEL_200_MS})`);
    expect(read.ms).toBeLessThan(BUDGET_READ_200_MS);
    expect(model.ms).toBeLessThan(BUDGET_MODEL_200_MS);
    expect(new Set(model.value.map((r) => r.key)).size).toBe(200);
    expect(model.value.map((r) => r.alphaId)).toEqual(rows.map((r) => r.alpha_id));
    const failures = rows.flatMap((r) => rowProblems(r).map((p) => `${r.alpha_id}: ${p}`));
    expect(failures).toEqual([]);
  });

  it("walks the cursor chain: each page asks for the cursor of the page before", () => {
    const chain = pages.map((p) => readAlphaFleet(p)!.page);
    expect(chain[0]!.nextCursor).toBe(cursors[0]);
    expect(chain[1]!.nextCursor).toBe(cursors[1]);
    expect(chain[2]!.nextCursor).toBe(cursors[2]);
    expect(chain[3]!.nextCursor).toBeNull();
    expect(chain[3]!.hasMore).toBe(false);
    expect(chain.map((c) => c.hasPrevious)).toEqual([false, true, true, true]);
  });

  it("a 1 MiB page (50 rows of deployments) is schema-valid, read inside the budget, and keeps its counts", () => {
    const make = (factor: number) => envelopeOf(cloneRows(bigRows(PAGE_LIMIT)[1]!, PAGE_LIMIT, (r: Draft, i) => {
      r.alpha_id = `alpha_big_${pad(i)}`;
      r.deployments = Array.from({ length: factor }, (_, k) => Object.assign(depOf("READY", k), { deployment_id: `dep_${pad(i)}_${pad(k, 3)}`, account_id: `acc_${pad(i)}_${pad(k, 3)}` }));
    }));
    const { value, factor, bytes } = fillToBytes(make, MIB, 200);
    const read = timed(() => readAlphaFleet(value));
    console.info(`fleet L2 1 MiB page: ${bytes} bytes (${(bytes / MIB).toFixed(2)} MiB), ${factor} deployments per row, reader ${read.ms.toFixed(1)} ms (budget ${BUDGET_READ_1MIB_MS})`);
    expect(bytes).toBeGreaterThanOrEqual(MIB);
    expect(violations(value)).toEqual([]);
    expect(read.ms).toBeLessThan(BUDGET_READ_1MIB_MS);
    const envelope = read.value!;
    expect(envelope.page.rows).toHaveLength(PAGE_LIMIT);
    expect(envelope.page.rows.every((r) => r.deployments.length === factor)).toBe(true);
    const model = timed(() => envelope.page.rows.map(toFleetRow));
    expect(model.ms).toBeLessThan(BUDGET_MODEL_200_MS);
    expect(model.value.every((r) => r.deployments.count === factor)).toBe(true);
  });

  it("the screen stays inside the DOM-row cap: 300 loaded rows draw at most 200, say so, and stop offering more", async () => {
    const big = bigRows(300);
    const set = pagesOf(big);
    const byCursor = new Map<string | null, Draft>([[null, set.pages[0]], ...set.cursors.map((c, i) => [c, set.pages[i + 1]] as const)]);
    const { api, calls } = makeApi((query) => byCursor.get(query.after ?? null) ?? set.pages[0]);
    const { container } = mount(api);
    const started = performance.now();
    await waitForTable();
    for (let step = 0; step < 3; step += 1) {
      const button = await screen.findByRole("button", { name: /Load more/ }, { timeout: 10_000 });
      fireEvent.click(button);
      await waitFor(() => expect(bodyRows().length).toBe(PAGE_LIMIT * (step + 2)), { timeout: 10_000 });
    }
    const ms = performance.now() - started;
    console.info(`fleet L2 screen: 4 pages mounted in ${ms.toFixed(0)} ms (budget ${BUDGET_RENDER_200_MS}), ${bodyRows().length} DOM rows (cap ${ROW_CAP}), ${calls.length} requests`);
    expect(bodyRows()).toHaveLength(ROW_CAP);
    expect(ms).toBeLessThan(BUDGET_RENDER_200_MS);
    expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
    expect(container.textContent).toContain(`Showing the first ${ROW_CAP} rows`);
    // Each follow-up asked for the cursor the page before published, under the same filter.
    expect(calls.slice(1).map((c) => c.after)).toEqual(set.cursors.slice(0, 3));
    expect(calls.every((c) => c.limit === PAGE_LIMIT)).toBe(true);
  });
});

/* ═════════════════════════ L3 · negative ═════════════════════════ */
const ROW0 = ["page", "rows", 0] as const;
const row0 = (...rest: (string | number)[]) => [...ROW0, ...rest];

interface Group { label: string; cases: NegativeCase[]; mustReject: (c: NegativeCase) => boolean }
const never = () => false;
const required = (c: NegativeCase) => c.category === "wrong-type" || c.category === "null-vs-absent" || c.category === "missing-required" || c.category === "bad-integer" || c.category === "truncated";

const OTHER_SCHEMAS = ["execution.alpha-fleet-list.v1", "execution.bindings-list.v1", "execution.portfolio-list.v1"];
const ENVELOPE_REQUIRED = [["environment"], ["freshness"], ["completeness"], ["read_at"], ["record_authority"], ["page"], ["summary"], ["page", "rows"], ["page", "total_count"], ["page", "filtered_count"]] as const;
const GROUPS: Group[] = [
  { label: "schema_version", cases: schemaVersionCases(canonical, ["schema_version"], NAME, OTHER_SCHEMAS), mustReject: () => true },
  { label: "record_authority", cases: enumCases(canonical, ["record_authority"], ["PORTAL_PROJECTION"]), mustReject: () => true },
  { label: "envelope required", cases: requiredCases(canonical, ENVELOPE_REQUIRED.map((p) => [...p])), mustReject: () => true },
  { label: "envelope strings", cases: ["environment", "freshness", "completeness", "read_at"].flatMap((k) => stringCases(canonical, [k])), mustReject: required },
  { label: "page counts", cases: ["total_count", "filtered_count"].flatMap((k) => integerCases(canonical, ["page", k])), mustReject: () => true },
  { label: "summary counts", cases: ["alpha_count", "deployment_count", "portfolio_count", "needs_attention_count", "research_only_count"].flatMap((k) => integerCases(canonical, ["summary", k])), mustReject: () => true },
  { label: "rows array", cases: arrayCases(canonical, ["page", "rows"], { idKey: "alpha_id" }), mustReject: (c) => c.category !== "duplicate-id" },
  { label: "row strings", cases: ["alpha_id", "alpha_label", "version", "stage", "health", "updated_at"].flatMap((k) => stringCases(canonical, row0(k))), mustReject: required },
  { label: "row stages", cases: arrayCases(canonical, row0("stages")), mustReject: required },
  { label: "row deployments", cases: arrayCases(canonical, row0("deployments"), { idKey: "deployment_id" }), mustReject: (c) => c.category !== "duplicate-id" },
  { label: "row attention_reasons", cases: arrayCases(canonical, row0("attention_reasons")), mustReject: required },
  { label: "position_fact_count", cases: integerCases(canonical, row0("deployments", 0, "position_fact_count")), mustReject: () => true },
  { label: "money wrong types", cases: ["net_pnl", "realized_pnl", "unrealized_pnl", "exposure"].flatMap((k) => decimalCases(canonical, row0("deployments", 0, k)).filter((c) => c.category === "wrong-type" || c.category === "number-as-decimal")), mustReject: () => true },
  { label: "health words", cases: enumCases(canonical, row0("health"), HEALTHS), mustReject: never },
  { label: "stage words", cases: enumCases(canonical, row0("stage"), STAGES), mustReject: never },
  { label: "metric state words", cases: enumCases(canonical, row0("metrics_availability", "account_balance", "state"), METRIC_STATES), mustReject: (c) => c.category === "unknown-enum" && typeof (c.value as Draft).page.rows[0].metrics_availability.account_balance.state !== "string" },
  { label: "optional strings", cases: ["owner"].flatMap((k) => stringCases(canonical, row0(k))), mustReject: never },
  { label: "optional envelope", cases: ["source_as_of", "source_authority", "projection_refreshed_at"].flatMap((k) => stringCases(canonical, [k])), mustReject: never },
  { label: "cursors", cases: ["next_cursor", "prev_cursor"].flatMap((k) => stringCases(canonical, ["page", k])), mustReject: never },
  { label: "bad roots", cases: rootCases(), mustReject: () => true },
  {
    label: "prototype pollution",
    cases: pollutionCases(canonical, [[], ["page"], ["summary"], ["summary", "stage_counts"], ROW0.slice() as (string | number)[], row0("metrics_availability"), row0("deployments", 0), row0("portfolios", 0)]),
    mustReject: never,
  },
];

describe("L3 · negative", () => {
  const total = GROUPS.reduce((n, g) => n + g.cases.length, 0);
  const rowCases = GROUPS.flatMap((g) => g.cases.map((c) => ({ group: g, c })));

  it("reports its case counts, and every case that should be invalid really violates the published schema", () => {
    console.info(`fleet L3: ${total} cases in ${GROUPS.length} groups: ${GROUPS.map((g) => `${g.label} ${g.cases.length}`).join(", ")}`);
    expect(total).toBeGreaterThan(400);
    const notInvalid = rowCases
      .filter(({ c }) => c.category !== "bad-root" && c.category !== "huge-string" && c.category !== "unknown-enum")
      .filter(({ c }) => violations(c.value).length === 0)
      .map(({ c }) => c.name);
    // Valid under the schema on purpose: integers past 2^53 (the schema sets no maximum, the reader is stricter),
    // a repeated id (the schema has no uniqueness rule), and null or absent on an optional field.
    const meant = [
      /^bad-integer: .* <- (9007199254740992|9007199254740994|1e\+21|1e\+308)$/,
      /^duplicate-id: /,
      /(owner|source_as_of|source_authority|projection_refreshed_at|next_cursor|prev_cursor) <- (null|absent)$/,
    ];
    expect(notInvalid.filter((name) => !meant.some((re) => re.test(name)))).toEqual([]);
  });

  it.each(rowCases.map(({ group, c }) => [`${group.label} · ${c.name}`, group, c] as const))("%s", (_name, group, c) => {
    expect(() => readAlphaFleet(c.value)).not.toThrow();
    const answer = readAlphaFleet(c.value);
    if (group.mustReject(c)) expect(answer, "must be refused").toBeNull();
    if (answer !== null) {
      // Accepted payloads: nothing the case planted reaches the answer as a value, and every row still maps.
      if (group.label !== "health words" && group.label !== "stage words" && group.label !== "metric state words") expect(leaked(answer, c.probe)).toBe(false);
      expect(() => answer.page.rows.map(toFleetRow)).not.toThrow();
      expect(() => fleetKpis(answer.summary ?? null)).not.toThrow();
      expect(() => lensCounts(answer.summary ?? null)).not.toThrow();
    }
    expect(prototypeIsClean()).toBe(true);
  });

  it("an unknown health or stage word is shown as itself, never as ok", () => {
    for (const { c } of rowCases.filter(({ group }) => group.label === "health words")) {
      const answer = readAlphaFleet(c.value);
      if (answer === null) continue;
      const published = (c.value as Draft).page.rows[0].health as unknown;
      const view = toFleetRow(answer.page.rows[0]!).health;
      if (typeof published === "string" && HEALTHS.includes(published)) continue;
      // Lowercase spellings are the one place a non-published word is read as a published one: see the defect below.
      if (typeof published === "string" && HEALTHS.includes(published.toUpperCase()) && published === published.toLowerCase()) continue;
      expect(view.kind, c.name).not.toBe("ok");
    }
  });

  it("an unknown freshness tier is never drawn as fresh", async () => {
    for (const word of ["fresh", " FRESH", "FRESH ", "OK", "LIVE", "UNKNOWN_WORD_FROM_TESTKIT"]) {
      const env = structuredClone(canonical);
      env.freshness = word;
      const { api } = makeApi(() => env);
      const { container, unmount } = mount(api);
      await waitFor(() => expect(container.querySelector(".exec-fleet-fresh .exec-flag")).not.toBeNull(), { timeout: 10_000 });
      const kind = container.querySelector(".exec-fleet-fresh .exec-flag")!.getAttribute("data-k");
      if (word !== "fresh") expect(kind, word).not.toBe("ok");
      unmount();
    }
  });

  it("a payload that is not an object is refused wherever the screen would read it", () => {
    for (const { c } of rootCases().map((x) => ({ c: x }))) {
      expect(readAlphaFleet(c.value)).toBeNull();
      expect(readAlphaFleetItem(c.value)).toBeNull();
    }
  });

  it("prints how much looser the V1 reader is than the published schema, by category", () => {
    const gap = new Map<string, string[]>();
    let invalid = 0;
    for (const { group, c } of rowCases) {
      if (c.category === "bad-root") continue;
      if (violations(c.value).length === 0) continue;
      invalid += 1;
      if (readAlphaFleet(c.value) !== null) gap.set(c.category, [...(gap.get(c.category) ?? []), `${group.label}: ${c.name}`]);
    }
    const accepted = [...gap.values()].reduce((n, v) => n + v.length, 0);
    console.info(`fleet L3 gap: reader accepts ${accepted} of ${invalid} schema-invalid payloads; ${[...gap.entries()].map(([k, v]) => `${k} ${v.length}`).join(", ")}`);
    for (const [category, names] of gap) console.info(`  ${category}: e.g. ${names.slice(0, 3).join(" | ")}`);
    expect(invalid).toBeGreaterThan(300);
  });
});

/* ═══════════════════ documented defects (turn red when fixed) ═══════════════════ */
describe("documented defects", () => {
  /*
   * DEFECT D1 (profileRead.ts readFleetDeployment, `str(item.net_pnl)` and the
   * three siblings, plus readCurrencyValue/Balance/Pnl): a money field is
   * accepted as any non-empty string, so "1e5", "NaN", "-0" and "0x1F" pass the
   * reader that Rules 9.8.2 says checks decimals. V2 Fleet draws no money, but
   * the V1 screens that share this reader do, and formatExact prints a
   * non-decimal string as received.
   */
  it.fails("DEFECT D1: a non-decimal string in net_pnl is refused by readAlphaFleet", () => {
    for (const bad of ["1e5", "NaN", "-0", "0x1F", "1,000", "01"]) {
      const env = structuredClone(canonical);
      env.page.rows[0].deployments[0].net_pnl = bad;
      expect(readAlphaFleet(env), bad).toBeNull();
    }
  });

  /*
   * DEFECT D2 (profileRead.ts readManagerPage): two rows with the same
   * alpha_id in one page are accepted. The screen keys rows by alpha_id, so the
   * table draws two rows with one React key; useFleetRead de-duplicates only
   * across later pages, not within the first.
   */
  it.fails("DEFECT D2: a page with a repeated alpha_id is refused or collapsed to unique rows", () => {
    const env = structuredClone(canonical);
    env.page.rows = [env.page.rows[0], structuredClone(env.page.rows[0])];
    env.page.total_count = 2;
    env.page.filtered_count = 2;
    const read = readAlphaFleet(env);
    const ids = read === null ? [] : read.page.rows.map((r) => r.alphaId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /*
   * DEFECT D3 (fleetModel.ts healthView and index.tsx freshnessFlag): both
   * upper-case the word before matching, so the unpublished spellings `ready`
   * and `fresh` are drawn as the success state. The enum is upper case; a
   * reader that does not repair decimals should not repair enums.
   */
  it.fails("DEFECT D3: a lower-case health word is not drawn as ok", () => {
    expect(healthView("ready").kind).not.toBe("ok");
  });

  /*
   * DEFECT D4 (profileRead.ts readFleetSummary via fleetModel.lensCounts): a
   * stage absent from stage_counts prints as `0`. Whether the source omits
   * zero stages or omits unpublished ones is not stated in the schema; until it
   * is, `0` may be an invented zero (Rules 3.3). Raised to Codex as a question.
   */
  it.fails("DEFECT D4: a stage missing from stage_counts is not counted as 0", () => {
    const env = structuredClone(canonical);
    env.summary.stage_counts = { PAPER: 1 };
    const counts = lensCounts(readAlphaFleet(env)!.summary!);
    expect(counts.sandbox.text).toBeNull();
  });
});

/* ═══════════════════ hook · cursor of another filter ═══════════════════ */
describe("L3 · a cursor issued under another filter is never used", () => {
  const rows = bigRows(100);
  const filtersA: FleetFilters = { q: "alpha", stages: [], owner: null, health: null, sort: null };
  const filtersB: FleetFilters = { q: "beta", stages: [], owner: null, health: null, sort: null };

  function pagesFor(filter: string) {
    return splitIntoPages(rows, PAGE_LIMIT, filter, (r: Draft) => r.alpha_id as string, (slice, info) =>
      envelopeOf(slice.map((r: Draft) => ({ ...r, alpha_label: `${filter} ${r.alpha_label}` })), {
        total_count: rows.length, filtered_count: rows.length, has_more: info.hasMore, next_cursor: info.nextCursor,
      }));
  }

  it("keys differ per filter and never include the cursor", () => {
    expect(queryKey(filtersA)).not.toBe(queryKey(filtersB));
    expect(fleetQuery(filtersA, keysetCursor("A", "x")).after).toBe(keysetCursor("A", "x"));
    expect(queryKey(filtersA)).toBe(JSON.stringify(fleetQuery(filtersA)));
  });

  it("switching filters drops page one of the old filter, and a late page two from the old filter is ignored", async () => {
    const a = pagesFor("A");
    const b = pagesFor("B");
    let releaseA: (() => void) | null = null;
    const getAlphaFleet = vi.fn(async (query: AlphaFleetQuery = {}) => {
      const filter = query.search === "beta" ? "B" : "A";
      const set = filter === "A" ? a : b;
      const page = query.after ? set.pages[1] : set.pages[0];
      if (filter === "A" && query.after) await new Promise<void>((resolve) => { releaseA = resolve; });
      const envelope = readAlphaFleet(page)!;
      return { ok: true as const, value: envelope };
    });
    const api = { getAlphaFleet } as unknown as ExecutionApi;
    const hook = renderHook(({ filters }) => useFleetRead(api, true, queryKey(filters), (after) => fleetQuery(filters, after)), { initialProps: { filters: filtersA } });
    await waitFor(() => expect(hook.result.current.state.phase).toBe("ready"));
    expect(hook.result.current.items[0]!.alphaLabel.startsWith("A ")).toBe(true);
    const cursorA = hook.result.current.nextCursor!;
    expect(cursorFilter(cursorA)).toBe("A");

    act(() => { hook.result.current.loadMore(); });
    await waitFor(() => expect(getAlphaFleet).toHaveBeenCalledTimes(2));
    hook.rerender({ filters: filtersB });
    await waitFor(() => expect(hook.result.current.items[0]?.alphaLabel.startsWith("B ")).toBe(true));
    await act(async () => {
      releaseA?.();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    // Nothing from filter A survived, the first request under B carried no cursor, and B's own cursor is B's.
    expect(hook.result.current.items.every((item) => item.alphaLabel.startsWith("B "))).toBe(true);
    expect(hook.result.current.items).toHaveLength(PAGE_LIMIT);
    const underB = getAlphaFleet.mock.calls.map((c) => c[0] as AlphaFleetQuery).filter((q) => q.search === "beta");
    expect(underB[0]!.after).toBeUndefined();
    expect(cursorFilter(hook.result.current.nextCursor!)).toBe("B");
    expect(hook.result.current.nextCursor).not.toBe(cursorA);
  });
});

// Kept in the file so the whole lane is one import graph.
export type { AlphaFleetItem };
export { FLEET_LENSES };
