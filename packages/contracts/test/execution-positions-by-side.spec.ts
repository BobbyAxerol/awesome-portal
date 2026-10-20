/**
 * S3-U4 / FE-051 widened (BE-P3): Long, Short and Gross by side for a deployment's open positions.
 * The producer function (apps/control-api/src/paper-read/positions-by-side.ts) is the same code the
 * Paper workbench runs; this spec ties it to the published schema and the canonical fixtures.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  POSITION_NOTIONAL_REASON, POSITIONS_BY_SIDE_REASONS, POSITIONS_BY_SIDE_STATES, positionsBySide,
} from "../../../apps/control-api/src/paper-read/positions-by-side";

const root = resolve(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
for (const name of readdirSync(resolve(root, "schemas"))) ajv.addSchema(load(`schemas/${name}`));
const paper = ajv.getSchema("https://schemas.primusspark.com/portal/execution-paper-read.v1.schema.json")!;
const block = ajv.getSchema("https://schemas.primusspark.com/portal/execution-paper-read.v1.schema.json#/$defs/PositionsBySide")!;

const FIXTURES = [
  ["available", "fixtures/execution-paper-workbench.positions-by-side.valid.json", "relation AVAILABLE"],
  ["partial (unclassified rows)", "fixtures/execution-paper-workbench.positions-by-side.partial.valid.json", "relation AVAILABLE"],
  ["unavailable", "fixtures/execution-paper-workbench.positions-by-side.unavailable.valid.json", "relation UNAVAILABLE"],
] as const;

describe("positions_by_side canonical fixtures", () => {
  it.each(FIXTURES)("%s validates against the Paper schema and equals what the producer derives from the same rows", (_name, path, relation) => {
    const fixture = load(path);
    expect(paper(fixture), JSON.stringify(paper.errors)).toBe(true);
    const derived = positionsBySide({
      rows: relation === "relation UNAVAILABLE" ? null : fixture.data.positions,
      relationState: relation === "relation UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE",
    });
    expect(derived).toEqual(fixture.data.positions_by_side);
  });

  it("notional by side is a typed unavailable in every fixture, never a number", () => {
    for (const [, path] of FIXTURES) {
      expect(load(path).data.positions_by_side.notional).toEqual({ state: "UNAVAILABLE", reason_code: POSITION_NOTIONAL_REASON });
    }
  });
});

describe("positions_by_side schema", () => {
  const good = () => structuredClone(load(FIXTURES[0][1]).data.positions_by_side);
  it("rejects a number where notional would be, an unknown reason, a stray key, and rule violations", () => {
    expect(block(good())).toBe(true);
    const mutations: Array<[string, (value: any) => void]> = [
      ["notional value", (v) => { v.notional = { state: "AVAILABLE", reason_code: null, value: "1" }; }],
      ["unknown reason", (v) => { v.state = "PARTIAL"; v.reason_code = "BECAUSE"; }],
      ["stray key", (v) => { v.total_notional = "9"; }],
      ["available with a reason", (v) => { v.reason_code = "SOURCE_POSITIONS_PARTIAL"; }],
      ["available with no rows", (v) => { v.rows = []; }],
      ["empty with rows", (v) => { v.state = "EMPTY"; }],
      ["unavailable with rows", (v) => { v.state = "UNAVAILABLE"; v.reason_code = "POSITIONS_NOT_PUBLISHED"; }],
      ["partial without a reason", (v) => { v.state = "PARTIAL"; }],
      ["negative quantity", (v) => { v.rows[0].short_quantity = "-1"; }],
      ["exponent quantity", (v) => { v.rows[0].long_quantity = "1e3"; }],
      ["number quantity", (v) => { v.rows[0].gross_quantity = 1.43; }],
      ["zero position_count", (v) => { v.rows[0].position_count = 0; }],
      ["more than 200 rows", (v) => { v.rows = Array.from({ length: 201 }, (_, i) => ({ ...v.rows[0], instrument_id: `I${i}` })); }],
    ];
    for (const [name, mutate] of mutations) {
      const value = good(); mutate(value);
      expect(block(value), name).toBe(false);
    }
  });

  it("producer vocabularies equal the schema enums", () => {
    const schema = load("schemas/execution-paper-read.v1.schema.json").$defs.PositionsBySide.properties;
    expect(schema.state.enum).toEqual([...POSITIONS_BY_SIDE_STATES]);
    expect(schema.reason_code.enum).toEqual([...POSITIONS_BY_SIDE_REASONS, null]);
    expect(schema.notional.properties.reason_code.const).toBe(POSITION_NOTIONAL_REASON);
    const openapi = load("openapi/execution-paper-read.openapi.json").components.schemas;
    expect(openapi.PositionsBySide.properties.state).toEqual(schema.state);
    expect(openapi.PositionsBySide.properties.reason_code).toEqual(schema.reason_code);
    expect(openapi.PositionsBySideRow).toEqual(load("schemas/execution-paper-read.v1.schema.json").$defs.PositionsBySideRow);
  });
});

describe("positionsBySide (pure)", () => {
  const row = (side: unknown, quantity: unknown, instrument: unknown = "BTCUSDT", extra: Record<string, unknown> = {}) =>
    ({ side, quantity, instrument_id: instrument, closed_at: null, ...extra });
  const run = (rows: unknown[] | null, relationState: "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE" = "AVAILABLE") =>
    positionsBySide({ rows: rows as never, relationState });

  it("sums exactly past double precision, per instrument, long and short apart", () => {
    const out = run([row("LONG", "9007199254740993.000000001"), row("LONG", "0.000000001"), row("SHORT", "1.5"), row("LONG", "2", "ETHUSDT")]);
    expect(out.rows).toEqual([
      { instrument_id: "BTCUSDT", long_quantity: "9007199254740993.000000002", short_quantity: "1.5", gross_quantity: "9007199254740994.500000002", position_count: 3 },
      { instrument_id: "ETHUSDT", long_quantity: "2", short_quantity: "0", gross_quantity: "2", position_count: 1 },
    ]);
    expect(out.state).toBe("AVAILABLE");
  });

  it("never totals across instruments and never invents a notional", () => {
    const out = run([row("LONG", "1"), row("LONG", "1", "ETHUSDT")]);
    expect(out.rows).toHaveLength(2);
    expect(JSON.stringify(out)).not.toMatch(/"total_|"gross_notional|"notional":\{"state":"AVAILABLE/);
    expect(out.notional).toEqual({ state: "UNAVAILABLE", reason_code: POSITION_NOTIONAL_REASON });
  });

  it.each([
    [null, "AVAILABLE", "UNAVAILABLE", "POSITIONS_NOT_PUBLISHED"],
    [[], "UNAVAILABLE", "UNAVAILABLE", "POSITIONS_NOT_PUBLISHED"],
    [[], "EMPTY", "EMPTY", null],
    [[], "AVAILABLE", "EMPTY", null],
    [[], "PARTIAL", "PARTIAL", "SOURCE_POSITIONS_PARTIAL"],
    [[row("FLAT", "0")], "AVAILABLE", "EMPTY", null],
    [[row("LONG", "1")], "PARTIAL", "PARTIAL", "SOURCE_POSITIONS_PARTIAL"],
    [[row("LONG", "1"), row("BUY", "1")], "AVAILABLE", "PARTIAL", "POSITION_ROWS_UNCLASSIFIED"],
  ] as const)("state %#", (rows, relationState, state, reason) => {
    const out = run(rows as never, relationState);
    expect([out.state, out.reason_code]).toEqual([state, reason]);
  });

  it("counts what it cannot classify instead of guessing", () => {
    const out = run([
      row("FLAT", "0"), row("LONG", "1", "BTCUSDT", { closed_at: "2026-10-17T00:00:00Z" }), row("SHORT", "-1"), row("SHORT", "1e2"),
      row("long", "1"), row("LONG", 5), row("LONG", "1", null), row("LONG", "1", ""), row("LONG", "1", "bad instrument"), row("LONG", "0"),
    ]);
    expect(out.excluded).toEqual({ flat_rows: 1, closed_rows: 1, unclassified_rows: 4, no_instrument_rows: 3 });
    expect(out.rows).toEqual([{ instrument_id: "BTCUSDT", long_quantity: "0", short_quantity: "0", gross_quantity: "0", position_count: 1 }]);
  });

  it("is deterministic in order and bounded at 200 instruments, saying so", () => {
    const many = Array.from({ length: 205 }, (_, i) => row("LONG", "1", `I${String(204 - i).padStart(3, "0")}`));
    const out = run(many);
    expect(out.rows).toHaveLength(200);
    expect(out.rows[0].instrument_id).toBe("I000");
    expect([out.state, out.reason_code]).toEqual(["PARTIAL", "SOURCE_POSITIONS_PARTIAL"]);
    expect(block(out), JSON.stringify(block.errors)).toBe(true);
  });

  it("every output the function can produce validates against the published block", () => {
    const cases = [null, [], [row("LONG", "1")], [row("FLAT", "0")], [row("BUY", "1")], [row("SHORT", "2.50"), row("LONG", "0.5")]];
    for (const rows of cases) for (const relationState of ["AVAILABLE", "EMPTY", "PARTIAL", "UNAVAILABLE"] as const) {
      const out = run(rows as never, relationState);
      expect(block(out), JSON.stringify([rows, relationState, block.errors])).toBe(true);
    }
  });
});
