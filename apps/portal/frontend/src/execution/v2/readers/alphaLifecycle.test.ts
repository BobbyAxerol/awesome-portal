/** WP-K slice 5: the strict alpha lifecycle reader, judged against the canonical fixtures and the published JSON Schema. */
import { describe, expect, it } from "vitest";
import { loadCanonical } from "../testkit/loadCanonical";
import { validateAgainst } from "../testkit/schema";
import { alphaLifecycleAnswers, alphaLifecyclePath, readAlphaLifecycleV1 } from "./alphaLifecycle";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;
const SCHEMA = "execution-alpha-lifecycle.v1.schema.json";
const body = (name: string): Draft => structuredClone(loadCanonical<{ value: Draft }>(`execution-alpha-lifecycle.${name}.synthetic.valid.json`).value);
const read = (raw: unknown) => readAlphaLifecycleV1(raw);

describe("fixtures", () => {
  it.each(["published", "not-read", "no-source", "regime-absent"])("%s passes the schema and the reader", (name) => {
    expect(validateAgainst(SCHEMA, "", body(name))).toEqual([]);
    expect(read(body(name))?.kind).toBe("alpha_lifecycle");
  });
  it("reads the stages, criteria, actors and receipts, the five event kinds, a published ratio and Net PnL per venue as exact strings", () => {
    const lc = (read(body("published")) as Draft).lifecycle;
    expect(lc.stages.value.map((s: Draft) => [s.stage, s.state])).toEqual([["R1", "DONE"], ["R2", "DONE"], ["PAPER", "DONE"], ["SANDBOX", "DONE"], ["CANARY", "CURRENT"], ["LIVE", "NOT_STARTED"]]);
    expect(lc.stages.value[4].criteria).toMatchObject({ met: 6, total: 7 });
    expect(lc.stages.value[2]).toMatchObject({ decidedBy: "TEST_ONLY:actor-1", receiptRef: "TEST_ONLY:receipt-paper", deciderRole: "Manager" });
    expect(new Set(lc.events.value.items.map((e: Draft) => e.kind)).size).toBe(5);
    expect(lc.regimeFit.value).toEqual({ state: "PUBLISHED", ratioScale: "FRACTION", exact: "0.6125" });
    expect(lc.venueNetPnl.value.map((v: Draft) => [v.venue, v.currency, v.exact])).toEqual([["BINANCE", "USDT", "1250.5"], ["OKX", "USDT", "-310.25"], ["DERIBIT", "BTC", "0.0412"]]);
  });
  it("omitted is NO_SOURCE and null is NOT_READ; an absent regime fit carries its code and no number", () => {
    const none = (read(body("no-source")) as Draft).lifecycle;
    const unread = (read(body("not-read")) as Draft).lifecycle;
    const absent = (read(body("regime-absent")) as Draft).lifecycle;
    expect([none.stages.state, none.venueNetPnl.state]).toEqual(["NO_SOURCE", "NO_SOURCE"]);
    expect([unread.events.state, unread.regimeFit.state]).toEqual(["NOT_READ", "NOT_READ"]);
    expect(absent.regimeFit.value).toEqual({ state: "NOT_PUBLISHED", reasonCode: "INSUFFICIENT_DATA" });
  });
  it("answers only the alpha asked; builds a safe path", () => {
    const lc = (read(body("published")) as Draft).lifecycle;
    expect(alphaLifecycleAnswers(lc, "TEST_ONLY:alpha-a")).toBe(true);
    expect(alphaLifecycleAnswers(lc, "other")).toBe(false);
    expect(alphaLifecyclePath("TEST_ONLY:alpha-a", "paper")).toBe("/alphas/TEST_ONLY%3Aalpha-a/lifecycle?environment=paper");
    expect(alphaLifecyclePath("a/b")).toBeNull();
  });
});

describe("refusals (reader and schema agree on the published negatives)", () => {
  const rule = loadCanonical<Draft>("execution-alpha-lifecycle.synthetic.negative.json");
  it.each(rule.cases.map((c: Draft): [string, Draft] => [c.id, c]) as [string, Draft][])("%s", (_id: string, c: Draft) => {
    const draft = structuredClone(loadCanonical<{ value: Draft }>(rule.bases[c.base]).value);
    for (const op of c.ops) {
      const holder = op.path.slice(0, -1).reduce((node: Draft, key: string | number) => node[key], draft);
      if (op.op === "delete") delete holder[op.path.at(-1)]; else holder[op.path.at(-1)] = op.value;
    }
    expect(validateAgainst(SCHEMA, "", draft).length).toBeGreaterThan(0);
    expect(read(draft)).toBeNull();
  });
  it("LC-1 stage order and a DONE stage without an exit, LC-2 criteria arithmetic, LC-3 duplicate events, one figure per venue and currency, another schema", () => {
    const outOfOrder = body("published"); outOfOrder.stages.reverse();
    expect(read(outOfOrder)).toBeNull();
    const noExit = body("published"); noExit.stages[0].exited_at_ms = null;
    expect(read(noExit)).toBeNull();
    const over = body("published"); over.stages[4].criteria.met = 8;
    expect(read(over)).toBeNull();
    const items = body("published"); items.stages[2].criteria.met = 3;
    expect(read(items)).toBeNull();
    const dup = body("published"); dup.events.items[1].event_id = dup.events.items[0].event_id;
    expect(read(dup)).toBeNull();
    const venue = body("published"); venue.venue_net_pnl.push({ ...venue.venue_net_pnl[0] });
    expect(read(venue)).toBeNull();
    const truncated = body("published"); truncated.events.truncated = true;
    expect(read(truncated)).toBeNull();
    expect(read({ schema_version: "portal.execution.alpha-lifecycle.v2" })).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.execution.alpha-lifecycle.v2" });
    expect(read(null)).toBeNull();
  });
});
