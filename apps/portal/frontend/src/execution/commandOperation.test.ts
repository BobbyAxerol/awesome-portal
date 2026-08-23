/**
 * `execution.command-operation.v1` — the contract nobody had read.
 *
 * It was published, it sat in `packages/contracts/fixtures/`, and the two
 * readers that poll operations took two of its twelve fields. What that cost:
 *
 *  - the fixture's own `status: "BLOCKED"` was not in `OPERATION_STATUSES`, so
 *    `readEnum` scored the contract's canonical example as an unrecognised
 *    token and the container dropped it — an operator polling a blocked
 *    operation was shown no status at all;
 *  - `blockers: ["COMMAND_RELAY_DISABLED"]`, the reason, was read by nothing,
 *    so a screen could say an operation was stopped and never say what
 *    stopped it;
 *  - the receipt was read as `receipt` / `receipt_id`. The contract publishes
 *    `relay_receipt`. Against this fixture the old pair matched nothing and
 *    the receipt was permanently null;
 *  - `source_side_effect_requested` was dropped, so after an apply there was
 *    no published answer to "did that reach the Trading System?".
 *
 * Everything here loads the published file. A hand-built object would have
 * agreed with whatever the reader already believed, which is how all four of
 * these survived a green suite.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { OPERATION_STATUSES, readOperation } from "./adapter";
import { decisionReducer, initialDecision, type DecisionState } from "./decision";

const CONTRACT = join(
  __dirname,
  "../../../../../packages/contracts/fixtures/execution-command-operation.valid.json",
);

function contract(): Record<string, unknown> {
  return JSON.parse(readFileSync(CONTRACT, "utf8")) as Record<string, unknown>;
}

describe("the published operation contract", () => {
  it("is the shape these tests think it is", () => {
    // Guards every assertion below: if the file moves or its fields are
    // renamed, this fails first and says so, instead of the rest passing
    // vacuously against an empty object.
    const raw = contract();
    expect(raw.schema_version).toBe("execution.command-operation.v1");
    expect(raw.status).toBe("BLOCKED");
    expect(raw.blockers).toEqual(["COMMAND_RELAY_DISABLED"]);
    expect(raw).toHaveProperty("relay_receipt");
    expect(raw).toHaveProperty("source_side_effect_requested");
  });

  it("has a status this build recognises", () => {
    expect(OPERATION_STATUSES).toContain("BLOCKED");
    const read = readOperation(contract());
    expect(read.status).toBe("BLOCKED");
    // The point of the regression: an unrecognised token lands in `unsupported`
    // and the status becomes null. That is what used to happen to the
    // contract's own canonical example.
    expect(read.unsupported).toEqual([]);
  });

  it("keeps the reason the operation is stopped", () => {
    expect(readOperation(contract()).blockers).toEqual(["COMMAND_RELAY_DISABLED"]);
  });

  it("drops blocker entries that are not strings rather than rendering them", () => {
    const raw = { ...contract(), blockers: ["COMMAND_RELAY_DISABLED", 7, null, "ROLE_MISSING"] };
    expect(readOperation(raw).blockers).toEqual(["COMMAND_RELAY_DISABLED", "ROLE_MISSING"]);
  });

  it("says there are no blockers, not that blockers are unknown, on an empty list", () => {
    // An empty list is an answer. Conflating it with a missing field would let
    // "nothing is blocking this" and "nobody said" render identically.
    expect(readOperation({ ...contract(), blockers: [] }).blockers).toEqual([]);
    expect(readOperation({ ...contract(), blockers: undefined }).blockers).toEqual([]);
  });

  it("reads the receipt under the name the contract publishes", () => {
    // Null in the canonical fixture, so the field name is proved with a value.
    expect(readOperation(contract()).receipt).toBeNull();
    expect(readOperation({ ...contract(), relay_receipt: "rcpt_9f12" }).receipt).toBe("rcpt_9f12");
  });

  it("fails closed on whether the Trading System was asked", () => {
    expect(readOperation(contract()).sourceSideEffectRequested).toBe(false);
    // Absent is not "nothing happened". Saying nothing was asked when nobody
    // said so is the one direction that misleads.
    const { source_side_effect_requested: _omitted, ...withoutFlag } = contract();
    expect(readOperation(withoutFlag).sourceSideEffectRequested).toBe(true);
  });
});

describe("a blocked operation reaches the reducer on every path", () => {
  const polled = (state: DecisionState, verification: string | null) =>
    decisionReducer(state, {
      type: "POLLED",
      status: "BLOCKED",
      verification: verification
        ? ({ known: true, value: verification } as never)
        : null,
      blockers: ["COMMAND_RELAY_DISABLED"],
      sourceSideEffectRequested: false,
    });

  it("starts by assuming the source may have been asked", () => {
    expect(initialDecision("rk_1").sourceSideEffectRequested).toBe(true);
    expect(initialDecision("rk_1").blockers).toEqual([]);
  });

  it.each([
    ["still verifying", null],
    ["settled", "SUCCEEDED"],
    ["uncertain", "UNCERTAIN"],
  ])("carries the blockers while %s", (_label, verification) => {
    // Four branches leave the POLLED case. A field set on one of them is a
    // field invisible on the other three, which is the shape of half the
    // defects this session found.
    const next = polled(initialDecision("rk_1"), verification);
    expect(next.blockers).toEqual(["COMMAND_RELAY_DISABLED"]);
    expect(next.sourceSideEffectRequested).toBe(false);
  });

  it("carries them past a verification token this build cannot read", () => {
    const next = decisionReducer(initialDecision("rk_1"), {
      type: "POLLED",
      status: "BLOCKED",
      verification: { known: false, raw: "SOMETHING_NEW" } as never,
      blockers: ["COMMAND_RELAY_DISABLED"],
      sourceSideEffectRequested: false,
    });
    expect(next.blockers).toEqual(["COMMAND_RELAY_DISABLED"]);
    expect(next.note).toContain("SOMETHING_NEW");
  });

  it("keeps the last known blockers when a poll does not restate them", () => {
    const blocked = polled(initialDecision("rk_1"), null);
    const quiet = decisionReducer(blocked, { type: "POLLED", status: "BLOCKED", verification: null });
    expect(quiet.blockers).toEqual(["COMMAND_RELAY_DISABLED"]);
  });
});
