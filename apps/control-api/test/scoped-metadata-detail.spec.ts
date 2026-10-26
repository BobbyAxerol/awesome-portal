/** Synthetic retained rows + real read scopes; not a source qualification receipt. */
import { describe, expect, it } from "vitest";
import { productReadFixture, FIELDS, OWN } from "./elp2-product-read.fixture";
import { addRecordDetail } from "../src/execution-v2/record-detail";
import { RECORD_DETAIL_READ_FIELDS } from "../src/execution-v2/read-fields";

async function scope(options: { full?: boolean; fields?: string[] } = { full: true }) {
  const fixture = productReadFixture(options);
  return fixture.scopes.authorize(fixture.principal, {
    environment: "paper", profileId: fixture.config.EXECUTION_EDGE_PAPER_PROFILE_ID!,
  }, {
    action: "alpha.read", resource: { kind: "ALPHA", id: OWN.alpha_id },
    dataset: { dataset_id: "TEST_ONLY-metadata-detail", source_revision: fixture.snapshot.payloadDigest,
      projection_generation: fixture.snapshot.projectionEpoch,
      catalogue_revision: fixture.snapshot.sourceCatalogueSha256, window: null },
  });
}

const SOURCE: Record<typeof RECORD_DETAIL_READ_FIELDS[number], string | number | boolean | null> = {
  submitted_at_ms: 0, resolved_at_ms: null, client_order_id: "TEST_ONLY-client", order_type: "LIMIT",
  commission: "0", commission_currency: "USDT", liquidity_side: "MAKER", finding_id: "TEST_ONLY-finding",
  finding_type: "SOURCE_OWNED_TYPE", leg_role: "ENTRY", leg_sequence: 0, runtime_state: "RUNNING",
  runtime_state_since: "2026-10-01T00:00:00.000Z", runtime_state_changed_at: null,
  execution_session_id: "TEST_ONLY-session", started_at: "2026-10-01T00:00:00.000Z", completed_at: null,
  account_type: "FUTURES", position_side: "LONG", time_in_force: "GTC", reduce_only: false, post_only: true,
  filled_quantity: "0", average_fill_price: "9007199254740993.0000000001", trigger_price: null,
};

describe("scoped metadata copier uses the canonical admitted detail vocabulary", () => {
  it("copies every source-stated detail member, preserving exact decimal, zero, false and null", async () => {
    const target: Record<string, unknown> = {};
    addRecordDetail(await scope(), SOURCE, target);
    expect(target).toEqual(SOURCE);
    expect(Object.keys(target).sort()).toEqual([...RECORD_DETAIL_READ_FIELDS].sort());
  });

  it("publishes only reviewed detail fields for a researcher, never business, custody or credential values", async () => {
    const allowed = ["execution_session_id", "average_fill_price", "reduce_only", "completed_at"];
    const selected = await scope({ fields: [...FIELDS, ...allowed, "private_key", "credential_state", "external_account_ref"] });
    const target: Record<string, unknown> = {};
    addRecordDetail(selected, { ...SOURCE, private_key: "NEVER_RETURN", credential_state: "NEVER_RETURN",
      external_account_ref: "NEVER_RETURN", equity: "123", host: "NEVER_RETURN" }, target);
    expect(target).toEqual(Object.fromEntries(allowed.map(field => [field, SOURCE[field as keyof typeof SOURCE]])));
  });

  it("keeps every detail absent when the reviewed policy admits no detail", async () => {
    const target: Record<string, unknown> = {};
    addRecordDetail(await scope({}), SOURCE, target);
    expect(target).toEqual({});
  });

  it("does not invent a missing source member or copy one inherited from the prototype", async () => {
    const source = Object.create({ filled_quantity: "999", post_only: true });
    source.execution_session_id = "TEST_ONLY-owned-session";
    const target: Record<string, unknown> = {};
    addRecordDetail(await scope(), source, target);
    expect(target).toEqual({ execution_session_id: "TEST_ONLY-owned-session" });
  });

  it("uses explicit column aliases and shared UTC timestamp validation", async () => {
    const target: Record<string, unknown> = {};
    addRecordDetail(await scope(), { submitted_at: "2026-10-01T07:00:00+07:00",
      session_started_at: "2026-10-01T00:00:00.123456789Z", raw_reduce_only: false }, target,
    { submitted_at_ms: "submitted_at", started_at: "session_started_at", reduce_only: "raw_reduce_only" });
    expect(target).toEqual({ submitted_at_ms: 1790812800000, started_at: "2026-10-01T00:00:00.123Z", reduce_only: false });
  });

  it("omits malformed raw values instead of coercing them or failing a whole response", async () => {
    const target: Record<string, unknown> = { untouched: "TEST_ONLY" };
    addRecordDetail(await scope(), { runtime_state: "ACTIVE", runtime_state_since: "2026-02-30T00:00:00Z",
      runtime_state_changed_at: "2026-10-01T24:00:00Z", execution_session_id: {}, started_at: "2026-10-01",
      completed_at: Number.MAX_SAFE_INTEGER, account_type: "x\ny", position_side: 2,
      time_in_force: "x".repeat(257), reduce_only: "false", post_only: 0, filled_quantity: 1,
      average_fill_price: "1e3", trigger_price: "1\n", commission: "01", leg_sequence: -1,
      private_key: "NEVER_RETURN" }, target);
    expect(target).toEqual({ untouched: "TEST_ONLY" });
  });
});
