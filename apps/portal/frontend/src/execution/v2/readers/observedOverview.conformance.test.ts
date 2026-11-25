/**
 * Conformance of `observedOverview.ts` (Core Observed consumer, slice 1).
 *
 * Oracle: `execution-observed-read.v1.schema.json` through the testkit checker, and the canonical fixtures
 * `execution-observed-read.synthetic.valid.json` (paper, unavailable, retained) and `...synthetic.invalid.json`, loaded digest-checked and
 * never hand-built. Lane: FIXTURE_LAB, every body is TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT: nothing here is a real value.
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical } from "../testkit/loadCanonical";
import { validateAgainst } from "../testkit/schema";
import { OBSERVED_CODES, classifyObservedFailure, observedOverviewPath, readObservedOverview, type ObservedOverview } from "./observedOverview";

const VALID = "execution-observed-read.synthetic.valid.json";
const INVALID = "execution-observed-read.synthetic.invalid.json";
const SCHEMA = "execution-observed-read.v1";
const digests = [canonicalDigest(VALID), canonicalDigest(INVALID)];
afterAll(() => {
  expect([canonicalDigest(VALID), canonicalDigest(INVALID)]).toEqual(digests);
});

type Draft = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const valid = loadCanonical<{ lane: string; cases: Record<string, Draft> }>(VALID);
const invalid = loadCanonical<{ cases: { name: string; value: unknown }[] }>(INVALID);
const edit = (name: string, change: (b: Draft) => void): Draft => {
  const copy = structuredClone(valid.cases[name]);
  change(copy);
  return copy;
};
const read = (raw: unknown): ObservedOverview => {
  const out = readObservedOverview(raw);
  expect(out).not.toBeNull();
  return out as ObservedOverview;
};
const figure = (body: ObservedOverview, id: string) => body.figures.find((f) => f.figure_id === id);

describe("canonical valid cases", () => {
  it("are the three published cases and are labelled test-only", () => {
    expect(valid.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(Object.keys(valid.cases)).toEqual(["paper", "unavailable", "retained"]);
  });
  for (const name of ["paper", "unavailable", "retained"]) {
    it(`${name}: schema-valid, read in full, trust pinned`, () => {
      expect(validateAgainst(SCHEMA, "", valid.cases[name])).toEqual([]);
      const body = read(valid.cases[name]);
      expect(body.trust.qualified).toBe(false);
      expect(body.trust.not_ts_qualified).toBe(true);
      expect(body.figures.map((f) => f.figure_id).length).toBe(valid.cases[name].figures.length);
      expect(body.not_published.length).toBe(valid.cases[name].not_published.length);
    });
  }
});

describe("populated (paper)", () => {
  const body = read(valid.cases.paper);
  it("keeps NAV as an exact decimal string and a real zero NET_PNL as the string 0", () => {
    expect(figure(body, "NAV")?.value).toBe(valid.cases.paper.figures.find((f: Draft) => f.figure_id === "NAV").value);
    expect(figure(body, "NET_PNL")?.value).toBe("0");
    expect(figure(body, "NET_PNL")?.availability).toBe("AVAILABLE");
  });
  it("keeps null fields as null, never 0, with their reason", () => {
    for (const id of ["RETURN", "DRAWDOWN"]) {
      const f = figure(body, id);
      expect(f?.value).toBeNull();
      expect(f?.value).not.toBe(0);
      expect(f?.availability).toBe("UNAVAILABLE");
      expect(f?.reason_code).not.toBeNull();
    }
  });
  it("keeps Score and Regime as typed absences", () => {
    expect(body.not_published.find((n) => n.figure === "SCORE")?.reason_code).toBe("NOT_PUBLISHED_IN_OBSERVED_MODE");
    expect(body.not_published.find((n) => n.figure === "REGIME")?.reason_code).toBe("NOT_PUBLISHED_IN_OBSERVED_MODE");
  });
});

describe("unavailable and retained", () => {
  it("unavailable: every figure null with its reason, nothing derived from the account counts", () => {
    const body = read(valid.cases.unavailable);
    expect(body.quality.completeness).toBe("UNRESOLVED");
    expect(body.quality.freshness).toBe("UNKNOWN");
    for (const f of body.figures) { expect(f.value).toBeNull(); expect(f.reason_code).not.toBeNull(); }
    expect(body.as_of.snapshot_source_as_of_ms === null || typeof body.as_of.snapshot_source_as_of_ms === "number").toBe(true);
  });
  it("retained: PARTIAL figures keep their number and their reasons", () => {
    const body = read(valid.cases.retained);
    const partial = body.figures.filter((f) => f.availability === "PARTIAL");
    expect(body.quality.completeness).toBe("PARTIAL");
    for (const f of partial) { expect(f.value).not.toBeNull(); expect(f.reason_code).not.toBeNull(); }
  });
  it("keeps one entry per currency in published order (no merge)", () => {
    const body = edit("paper", (b) => b.figures.push({ ...structuredClone(b.figures[0]), currency: "EUR", value: "5" }));
    const out = read(body);
    expect(out.figures.filter((f) => f.figure_id === "NAV").map((f) => f.currency)).toEqual(["USD", "EUR"]);
  });
});

describe("canonical invalid cases are all refused", () => {
  it("lists the ten published refusals", () => {
    expect(invalid.cases.map((c) => c.name)).toContain("qualified-upgrade");
    expect(invalid.cases).toHaveLength(10);
  });
  for (const c of invalid.cases) {
    it(`${c.name}: the schema rejects it and so does the reader`, () => {
      expect(validateAgainst(SCHEMA, "", c.value).length).toBeGreaterThan(0);
      expect(readObservedOverview(c.value)).toBeNull();
    });
  }
});

describe("strictness beyond the published cases", () => {
  it("rejects qualified:true and any other trust word", () => {
    expect(readObservedOverview(edit("paper", (b) => { b.trust.qualified = true; }))).toBeNull();
    expect(readObservedOverview(edit("paper", (b) => { b.trust.class = "TS_QUALIFIED"; }))).toBeNull();
    expect(readObservedOverview(edit("paper", (b) => { b.trust.not_ts_qualified = false; }))).toBeNull();
    expect(readObservedOverview(edit("paper", (b) => { delete b.trust.qualified; }))).toBeNull();
  });
  it("rejects an unknown key at any level, another schema version and a non-object", () => {
    expect(readObservedOverview(edit("paper", (b) => { b.extra = 1; }))).toBeNull();
    expect(readObservedOverview(edit("paper", (b) => { b.figures[0].extra = 1; }))).toBeNull();
    expect(readObservedOverview(edit("paper", (b) => { b.schema_version = "portal.execution.observed-read.v2"; }))).toBeNull();
    for (const raw of [null, undefined, [], "x", 3]) expect(readObservedOverview(raw)).toBeNull();
  });
  it("rejects a numeric (non-string) value and a value on an UNAVAILABLE figure", () => {
    expect(readObservedOverview(edit("paper", (b) => { b.figures[0].value = 20000; }))).toBeNull();
    expect(readObservedOverview(edit("paper", (b) => { b.figures[2].value = "0"; }))).toBeNull();
  });
  it("rejects a null value on an AVAILABLE figure", () => {
    expect(readObservedOverview(edit("paper", (b) => { b.figures[0].value = null; }))).toBeNull();
  });
  it("rejects an unsafe sequence and a malformed clock", () => {
    expect(readObservedOverview(edit("paper", (b) => { b.projection.sequence = 2 ** 53; }))).toBeNull();
    expect(readObservedOverview(edit("paper", (b) => { b.as_of.read_at_ms = "1795478400000"; }))).toBeNull();
    expect(readObservedOverview(edit("paper", (b) => { b.as_of.read_at_ms = -1; }))).toBeNull();
  });
  it("rejects the server invariants the schema cannot say", () => {
    expect(readObservedOverview(edit("paper", (b) => { b.figures[0].accounts_reported = b.figures[0].accounts_total + 1; }))).toBeNull();
    expect(readObservedOverview(edit("paper", (b) => { b.figures.push(structuredClone(b.figures[0])); }))).toBeNull();
    expect(readObservedOverview(edit("paper", (b) => { b.figures[0].window = { from_ts_ms: 2, to_ts_ms: 1 }; }))).toBeNull();
    expect(readObservedOverview(edit("paper", (b) => { b.figures[0].oldest_ts_ms = 5; b.figures[0].newest_ts_ms = 4; }))).toBeNull();
  });
  it("rejects an environment outside paper, sandbox, live", () => {
    expect(readObservedOverview(edit("paper", (b) => { b.environment = "ALL"; }))).toBeNull();
  });
});

describe("path and failure classes", () => {
  it("encodes the environment and refuses an unknown one", () => {
    expect(observedOverviewPath({ environment: "paper" })).toBe("/observed/overview?environment=paper");
    expect(() => observedOverviewPath({ environment: "all" as never })).toThrow();
  });
  it("keeps 404 lane-off, 404 not-available, 409 SCOPED_V2, 409 access-changed and the rest apart", () => {
    expect(classifyObservedFailure({ httpStatus: 404, code: OBSERVED_CODES.laneOff })).toBe("lane_off");
    expect(classifyObservedFailure({ httpStatus: 404, code: "HTTP_404" })).toBe("lane_off");
    expect(classifyObservedFailure({ httpStatus: 404, code: OBSERVED_CODES.notAvailable })).toBe("not_available");
    expect(classifyObservedFailure({ httpStatus: 409, code: OBSERVED_CODES.scoped })).toBe("scoped");
    expect(classifyObservedFailure({ httpStatus: 409, code: OBSERVED_CODES.accessChanged })).toBe("access_changed");
    expect(classifyObservedFailure({ httpStatus: 409, code: "OTHER" })).toBe("other");
    for (const httpStatus of [400, 401, 403, 500, 503]) expect(classifyObservedFailure({ httpStatus })).toBe("other");
    expect(classifyObservedFailure({})).toBe("other");
  });
});
