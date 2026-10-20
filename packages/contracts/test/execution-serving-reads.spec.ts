/**
 * S3-U2 (BE-P3): schemas + producer-written canonical fixtures for the reads Alpha 360 / Trade Replay consume.
 * The fixtures are written by the real services (apps/control-api/test/be-p3-serving-*.spec.ts); this spec is the
 * consumer-side gate: they validate, the schemas refuse the shapes that would turn absence into data, and the OpenAPI
 * document names the routes.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
for (const name of readdirSync(resolve(root, "schemas"))) ajv.addSchema(load(`schemas/${name}`));
const validator = (file: string) => ajv.getSchema(`https://schemas.primusspark.com/portal/${file}`)!;
const FAMILIES = [
  { name: "alpha resource v1", schema: "execution-alpha-resource.v1.schema.json", fixture: "fixtures/execution-alpha-resource.v1.synthetic.valid.json",
    cases: ["ready", "alpha_not_in_projection", "projection_not_ready"] },
  { name: "subject records v1", schema: "execution-subject-records.v1.schema.json", fixture: "fixtures/execution-subject-records.v1.synthetic.valid.json",
    cases: ["orders_first_page_has_more", "orders_last_page", "fills_one_page", "authoritative_empty", "relation_unavailable"] },
  { name: "observed timeline", schema: "execution-observed-timeline.v1.schema.json", fixture: "fixtures/execution-observed-timeline.v1.synthetic.valid.json",
    cases: ["one_page", "first_page_has_more", "empty"] },
  { name: "market candles", schema: "execution-market-candles.v1.schema.json", fixture: "fixtures/execution-market-candles.v1.synthetic.valid.json",
    cases: ["venue_public_ready", "venue_public_empty_window", "venue_public_symbol_unknown", "venue_public_rate_limited", "venue_public_malformed", "okx_swap_ready",
      "feature_disabled", "data_layer_source_not_wired", "data_layer_via_market_context_ready", "data_layer_range_required"] },
] as const;
const named = (fixture: string, name: string) => structuredClone(load(fixture).cases.find((c: { name: string }) => c.name === name).value);

describe.each(FAMILIES)("$name", (family) => {
  const validate = validator(family.schema);
  it("canonical fixtures: producer-written, all validate", () => {
    const body = load(family.fixture);
    expect(body.producer_run).toBe(true);
    expect(body.cases.map((c: { name: string }) => c.name)).toEqual(family.cases);
    for (const c of body.cases) expect(validate(c.value), `${c.name} ${JSON.stringify(validate.errors?.slice(0, 4))}`).toBe(true);
  });
  it("refuses a stray top-level key and a wrong schema_version", () => {
    const value = named(family.fixture, family.cases[0]);
    expect(validate({ ...value, injected: true })).toBe(false);
    expect(validate({ ...value, schema_version: "x.v2" })).toBe(false);
  });
});

describe("variant-specific refusals", () => {
  it("alpha resource: a v2 body is not a v1 body, and a bounded shell is the only partial alpha", () => {
    const v = validator("execution-alpha-resource.v1.schema.json");
    const ready = named("fixtures/execution-alpha-resource.v1.synthetic.valid.json", "ready");
    expect(v({ ...ready, schema_version: "execution.alpha-resource.v2" })).toBe(false);
    const bad = structuredClone(ready); bad.data.alpha.deployments[0].health = "NOT_READY"; expect(v(bad)).toBe(false);
    const money = structuredClone(ready); money.data.alpha.balances[0].total = 41230.55; expect(v(money)).toBe(false);
    const shell = structuredClone(ready); shell.data.alpha = { id: "alpha_btc_trend", state: "PARTIAL", reason_code: "EDS04_RESOURCE_RESPONSE_BYTE_BOUND" };
    expect(v(shell), JSON.stringify(v.errors)).toBe(true);
    const lie = structuredClone(ready); lie.data.alpha.valuation_warning = "NONE"; expect(v(lie)).toBe(false);
  });
  it("subject records: unavailable and authoritative-empty pages carry no rows; cursor is Portal-signed", () => {
    const v = validator("execution-subject-records.v1.schema.json");
    const page = named("fixtures/execution-subject-records.v1.synthetic.valid.json", "orders_first_page_has_more");
    const rows = structuredClone(named("fixtures/execution-subject-records.v1.synthetic.valid.json", "relation_unavailable"));
    rows.records = page.records; expect(v(rows)).toBe(false);
    page.page.next_cursor = "raw-manager-cursor"; expect(v(page)).toBe(false);
    const big = named("fixtures/execution-subject-records.v1.synthetic.valid.json", "orders_last_page"); big.page.limit = 501; expect(v(big)).toBe(false);
  });
  it("observed timeline: an entry has no order status, and a ready panel needs data", () => {
    const v = validator("execution-observed-timeline.v1.schema.json");
    const page = named("fixtures/execution-observed-timeline.v1.synthetic.valid.json", "one_page");
    const withStatus = structuredClone(page); withStatus.observed_timeline.data.entries[0].status = "FILLED"; expect(v(withStatus)).toBe(false);
    const noData = structuredClone(page); noData.observed_timeline.data = null; expect(v(noData)).toBe(false);
    const sloppy = structuredClone(page); sloppy.observed_timeline.data.entries[0].values.price = 67200.5; expect(v(sloppy)).toBe(false);
    const clock = structuredClone(page); clock.observed_timeline.data.entries[0].source_clock = "BROKER_ACK_AT"; expect(v(clock)).toBe(false);
  });
  it("market candles: READY needs bars and no reason; EMPTY/UNAVAILABLE carry a reason and no bars; prices are strings", () => {
    const v = validator("execution-market-candles.v1.schema.json");
    const ready = named("fixtures/execution-market-candles.v1.synthetic.valid.json", "venue_public_ready");
    const none = structuredClone(ready); none.candles = []; expect(v(none)).toBe(false);
    const reasoned = structuredClone(ready); reasoned.reason_code = "X"; expect(v(reasoned)).toBe(false);
    const fabricated = structuredClone(named("fixtures/execution-market-candles.v1.synthetic.valid.json", "venue_public_rate_limited")); fabricated.candles = ready.candles;
    expect(v(fabricated)).toBe(false);
    const number = structuredClone(ready); number.candles[0].o = 67200.5; expect(v(number)).toBe(false);
    const src = structuredClone(ready); src.source_authority = "PORTAL"; expect(v(src)).toBe(false);
  });
  it("OpenAPI names every route and points at the schemas", () => {
    const doc = load("openapi/execution-serving-reads.openapi.json");
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/api/v1/execution/market/venue-candles", "/api/v1/execution/resources/accounts/{accountId}/{relation}",
      "/api/v1/execution/resources/alphas/{alphaId}/{relation}", "/api/v1/execution/resources/alphas/{resource_id}", "/api/v1/execution/views/observed-timeline"]);
    const refs = JSON.stringify(doc).match(/\.\.\/schemas\/[a-z0-9.-]+\.json/g)!;
    for (const ref of new Set(refs)) expect(() => load(ref.slice(3))).not.toThrow();
  });
});
