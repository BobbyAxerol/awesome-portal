/**
 * P06 FE/consumer tests.
 *
 * P06's FE to-do is a queue/cancel/retry/finishing contract harness plus worker
 * attempt data, with two explicit prohibitions: no fabricated ETA, and a
 * technical retry must not become a research attempt. The handoff adds the
 * late-result and mandatory/optional rules. Each is a block below.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type LogicalRun,
  type WorkerAttempt,
  RESEARCH_JOB_STATES,
  boundedProgressCaption,
  isTerminal,
  outboxDeliveryImpliesCompletion,
  reconcileLateAttempt,
  runDisplay,
} from "./scheduler";

function attempt(overrides: Partial<WorkerAttempt> = {}): WorkerAttempt {
  return { ordinal: 1, state: "RUNNING", message: null, ...overrides };
}

function run(overrides: Partial<LogicalRun> = {}): LogicalRun {
  return { runId: "run_1", state: "RUNNING", attempts: [attempt()], ...overrides };
}

describe("a retry is the same run, not a new one", () => {
  it("keeps one run id across three attempts", () => {
    const display = runDisplay(
      run({
        attempts: [
          attempt({ ordinal: 1, state: "FAILED" }),
          attempt({ ordinal: 2, state: "FAILED" }),
          attempt({ ordinal: 3, state: "RUNNING" }),
        ],
      }),
    );
    expect(display.runId).toBe("run_1");
    expect(display.attemptCount).toBe(3);
    expect(display.latestAttempt?.ordinal).toBe(3);
    // The ordinal is the only attempt identity the browser is given; the lease
    // that fences the worker is an internal fact and never crosses over.
    expect(display.latestAttempt).not.toHaveProperty("leaseEpoch");
  });

  it("reports no attempts as zero rather than inventing one", () => {
    const display = runDisplay(run({ attempts: [] }));
    expect(display.attemptCount).toBe(0);
    expect(display.latestAttempt).toBeNull();
  });
});

describe("queue, cancel and terminal truth", () => {
  it("classifies exactly three states as terminal", () => {
    const terminal = RESEARCH_JOB_STATES.filter(isTerminal);
    expect(terminal).toEqual(["SUCCEEDED", "FAILED", "CANCELLED"]);
  });

  it("offers cancel only while the run can still be stopped", () => {
    for (const state of RESEARCH_JOB_STATES) {
      const display = runDisplay(run({ state }));
      const expected = !isTerminal(state) && state !== "CANCEL_REQUESTED";
      expect(display.cancellable).toBe(expected);
    }
  });

  it("does not re-offer cancel once one is already requested", () => {
    expect(runDisplay(run({ state: "CANCEL_REQUESTED" })).cancellable).toBe(false);
  });

  it("carries the server reason and never composes one", () => {
    expect(runDisplay(run({ state: "FAILED", reason: "Worker exceeded memory." })).reason).toBe(
      "Worker exceeded memory.",
    );
    expect(runDisplay(run({ state: "FAILED" })).reason).toBeNull();
  });
});

describe("no fabricated percent or ETA", () => {
  it("returns null when the server published no progress", () => {
    expect(boundedProgressCaption(run())).toBeNull();
    expect(runDisplay(run()).progress).toBeNull();
  });

  it("prints the published counts and never a percentage", () => {
    const caption = boundedProgressCaption(run({ progress: { completed: 3, total: 10 } }));
    expect(caption).toBe("3 of 10");
    expect(caption).not.toMatch(/%|ETA|remaining|estimate/i);
  });

  it("contains no estimation logic at all", () => {
    const source = readFileSync(join(process.cwd(), "src", "research", "scheduler.ts"), "utf8");
    const code = source
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/\beta\b|estimate|percent|elapsed\s*\/|Date\.now/i);
    expect(code).not.toMatch(/\bfetch\s*\(|postgres|nats|WebSocket/i);
  });
});

describe("mandatory and optional diagnostics stay separate", () => {
  it("does not let an optional failure become a primary failure", () => {
    const display = runDisplay(
      run({
        state: "SUCCEEDED",
        diagnostics: [
          { id: "audit_trace", kind: "OPTIONAL", failed: true },
          { id: "numeric_parity", kind: "MANDATORY", failed: false },
        ],
      }),
    );
    expect(display.primaryFailure).toBe(false);
    expect(display.optionalFailures).toEqual(["audit_trace"]);
  });

  it("raises a primary failure when a mandatory diagnostic fails", () => {
    const display = runDisplay(
      run({
        state: "SUCCEEDED",
        diagnostics: [{ id: "numeric_parity", kind: "MANDATORY", failed: true }],
      }),
    );
    expect(display.primaryFailure).toBe(true);
  });

  it("treats a FAILED run as a primary failure regardless of diagnostics", () => {
    expect(runDisplay(run({ state: "FAILED", diagnostics: [] })).primaryFailure).toBe(true);
  });
});

describe("a late worker result never overrides an authoritative terminal state", () => {
  it("keeps CANCELLED when a worker reports success afterwards", () => {
    const result = reconcileLateAttempt(
      run({ state: "CANCELLED" }),
      attempt({ ordinal: 2, state: "SUCCEEDED", message: "done" }),
    );
    expect(result.state).toBe("CANCELLED");
    expect(result.ignoredLateMessage).toBe(true);
  });

  it("keeps FAILED when a straggler reports success", () => {
    expect(
      reconcileLateAttempt(run({ state: "FAILED" }), attempt({ state: "SUCCEEDED" })).state,
    ).toBe("FAILED");
  });

  it("accepts the attempt state while the run is still open", () => {
    const result = reconcileLateAttempt(run({ state: "RUNNING" }), attempt({ state: "RETRY_WAIT" }));
    expect(result.state).toBe("RETRY_WAIT");
    expect(result.ignoredLateMessage).toBe(false);
  });

  it("does not flag a late message that agrees with the terminal state", () => {
    expect(
      reconcileLateAttempt(run({ state: "SUCCEEDED" }), attempt({ state: "SUCCEEDED" }))
        .ignoredLateMessage,
    ).toBe(false);
  });
});

describe("an outbox delivery is transport, not compute", () => {
  it("never implies completion", () => {
    expect(outboxDeliveryImpliesCompletion()).toBe(false);
  });
});

describe("claimability is not a browser decision", () => {
  it("exposes no claimability helper at all", async () => {
    // A browser-side claimability check is inference the server owns: its typed
    // state already answers the question, and a row the scheduler has not
    // accepted must not reach the queue as an item in the first place.
    const module = await import("./scheduler");
    expect(Object.keys(module)).not.toContain("isClaimableP06Job");
  });

  it("never forms a digest in the browser", () => {
    const source = readFileSync(join(process.cwd(), "src", "research", "scheduler.ts"), "utf8");
    expect(source).not.toMatch(/createHash|sha256\(|subtle\.digest/i);
  });
});
