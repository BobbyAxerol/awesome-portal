/**
 * The free-row reader (`readRowRecord` / `readRowCollection`) after the V2 loss tracking was added.
 *
 * V1 contract: the kept rows are byte for byte what the pre-change reader (855ad7c0) kept. The legacy reader is
 * written out below from that commit and compared on a spread of rows; the only deliberate difference is the
 * shared `unsafeText` set, which also refuses a few invisible characters the old regex missed.
 */
import { describe, expect, it } from "vitest";

import { readRowCollection, readRowRecord } from "./certification";

const MAX_CELLS = 80;
const OLD_UNSAFE = new RegExp(
  "[" + [[0x0000, 0x001f], [0x007f, 0x009f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff]]
    .map(([lo, hi]) => `\\u${lo.toString(16).padStart(4, "0")}-\\u${hi.toString(16).padStart(4, "0")}`)
    .join("") + "]",
);
const CELL_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** The reader as it was before loss tracking. */
function legacyRow(raw: unknown): Record<string, string | boolean | null> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const cells: Record<string, string | boolean | null> = {};
  let kept = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (kept >= MAX_CELLS) break;
    if (!CELL_KEY.test(key)) continue;
    if (value === null || typeof value === "boolean" || (typeof value === "string" && value.length <= 256 && !OLD_UNSAFE.test(value))) {
      cells[key] = value;
      kept += 1;
    }
  }
  return kept === 0 ? null : cells;
}

const SAMPLES: unknown[] = [
  { symbol: "BTCUSDT", qty: "0.0120", reduce_only: false, note: null },
  { symbol: "A", qty: 5, price: "1.50", arr: ["x"], obj: { a: 1 } },
  { qty: 1.5 },
  {},
  [],
  null,
  "text",
  { "bad name": "1", ok: "2", "1st": "3" },
  { a: "x".repeat(257), b: "y".repeat(256) },
  { a: "tab\there", b: "fine" },
  { a: `bidi${String.fromCharCode(0x202e)}`, b: "fine" },
  Object.fromEntries(Array.from({ length: 95 }, (_, i) => [`k${i}`, i % 3 === 0 ? i : `v${i}`])),
];

describe("readRowRecord keeps exactly what the old reader kept", () => {
  it.each(SAMPLES.map((s, i) => [i, s] as const))("sample %i", (_i, sample) => {
    expect(readRowRecord(sample)).toEqual(legacyRow(sample));
  });
});

describe("readRowCollection: the V1 fields are unchanged, the loss fields are additive", () => {
  const envelope = {
    panel_id: "positions", source_authority: "EXECUTION", panel_state: "ready", freshness_state: "FRESH", delivery_profile: "fixture",
    source_verification_state: "VERIFIED", as_of: "2026-10-17T12:04:00.000Z", read_at: "2026-10-17T12:04:00.000Z", data: {}, warnings: [],
  };
  it("rows, rowsDropped, total and counts equal the old reader's on the same body", () => {
    const rows = [...SAMPLES, ...Array.from({ length: 210 }, (_, i) => ({ n: `${i}` }))];
    const read = readRowCollection({ envelope, exact_total: rows.length, returned_count: rows.length, rows }, "positions")!;
    const kept = rows.map(legacyRow).filter((r) => r !== null);
    const capped = kept.slice(0, 200);
    expect(read.rows).toEqual(capped);
    expect(read.rowsDropped).toBe(rows.length - capped.length);
    expect(read.exactTotal).toBe(rows.length);
    expect(read.rowLosses).toHaveLength(read.rows.length);
  });

  it("a number cell is recorded as lost (number), never converted to a string", () => {
    const read = readRowCollection({ envelope, exact_total: 1, returned_count: 1, rows: [{ symbol: "A", qty: 0.012 }] }, "positions")!;
    expect(read.rows).toEqual([{ symbol: "A" }]);
    expect(read.rowLosses![0]).toEqual({ cells: { qty: "number" }, notShown: 0 });
    expect(JSON.stringify(read.rows)).not.toContain("0.012");
  });
});
