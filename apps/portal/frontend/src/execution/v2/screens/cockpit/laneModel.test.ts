import { describe, expect, it } from "vitest";

import type { ConditionRow } from "../../../api/ports";
import type { DecidedRow } from "../../../screens/ApprovalInbox";
import { loadCanonical } from "../../testkit/loadCanonical";
import { readLiveParentV2, readPaperExitParentV2, readR2ParentV2 } from "../../readers/governanceParents";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import type { InboxRowV2 } from "./inboxRowV2";
import {
  actorText,
  deriveAccess,
  formatMinutes,
  gateItems,
  instantText,
  isYours,
  kindOfGate,
  lensCounts,
  NO_PRINCIPAL,
  ownRequests,
  principalOf,
  quorumCells,
  quorumText,
  sameActor,
  separationOfDuty,
  separationOfDutyV2,
  serverViewFor,
  settledPanel,
  slaView,
  stepSelection,
  summarizeEvidence,
  waiverItems,
  type Principal,
} from "./laneModel";

const BOBBY: Principal = principalOf({ userId: "usr_bobby", username: "bobby" });
const STAN: Principal = principalOf({ userId: "usr_stan", username: "stan" });

function row(id: string, over: Partial<InboxRowV2> = {}): InboxRowV2 {
  return {
    id,
    gate: "R1",
    subject: `Subject ${id}`,
    subjectId: null,
    target: null,
    environment: null,
    releaseCandidate: null,
    requester: null,
    creator: { userId: "usr_stan", username: "stan" },
    status: "PENDING",
    policyVersion: null,
    blockerCount: 0,
    blockerSummary: null,
    sla: { state: "ON_TRACK", ageMinutes: 5, budgetMinutes: 240, dueAt: null, expiresAt: null },
    quorumMet: 0,
    quorumRequired: 2,
    inert: null,
    needsYou: false,
    updatedAt: null,
    ...over,
  };
}

function decided(id: string, gate: DecidedRow["gate"] = "R1"): DecidedRow {
  return { id: id as DecidedRow["id"], gate, subject: id, outcome: "APPROVED", decidedBy: "minh", decidedAt: "2026-10-17T09:12:00Z", policyVersion: "approval.v3" };
}

describe("gate to lane", () => {
  it("routes the five gates to four evidence kinds and four server views", () => {
    expect(kindOfGate("R1")).toBe("r1");
    expect(kindOfGate("R2")).toBe("r2");
    expect(kindOfGate("PAPER_EXIT")).toBe("exit");
    expect(kindOfGate("SANDBOX_EXIT")).toBe("exit");
    expect(kindOfGate("LIVE_GATE")).toBe("live");
    expect(["all", "r1", "r2", "exit", "live"].map((lane) => serverViewFor(lane as "all"))).toEqual(["ALL", "R1", "R2", "EXIT_REVIEWS", "LIVE_GATES"]);
  });
});

describe("lane and lens filtering", () => {
  const rows = [
    row("r1-needs", { gate: "R1", needsYou: true }),
    row("r2-plain", { gate: "R2" }),
    row("exit-self", { gate: "PAPER_EXIT", inert: "SELF", creator: null }),
    row("live-mine", { gate: "LIVE_GATE", creator: { userId: "usr_bobby", username: "bobby" } }),
    row("r1-closed", { gate: "R1", status: "APPROVED" }),
    row("sbx-needs", { gate: "SANDBOX_EXIT", needsYou: true }),
  ];
  const history = [decided("h-r1"), decided("h-live", "LIVE_GATE"), decided("r1-closed")];
  const keys = (lane: Parameters<typeof gateItems>[0]["lane"], lens: Parameters<typeof gateItems>[0]["lens"], principal = BOBBY) =>
    gateItems({ rows, decided: history, lane, lens, principal }).map((item) => item.key);

  it("Open is every request that is not closed, in server order", () => {
    expect(keys("all", "open")).toEqual(["r1-needs", "r2-plain", "exit-self", "live-mine", "sbx-needs"]);
  });

  it("a lane keeps only its gates; Exit holds paper and sandbox exits", () => {
    expect(keys("r1", "open")).toEqual(["r1-needs"]);
    expect(keys("exit", "open")).toEqual(["exit-self", "sbx-needs"]);
    expect(keys("live", "open")).toEqual(["live-mine"]);
  });

  it("Needs you uses only the published needs_you flag", () => {
    expect(keys("all", "needs")).toEqual(["r1-needs", "sbx-needs"]);
    expect(keys("exit", "needs")).toEqual(["sbx-needs"]);
  });

  it("an unknown needs_you is not a yes", () => {
    const unknown = [row("u", { needsYou: null })];
    expect(gateItems({ rows: unknown, decided: [], lane: "all", lens: "needs", principal: BOBBY })).toEqual([]);
  });

  it("Yours is creator equal to the signed-in person, or the server's SELF mark", () => {
    expect(keys("all", "yours", BOBBY)).toEqual(["exit-self", "live-mine"]);
    expect(keys("all", "yours", STAN)).toEqual(["r1-needs", "r2-plain", "exit-self", "sbx-needs"]);
  });

  it("Closed lists closed rows first, then decided history, once each, in the lane", () => {
    expect(keys("all", "closed")).toEqual(["r1-closed", "h-r1", "h-live"]);
    expect(keys("live", "closed")).toEqual(["h-live"]);
  });

  it("lens counts are over the loaded page and match the lens lists", () => {
    expect(lensCounts(rows, "all", BOBBY)).toEqual({ open: 5, needs: 2, yours: 2 });
    expect(lensCounts(rows, "r1", BOBBY)).toEqual({ open: 1, needs: 1, yours: 0 });
  });

  it("a waiver is never a gate item and a gate is never a waiver item", () => {
    const waivers: ConditionRow[] = [
      {
        conditionId: "wv-1", approvalId: "a", gate: "R1", subjectId: "s", subjectLabel: "S", environment: "PAPER", kind: "WAIVER", state: "EXPIRING",
        label: "Cap", statement: "x", owner: "stan", dueAt: null, blocking: false, policyVersion: "p", createdAt: null, updatedAt: null,
      },
    ];
    const gates = gateItems({ rows, decided: history, lane: "all", lens: "open", principal: BOBBY });
    expect(gates.every((item) => item.kind === "gate")).toBe(true);
    expect(waiverItems(waivers).map((item) => [item.kind, item.key])).toEqual([["waiver", "wv-1"]]);
  });

  it("ownership: creator or requester match, SELF counts, no creator and no mark is not yours", () => {
    expect(isYours(row("a"), STAN)).toBe(true);
    expect(isYours(row("a"), BOBBY)).toBe(false);
    expect(isYours(row("a", { creator: null, requester: { userId: "usr_bobby", username: null } }), BOBBY)).toBe(true);
    expect(isYours(row("a", { creator: null, inert: "SELF" }), BOBBY)).toBe(true);
    expect(isYours(row("a", { creator: null }), BOBBY)).toBe(false);
  });

  it("own requests counts the rows whose owner is not published instead of guessing", () => {
    const mixed = [row("mine"), row("theirs", { creator: { userId: "usr_other", username: "o" } }), row("blank", { creator: null })];
    const result = ownRequests(mixed, STAN);
    expect(result.own.map((r) => r.id)).toEqual(["mine"]);
    expect(result.unknownOwner).toBe(1);
  });
});

describe("who is who", () => {
  it("ids decide when both sides have one; a name is the fallback", () => {
    expect(sameActor({ userId: "usr_bobby", username: null }, BOBBY)).toBe(true);
    expect(sameActor({ userId: "usr_stan", username: null }, BOBBY)).toBe(false);
    expect(sameActor({ userId: null, username: "bobby" }, BOBBY)).toBe(true);
    expect(sameActor({ userId: null, username: "stan" }, BOBBY)).toBe(false);
  });

  it("nothing to compare is unknown, not false", () => {
    expect(sameActor(null, BOBBY)).toBeNull();
    expect(sameActor({ userId: "usr_stan", username: null }, NO_PRINCIPAL)).toBeNull();
    expect(sameActor({ userId: null, username: null }, BOBBY)).toBeNull();
  });

  it("every id the session knows counts as the signed-in person", () => {
    const both = principalOf({ userId: "usr_bobby", principalId: "pr_1", username: "bobby" });
    expect(sameActor({ userId: "pr_1", username: null }, both)).toBe(true);
  });
});

describe("separation of duty", () => {
  it("creator equal to the signed-in person blocks and says why", () => {
    const sod = separationOfDuty({ creator: { userId: "usr_bobby", username: "bobby" }, serverSod: "OK", principal: BOBBY });
    expect(sod.kind).toBe("violation");
    expect(sod.text).toMatch(/you created this request/);
  });

  it("a different creator is OK and names both people", () => {
    const sod = separationOfDuty({ creator: { userId: "usr_stan", username: "stan" }, serverSod: null, principal: BOBBY });
    expect(sod).toEqual({ kind: "ok", text: "Separation of duty OK · created by stan, you are bobby" });
  });

  it("the server's VIOLATION blocks even when the creator is another name", () => {
    expect(separationOfDuty({ creator: { userId: "usr_stan", username: "stan" }, serverSod: "VIOLATION", principal: BOBBY }).kind).toBe("violation");
  });

  it("an unreadable creator is never reported as OK on its own", () => {
    const sod = separationOfDuty({ creator: null, serverSod: null, principal: BOBBY });
    expect(sod.kind).toBe("unknown");
    expect(sod.text).toContain("Not published (FE-030)");
    expect(separationOfDuty({ creator: null, serverSod: "OK", principal: BOBBY }).kind).toBe("ok");
  });
});

describe("SLA and quorum are printed as published", () => {
  it("minutes decompose and never round", () => {
    expect([0, 5, 60, 125, 240, 1320, 1441].map(formatMinutes)).toEqual(["0m", "5m", "1h", "2h 5m", "4h", "22h", "1d 1m"]);
    expect(formatMinutes(-4)).toBe("0m");
  });

  it("time left, with the raw numbers beside it", () => {
    const view = slaView({ state: "ON_TRACK", ageMinutes: 5, budgetMinutes: 240, dueAt: null, expiresAt: null });
    expect(view?.phrase).toBe("3h 55m left");
    expect(view?.detail).toBe("5 of 240 min used");
    expect(view?.fill).toBeCloseTo(2.0833333333, 9);
    expect(view?.overdue).toBe(false);
  });

  it("the overdue verdict is the server's; the amount is the arithmetic", () => {
    const view = slaView({ state: "OVERDUE", ageMinutes: 360, budgetMinutes: 240, dueAt: null, expiresAt: null });
    expect(view).toMatchObject({ phrase: "overdue 2h", overdue: true, fill: 100 });
    const quiet = slaView({ state: "ON_TRACK", ageMinutes: 250, budgetMinutes: 240, dueAt: null, expiresAt: null });
    expect(quiet?.overdue).toBe(false);
    expect(quiet?.phrase).toBe("past budget 10m");
  });

  it("no SLA or no budget is no view", () => {
    expect(slaView(null)).toBeNull();
    expect(slaView({ state: null, ageMinutes: 1, budgetMinutes: 0, dueAt: null, expiresAt: null })).toBeNull();
  });

  it("quorum text needs both numbers and keeps a published zero", () => {
    expect(quorumText(0, 2)).toBe("0 of 2 approvers");
    expect(quorumText(null, 2)).toBeNull();
    expect(quorumText(1, null)).toBeNull();
  });

  it("meter cells are the true quorum up to a cap, and none beyond it", () => {
    expect(quorumCells(1, 3)).toEqual([true, false, false]);
    expect(quorumCells(0, 2)).toEqual([false, false]);
    expect(quorumCells(0, 13)).toEqual([]);
    expect(quorumCells(null, 2)).toEqual([]);
  });
});

describe("access from capabilities, never from a role name", () => {
  it("manager and reviewer see decisions; researcher sees own requests; operator is denied", () => {
    expect(deriveAccess(V2_ROLE_PRESETS.manager).mode).toBe("decisions");
    expect(deriveAccess(V2_ROLE_PRESETS.reviewer).mode).toBe("decisions");
    expect(deriveAccess(V2_ROLE_PRESETS.researcher).mode).toBe("own");
    expect(deriveAccess(V2_ROLE_PRESETS.operator).mode).toBe("denied");
    expect(deriveAccess(new Set()).mode).toBe("denied");
  });

  it("a decide grant without a read opens nothing", () => {
    expect(deriveAccess(new Set(["governance.r1.decide"])).mode).toBe("denied");
  });
});

describe("keys", () => {
  const keys = ["a", "b", "c"];
  it("J and K step within the list and stop at the ends", () => {
    expect(stepSelection(keys, "a", "next")).toBe("b");
    expect(stepSelection(keys, "c", "next")).toBe("c");
    expect(stepSelection(keys, "b", "previous")).toBe("a");
    expect(stepSelection(keys, "a", "previous")).toBe("a");
  });
  it("nothing selected starts at the first row for J and the last for K; an empty list selects nothing", () => {
    expect(stepSelection(keys, null, "next")).toBe("a");
    expect(stepSelection(keys, null, "previous")).toBe("c");
    expect(stepSelection(keys, "gone", "next")).toBe("a");
    expect(stepSelection([], "a", "next")).toBeNull();
  });
});

describe("small helpers", () => {
  it("instants are UTC and a non-instant is returned as sent", () => {
    expect(instantText("2026-10-17T09:14:00Z")).toBe("17 Oct 09:14Z");
    expect(instantText("not a time")).toBe("not a time");
    expect(instantText(null)).toBeNull();
    expect(instantText("")).toBeNull();
  });
  it("a loading answer on a failed read is shown as unavailable", () => {
    expect(settledPanel("loading")).toBe("unavailable");
    expect(settledPanel("denied")).toBe("denied");
  });
  it("no evidence summarises to nothing published", () => {
    expect(summarizeEvidence(null)).toMatchObject({ creator: null, serverSod: null, quorumMet: null, quorumRequired: null, policyVersion: null, workspaceId: null, decided: null });
  });
});

describe("V2 parent actors (Codex e19ad906)", () => {
  const fixture = loadCanonical<Record<string, any>>("execution-positive-parent.synthetic");
  const r2 = (key: string) => readR2ParentV2(fixture[key])!;
  const exit = (key: string) => readPaperExitParentV2(fixture[key])!;

  it("a stored actor is its id, and (you) only where the server said the viewer is that actor", () => {
    expect(actorText("user_a", false)).toBe("user_a");
    expect(actorText("user_a", null)).toBe("user_a");
    expect(actorText("user_a", true)).toBe("user_a (you)");
  });

  it("separationOfDutyV2 states the facts and never says OK or that the viewer cannot decide", () => {
    const sod = separationOfDutyV2(r2("r2_followthrough").actors);
    expect(sod.kind).toBe("unknown");
    expect(sod.text).toContain("Requested by user_TEST_ONLY_requester,");
    expect(sod.text).toContain("created by user_TEST_ONLY_creator (you)");
    expect(sod.text).not.toMatch(/\bOK\b|cannot decide|may not/);
  });

  it("without the actors section the creator is Not published (FE-030), as before", () => {
    expect(separationOfDutyV2(r2("r2").actors).text).toBe("Separation of duty: creator Not published (FE-030).");
    expect(separationOfDutyV2(null).kind).toBe("unknown");
  });

  it("summarizeEvidence carries the parent's actors and latest plan, and names the decider only when the actors do", () => {
    const decided = summarizeEvidence({ kind: "r2v2", parent: r2("r2_recorded") });
    expect(decided.actors).toMatchObject({ availability: "AVAILABLE", decidedByUserId: "user_TEST_ONLY_reviewer" });
    expect(decided.latestOperation).toMatchObject({ availability: "AVAILABLE", operationId: "op_TEST_ONLY_R2_APPLIED" });
    expect(decided.decided).toMatchObject({ outcome: "DENIED", by: "user_TEST_ONLY_reviewer" });
    // The same status with the actors withheld: the decider is the not-published word, never a guess.
    const withheld = structuredClone(fixture.r2_recorded);
    withheld.actors = { availability: "NOT_PUBLISHED", reason_code: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" };
    expect(summarizeEvidence({ kind: "r2v2", parent: readR2ParentV2(withheld)! }).decided).toMatchObject({ outcome: "DENIED", by: "Not published (FE-030)" });
    const mine = summarizeEvidence({ kind: "exitv2", parent: exit("paper_exit_followthrough") });
    expect(mine.decided?.by).toBe("user_TEST_ONLY_reviewer (you)");
    expect(summarizeEvidence({ kind: "livev2", parent: readLiveParentV2(fixture.live)! }).actors).toBeNull();
  });
});
