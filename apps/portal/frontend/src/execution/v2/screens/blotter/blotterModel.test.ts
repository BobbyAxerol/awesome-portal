/**
 * Blotter reader and model, conformance levels L0 to L3 (Rules 9.8.3):
 *
 * L0  the canonical `execution-full-blotter.partial` read verbatim;
 * L1  a matrix over freshness x completeness x totals x cursors x counts;
 * L2  a 300-row page: the reader caps at 200 and says how many it skipped;
 * L3  hostile decimals, enums, ids, roots and prototype pollution never throw,
 *     never leak and never turn into a success.
 */
import { pathTimeProblem } from "./OrderDetail";
import { describe, expect, it } from "vitest";

import { readProfileEnvelope } from "../../../api/profileRead";
import { canonicalDigest, loadCanonical } from "../../testkit/loadCanonical";
import { ABSENT, cartesian, coverage, describeCoverage, dimension, pairwise, type Draft } from "../../testkit/matrix";
import { decimalCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, stringCases, type NegativeCase } from "../../testkit/negative";
import { cloneRows, pad, timed } from "../../testkit/scale";
import {
  COLUMNS, DEFAULT_COLUMNS, NO_FILTERS, NO_SCOPE, ROW_CAP, applyScope, blotterCsv, blotterCsvName, blotterQuery, chipCounts, unchippedStatusCounts, fillsFor, filtersKey, groupExact, humanize,
  isBucket, legsFor, readBlotter, readExact, scopeActive, shortUtc, statusView, type BlotterFill, type BlotterLeg, type BlotterOrder,
  feePrecisionByCurrency, formatFee,
} from "./blotterModel";

const NAME = "execution-full-blotter.partial";
const digestBefore = canonicalDigest(NAME);
const canonical = loadCanonical<Draft>(NAME);
const read = (raw: unknown) => {
  const profile = readProfileEnvelope(raw);
  return profile === null ? null : readBlotter(profile);
};

describe("L0 canonical", () => {
  it("reads the published page", () => {
    const page = read(canonical)!;
    expect(page.orders).toHaveLength(1);
    expect(page.orders[0]).toMatchObject({ orderId: "ord_1", status: "FILLED", quantity: { kind: "value", text: "1.25" } });
    expect(page.exactTotal).toBe(12);
    expect(page.filteredTotal).toBe(1);
    expect(page.nextCursor).toBeNull();
    expect(page.prevCursor).toBe("kc1.previous");
    expect(page.statusCounts).toEqual({ FILLED: 1, REJECTED: 3 });
    expect(page.countScope).toBe("COMMITTED_HOT_PROJECTION");
  });

  it.each([["OPEN", "OPEN"], [null, null], [ABSENT, null]])("order intent %j reads as %j and the column is optional, off by default", (raw, expected) => {
    const wire = structuredClone(canonical) as Draft;
    const rows = (wire as { data: { orders: Record<string, unknown>[] } }).data.orders;
    if (raw === ABSENT) delete rows[0]!.intent; else rows[0]!.intent = raw;
    expect(read(wire)!.orders[0]!.intent).toBe(expected);
    expect(COLUMNS.find((c) => c.id === "intent")?.dflt).toBe(false);
  });

  it("leaves the file on disk as it found it", () => {
    expect(canonicalDigest(NAME)).toBe(digestBefore);
  });
});

describe("readExact", () => {
  it.each(["0", "1.25", "0.0400", "60890.00", "-12.5", "1250", "0.00001234"])("keeps %s", (text) => {
    expect(readExact(text)).toEqual({ kind: "value", text });
  });
  it.each([1.25, 0, NaN, true, {}, [], ["1"], "1e3", "01", "-0", "-0.00", ".5", "5.", "+5", "1,000", " 1", "NaN", "٣"])("refuses %s as unreadable", (value) => {
    expect(readExact(value)).toEqual({ kind: "unreadable" });
  });
  it("refuses a string longer than any real quantity instead of printing 70,000 digits", () => {
    expect(readExact("9".repeat(64))).toEqual({ kind: "value", text: "9".repeat(64) });
    expect(readExact("9".repeat(65))).toEqual({ kind: "unreadable" });
  });
  it.each([null, undefined, ""])("%s is absent, not zero", (value) => {
    expect(readExact(value)).toEqual({ kind: "absent" });
  });
});

describe("groupExact", () => {
  it("groups thousands and keeps every decimal", () => {
    expect(groupExact("60890.00")).toBe("60,890.00");
    expect(groupExact("0.0400")).toBe("0.0400");
    expect(groupExact("1234567")).toBe("1,234,567");
    expect(groupExact("-1234.50")).toBe("-1,234.50");
    expect(groupExact("123456789012345678.123456789")).toBe("123,456,789,012,345,678.123456789");
  });
});

describe("statusView", () => {
  it("places every published status in its server bucket", () => {
    expect(statusView("FILLED")).toMatchObject({ kind: "ok", bucket: "FILLED" });
    expect(statusView("PARTIALLY_FILLED")).toMatchObject({ kind: "partial", bucket: "PARTIAL" });
    for (const s of ["REJECTED", "DENIED"]) expect(statusView(s)).toMatchObject({ kind: "rejected", bucket: "REJECTED" });
    for (const s of ["INITIALIZED", "SUBMITTED", "ACCEPTED", "PENDING_UPDATE", "PENDING_CANCEL", "TRIGGERED"]) expect(statusView(s)).toMatchObject({ kind: "pending", bucket: "OPEN" });
    expect(statusView("CANCELED")).toMatchObject({ kind: "na", label: "Canceled", closed: true, bucket: null });
    expect(statusView("EXPIRED")).toMatchObject({ kind: "stale", label: "Expired", bucket: null });
    // Nothing that is over is called paused.
    for (const s of ["CANCELED", "EXPIRED"]) expect(statusView(s).kind).not.toBe("paused");
  });
  it("an unknown or missing status is unknown, never a success", () => {
    for (const s of ["WIZARD", "filled", "FILLED ", "", null]) expect(statusView(s as string | null).kind).toBe("unknown");
  });
  it("no two kinds that mean different things share a kind", () => {
    expect(new Set(["FILLED", "PARTIALLY_FILLED", "REJECTED", "CANCELED", "ACCEPTED"].map((s) => statusView(s).kind)).size).toBe(5);
  });
});

describe("L1 matrix", () => {
  const dims = [
    dimension("freshness", ["freshness"], ["FRESH", "AGING", "STALE", "UNKNOWN", ABSENT]),
    dimension("completeness", ["completeness"], ["COMPLETE", "PARTIAL", ABSENT]),
    dimension("exact_total", ["data", "exact_total"], [12, "12", 0, null, ABSENT, -1, "x", 1.5]),
    dimension("filtered_total", ["data", "filtered_total"], [1, null, ABSENT]),
    dimension("next", ["data", "page", "next_cursor"], ["kc1.next", null, ABSENT, 7]),
    dimension("status_counts", ["data", "aggregates", "status"], [{ FILLED: 12 }, { FILLED: 1, REJECTED: 3 }, {}, null, ABSENT, { FILLED: "x" }]),
  ];
  const states = pairwise(canonical, dims);
  it(describeCoverage("blotter envelope", coverage(dims, states)), () => {
    expect(states.length).toBeGreaterThan(10);
  });
  it("every state reads without throwing and keeps counts honest", () => {
    for (const state of states) {
      const page = read(state.value);
      expect(page, state.name).not.toBeNull();
      const raw = state.value.data.exact_total;
      const expected = typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 ? raw : typeof raw === "string" && /^\d{1,15}$/.test(raw) ? Number(raw) : null;
      expect(page!.exactTotal, state.name).toBe(expected);
      const chips = chipCounts(page!);
      expect(chips.ALL.count, state.name).toBe(page!.exactTotal);
      for (const bucket of ["FILLED", "PARTIAL", "REJECTED", "OPEN"] as const) {
        const c = chips[bucket];
        // null is never 0: a bucket with no number is "no number".
        if (c.count === null) expect(c.exact, state.name).toBe(false);
        if (c.count === 0) expect(c.exact, state.name).toBe(true);
      }
    }
  });

  it("an aggregate that covers the population makes a missing bucket a true zero", () => {
    const covered = read(cartesian(canonical, [dimension("s", ["data", "aggregates", "status"], [{ FILLED: 12 }]), dimension("t", ["data", "exact_total"], [12])])[0]!.value)!;
    expect(chipCounts(covered).REJECTED).toEqual({ count: 0, exact: true });
    expect(chipCounts(covered).FILLED).toEqual({ count: 12, exact: true });
  });

  it("lists the counted statuses no chip claims, and nothing when there is no aggregate", () => {
    const rows = read(cartesian(canonical, [dimension("s", ["data", "aggregates", "status"], [{ FILLED: 12, CANCELED: 3, EXPIRED: 1, WEIRD_NEW: 2 }]), dimension("t", ["data", "exact_total"], [18])])[0]!.value)!;
    expect(unchippedStatusCounts(rows)).toEqual([{ status: "CANCELED", label: "Canceled", count: 3 }, { status: "EXPIRED", label: "Expired", count: 1 }, { status: "WEIRD_NEW", label: "Weird new", count: 2 }]);
    expect(unchippedStatusCounts({ ...rows, statusCounts: null })).toEqual([]);
  });

  it("an aggregate that does not cover it leaves unlisted buckets without a number", () => {
    const sparse = read(canonical)!;
    expect(chipCounts(sparse).OPEN).toEqual({ count: null, exact: false });
    expect(chipCounts(sparse).PARTIAL).toEqual({ count: null, exact: false });
    expect(chipCounts(sparse).REJECTED).toEqual({ count: 3, exact: false });
  });
});

describe("L2 scale", () => {
  const rowsOf = (n: number) =>
    cloneRows(canonical.data.orders[0], n, (row, i) => {
      row.order_id = `ord_${pad(i)}`;
      row.client_order_id = `cl_${pad(i)}`;
    });
  const big = (n: number) => {
    const copy = structuredClone(canonical);
    copy.data.orders = rowsOf(n);
    return copy;
  };

  it("caps a 300 row page at the DOM budget and counts nothing as dropped silently", () => {
    const { value, ms } = timed(() => read(big(300))!);
    expect(value.orders).toHaveLength(ROW_CAP);
    expect(value.orders[0]!.orderId).toBe("ord_00000");
    expect(ms).toBeLessThan(500);
  });

  it("counts rows it could not place instead of dropping them", () => {
    const copy = big(60);
    delete copy.data.orders[3].order_id;
    copy.data.orders[4].order_id = null;
    const page = read(copy)!;
    expect(page.orders).toHaveLength(58);
    expect(page.skippedOrders).toBe(2);
  });

  it("joins 200 orders to 100 fills and 200 legs without a quadratic stall", () => {
    const orders = Array.from({ length: 200 }, (_, i): BlotterOrder => ({ ...read(canonical)!.orders[0]!, orderId: `o${i}`, clientOrderId: `c${i}`, venueOrderId: `v${i}` }));
    const fills = Array.from({ length: 100 }, (_, i): BlotterFill => ({ fillId: `f${i}`, tradeId: null, clientOrderId: `c${i}`, venueOrderId: null, symbol: null, side: null, price: { kind: "absent" }, quantity: { kind: "absent" }, commission: { kind: "absent" }, commissionCurrency: null, liquiditySide: null, tradeTime: null }));
    const { ms } = timed(() => orders.forEach((o) => fillsFor(o, fills)));
    expect(ms).toBeLessThan(200);
  });
});

describe("joins", () => {
  const order = (over: Partial<BlotterOrder>): BlotterOrder => ({ ...read(canonical)!.orders[0]!, clientOrderId: "c1", venueOrderId: "v1", ...over });
  const fill = (id: string, over: Partial<BlotterFill>): BlotterFill => ({ fillId: id, tradeId: null, clientOrderId: null, venueOrderId: null, symbol: null, side: null, price: { kind: "absent" }, quantity: { kind: "absent" }, commission: { kind: "absent" }, commissionCurrency: null, liquiditySide: null, tradeTime: null, ...over });
  const leg = (group: string, id: string, seq: string, over: Partial<BlotterLeg> = {}): BlotterLeg => ({ groupId: group, legId: id, role: null, sequence: seq, clientOrderId: null, venueOrderId: null, side: null, orderType: null, quantity: { kind: "absent" }, filledQuantity: { kind: "absent" }, price: { kind: "absent" }, triggerPrice: { kind: "absent" }, triggerReference: null, state: null, averageFillPrice: { kind: "absent" }, ...over });

  it("matches fills by client or venue order id and never by absence", () => {
    const fills = [fill("a", { clientOrderId: "c1" }), fill("b", { venueOrderId: "v1" }), fill("c", { clientOrderId: "other" }), fill("d", {})];
    expect(fillsFor(order({}), fills).map((f) => f.fillId)).toEqual(["a", "b"]);
    expect(fillsFor(order({ clientOrderId: null, venueOrderId: null }), fills)).toEqual([]);
  });

  it("takes every leg of the group an order is a leg of, in sequence order", () => {
    const legs = [leg("g1", "l3", "3"), leg("g1", "l1", "1", { clientOrderId: "c1" }), leg("g2", "x", "1", { clientOrderId: "zzz" }), leg("g1", "l2", "2")];
    expect(legsFor(order({}), legs).map((l) => l.legId)).toEqual(["l1", "l2", "l3"]);
    expect(legsFor(order({ clientOrderId: null, venueOrderId: null }), legs)).toEqual([]);
  });
});

describe("scope", () => {
  const orders = read(canonical)!.orders;
  const two: BlotterOrder[] = [{ ...orders[0]!, orderId: "o1", accountId: "a1", alphaId: "x" }, { ...orders[0]!, orderId: "o2", accountId: "a2", alphaId: "y" }];
  it("narrows by account and alpha on the loaded rows", () => {
    expect(applyScope(two, [], { ...NO_SCOPE, account: "a2" }).rows.map((o) => o.orderId)).toEqual(["o2"]);
    expect(applyScope(two, [], { ...NO_SCOPE, alpha: "x", account: "a2" }).rows).toEqual([]);
  });
  it("does not pretend to apply a deployment scope the rows cannot answer", () => {
    const result = applyScope(two, [], { ...NO_SCOPE, deployment: "dep_1" });
    expect(result.deploymentNotApplied).toBe(true);
    expect(result.rows).toHaveLength(2);
  });
  it("applies it when a row carries a deployment id", () => {
    const withId = [{ ...two[0]!, deploymentId: "dep_1" }, { ...two[1]!, deploymentId: "dep_2" }];
    expect(applyScope(withId, [], { ...NO_SCOPE, deployment: "dep_1" }).rows.map((o) => o.orderId)).toEqual(["o1"]);
  });
  it("finds the order that holds a focused fill, or says it is missing", () => {
    const f = (id: string, client: string | null): BlotterFill => ({ fillId: id, tradeId: null, clientOrderId: client, venueOrderId: null, symbol: null, side: null, price: { kind: "absent" }, quantity: { kind: "absent" }, commission: { kind: "absent" }, commissionCurrency: null, liquiditySide: null, tradeTime: null });
    const orderWithClient = { ...two[0]!, clientOrderId: "c9" };
    expect(applyScope([orderWithClient], [f("f1", "c9")], { ...NO_SCOPE, fill: "f1" })).toMatchObject({ focusOrderId: "o1", focusMissing: false });
    expect(applyScope([orderWithClient], [f("f2", "c0")], { ...NO_SCOPE, fill: "f2" })).toMatchObject({ focusOrderId: null, focusMissing: true });
    expect(applyScope([orderWithClient], [], { ...NO_SCOPE, order: "nope" })).toMatchObject({ focusMissing: true });
  });
  it("scopeActive ignores order and fill focus", () => {
    expect(scopeActive({ ...NO_SCOPE, order: "o", fill: "f" })).toBe(false);
    expect(scopeActive({ ...NO_SCOPE, alpha: "x" })).toBe(true);
  });
});

describe("query", () => {
  it("sends only what the server filters on, and the cursor in its direction", () => {
    expect(blotterQuery(NO_FILTERS, null)).toEqual({ limit: 50 });
    expect(blotterQuery({ bucket: "REJECTED", symbol: " BTCUSDT ", venue: "OKX", side: "SELL" }, { dir: "after", value: "c1" })).toEqual({ limit: 50, status_bucket: "REJECTED", symbol: "BTCUSDT", venue: "OKX", side: "SELL", after: "c1" });
    expect(blotterQuery(NO_FILTERS, { dir: "before", value: "c2" })).toEqual({ limit: 50, before: "c2" });
  });
  it("a filter key changes with every server filter and no other", () => {
    expect(new Set([filtersKey(NO_FILTERS), filtersKey({ ...NO_FILTERS, bucket: "OPEN" }), filtersKey({ ...NO_FILTERS, symbol: "X" }), filtersKey({ ...NO_FILTERS, venue: "V" }), filtersKey({ ...NO_FILTERS, side: "BUY" })]).size).toBe(5);
  });
  it("accepts only the four buckets", () => {
    for (const ok of ["FILLED", "PARTIAL", "REJECTED", "OPEN"]) expect(isBucket(ok)).toBe(true);
    for (const bad of ["ALL", "filled", "", null, "CANCELED"]) expect(isBucket(bad)).toBe(false);
  });
});

describe("columns", () => {
  it("keeps Order and Status fixed and on by default", () => {
    expect(COLUMNS.filter((c) => c.fixed).map((c) => c.id)).toEqual(["order", "status"]);
    expect(DEFAULT_COLUMNS.has("order") && DEFAULT_COLUMNS.has("status")).toBe(true);
    expect(new Set(COLUMNS.map((c) => c.id)).size).toBe(COLUMNS.length);
  });
  it("humanize keeps a word it cannot improve", () => {
    expect(humanize("PARTIALLY_FILLED")).toBe("Partially filled");
    expect(humanize("")).toBe("");
  });
});

describe("L3 negative", () => {
  const cases: NegativeCase[] = [
    ...decimalCases(canonical, ["data", "orders", 0, "quantity"]),
    ...decimalCases(canonical, ["data", "orders", 0, "price"]),
    ...stringCases(canonical, ["data", "orders", 0, "order_id"]),
    ...stringCases(canonical, ["data", "orders", 0, "status"]),
    ...requiredCases(canonical, [["data", "orders"], ["data", "page"], ["data", "aggregates"], ["data", "exact_total"], ["schema_version"], ["state"]]),
    ...pollutionCases(canonical, [[], ["data"], ["data", "page"], ["data", "orders", 0]]),
    ...rootCases(),
  ];

  it("never throws, never leaks the probe and never invents a number", () => {
    for (const c of cases) {
      const holder: { page: ReturnType<typeof read> } = { page: null };
      expect(() => { holder.page = read(c.value); }, c.name).not.toThrow();
      expect(leaked(holder.page, c.probe), c.name).toBe(false);
      if (holder.page !== null && c.name.includes("orders.0.quantity")) {
        const quantity = holder.page.orders[0]?.quantity;
        const original = (c.value as Draft)?.data?.orders?.[0]?.quantity;
        // A refused decimal is unreadable or absent; only a string in the grammar is ever a value.
        if (quantity?.kind === "value") expect(quantity.text, c.name).toBe(original);
        if (typeof original !== "string" || !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(original) || /^-0+(\.0+)?$/.test(original)) {
          expect(quantity?.kind === "value", c.name).toBe(false);
        }
      }
    }
    expect(prototypeIsClean()).toBe(true);
  });

  it("a status outside the vocabulary is never a success", () => {
    const hostile = ["filled", "OK", "SUCCESS", "__proto__", 1, true, {}, []];
    for (const status of hostile) {
      const copy = structuredClone(canonical);
      copy.data.orders[0].status = status;
      const page = read(copy)!;
      const view = statusView(page.orders[0]!.status);
      expect(view.kind, String(status)).not.toBe("ok");
    }
  });
});

describe("blotter default columns and time (BLT-B1)", () => {
  it("opens with the hi-fi's columns (Deployment, Filled, Avg price and Fee are kept, Not available where the read has none): Alpha, Account and Venue are off until chosen", () => {
    expect([...DEFAULT_COLUMNS].sort()).toEqual(["avg", "deployment", "fee", "fillqty", "order", "price", "side", "status", "symbol", "time"].sort());
    for (const id of ["alpha", "account", "venue"] as const) {
      expect(COLUMNS.find((c) => c.id === id)?.dflt, id).toBe(false);
    }
  });

  it("prints a UTC instant as 'DD Mon HH:MM:SSZ' and returns anything else as written", () => {
    expect(shortUtc("2026-10-17T09:58:00Z")).toBe("17 Oct 09:58:00Z");
    expect(shortUtc("2026-10-17T09:58:07.123456Z")).toBe("17 Oct 09:58:07Z");
    expect(shortUtc("2026-10-17T09:58:00+00:00")).toBe("17 Oct 09:58:00Z");
    // not stated as UTC, or not an instant: never relabelled
    expect(shortUtc("2026-10-17T09:58:00")).toBe("2026-10-17T09:58:00");
    expect(shortUtc("2026-10-17T09:58:00+07:00")).toBe("2026-10-17T09:58:00+07:00");
    expect(shortUtc("2026-13-17T09:58:00Z")).toBe("2026-13-17T09:58:00Z");
    expect(shortUtc("yesterday")).toBe("yesterday");
  });
});

describe("CSV export of the loaded rows", () => {
  const base = read(canonical)!.orders[0]!;
  const order = (over: Partial<BlotterOrder>): BlotterOrder => ({ ...base, ...over });
  const cols = (...ids: string[]) => COLUMNS.filter((c) => ids.includes(c.id));

  it("the Deployment cell is the row's own deployment_id when the read publishes one, an empty cell when it does not; Avg price and Fee stay empty", () => {
    const csv = blotterCsv(
      [order({ orderId: "o1", deploymentId: "dep_btc_live" }), order({ orderId: "o2", deploymentId: null })],
      cols("order", "deployment", "avg", "fee"),
    );
    const lines = csv.trim().split(/\r?\n/);
    expect(lines.slice(1)).toEqual(["o1,dep_btc_live,,", "o2,,,"]);
  });

  it("prints the visible labels once, then each row as shown: exact decimals ungrouped, UTC short form, absent as an empty cell", () => {
    const csv = blotterCsv(
      [order({ orderId: "o1", submittedAt: "2026-10-17T09:58:00Z", quantity: { kind: "value", text: "1250.0400" }, price: { kind: "absent" }, side: "BUY", orderType: "MARKET", status: "FILLED" })],
      cols("time", "order", "price", "qty", "side", "status"),
    );
    expect(csv).toBe("Time (UTC),Order,Side and type,Price,Quantity,Status\r\n17 Oct 09:58:00Z,o1,Buy Market,,1250.0400,Filled\r\n");
  });

  it("quotes commas and quotes, and defuses a text cell that a spreadsheet would run as a formula", () => {
    const csv = blotterCsv([order({ orderId: "o,1", symbol: '=HYPERLINK("x")', alphaId: "-cmd", quantity: { kind: "value", text: "-5" } })], cols("order", "symbol", "alpha", "qty"));
    expect(csv.split("\r\n")[1]).toBe('"o,1",\'-cmd,"\'=HYPERLINK(""x"")",-5');
  });

  it("names the file for the environment and the read's as-of", () => {
    expect(blotterCsvName("Paper", "2026-10-21T10:42:01Z")).toBe("blotter-paper-20261021T104201Z.csv");
    expect(blotterCsvName("Paper", null)).toBe("blotter-paper-asof-not-published.csv");
  });
});

describe("an order path never shows a time that cannot belong to the order (QA4 R4-01)", () => {
  const stage = (name: string) => ({ name, state: "OBSERVED", events: [], eventCount: 1, truncated: false } as unknown as Parameters<typeof pathTimeProblem>[0]);
  const order = { submittedAt: "2026-10-27T11:35:53Z" };

  it("a hop later than the page's as-of is not shown", () => {
    expect(pathTimeProblem(stage("FILL"), "2026-10-27T12:04:00Z", order, "2026-10-27T12:03:57Z")).toBe(true);
    expect(pathTimeProblem(stage("FILL"), "2026-10-27T11:35:54Z", order, "2026-10-27T12:03:57Z")).toBe(false);
  });

  it("a submitted time that is not the order's own is not shown; the order's own is", () => {
    expect(pathTimeProblem(stage("SUBMIT"), "2026-10-27T12:03:58Z", order, null)).toBe(true);
    expect(pathTimeProblem(stage("SUBMIT"), "2026-10-27T11:35:53Z", order, null)).toBe(false);
  });

  it("no time, no problem", () => {
    expect(pathTimeProblem(stage("SUBMIT"), null, order, "2026-10-27T12:03:57Z")).toBe(false);
  });
});

describe("G2: Fee precision, one per currency", () => {
  const order = (fee: string | null, feeCurrency: string | null) => ({ fee: fee === null ? { kind: "absent" } : { kind: "value", text: fee }, feeCurrency }) as never;

  it("writes every fee of a currency to the same number of places (the finest the page needs), padding rather than rounding away digits", () => {
    const orders = [order("0.0123", "USDT"), order("0.01272100", "USDT"), order("0.01", "USDT")];
    const places = feePrecisionByCurrency(orders).get("USDT")!;
    expect(places).toBe(4);
    expect(["0.0123", "0.01272100", "0.01"].map((t) => formatFee(t, places))).toEqual(["0.0123", "0.0127", "0.0100"]);
  });

  it("keeps a currency of its own: another currency on the page does not set this one's precision", () => {
    const orders = [order("0.00001234", "BTC"), order("1.5", "USDT"), order("0.25", "USDT")];
    const places = feePrecisionByCurrency(orders);
    expect(places.get("USDT")).toBe(2);
    expect(places.get("BTC")).toBe(8);
    expect(formatFee("1.5", places.get("USDT")!)).toBe("1.50");
    // A real fee is never shown as zero: the page's finest scale keeps it.
    expect(formatFee("0.00001234", places.get("BTC")!)).toBe("0.00001234");
  });

  it("groups thousands, ignores absent fees, and returns a text the formatter cannot read as published", () => {
    expect(feePrecisionByCurrency([order(null, "USDT")]).size).toBe(0);
    expect(formatFee("1234.5", 2)).toBe("1,234.50");
    expect(formatFee("1e-5", 2)).toBe("1e-5");
  });
});
