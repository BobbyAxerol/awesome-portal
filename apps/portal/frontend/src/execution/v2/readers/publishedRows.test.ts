/**
 * Rows the contract does not type, drawn as the source wrote them (readers/publishedRows.ts).
 * Lane: collections built with the V1 reader (`readRowCollection`) from bodies shaped like the published
 * `UnavailableCollection`; the member names are the test's own because the contract does not name them (FE-072).
 */
import { describe, expect, it } from "vitest";

import { readRowCollection } from "../../certification";
import { PUBLISHED_COLUMN_CAP, PUBLISHED_ROW_CAP, cellText, lossNote, lossText, memberLabel, publishedRowsOf } from "./publishedRows";

const envelope = (state: string) => ({
  panel_id: "positions", source_authority: "EXECUTION", panel_state: state, freshness_state: "FRESH", delivery_profile: "fixture",
  source_verification_state: "VERIFIED", as_of: "2026-10-17T12:04:00.000Z", read_at: "2026-10-17T12:04:00.000Z", data: {}, warnings: [],
});
const collection = (rows: unknown[], state = "ready", total: number | null = rows.length) =>
  readRowCollection({ envelope: envelope(state), exact_total: total, returned_count: rows.length, rows }, "positions");

describe("publishedRowsOf", () => {
  it("columns are the members the rows carry, in first-appearance order; a row that lacks one has null there", () => {
    const table = publishedRowsOf(collection([{ symbol: "A", qty: "1.0000" }, { symbol: "B", side: "LONG" }]))!;
    expect(table.columns.map((c) => [c.key, c.label])).toEqual([["symbol", "Symbol"], ["qty", "Qty"], ["side", "Side"]]);
    expect(table.rows.map((r) => r.cells)).toEqual([["A", "1.0000", null], ["B", null, "LONG"]]);
    expect(table.total).toBe(2);
  });

  it("cell text is exactly what the server wrote: a decimal keeps every digit and its trailing zeros, a boolean is Yes / No, null and empty are absent", () => {
    expect(cellText("0.00120000")).toBe("0.00120000");
    expect(cellText("9007199254740993.123456789")).toBe("9007199254740993.123456789");
    expect(cellText(true)).toBe("Yes");
    expect(cellText(false)).toBe("No");
    expect(cellText(null)).toBeNull();
    expect(cellText(undefined)).toBeNull();
    expect(cellText("")).toBeNull();
  });

  it("a collection whose envelope does not hold rows yields nothing, even if the body carried rows", () => {
    for (const state of ["unavailable", "suppressed", "error", "loading", "fine", ""]) {
      expect(publishedRowsOf(collection([{ symbol: "A" }], state)), state).toBeNull();
    }
    for (const state of ["ready", "empty", "partial", "stale"]) {
      expect(publishedRowsOf(collection([{ symbol: "A" }], state)), state).not.toBeNull();
    }
    expect(publishedRowsOf(null)).toBeNull();
    expect(publishedRowsOf(undefined)).toBeNull();
  });

  it("an empty list is a table with no rows, and the server's total is kept apart from what was loaded", () => {
    const table = publishedRowsOf(collection([], "ready", 5000))!;
    expect(table.rows).toEqual([]);
    expect(table.columns).toEqual([]);
    expect(table.total).toBe(5000);
    expect(publishedRowsOf(collection([], "ready", null))!.total).toBeNull();
  });

  it("bounds: at most 200 rows and 12 columns, with the cut named", () => {
    const row = (i: number) => Object.fromEntries(Array.from({ length: 15 }, (_, j) => [`field_${j}`, `${i}:${j}`]));
    const table = publishedRowsOf(collection(Array.from({ length: 230 }, (_, i) => row(i))))!;
    expect(table.rows).toHaveLength(PUBLISHED_ROW_CAP);
    expect(table.columns).toHaveLength(PUBLISHED_COLUMN_CAP);
    expect(table.hiddenColumns).toBe(3);
    expect(table.rowsDropped).toBe(30);
    expect(table.rows[199]!.cells[11]).toBe("199:11");
  });

  it("only scalars become cells: a number, an array, an object, an over-long string and a control or bidi character are dropped", () => {
    const bidi = String.fromCharCode(0x202e);
    const zero = String.fromCharCode(0x200b);
    const table = publishedRowsOf(collection([{
      good: "x", num: 5, arr: ["a"], obj: { a: "b" }, long: "y".repeat(257), edge: "z".repeat(256), tab: "a\tb", bidi: `a${bidi}b`, zero: `a${zero}b`,
    }]))!;
    // The kept cells are the scalars; every other member the row carried keeps its column and is marked LOST, not absent.
    expect(table.columns.map((c) => c.key)).toEqual(["good", "edge", "num", "arr", "obj", "long", "tab", "bidi", "zero"]);
    expect(table.rows[0]!.cells).toEqual(["x", "z".repeat(256), null, null, null, null, null, null, null]);
    expect(table.rows[0]!.lost).toEqual([null, null, "number", "unreadable", "unreadable", "unreadable", "unreadable", "unreadable", "unreadable"]);
  });

  it("a figure the server sent as a JSON number prints as Unreadable (number not accepted), never as a string, never as Not available", () => {
    const table = publishedRowsOf(collection([{ symbol: "A", qty: 0.012, price: "64000.10" }, { symbol: "B", qty: "0.0120", price: 64000.1 }]))!;
    const qty = table.columns.findIndex((c) => c.key === "qty");
    expect(table.rows[0]!.cells[qty]).toBeNull();
    expect(table.rows[0]!.lost[qty]).toBe("number");
    expect(table.rows[1]!.cells[qty]).toBe("0.0120");
    expect(table.rows[1]!.lost[qty]).toBeNull();
    expect(lossText("number")).toBe("Unreadable (number not accepted)");
    expect(lossText("unreadable")).toBe("Unreadable");
    // a source null is still just absent
    const withNull = publishedRowsOf(collection([{ symbol: "A", qty: null }]))!;
    expect(withNull.rows[0]!.lost).toEqual([null, null]);
  });

  it("cells with no column to sit in are counted: an unsafe key, a cell past the 80-cell bound", () => {
    const wide = Object.fromEntries(Array.from({ length: 85 }, (_, i) => [`k${i}`, "v"]));
    const table = publishedRowsOf(collection([{ ...wide, "bad name": "1", "1st": "2" } as never]))!;
    expect(table.cellsNotShown).toBe(5 + 2);
    expect(lossNote(table)).toBe("7 cells not shown.");
    const one = publishedRowsOf(collection([{ ok: "1", "bad name": "1" } as never]))!;
    expect(lossNote(one)).toBe("1 cell not shown.");
  });

  it("a row whose every cell is unreadable is counted, not silently gone", () => {
    const table = publishedRowsOf(collection([{ a: "x" }, { qty: 1.5 }, {}]))!;
    expect(table.rows).toHaveLength(1);
    expect(table.rowsDropped).toBe(2);
    expect(table.rowsUnreadable).toBe(1);
    expect(lossNote(table)).toBe("1 row has no readable cell.");
  });

  it("nothing lost: no note, no lost cell", () => {
    const table = publishedRowsOf(collection([{ a: "x" }]))!;
    expect(lossNote(table)).toBeNull();
    expect(table.rows[0]!.lost).toEqual([null]);
  });

  it("member names are tokens: a name with a space, a leading digit or an underscore first is not a column", () => {
    const table = publishedRowsOf(collection([{ "bad name": "1", "1st": "2", _hidden: "3", __proto__: "4", ok_1: "5" } as never]))!;
    expect(table.columns.map((c) => c.key)).toEqual(["ok_1"]);
    expect(table.cellsNotShown).toBe(3);
  });

  it("memberLabel speaks the key as words and never leaves a blank", () => {
    expect(memberLabel("entry_price")).toBe("Entry price");
    expect(memberLabel("qty")).toBe("Qty");
    expect(memberLabel("a-b")).toBe("A b");
    expect(memberLabel("___")).toBe("___");
  });
});
