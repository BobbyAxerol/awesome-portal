/**
 * Reader conformance for the Portfolios register (Rules 9.8.3, L0 to L3):
 * `readPortfolioList` (V1 reader, read only) -> `listModel` -> the screen.
 *
 * L0  the canonical `execution-portfolio-list` verbatim, digest unchanged at the end.
 * L1  two matrices built from the published enums, each state checked against
 *     the schema first:
 *       A  envelope: freshness x completeness x source_as_of x truncation x branches x rows
 *       B  row:      state x base currency x environments x allocated x owner x counts
 *     Reader and model are checked on every state; the screen is rendered for
 *     the pairwise subset of A and for one page holding the pairwise rows of B.
 * L2  100 rows (the schema's cap) with 20 currencies in the worst row: reader,
 *     model, sort and render budgets; the DOM-row cap is in portfolios.test.tsx.
 * L3  negative payloads: never a throw; the screen never prints a decimal the
 *     boundary refuses; an unknown environment word never becomes a success domain.
 *     Where the V1 reader is looser than the published schema (exponents,
 *     leading zeros, signed zeros and unknown environment words pass it), the
 *     gap is counted and printed, and the screen is the second line of defence.
 *
 * The testkit checker does not know `minProperties`, which the envelope's
 * `environments` map uses, so the envelope is checked for its required keys and
 * every item and branch against its own definition.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { readPortfolioList } from "../../../api/profileRead";
import type { ExecutionApi } from "../../../api/ports";
import { formatInstant } from "../../boundary";
import { whyText } from "../../gapWhyTestUtil";
import { cartesian, coverage, describeCoverage, dimension, dimensionOf, pairwise, type Draft } from "../../testkit/matrix";
import { canonicalDigest, loadCanonical, loadSchema, schemaEnum } from "../../testkit/loadCanonical";
import {
  arrayCases, decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
} from "../../testkit/negative";
import { cloneRows, pad, serializedBytes, timed } from "../../testkit/scale";
import { validateAgainst } from "../../testkit/schema";
import { makeApi } from "./harness.fixtures";
import PortfolioListScreen from "./index";
import { ROW_CAP, allocatedIn, countLine, degradedBranches, filterRows, parseSort, sortRows, toRow, toRows, writeSort } from "./listModel";

afterEach(cleanup);

const BUDGET_READ_MS = 400;
const BUDGET_MODEL_MS = 200;
const BUDGET_RENDER_MS = 15_000;
const BUDGET_STATE_MS = 5_000;

const NAME = "execution-portfolio-list.valid.json";
const SCHEMA = "execution-portfolio-list.v1";
const digestBefore = canonicalDigest(NAME);
afterAll(() => { expect(canonicalDigest(NAME)).toBe(digestBefore); });

const canonical = loadCanonical<Draft>(NAME);
const baseItem: Draft = canonical.items[0];

const FRESHNESS = schemaEnum(SCHEMA, "/$defs/PortfolioListResponse/properties/freshness");
const COMPLETENESS = schemaEnum(SCHEMA, "/$defs/PortfolioListResponse/properties/completeness");
const BRANCH_STATES = schemaEnum(SCHEMA, "/$defs/EnvironmentBranch/properties/state");
const ENVIRONMENTS = schemaEnum(SCHEMA, "/$defs/Environment");
const REQUIRED = (loadSchema(SCHEMA).$defs as Record<string, { required: string[] }>).PortfolioListResponse.required;

function violations(envelope: Draft): string[] {
  const missing = REQUIRED.filter((key) => !(key in envelope)).map((key) => `${key}: required`);
  const items = (envelope.items as Draft[]).flatMap((item, i) => validateAgainst(SCHEMA, "/$defs/PortfolioListItem", item).map((v) => `items[${i}] ${v}`));
  const branches = Object.entries(envelope.environments as Record<string, Draft>).flatMap(([key, branch]) => validateAgainst(SCHEMA, "/$defs/EnvironmentBranch", branch).map((v) => `environments.${key} ${v}`));
  const size = (envelope.items as Draft[]).length > 100 ? ["items: more than 100 items"] : [];
  return [...missing, ...items, ...branches, ...size];
}
const itemViolations = (item: Draft) => validateAgainst(SCHEMA, "/$defs/PortfolioListItem", item);

const mount = (api: ExecutionApi, entry = "/deployments/portfolios") =>
  render(<MemoryRouter initialEntries={[entry]}><PortfolioListScreen api={api} /></MemoryRouter>);
const loaded = () => screen.findByRole("table", { name: "Portfolios" }, { timeout: 10_000 });
const bodyRows = () => within(screen.getByRole("table", { name: "Portfolios" })).getAllByRole("row").slice(1);
const cellOf = (tr: HTMLElement, label: string) => tr.querySelector(`td[data-l='${label}']`)?.textContent ?? "";

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("passes the checker (so the checker is not vacuous) and a broken copy does not", () => {
    expect(violations(canonical)).toEqual([]);
    const broken = structuredClone(canonical);
    delete broken.freshness;
    broken.items[0].allocation_count = -1;
    expect(violations(broken).length).toBeGreaterThanOrEqual(2);
  });

  it("reads through the real reader and the model without change", () => {
    const read = readPortfolioList(canonical)!;
    expect(read.freshness).toBe("FRESH");
    expect(read.completeness).toBe("PARTIAL");
    expect(read.items).toHaveLength(2);
    const [carry, una] = read.items.map(toRow);
    expect(carry).toMatchObject({ portfolioId: "pf_carry_core", label: "Carry Core", owner: "bobby", domain: "simulated", domainLabel: "Simulated", comparable: true, mixedBooks: false });
    expect(carry.allocated).toEqual([{ currency: "USDT", value: "30000" }]);
    expect(una).toMatchObject({ unallocated: true, label: "Unallocated", comparable: false, owner: null, allocated: [] });
    expect(una.notComparableReason).toContain("nothing to compare");
    expect(degradedBranches(read)).toEqual([
      { environment: "live", state: "UNAVAILABLE", reasonCode: "N31_PROJECTION_NOT_READY" },
    ]);
  });

  it("is loaded as an independent copy each time", () => {
    const a = loadCanonical<Draft>(NAME);
    a.items[0].name = "changed";
    expect(loadCanonical<Draft>(NAME).items[0].name).toBe("Carry Core");
  });

  it("refuses the alpha fleet's canonical, whose schema_version differs", () => {
    expect(readPortfolioList(loadCanonical("execution-alpha-fleet-list.v2"))).toBeNull();
  });
});

/* ═════════════════════════ L1 · matrix A, envelope ═════════════════════════ */
const BRANCHES: [string, Draft][] = [
  ["all available", { paper: { state: "AVAILABLE", reason_code: null }, sandbox: { state: "AVAILABLE", reason_code: null }, live: { state: "AVAILABLE", reason_code: null } }],
  ["live unavailable", { paper: { state: "AVAILABLE", reason_code: null }, live: { state: "UNAVAILABLE", reason_code: "N31_PROJECTION_NOT_READY" } }],
  ["paper partial, sandbox empty", { paper: { state: "PARTIAL", reason_code: "LAGGING" }, sandbox: { state: "EMPTY", reason_code: null } }],
];
const AXES_A = [
  dimension("freshness", ["freshness"], FRESHNESS),
  dimension("completeness", ["completeness"], COMPLETENESS),
  dimension("source_as_of", ["source_as_of"], [canonical.source_as_of, null], (v) => (v === null ? "null" : "published")),
  dimensionOf("branches", BRANCHES.map(([label, value]) => ({ label, apply: (d: Draft) => { d.environments = structuredClone(value); } }))),
  dimensionOf("population", [
    { label: "whole", apply: () => undefined },
    { label: "truncated", apply: (d: Draft) => { d.truncated = true; d.total_portfolios = 7; } },
    { label: "empty", apply: (d: Draft) => { d.items = []; d.total_portfolios = 0; d.truncated = false; } },
  ]),
];

describe("L1 · matrix A · envelope states", () => {
  const all = cartesian(canonical, AXES_A);
  const pairs = pairwise(canonical, AXES_A);

  it("prints its size and proves the pairwise subset covers every possible pair", () => {
    const full = coverage(AXES_A, all);
    const part = coverage(AXES_A, pairs);
    console.info(describeCoverage("portfolios matrix A cartesian", full));
    console.info(describeCoverage("portfolios matrix A pairwise", part));
    expect(all).toHaveLength(FRESHNESS.length * COMPLETENESS.length * 2 * BRANCHES.length * 3);
    expect(part.pairsCovered).toBe(part.pairsPossible);
  });

  it("every state is a valid L1 state: the published schema accepts it", () => {
    expect(all.map((s) => [s.name, violations(s.value)] as const).filter(([, v]) => v.length > 0).slice(0, 3)).toEqual([]);
    // The branch words the matrix uses are the published ones, so the axis is not a copy of the vocabulary.
    const used = BRANCHES.flatMap(([, value]) => Object.values<Draft>(value).map((b) => b.state));
    expect(used.filter((word) => !BRANCH_STATES.includes(word))).toEqual([]);
  });

  it("the reader carries every state verbatim: no tier is repaired, no absence becomes a value", () => {
    const wrong: string[] = [];
    for (const { name, value } of all) {
      const d = value as Draft;
      const read = readPortfolioList(value);
      if (read === null) { wrong.push(`${name}: refused`); continue; }
      if (read.freshness !== d.freshness || read.completeness !== d.completeness) wrong.push(`${name}: tier changed`);
      if (read.sourceAsOf !== d.source_as_of) wrong.push(`${name}: source_as_of changed`);
      if (read.truncated !== d.truncated || read.totalPortfolios !== d.total_portfolios) wrong.push(`${name}: population changed`);
      if (read.items.length !== d.items.length) wrong.push(`${name}: rows changed`);
      if (JSON.stringify(Object.entries(read.environmentBranches).map(([k, b]) => [k, b.state, b.reasonCode])) !== JSON.stringify(Object.entries(d.environments).map(([k, b]: [string, Draft]) => [k, b.state, b.reason_code]))) wrong.push(`${name}: branches changed`);
    }
    expect(wrong).toEqual([]);
  });

  it("the model says exactly which branches are not whole", () => {
    for (const { value } of all) {
      const d = value as Draft;
      const expected = Object.entries<Draft>(d.environments).filter(([, b]) => b.state === "UNAVAILABLE" || b.state === "PARTIAL").map(([k]) => k);
      expect(degradedBranches(readPortfolioList(value)!).map((b) => b.environment)).toEqual(expected);
    }
  });

  describe.each(pairs.map((s) => [s.name, s.value] as const))("screen · %s", (_name, input) => {
    const d = input as Draft;
    it("maps the state to the documented UI state", async () => {
      const { container } = mount(makeApi((_m, path) => (path === "/portfolios" ? { status: 200, body: input } : undefined)).api);
      const started = performance.now();
      await waitFor(() => expect(container.querySelector(".exec-pf-fresh")).not.toBeNull(), { timeout: 10_000 });
      await waitFor(() => expect(container.querySelector(".exec-pf-fresh")!.textContent).not.toBe(""), { timeout: 10_000 });
      expect(performance.now() - started).toBeLessThan(BUDGET_STATE_MS);
      // A FRESH read prints no chip (the as-of line says it); every other tier keeps its chip, because it changes what the reader trusts.
      const flag = container.querySelector(".exec-pf-fresh .exec-flag");
      if (d.freshness === "FRESH") expect(flag).toBeNull();
      else {
        expect(flag!.getAttribute("data-k")).toBe("stale");
        expect(flag!.textContent).toContain(d.freshness === "STALE" ? "Stale" : "Aging");
      }
      // The completeness sentence is behind the banner's "?" disclosure; the visible line is one short clause.
      const banners = [...container.querySelectorAll(".exec-pf-banner[role='status']")].map((b) => `${b.textContent ?? ""} ${[...b.querySelectorAll("button[aria-expanded]")].map((t) => whyText(t)).join(" ")}`);
      if (d.completeness === "COMPLETE") expect(banners.some((b) => /The read is/.test(b))).toBe(false);
      else expect(banners.find((b) => b.includes("The read is"))?.toLowerCase()).toContain(d.completeness.toLowerCase());
      const notWhole = Object.entries<Draft>(d.environments).filter(([, b]) => b.state === "UNAVAILABLE" || b.state === "PARTIAL");
      expect(banners.filter((b) => b.includes("Branch not whole"))).toHaveLength(notWhole.length > 0 ? 1 : 0);
      const fresh = container.querySelector(".exec-pf-fresh")!.textContent!;
      if (d.source_as_of === null) expect(fresh).toContain("Source time not published");
      else expect(fresh).toContain(`As of ${formatInstant(d.source_as_of)}`);
      if (d.items.length === 0) {
        expect(await screen.findByText(/published no portfolios/)).toBeTruthy();
        expect(container.querySelectorAll("tbody tr[tabindex]")).toHaveLength(0);
      } else {
        await loaded();
        expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
        expect(container.querySelector(".exec-pf-count-line")!.textContent).toBe(d.truncated ? `Top ${d.items.length} / ${d.total_portfolios} portfolios` : `${d.items.length} portfolios`);
      }
    });
  });
});

/* ═════════════════════════ L1 · matrix B, row ═════════════════════════ */
const ALLOCATIONS: [string, Draft[]][] = [
  ["none", []],
  ["usdt", [{ currency: "USDT", value: "30000" }]],
  ["two", [{ currency: "USDT", value: "540000.00" }, { currency: "JPY", value: "48000000" }]],
  ["three", [{ currency: "USDT", value: "1.50" }, { currency: "JPY", value: "7" }, { currency: "VND", value: "12345678901234567890.123456789" }]],
];
const ENV_SETS: [string, string[]][] = [["paper", ["paper"]], ["live", ["live"]], ["paper+live", ["paper", "live"]], ["all three", ["sandbox", "live", "paper"]]];
const AXES_B = [
  dimension("state", ["state"], ["ACTIVE", "PAUSED", "UNKNOWN"]),
  dimension("base_currency", ["base_currency"], ["USDT", "JPY", "UNKNOWN"]),
  dimensionOf("environments", ENV_SETS.map(([label, value]) => ({ label, apply: (d: Draft) => { d.environments = [...value]; } }))),
  dimensionOf("allocated", ALLOCATIONS.map(([label, value]) => ({ label, apply: (d: Draft) => { d.allocated_by_currency = structuredClone(value); } }))),
  dimension("owner", ["owner"], ["bobby", null], (v) => (v === null ? "null" : "published")),
  dimension("counts", ["allocation_count"], [0, 5]),
];
const domainOf = (envs: string[]) => {
  const real = envs.includes("live");
  const sim = envs.some((e) => e === "paper" || e === "sandbox");
  return real && sim ? "mixed" : real ? "real" : "simulated";
};

describe("L1 · matrix B · row states", () => {
  const all = cartesian(baseItem, AXES_B);
  const pairs = pairwise(baseItem, AXES_B);

  it("prints its size and proves the pairwise subset covers every possible pair", () => {
    const full = coverage(AXES_B, all);
    const part = coverage(AXES_B, pairs);
    console.info(describeCoverage("portfolios matrix B cartesian", full));
    console.info(describeCoverage("portfolios matrix B pairwise", part));
    expect(part.pairsCovered).toBe(part.pairsPossible);
    expect(pairs.length).toBeLessThan(all.length);
  });

  it("every state is a valid L1 state: the published schema accepts the item", () => {
    expect(all.map((s) => [s.name, itemViolations(s.value)] as const).filter(([, v]) => v.length > 0).slice(0, 3)).toEqual([]);
  });

  it("the model maps every state to its documented words (domain, mixed books, comparability, owner, strings kept exact)", () => {
    const wrong: string[] = [];
    for (const { name, value } of all) {
      const d = value as Draft;
      const envelope = { ...structuredClone(canonical), items: [d] };
      const item = readPortfolioList(envelope)?.items[0];
      if (!item) { wrong.push(`${name}: refused`); continue; }
      const row = toRow(item);
      const domain = domainOf(d.environments);
      if (row.domain !== domain) wrong.push(`${name}: domain ${row.domain}`);
      if (row.mixedBooks !== (domain === "mixed" && d.allocated_by_currency.length > 0)) wrong.push(`${name}: mixedBooks ${row.mixedBooks}`);
      if (row.owner !== d.owner) wrong.push(`${name}: owner`);
      if (row.comparable !== true || row.unallocated) wrong.push(`${name}: comparable`);
      if (JSON.stringify(row.allocated) !== JSON.stringify(d.allocated_by_currency)) wrong.push(`${name}: allocated changed`);
      if (row.state !== d.state || row.baseCurrency !== d.base_currency) wrong.push(`${name}: identity changed`);
      if (row.stateKind === "ok" && d.state !== "ACTIVE") wrong.push(`${name}: ${d.state} drawn as ok`);
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it("the screen prints each pairwise row with its own words and exact strings", async () => {
    const items = pairs.map((s, i) => Object.assign(structuredClone(s.value) as Draft, { portfolio_id: `pf_b_${pad(i)}`, name: `Row ${pad(i)}` }));
    const body = { ...structuredClone(canonical), items, total_portfolios: items.length, truncated: false };
    const { container } = mount(makeApi((_m, path) => (path === "/portfolios" ? { status: 200, body } : undefined)).api, "/deployments/portfolios?sort=name");
    await loaded();
    const dom = bodyRows();
    expect(dom).toHaveLength(items.length);
    const problems: string[] = [];
    items.forEach((it) => {
      const tr = dom.find((r) => r.querySelector(".exec-pf-title")?.textContent === it.name)!;
      if (tr === undefined) { problems.push(`${it.name}: row missing`); return; }
      const money = cellOf(tr, "Allocated capital");
      if (it.allocated_by_currency.length === 0 && money !== "Not available · no allocation published") problems.push(`${it.name}: empty allocation says "${money}"`);
      for (const entry of it.allocated_by_currency as Draft[]) if (!money.includes(entry.currency)) problems.push(`${it.name}: ${entry.currency} missing`);
      if (cellOf(tr, "Manager") !== (it.owner ?? "Not available · owner not published")) problems.push(`${it.name}: owner "${cellOf(tr, "Manager")}"`);
      if (domainOf(it.environments) === "mixed" && it.allocated_by_currency.length > 0 && !money.includes("books together")) problems.push(`${it.name}: mixed flag missing`);
      if (it.state !== "ACTIVE" && cellOf(tr, "Health").includes("Active")) problems.push(`${it.name}: ${it.state} drawn as Active`);
      if (cellOf(tr, "Allocations") !== String(it.allocation_count)) problems.push(`${it.name}: count`);
    });
    expect(problems).toEqual([]);
    const exact = new Set([...container.querySelectorAll(".exec-pf-num")].map((n) => n.getAttribute("data-full")));
    expect(exact.has("12345678901234567890.123456789")).toBe(true);
    expect(container.textContent).not.toMatch(/N\/A|—|–/);
  });
});

/* ═════════════════════════ L2 · scale ═════════════════════════ */
function bigEnvelope(count: number, currencies: number): Draft {
  const items = cloneRows(baseItem, count, (item: Draft, i) => {
    item.portfolio_id = `pf_${pad(i)}`;
    item.name = `Portfolio ${pad(i)}`;
    item.owner = i % 9 === 0 ? null : `owner_${pad(i % 40, 2)}`;
    item.environments = ENV_SETS[i % ENV_SETS.length]![1];
    item.base_currency = i % 3 === 0 ? "JPY" : "USDT";
    item.allocation_count = i % 17;
    item.deployment_count = i % 23;
    item.allocated_by_currency = Array.from({ length: i === 0 ? currencies : i % 3 }, (_, k) => ({ currency: k === 0 ? item.base_currency : `C${pad(k, 2)}`, value: `${(i + 1) * 1000 + k}.${pad(k, 2)}` }));
  });
  return { ...structuredClone(canonical), items, total_portfolios: count, truncated: false };
}

describe("L2 · scale", () => {
  const envelope = bigEnvelope(100, 20);

  it("builds 100 unique rows with a 20-currency worst row, schema-valid and within the item cap", () => {
    console.info(`portfolios L2: ${envelope.items.length} rows, worst row ${envelope.items[0].allocated_by_currency.length} currencies, ${serializedBytes(envelope)} bytes`);
    expect(violations(envelope)).toEqual([]);
    expect(new Set(envelope.items.map((i: Draft) => i.portfolio_id)).size).toBe(100);
    expect(envelope.items[0].allocated_by_currency).toHaveLength(20);
  });

  it("reads, maps, filters and sorts 100 rows inside the stated budgets, keeping every string exact", () => {
    const read = timed(() => readPortfolioList(envelope));
    expect(read.value).not.toBeNull();
    const model = timed(() => read.value!.items.map(toRow));
    const work = timed(() => sortRows(filterRows(model.value, null, null), parseSort("allocated:desc").sort, "USDT"));
    console.info(`portfolios L2 reader ${read.ms.toFixed(1)} ms (budget ${BUDGET_READ_MS}); model ${model.ms.toFixed(1)} ms (budget ${BUDGET_MODEL_MS}); filter+sort ${work.ms.toFixed(1)} ms`);
    expect(read.ms).toBeLessThan(BUDGET_READ_MS);
    expect(model.ms).toBeLessThan(BUDGET_MODEL_MS);
    expect(work.ms).toBeLessThan(BUDGET_MODEL_MS);
    expect(work.value).toHaveLength(100);
    const withUsdt = work.value.filter((row) => allocatedIn(row, "USDT") !== null);
    // Money sorts inside one currency, descending, and rows with none in it come last.
    expect(work.value.slice(0, withUsdt.length).map((r) => r.portfolioId).sort()).toEqual(withUsdt.map((r) => r.portfolioId).sort());
    const values = withUsdt.map((row) => allocatedIn(row, "USDT")!);
    const sorted = [...values].sort((a, b) => Number(b) - Number(a));
    expect(values.map(Number)).toEqual(sorted.map(Number));
    model.value.forEach((row, i) => expect(row.allocated).toEqual(envelope.items[i].allocated_by_currency));
  });

  it("the screen draws 100 rows, 20 currency lines in the worst one, inside the render budget", async () => {
    const started = performance.now();
    mount(makeApi((_m, path) => (path === "/portfolios" ? { status: 200, body: envelope } : undefined)).api);
    await loaded();
    const ms = performance.now() - started;
    console.info(`portfolios L2 screen: ${bodyRows().length} DOM rows in ${ms.toFixed(0)} ms (budget ${BUDGET_RENDER_MS}, cap ${ROW_CAP})`);
    expect(bodyRows()).toHaveLength(100);
    expect(ms).toBeLessThan(BUDGET_RENDER_MS);
    const worst = bodyRows().find((r) => r.querySelector(".exec-pf-title")?.textContent === "Portfolio 00000")!;
    expect(worst.querySelectorAll("td[data-l='Allocated capital'] .exec-pf-money")).toHaveLength(20);
  });

  it("writes and reads the sort without losing it", () => {
    for (const key of ["name", "owner", "allocations", "deployments", "allocated", "updated"] as const) {
      for (const dir of ["asc", "desc"] as const) {
        const written = writeSort({ key, dir });
        expect(parseSort(written).sort).toEqual({ key, dir });
      }
    }
    expect(writeSort({ key: "name", dir: "asc" })).toBeNull();
    expect(parseSort("nonsense")).toEqual({ sort: { key: "name", dir: "asc" }, valid: false });
    expect(parseSort("name:sideways").valid).toBe(false);
    expect(countLine(readPortfolioList(envelope)!, 100, 100, false)).toEqual({ text: "100 portfolios", truncated: false });
  });
});

/* ═════════════════════════ L3 · negative ═════════════════════════ */
describe("L3 · negative payloads", () => {
  const MONEY: readonly (string | number)[] = ["items", 0, "allocated_by_currency", 0, "value"];
  const structural = [
    ...requiredCases(canonical, [["items", 0, "portfolio_id"], ["items", 0, "name"], ["items", 0, "state"], ["items", 0, "base_currency"], ["items", 0, "updated_at"], ["items", 0, "environments"], ["items", 0, "allocated_by_currency"], ["freshness"], ["completeness"], ["read_at"], ["truncated"], ["total_portfolios"], ["environments"], ["items"]]),
    ...integerCases(canonical, ["items", 0, "allocation_count"]),
    ...integerCases(canonical, ["items", 0, "deployment_count"]),
    ...integerCases(canonical, ["total_portfolios"]),
    ...stringCases(canonical, ["items", 0, "name"]),
    ...stringCases(canonical, ["items", 0, "portfolio_id"]),
    ...arrayCases(canonical, ["items"], { idKey: "portfolio_id" }),
    ...arrayCases(canonical, ["items", 0, "allocated_by_currency"]),
    ...schemaVersionCases(canonical, ["schema_version"], "execution.portfolio-list.v1", ["execution.alpha-fleet-list.v2", "execution.bindings-list.v1"]),
    ...pollutionCases(canonical, [[], ["items", 0], ["items", 0, "allocated_by_currency", 0], ["environments"]]),
    ...rootCases(),
  ];

  it("never throws, whatever it is given, and leaves the shared prototype clean", () => {
    const threw = structural.filter((c) => { try { readPortfolioList(c.value); return false; } catch { return true; } });
    expect(threw.map((c) => c.name)).toEqual([]);
    expect(prototypeIsClean()).toBe(true);
  });

  it("refuses a body whose schema, root, required scalar or count is wrong; an unknown word is never a success", () => {
    const mustReject = structural.filter((c) => ["bad-root", "schema-swapped", "bad-integer"].includes(c.category));
    expect(mustReject.filter((c) => readPortfolioList(c.value) !== null).map((c) => c.name)).toEqual([]);
    const requiredKeys = structural.filter((c) => c.category === "missing-required" && !c.name.includes("items.0.owner") && !c.name.includes("allocated_by_currency <- absent"));
    expect(requiredKeys.filter((c) => readPortfolioList(c.value) !== null).map((c) => c.name)).toEqual([]);
  });

  it("counts, and does not hide, what the V1 reader lets through that the schema would not", () => {
    const loose = structural.filter((c) => readPortfolioList(c.value) !== null && itemViolations((c.value as Draft)?.items?.[0] ?? {}).length > 0 && c.category !== "missing-required");
    const byCategory = loose.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.category]: (acc[c.category] ?? 0) + 1 }), {});
    console.info(`portfolios L3: V1 reader accepts ${loose.length} payloads the schema refuses, by category ${JSON.stringify(byCategory)}`);
    expect(Number.isFinite(loose.length)).toBe(true);
  });

  const decimals = decimalCases(canonical, MONEY).filter((c) => c.probe !== null || ["exponent", "malformed-decimal", "negative-zero", "number-as-decimal"].includes(c.category));

  it("the screen never prints a decimal the boundary refuses, and says it is unreadable instead", async () => {
    const leaks: string[] = [];
    const tried: string[] = [];
    for (const c of decimals) {
      const read = readPortfolioList(c.value);
      if (read === null) continue; // the reader already refused it: nothing reaches the screen
      const raw = (c.value as Draft).items[0].allocated_by_currency[0].value as unknown;
      if (typeof raw !== "string") continue;
      tried.push(c.name);
      const view = mount(makeApi((_m, path) => (path === "/portfolios" ? { status: 200, body: c.value } : undefined)).api);
      await loaded();
      const row = bodyRows().find((r) => r.querySelector(".exec-pf-title")?.textContent === "Carry Core")!;
      const shown = cellOf(row, "Allocated capital");
      const accepted = /^-?(0|[1-9]\d*)(\.\d+)?$/.test(raw) && !/^-0+(\.0+)?$/.test(raw);
      if (!accepted && !shown.includes("unreadable value")) leaks.push(`${c.name}: printed "${shown.slice(0, 40)}"`);
      if (!accepted && leaked(view.container.textContent, raw.length < 40 && raw.trim() !== "" ? raw : null) && !shown.includes("unreadable value")) leaks.push(`${c.name}: probe in DOM`);
      view.unmount();
    }
    // The shared V1 money reader (profileRead.ts `money`) now refuses every non-decimal at the reader (F5b D1),
    // so what reaches the screen is only a string the boundary also reads; the rest never gets that far.
    const refusedAtReader = decimals.filter((c) => readPortfolioList(c.value) === null).length;
    console.info(`portfolios L3: ${refusedAtReader} of ${decimals.length} decimal payloads refused by the reader, ${tried.length} reached the screen; ${leaks.length} leaks`);
    expect(refusedAtReader).toBeGreaterThan(20);
    expect(leaks).toEqual([]);
  }, 60_000);

  it("an unknown environment word never becomes Real-funded or Simulated", async () => {
    const cases = enumCases(canonical, ["items", 0, "environments", 0], ENVIRONMENTS).filter((c) => readPortfolioList(c.value) !== null);
    const wrong: string[] = [];
    for (const c of cases) {
      const item = readPortfolioList(c.value)!.items[0];
      const row = toRow(item);
      const word = item.environments[0];
      const known = ["paper", "sandbox", "live"].includes(word.toLowerCase());
      if (!known && row.domain !== "unknown") wrong.push(`${c.name}: ${row.domain}`);
      if (!known && row.domainLabel !== "Domain not published") wrong.push(`${c.name}: label ${row.domainLabel}`);
    }
    expect(cases.length).toBeGreaterThan(5);
    expect(wrong).toEqual([]);
    // The one case that is not a success: an unknown word, on screen, is named, not coloured.
    const body = (cases.find((c) => (c.value as Draft).items[0].environments[0] === "UNKNOWN_WORD_FROM_TESTKIT")!.value);
    mount(makeApi((_m, path) => (path === "/portfolios" ? { status: 200, body } : undefined)).api, "/deployments/portfolios?hide=none");
    await loaded();
    const row = bodyRows().find((r) => r.querySelector(".exec-pf-title")?.textContent === "Carry Core")!;
    expect(cellOf(row, "Domain")).toContain("Domain not published");
    expect(cellOf(row, "Domain")).not.toContain("Real-funded");
  });

  it("a duplicate portfolio id is two rows with two keys: the table shows what was sent rather than choosing one", async () => {
    const dup = structural.find((c) => c.category === "duplicate-id")!;
    const read = readPortfolioList(dup.value);
    expect(read).not.toBeNull();
    const keys = toRows(read!.items).map((r) => r.key);
    expect(keys.slice(0, 2)).toEqual(["pf_carry_core", "pf_carry_core#2"]);
    expect(new Set(keys).size).toBe(keys.length);
    mount(makeApi((_m, path) => (path === "/portfolios" ? { status: 200, body: dup.value } : undefined)).api);
    await loaded();
    expect(bodyRows().filter((r) => r.querySelector(".exec-pf-title")?.textContent === "Carry Core")).toHaveLength(2);
  });
});
