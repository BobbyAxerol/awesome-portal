/** EL-V2-09 — the parity script reports every lens and hides nothing. */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compare } from "../../scripts/shadow-parity.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, "../../../../../packages/contracts/fixtures");

describe("shadow parity", () => {
  it("every canonical fixture is at parity with itself (0 rows) — the harness is quiet when nothing differs", () => {
    for (const f of readdirSync(FIXTURES).filter((n) => n.endsWith(".valid.json"))) {
      const doc = JSON.parse(readFileSync(join(FIXTURES, f), "utf8"));
      expect(compare(doc, JSON.parse(JSON.stringify(doc))), f).toEqual([]);
    }
  });
  it("names schema, state, decimal and completeness mismatches separately and never rounds a decimal", () => {
    const fixture = { data: { state: "OK", qty: "125000.250000000000000001", row_count: 3, items: [{ id: "a" }, { id: "b" }] } };
    const shadow = { data: { state: "STALE", qty: "125000.25", row_count: 2, items: [{ id: "a" }], extra: true } };
    const rows = compare(fixture, shadow);
    expect(rows.map((r) => r.lens).sort()).toEqual(["completeness", "completeness", "decimal", "schema", "state"]);
    expect(rows.find((r) => r.lens === "decimal")?.left).toBe('"125000.250000000000000001"');
  });
});
