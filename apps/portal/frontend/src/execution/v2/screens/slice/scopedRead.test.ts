/**
 * The scoped read reader and the slice model (UXM-08, FIXTURE ONLY): what the published `manager-scoped` example reads to,
 * and the honesty rules the slice's derivations hold (UX-F02, F05, F07, F19).
 */
import { describe, expect, it } from "vitest";

import { loadCanonical } from "../../testkit/loadCanonical";
import type { Draft } from "../../testkit/matrix";
import { connectionKey, fleetRows, portfolioRows, scopeLines } from "./model";
import { MANAGER_SCOPED_SCHEMA, readManagerScoped, type ScopedRead } from "./scopedRead";

const FILE = "execution-manager-scoped.synthetic";
const cases = loadCanonical<{ cases: Draft[] }>(FILE).cases;
const ALPHA_FLEET = (): Draft => structuredClone(cases[0]);
const BINDINGS = (): Draft => structuredClone(cases[1]);

function readOf(raw: unknown): ScopedRead {
  const read = readManagerScoped(raw);
  if (read === null || read.kind !== "scoped") throw new Error("expected a scoped read");
  return read.read;
}

describe("the published example", () => {
  it("ALPHA_FLEET reads: the scope constants, one row, exact money, PARTIAL availability", () => {
    const read = readOf(ALPHA_FLEET());
    expect(read.surface).toBe("ALPHA_FLEET");
    expect(read.scope).toEqual({ visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", totalsScope: "VISIBLE_ROWS_ONLY", policyRevisions: ["TEST_ONLY-policy"] });
    expect(read.completeness).toBe("PARTIAL");
    expect(read.items).toHaveLength(1);
    const item = read.items[0]!;
    expect(item.identity).toMatchObject({ alpha_id: "alpha_TEST_ONLY", portfolio_id: "portfolio_TEST_ONLY", name: "TEST_ONLY Alpha" });
    expect(item.financialTotals).toEqual([{ currency: "USD", allocation: "100.1234567890123456789" }]);
    expect(item.availability).toEqual({ state: "PARTIAL", reasonCode: "SCOPED_FINANCIAL_GRAIN_OR_FIELDS_UNAVAILABLE" });
    expect(item.isFullResource).toBe(false);
    expect(item.instances).toEqual([]);
  });

  it("BINDINGS (zero rows) reads: an authorized-empty page is a page, not a failure", () => {
    const read = readOf(BINDINGS());
    expect(read.items).toEqual([]);
    expect(read.page).toMatchObject({ visibleCount: 0, returnedCount: 0, hasMore: false });
  });

  it("another schema_version is a typed unsupported_shape; a non-object is nothing", () => {
    expect(readManagerScoped({ ...ALPHA_FLEET(), schema_version: "portal.execution.manager-dataset.v1" })).toEqual({ kind: "unsupported_shape" });
    expect(readManagerScoped(null)).toBeNull();
    expect(readManagerScoped({ ...ALPHA_FLEET(), schema_version: 3 })).toBeNull();
    expect(MANAGER_SCOPED_SCHEMA).toBe("portal.execution.manager-scoped.v1");
  });
});

describe("withheld is not null is not zero (UX-F07)", () => {
  it("an omitted fact stays omitted; a null fact stays null; neither becomes 0", () => {
    const body = ALPHA_FLEET();
    body.items[0].financial_totals = [{ currency: "USD" }, { currency: "EUR", allocation: null }];
    const read = readOf(body);
    const [usd, eur] = read.items[0]!.financialTotals;
    expect("allocation" in usd!).toBe(false);
    expect(eur!.allocation).toBeNull();
    const rows = fleetRows(read);
    const cells = rows[0]!.allocation;
    expect(cells.map((c) => c.currency)).toEqual(["USD", "EUR"]);
    for (const cell of cells) {
      expect(cell.metric).toMatchObject({ kind: "absent", state: "UNAVAILABLE", reasonCode: "SCOPED_FINANCIAL_GRAIN_OR_FIELDS_UNAVAILABLE" });
    }
  });

  it("NOT_PUBLISHED availability never shows a figure, even if one is present in the totals", () => {
    const body = ALPHA_FLEET();
    body.items[0].financial_availability = { state: "NOT_PUBLISHED", reason_code: "SOURCE_FACTS_NOT_PUBLISHED" };
    const rows = fleetRows(readOf(body));
    expect(rows[0]!.allocation[0]!.metric).toMatchObject({ kind: "absent", reasonCode: "SOURCE_FACTS_NOT_PUBLISHED" });
  });

  it("no total at all: an absence with the row's reason, not an empty cell", () => {
    const body = ALPHA_FLEET();
    body.items[0].financial_totals = [];
    const row = fleetRows(readOf(body))[0]!;
    expect(row.allocation).toEqual([]);
    expect(row.allocationAbsent).toMatchObject({ kind: "absent", copy: "Not available · SCOPED_FINANCIAL_GRAIN_OR_FIELDS_UNAVAILABLE" });
  });

  it("PARTIAL keeps the exact string and is not toned; AVAILABLE is a plain value", () => {
    const partial = fleetRows(readOf(ALPHA_FLEET()))[0]!.allocation[0]!.metric;
    if (partial === null || partial.kind !== "value") throw new Error("value");
    expect(partial.partial).toBe(true);
    expect(partial.decimal.full).toBe("100.1234567890123456789");
    expect(partial.tone).toBe("neutral");
    const body = ALPHA_FLEET();
    body.items[0].financial_availability = { state: "AVAILABLE", reason_code: "AUTHORIZED_RETAINED_FACTS" };
    const available = fleetRows(readOf(body))[0]!.allocation[0]!.metric;
    if (available === null || available.kind !== "value") throw new Error("value");
    expect(available.partial).toBe(false);
  });

  it("a published zero stays a value, distinct from a missing figure", () => {
    const body = ALPHA_FLEET();
    body.items[0].financial_totals = [{ currency: "USD", allocation: "0" }];
    const metric = fleetRows(readOf(body))[0]!.allocation[0]!.metric;
    if (metric === null || metric.kind !== "value") throw new Error("value");
    expect(metric.publishedZero).toBe(true);
  });
});

describe("refusals (one bad row voids the read)", () => {
  const refused: [string, (b: Draft) => void][] = [
    ["an extra key on the envelope", (b) => { b.peer_count = 12; }],
    ["an extra key on a row", (b) => { b.items[0].rank = 1; }],
    ["an extra key in a fact set", (b) => { b.items[0].identity.share = "0.5"; }],
    ["a number as a decimal", (b) => { b.items[0].financial_totals[0].allocation = 100.12; }],
    ["an exponent as a decimal", (b) => { b.items[0].financial_totals[0].allocation = "1e5"; }],
    ["a negative zero", (b) => { b.items[0].financial_totals[0].allocation = "-0.00"; }],
    ["SS-1 a total with no currency", (b) => { b.items[0].financial_totals = [{ allocation: "1" }]; }],
    ["SS-1 a total with a null currency", (b) => { b.items[0].financial_totals = [{ currency: null, allocation: "1" }]; }],
    ["SS-1 two totals in one currency", (b) => { b.items[0].financial_totals = [{ currency: "USD", allocation: "1" }, { currency: "USD", allocation: "2" }]; }],
    ["SS-2 returned_count not equal to the rows", (b) => { b.page.returned_count = 2; b.page.visible_count = 2; }],
    ["SS-2 returned_count above visible_count", (b) => { b.page.visible_count = 0; }],
    ["SS-2 has_more with no next cursor", (b) => { b.page.has_more = true; }],
    ["SS-2 a next cursor with has_more false", (b) => { b.page.next_cursor = "abc"; }],
    ["SS-3 a whitespace-only name", (b) => { b.items[0].identity.name = "   "; }],
    ["SS-4 the same row twice", (b) => { b.items.push(structuredClone(b.items[0])); b.page.returned_count = 2; b.page.visible_count = 2; }],
    ["a completeness other than PARTIAL", (b) => { b.completeness = "COMPLETE"; }],
    ["a different visibility", (b) => { b.read_scope.visibility = "FULL"; }],
    ["a different totals scope", (b) => { b.read_scope.totals_scope = "ALL_ROWS"; }],
    ["an unknown environment on a row", (b) => { b.items[0].environment = "backtest"; }],
    ["an unknown availability state", (b) => { b.items[0].financial_availability.state = "OK"; }],
  ];
  it.each(refused)("%s", (_name, change) => {
    const body = ALPHA_FLEET();
    change(body);
    expect(readManagerScoped(body)).toBeNull();
  });
});

describe("UX-F02 no peer leak: nothing is computed across rows", () => {
  it("the page line uses the server's own counts and never a fraction of a whole", () => {
    const lines = scopeLines(readOf(ALPHA_FLEET()));
    expect(lines.page).toBe("1 on this page, 1 visible to you, limit 50");
    for (const text of Object.values(lines).filter((v): v is string => typeof v === "string")) {
      // No "N of M", no percentage, no word for rows the caller cannot see.
      expect(text).not.toMatch(/\d\s+of\s+\d|%|\btotal rows\b|\ball rows\b|\bpeers?\b|\bothers?\b/i);
    }
    expect(lines.totals).toBe("Totals cover the rows you can see");
  });

  it("a portfolio row counts the rows ON THIS PAGE and says nothing of the portfolio's size", () => {
    const body = ALPHA_FLEET();
    const second = structuredClone(body.items[0]);
    second.identity.alpha_id = "alpha_TEST_ONLY_2";
    body.items.push(second);
    body.page.returned_count = 2;
    body.page.visible_count = 2;
    const rows = portfolioRows(readOf(body));
    expect(rows).toEqual([{ portfolioId: "portfolio_TEST_ONLY", rowsOnThisPage: 2, environments: ["paper"] }]);
    expect(Object.keys(rows[0]!).sort()).toEqual(["environments", "portfolioId", "rowsOnThisPage"]);
  });

  it("a row with no portfolio id lists no portfolio", () => {
    const body = ALPHA_FLEET();
    delete body.items[0].identity.portfolio_id;
    expect(portfolioRows(readOf(body))).toEqual([]);
  });

  it("more pages are said, never completed by the client", () => {
    const body = ALPHA_FLEET();
    body.page.has_more = true;
    body.page.next_cursor = "TEST_ONLY-next";
    body.page.visible_count = 120;
    const read = readOf(body);
    expect(scopeLines(read)).toMatchObject({ morePages: true, page: "1 on this page, 120 visible to you, limit 50" });
    expect(read.items).toHaveLength(1);
  });
});

describe("UX-F05 environments and currencies stay apart", () => {
  it("a Real-funded row and a Paper row keep their own environment and their own money; nothing adds them", () => {
    const body = ALPHA_FLEET();
    const live = structuredClone(body.items[0]);
    live.environment = "live";
    live.financial_totals = [{ currency: "USD", allocation: "7.5" }, { currency: "EUR", allocation: "3" }];
    body.items.push(live);
    body.environment = "all";
    body.page.returned_count = 2;
    body.page.visible_count = 2;
    const rows = fleetRows(readOf(body));
    expect(rows.map((r) => r.environment)).toEqual(["paper", "live"]);
    expect(rows[0]!.allocation).toHaveLength(1);
    expect(rows[1]!.allocation.map((c) => c.currency)).toEqual(["USD", "EUR"]);
    const full = rows.flatMap((r) => r.allocation.map((c) => (c.metric !== null && c.metric.kind === "value" ? c.metric.decimal.full : null)));
    expect(full).toEqual(["100.1234567890123456789", "7.5", "3"]);
    expect(portfolioRows(readOf(body))[0]!.environments).toEqual(["paper", "live"]);
  });

  it("the model exports nothing that totals, sums or ranks", async () => {
    const model = await import("./model");
    expect(Object.keys(model).filter((name) => /total|sum|rank|share|percent|aggregate/i.test(name))).toEqual([]);
  });
});

describe("connection key", () => {
  it("changes with any part of the context, so a change of scope is a new connection", () => {
    const keys = new Set([
      connectionKey({ workspaceId: null, environment: null }),
      connectionKey({ workspaceId: "w", environment: null }),
      connectionKey({ workspaceId: "w", environment: "paper" }),
      connectionKey({ workspaceId: "w2", environment: "paper" }),
    ]);
    expect(keys.size).toBe(4);
  });
});
