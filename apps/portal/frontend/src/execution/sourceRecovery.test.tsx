/**
 * BE-R2-5 consumer (`FRONTEND_HANDOFF.md` §8.58): the source coordinator's own
 * health, which the browser had been dropping on the floor.
 *
 * No canonical fixture publishes this envelope yet, so instead of retyping the
 * shape and hoping, these tests bind to the file that emits it. That is the
 * `readPassportEntry` lesson: a fail-closed reader whose field names never
 * matched the producer returns "nothing here" forever and every suite stays
 * green. If codex renames one of these, this goes red rather than the screen
 * quietly reporting UNKNOWN for the rest of its life.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readProfileRealtime, readSourceRecovery, SOURCE_UNKNOWN } from "./profileRealtime";
import { liveDot, sourceRecoveryNote } from "./sourceTone";

const SERVICE = readFileSync(
  join(__dirname, "../../../../../apps/control-api/src/execution/profile-realtime.service.ts"),
  "utf8",
);

const envelope = (over: Record<string, unknown> = {}) => ({
  schema_version: "portal.execution.profile-realtime.v1",
  event_type: "snapshot",
  terminal: false,
  reconnect_required: false,
  cursor: "cur_1",
  projection_epoch: "ep_1",
  projection_sequence: 4,
  availability: "DEGRADED",
  freshness: "STALE",
  recovery: { state: "RECOVERING", reason_code: "N31_SOURCE_REFRESH_FAILED", retry_not_before: "2026-09-11T18:00:00.000Z" },
  payload: {},
  ...over,
});

describe("§8.58 · the names this reader depends on are the names the server emits", () => {
  it("finds every field on the producer, so a rename cannot pass silently", () => {
    // A scan that finds nothing is not a pass.
    expect(SERVICE.length).toBeGreaterThan(1_000);
    for (const name of [
      "availability", "freshness", "recovery", "reason_code", "retry_not_before",
      "snapshot_mode", "STATUS_ONLY", "RECOVERING", "HEALTHY", "DEGRADED",
    ]) {
      expect(SERVICE, name).toContain(name);
    }
  });

  it("agrees with the server that a recovering coordinator is never labelled fresh", () => {
    expect(SERVICE).toMatch(/if \(health\.state === "RECOVERING"\) return "STALE"/);
  });
});

describe("§8.58 · reading the coordinator status", () => {
  it("reads the published shape", () => {
    expect(readSourceRecovery(envelope())).toEqual({
      availability: "DEGRADED",
      freshness: "STALE",
      state: "RECOVERING",
      reasonCode: "N31_SOURCE_REFRESH_FAILED",
      retryNotBefore: "2026-09-11T18:00:00.000Z",
    });
  });

  it("keeps it on the parsed envelope instead of dropping it", () => {
    expect(readProfileRealtime(envelope())?.source.state).toBe("RECOVERING");
  });

  it("says UNKNOWN when the server said nothing, never HEALTHY", () => {
    const quiet = readSourceRecovery({});
    expect(quiet).toEqual(SOURCE_UNKNOWN);
    expect(quiet.state).toBeNull();
  });

  it("refuses a value it does not recognise rather than passing it through", () => {
    const odd = readSourceRecovery(envelope({ availability: "PROBABLY_FINE", recovery: { state: "MAYBE" } }));
    expect(odd.availability).toBe("UNKNOWN");
    expect(odd.state).toBeNull();
  });

  it("drops a reason that arrives without a state, so a bare code cannot imply one", () => {
    const orphan = readSourceRecovery({ recovery: { reason_code: "X" } });
    expect(orphan.state).toBeNull();
    expect(orphan.reasonCode).toBeNull();
  });
});

describe("§8.58 · what the reader is shown", () => {
  it("stops the dot pulsing while the source backs off, even on a live stream", () => {
    const healthy = liveDot("live", { ...SOURCE_UNKNOWN, state: "HEALTHY" });
    expect(healthy.live).toBe(true);
    const recovering = liveDot("live", readSourceRecovery(envelope()));
    expect(recovering.live).toBe(false);
    expect(recovering.tone).toBe("warn");
    expect(recovering.title).toContain("last good read");
  });

  it("says nothing when there is nothing to say", () => {
    expect(sourceRecoveryNote(null)).toBeNull();
    expect(sourceRecoveryNote({ ...SOURCE_UNKNOWN, state: "HEALTHY" })).toBeNull();
  });

  it("names the reason and the retry time it was given", () => {
    const note = sourceRecoveryNote(readSourceRecovery(envelope()))!;
    expect(note.line).toContain("N31_SOURCE_REFRESH_FAILED");
    expect(note.title).toContain("2026-09-11T18:00:00.000Z");
    // Not an error: the handoff keeps the composition mounted.
    expect(note.tone).toBe("warn");
  });

  it("still says something useful when the coordinator gave no reason code", () => {
    const note = sourceRecoveryNote(readSourceRecovery(envelope({ recovery: { state: "RECOVERING" } })))!;
    expect(note.line).toBe("Source recovering");
    expect(note.title.length).toBeGreaterThan(20);
  });
});
