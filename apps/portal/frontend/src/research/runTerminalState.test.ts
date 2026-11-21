import { describe, expect, it } from "vitest";

import { phaseOfStatus, runStatusWord, runTerminalState, isEndedWithoutEvidence, stageChip, type RunPhase } from "./runTerminalState";

const CASES: [string, RunPhase, string, string | null, readonly string[]][] = [
  ["DRAFT", "queued", "queued", "Queued.", ["progress", "library"]],
  ["QUEUED", "queued", "queued", "Queued.", ["progress", "library"]],
  ["CLAIMED", "queued", "queued", "Queued.", ["progress", "library"]],
  ["RUNNING", "running", "running", "Running.", ["progress", "library"]],
  ["SEALING", "running", "running", "Running.", ["progress", "library"]],
  ["FINISHING", "running", "running", "Running.", ["progress", "library"]],
  ["CANCEL_REQUESTED", "running", "running", "Running.", ["progress", "library"]],
  ["READY", "completed", "completed", null, []],
  ["COMPLETED", "completed", "completed", null, []],
  ["FAILED", "failed", "failed", "Failed.", ["progress", "new-run", "library"]],
  ["CANCELLED", "cancelled", "cancelled", "Cancelled.", ["progress", "new-run", "library"]],
  ["RECOVERY_REQUIRED", "attention", "needs recovery", "Needs recovery.", ["progress", "library"]],
];

describe("runTerminalState (W1 §1.1)", () => {
  it.each(CASES)("%s -> %s", (status, phase, word, banner, exits) => {
    const s = runTerminalState({ status, read: "ok" });
    expect(s.phase).toBe(phase);
    expect(s.word).toBe(word);
    expect(s.banner).toBe(banner);
    expect(s.exits).toEqual(exits);
    expect(runStatusWord(status)).toBe(word);
  });

  it("names the failed stage only when the caller served it", () => {
    expect(runTerminalState({ status: "FAILED", read: "ok", failedStage: "S4" }).banner).toBe("Failed at S4.");
    expect(runTerminalState({ status: "FAILED", read: "ok", failedStage: null }).banner).toBe("Failed.");
  });

  it("a refused read is one state whatever the status", () => {
    const s = runTerminalState({ status: "COMPLETED", read: "not-found" });
    expect(s).toMatchObject({ phase: "unavailable", word: "not available", banner: "Run not available.", exits: ["library"] });
    expect(s.tip).toMatch(/access/);
  });

  it("an unreadable read, a null status and an unknown word conclude nothing", () => {
    for (const input of [
      { status: "FAILED", read: "unread" as const },
      { status: null, read: "ok" as const },
      { status: "WOBBLING", read: "ok" as const },
    ]) {
      expect(runTerminalState(input)).toMatchObject({ phase: "unread", banner: "Could not read this run.", tone: "warn" });
    }
  });

  it("`has` never claims a report unless the screen says a seal exists", () => {
    expect(runTerminalState({ status: "COMPLETED", read: "ok" }).has).toEqual({ evidence: true, report: false, releaseCandidate: true });
    expect(runTerminalState({ status: "COMPLETED", read: "ok", sealed: true }).has.report).toBe(true);
    expect(runTerminalState({ status: "FAILED", read: "ok", sealed: true }).has).toEqual({ evidence: false, report: false, releaseCandidate: false });
  });

  it("runStatusWord never returns an UPPER_SNAKE token", () => {
    for (const status of [...CASES.map((c) => c[0]), "WOBBLING", "", null]) {
      const word = runStatusWord(status);
      expect(word).not.toMatch(/[A-Z_]/);
      expect(word.length).toBeGreaterThan(0);
    }
  });

  it("phaseOfStatus is case-insensitive and null for unknown", () => {
    expect(phaseOfStatus("failed")).toBe("failed");
    expect(phaseOfStatus("nope")).toBeNull();
    expect(phaseOfStatus(null)).toBeNull();
  });

  it("isEndedWithoutEvidence", () => {
    const ended = (["failed", "cancelled", "attention", "unavailable"] as RunPhase[]).every(isEndedWithoutEvidence);
    const live = (["queued", "running", "completed", "unread"] as RunPhase[]).some(isEndedWithoutEvidence);
    expect(ended).toBe(true);
    expect(live).toBe(false);
  });
});

describe("stageChip (B1)", () => {
  const rows: [string, RunPhase | null, string, string][] = [
    ["DONE", "running", "done", "good"],
    ["DONE", "failed", "done", "good"],
    ["DONE", "cancelled", "done", "good"],
    ["RUNNING", "running", "running", "accent"],
    ["RUNNING", "completed", "running", "accent"],
    ["RUNNING", "failed", "failed", "bad"],
    ["RUNNING", "cancelled", "cancelled", "quiet"],
    ["RUNNING", "attention", "stopped", "warn"],
    ["PENDING", "running", "pending", "quiet"],
    ["PENDING", "failed", "not run", "quiet"],
    ["PENDING", "cancelled", "not run", "quiet"],
    ["PENDING", "attention", "not run", "quiet"],
    ["RUNNING", null, "running", "accent"],
  ];
  it.each(rows)("%s in a %s run -> %s", (state, phase, word, tone) => {
    expect(stageChip(state, phase)).toEqual({ word, tone });
  });
});
