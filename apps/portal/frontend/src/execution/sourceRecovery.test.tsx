/**
 * BE-R2-5 consumer (`FRONTEND_HANDOFF.md` §8.58): the source coordinator's own
 * health, which the browser had been dropping on the floor.
 *
 * BE-R2-8: consume the shared canonical corpus validated by the producer gate,
 * not a string search of the implementation or a hand-built positive envelope.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readProfileRealtime, readSourceRecovery, SOURCE_UNKNOWN } from "./profileRealtime";
import { liveDot, sourceRecoveryNote } from "./sourceTone";

const canonical = (event: string) => JSON.parse(readFileSync(join(__dirname,
  `../../../../../packages/contracts/fixtures/execution-profile-realtime.${event}.valid.json`), "utf8"));

const envelope = (over: Record<string, unknown> = {}) => ({
  ...canonical("snapshot"),
  availability: "DEGRADED",
  freshness: "STALE",
  recovery: { state: "RECOVERING", reason_code: "N31_SOURCE_REFRESH_FAILED", retry_not_before: "2026-09-11T18:00:00.000Z" },
  ...over,
});

describe("§8.58 · canonical producer contract → real consumer", () => {
  it.each(["snapshot", "delta", "heartbeat", "auth-expired", "projection-gap"])("reads %s without dropping wire state", (name) => {
    const wire = canonical(name);
    const parsed = readProfileRealtime(wire);
    expect(parsed).not.toBeNull();
    expect(parsed?.event_type).toBe(wire.event_type);
    expect(parsed?.terminal).toBe(wire.terminal);
    expect(parsed?.reconnect_required).toBe(wire.reconnect_required);
    expect(parsed?.projection_sequence).toBe(wire.projection_sequence);
    expect(parsed?.source).toEqual(readSourceRecovery(wire));
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
