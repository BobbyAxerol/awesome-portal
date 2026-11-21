/** WP-K second pass: the generated strict readers of the twelve sibling reads, judged against the published schemas, fixtures and refusals. */
import { describe, expect, it } from "vitest";
import { loadCanonical } from "../testkit/loadCanonical";
import { validateAgainst } from "../testkit/schema";
import { run as runStrict, FAIL } from "./strictRead";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = runStrict as (reader: unknown, raw: unknown) => any;
import * as S from "./strictRead";
import { SIBLINGS, type SiblingId } from "./siblings.generated";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;
const index = loadCanonical<{ siblings: Array<{ name: SiblingId; gap: string; schema: string; valid: string[] }> }>("execution-siblings.index.json").siblings;
const apply = (body: Draft, ops: Array<{ op: string; path: Array<string | number>; value?: unknown }>) => {
  for (const op of ops) {
    const holder = op.path.slice(0, -1).reduce((node: Draft, key) => node[key], body);
    if (op.op === "delete") delete holder[op.path.at(-1) as string]; else holder[op.path.at(-1) as string] = op.value;
  }
  return body;
};

describe("the combinators", () => {
  it("an object is closed; a number is a safe integer; money is text; a section has three states", () => {
    const r = S.obj({ a: S.int(0), b: S.dec, c: S.sec(S.str(8)) });
    expect(run(r, { a: 1, b: "-1.50", c: "x" })).toEqual({ a: 1, b: "-1.50", c: { state: "PUBLISHED", value: "x" } });
    expect(run(r, { a: 1, b: "1" })).toEqual({ a: 1, b: "1", c: { state: "NO_SOURCE" } });
    expect(run(r, { a: 1, b: "1", c: null })).toEqual({ a: 1, b: "1", c: { state: "NOT_READ" } });
    for (const bad of [{ a: 1.5, b: "1" }, { a: 1, b: 1 }, { a: 1, b: "1e3" }, { a: 1, b: "1", extra: 1 }, { b: "1" }, { a: 1, b: "1", c: 5 }, [], null, "x"]) expect(run(r, bad)).toBeNull();
    expect(S.int(0)(Number.MAX_SAFE_INTEGER + 2)).toBe(FAIL);
    expect(S.ms(-1)).toBe(FAIL);
    expect(S.str(3)("abcd")).toBe(FAIL);
    expect(S.str(3)("a\u0000b")).toBe(FAIL);
    expect(run(S.refine(S.int(0), (n) => n < 5), 7)).toBeNull();
  });
});

describe.each(index.map((s) => [s.name, s] as const))("%s", (name, entry) => {
  const spec = SIBLINGS[name];
  it("carries its gap and schema version", () => {
    expect(spec.gap).toBe(entry.gap);
    expect(spec.schemaVersion).toBe(`portal.execution.${name}.v1`);
  });
  it.each(entry.valid)("the %s fixture passes the schema and the reader, and the reader keeps the wire names", (variant) => {
    const body = loadCanonical<{ value: Draft }>(`execution-${name}.${variant}.synthetic.valid.json`).value;
    expect(validateAgainst(entry.schema, "", body)).toEqual([]);
    const read = run(spec.read, structuredClone(body));
    expect(read, `${name}/${variant}`).not.toBeNull();
    expect(read.schema_version).toBe(spec.schemaVersion);
  });
  const rule = loadCanonical<Draft>(`execution-${name}.synthetic.negative.json`);
  it.each(rule.cases.map((c: Draft): [string, Draft] => [c.id, c]) as [string, Draft][])("refuses %s (schema and reader agree)", (_id: string, c: Draft) => {
    const body = apply(structuredClone(loadCanonical<{ value: Draft }>(rule.bases[c.base]).value), c.ops);
    if (c.refused_by !== "READER_ONLY") expect(validateAgainst(entry.schema, "", body).length).toBeGreaterThan(0);
    expect(run(spec.read, body)).toBeNull();
  });
  it("refuses another schema version and a hostile root", () => {
    expect(run(spec.read, { schema_version: `portal.execution.${name}.v2` })).toBeNull();
    for (const bad of [null, [], "x", 3]) expect(run(spec.read, bad)).toBeNull();
  });
});

describe("paths", () => {
  it("builds the path from the definition and refuses an id the Portal does not accept", () => {
    expect(SIBLINGS["portfolio-members"].path({ portfolio_id: "pf_1", workspace_id: "ws_1" })).toBe("/portfolios/pf_1/members?workspace_id=ws_1");
    expect(SIBLINGS["portfolio-members"].path({ portfolio_id: "../x" })).toBeNull();
    expect(SIBLINGS["portfolio-members"].path({})).toBeNull();
    expect(SIBLINGS.limits.path({ subject_type: "DEPLOYMENT", subject_id: "d1" })).toBe("/limits?subject_type=DEPLOYMENT&subject_id=d1");
  });
});
