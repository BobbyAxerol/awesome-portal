import { describe, expect, it } from "vitest";
import { foldOrdering } from "../src/research/fold-ordering";
import { p11StageEvents, P11StageEventsSchema, P11_STAGE_BINDING_ABSENT, P11_STAGE_EVENT_SEMANTICS } from "../src/research/p11-stage-events";

describe("source-bound P11 stage-event observations", () => {
  it("publishes only orchestration names, never engine freeze/search/read clocks", () => {
    const events = p11StageEvents("a".repeat(64), { s3_completed_utc_ms: 10, s4_started_utc_ms: 11, s4_completed_utc_ms: 50 });
    expect(events.semantics).toBe(P11_STAGE_EVENT_SEMANTICS);
    expect(events.reason_codes).toEqual({ s3_completed: null, s4_started: null, s4_completed: null });
    const ordering = foldOrdering([], undefined, {}, undefined, events);
    expect(ordering.stage_events).toEqual(events);
    expect(ordering.wall_clock).toEqual({ state: "NOT_PUBLISHED", reason_code: "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_FREEZE_OR_OOS_READ_CLOCKS" });
    for (const name of ["pool_frozen_utc_ms", "search_completed_utc_ms", "first_oos_read_utc_ms", "worker_attempt_id"]) {
      expect(events).not.toHaveProperty(name);
    }
  });
  it("requires a binding and separates missing event reasons without inventing time", () => {
    expect(p11StageEvents(null, { s4_completed_utc_ms: 42 })).toMatchObject({ s4_completed_utc_ms: null,
      reason_codes: { s3_completed: P11_STAGE_BINDING_ABSENT, s4_started: P11_STAGE_BINDING_ABSENT, s4_completed: P11_STAGE_BINDING_ABSENT } });
    const partial = p11StageEvents("b".repeat(64), { s4_started_utc_ms: 20 });
    expect(partial).toMatchObject({ s4_started_utc_ms: 20, s4_completed_utc_ms: null,
      reason_codes: { s3_completed: "P11_S3_COMPLETED_EVENT_NOT_RETAINED", s4_started: null, s4_completed: "P11_S4_COMPLETED_EVENT_NOT_RETAINED" } });
    expect(P11StageEventsSchema.safeParse({ ...partial, source_binding_digest: null }).success).toBe(false);
    expect(P11StageEventsSchema.safeParse({ ...partial, s4_completed_utc_ms: 30 }).success).toBe(false);
    expect(P11StageEventsSchema.safeParse({ ...partial, s4_started_utc_ms: -1 }).success).toBe(false);
  });
});
