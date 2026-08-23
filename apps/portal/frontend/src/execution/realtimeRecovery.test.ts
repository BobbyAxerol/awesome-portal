/**
 * C-PI04-02 — loss-detectable realtime recovery.
 *
 * The reducer is exercised here and deliberately never attached to a real
 * EventSource: `stream_available` is false and creating one is outside the
 * boundary PRE-IAM-04 set. These gates prepare the behaviour so that activation
 * is a wiring change rather than a design change.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  gapIsClientSide,
  INITIAL_SUBSCRIPTION,
  readGapReason,
  resnapshotDecision,
  resnapshotTarget,
  subscriptionReducer,
  type SubscriptionState,
} from "./subscription";

const CONTRACT = join(
  __dirname,
  "../../../../../packages/contracts/generated/execution-realtime.d.ts",
);

/**
 * Every reason string the generated declaration publishes.
 *
 * Read as a UNION, not as an alternation of names known in advance. A first
 * draft of this listed the seven reasons in the regex, which meant an eighth
 * added upstream would simply not be found and the count assertion would keep
 * passing — a gate that verifies only what it was already told.
 */
function contractReasons(): string[] {
  const source = readFileSync(CONTRACT, "utf8");
  const line = source.split("\n").find((l) => /^\s*reason:\s*"/.test(l));
  if (!line) throw new Error("no `reason:` union found in the generated declaration");
  return [...line.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

function live(): SubscriptionState {
  return subscriptionReducer(
    subscriptionReducer(INITIAL_SUBSCRIPTION, { type: "SUBSCRIBE" }),
    { type: "SNAPSHOT", epoch: "e1", sequence: 100, asOf: "2026-08-22T10:00:00Z" },
  );
}

describe("every reason the contract publishes is a reason the client knows", () => {
  it("recognises all of them, and none of them becomes unknown", () => {
    const reasons = contractReasons();
    // Guards the extraction: an empty list would make the loop vacuous.
    expect(reasons.length).toBe(7);
    for (const reason of reasons) {
      expect(readGapReason(reason), reason).toBe(reason);
    }
  });

  it("still fails closed on a reason it does not know", () => {
    expect(readGapReason("something_new")).toBe("unknown");
    expect(readGapReason(undefined)).toBe("unknown");
  });
});

describe("each reason gets its own recovery", () => {
  it("projection_sequence_gap loses continuity and keeps the data as stale", () => {
    const s = subscriptionReducer(live(), {
      type: "PROJECTION_GAP",
      reason: "projection_sequence_gap",
      missedEvents: 12,
      resnapshotNotBefore: "2026-08-22T10:00:30Z",
    });
    expect(s.continuityLost).toBe(true);
    expect(s.freshness).toBe("STALE");
    expect(s.resumeToken).toBeNull();
    // The data that was on screen is still identified — it is stale, not gone.
    expect(s.lastGoodAsOf).toBe("2026-08-22T10:00:00Z");
    expect(s.note).toMatch(/Continuity is lost/);
  });

  it("cursor_ahead discards the cursor and shows the sequence the server can serve", () => {
    const s = subscriptionReducer(live(), {
      type: "PROJECTION_GAP",
      reason: "cursor_ahead",
      latestAvailableSequence: 87,
      earliestAvailableSequence: 40,
      activeEpochId: "e1",
      resnapshotNotBefore: null,
    });
    expect(s.resumeToken).toBeNull();
    expect(s.latestAvailableSequence).toBe(87);
    expect(s.earliestAvailableSequence).toBe(40);
    expect(s.note).toMatch(/up to sequence 87/);
    // Not reported as an epoch change: the epoch may be unchanged (H-5).
    expect(s.gapReason).toBe("cursor_ahead");
    expect(s.phase).not.toBe("epoch_changed");
  });

  it("never resumes at latest_available_sequence, which would skip the difference", () => {
    const s = subscriptionReducer(live(), {
      type: "PROJECTION_GAP",
      reason: "cursor_ahead",
      latestAvailableSequence: 87,
    });
    expect(resnapshotTarget(s).resumeToken).toBeNull();
  });

  it("epoch_changed names the epoch to snapshot into, apart from the one on screen", () => {
    const s = subscriptionReducer(live(), {
      type: "EPOCH_CHANGED",
      epoch: "e2",
      resnapshotNotBefore: "2026-08-22T10:00:30Z",
    });
    expect(s.continuityLost).toBe(true);
    expect(s.activeEpochId).toBe("e2");
    // `epoch` still describes the data being rendered.
    expect(s.epoch).toBe("e1");
    expect(resnapshotTarget(s).epoch).toBe("e2");
  });

  it("does not relabel source_discontinuity as an ordinary projection gap", () => {
    const s = subscriptionReducer(live(), {
      type: "PROJECTION_GAP",
      reason: "source_discontinuity",
    });
    expect(s.gapReason).toBe("source_discontinuity");
    expect(s.note).toMatch(/Trading System/);
    expect(s.note).not.toMatch(/projection skipped/);
  });

  it("gives the seven reasons seven distinct notes", () => {
    const notes = contractReasons().map(
      (reason) =>
        subscriptionReducer(live(), { type: "PROJECTION_GAP", reason: readGapReason(reason) }).note,
    );
    expect(new Set(notes).size).toBe(7);
  });
});

describe("resnapshot_not_before is a deadline, not decoration", () => {
  const gapped = (notBefore: string | null) =>
    subscriptionReducer(live(), {
      type: "PROJECTION_GAP",
      reason: "projection_sequence_gap",
      resnapshotNotBefore: notBefore,
    });

  it("refuses before the deadline and reports how long to wait", () => {
    const d = resnapshotDecision(gapped("2026-08-22T10:00:30Z"), new Date("2026-08-22T10:00:00Z"));
    expect(d.allowed).toBe(false);
    expect(d.waitMs).toBe(30_000);
  });

  it("allows once the deadline has passed", () => {
    const d = resnapshotDecision(gapped("2026-08-22T10:00:30Z"), new Date("2026-08-22T10:00:31Z"));
    expect(d.allowed).toBe(true);
    expect(d.waitMs).toBe(0);
  });

  it("treats a null deadline as permission, not as a default wait", () => {
    const d = resnapshotDecision(gapped(null), new Date("2026-08-22T10:00:00Z"));
    expect(d.allowed).toBe(true);
    expect(d.waitMs).toBe(0);
  });

  it("fails closed on a deadline it cannot parse", () => {
    const d = resnapshotDecision(gapped("soon"), new Date("2026-08-22T10:00:00Z"));
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/could not be read/);
  });

  it("asks for nothing while continuity is intact", () => {
    expect(resnapshotDecision(live(), new Date()).allowed).toBe(false);
  });
});

describe("clients do not return in a herd", () => {
  it("spreads the release by the caller's jitter", () => {
    const s = subscriptionReducer(live(), {
      type: "PROJECTION_GAP",
      reason: "projection_sequence_gap",
      resnapshotNotBefore: "2026-08-22T10:00:30Z",
    });
    const at = new Date("2026-08-22T10:00:30Z");
    // Same deadline, same instant, different clients: different waits.
    expect(resnapshotDecision(s, at, 0).allowed).toBe(true);
    expect(resnapshotDecision(s, at, 2_000).waitMs).toBe(2_000);
    expect(resnapshotDecision(s, at, 5_000).waitMs).toBe(5_000);
  });
});

describe("only a completed snapshot repairs continuity", () => {
  it("clears the loss, the facts and the target together", () => {
    const gapped = subscriptionReducer(live(), {
      type: "PROJECTION_GAP",
      reason: "cursor_ahead",
      latestAvailableSequence: 87,
      activeEpochId: "e2",
    });
    const repaired = subscriptionReducer(gapped, {
      type: "SNAPSHOT",
      epoch: "e2",
      sequence: 90,
      asOf: "2026-08-22T10:01:00Z",
    });
    expect(repaired.continuityLost).toBe(false);
    expect(repaired.latestAvailableSequence).toBeNull();
    expect(repaired.activeEpochId).toBeNull();
    expect(repaired.gapReason).toBeNull();
    expect(repaired.freshness).toBe("OK");
  });

  it("a disconnect does not repair it", () => {
    const gapped = subscriptionReducer(live(), {
      type: "PROJECTION_GAP",
      reason: "projection_sequence_gap",
    });
    const dropped = subscriptionReducer(gapped, { type: "DISCONNECTED" });
    // The transport state may move; the hole in the data does not close.
    expect(dropped.continuityLost).toBe(true);
    expect(dropped.resumeToken).toBeNull();
  });
});

describe("only slow_consumer is something the operator can act on", () => {
  it("keeps the two new reasons out of the actionable set", () => {
    // A new reason defaulting to false is the safe direction, but silent — so
    // it is asserted rather than assumed. cursor_ahead in particular reads as
    // the client's fault and is not: the projection was rebuilt beneath it.
    expect(gapIsClientSide("slow_consumer")).toBe(true);
    for (const reason of contractReasons().filter((r) => r !== "slow_consumer")) {
      expect(gapIsClientSide(readGapReason(reason)), reason).toBe(false);
    }
  });
});
