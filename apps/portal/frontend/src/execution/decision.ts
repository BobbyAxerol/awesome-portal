/**
 * plan → apply → poll, as a reducer.
 *
 * The whole point of this module is one rule, and it is the rule that is easiest
 * to lose when somebody wires a real endpoint under a deadline:
 *
 *   **A `202` from apply is a receipt, not a result.**
 *
 * Master plan §7.3: "Apply returns 202 plus operation ID and receipt only."
 * Everything after that is observation. So `apply` never moves this machine to a
 * settled phase, no matter what the response body says, and the poll loop is the
 * only thing that can. A drawer that closed on 202 would tell an operator their
 * halt succeeded when all that happened was that the request was accepted.
 *
 * The second rule is BR-EX-21's ruling on `UNCERTAIN`: it stops the automatic
 * retry loop but is **not** settled for operational truth, and it never ages
 * into `EXPIRED`. The machine therefore stops polling and stays visibly
 * unresolved, with an incident implied rather than a tidy ending.
 */
import { isSettled, type MaybeKnown } from "./adapter";
import type { OperationStatus, VerificationResult } from "./contracts";

export type DecisionPhase =
  /** Nothing requested. */
  | "idle"
  /** A plan is being generated. Nothing has been sent to the Trading System. */
  | "planning"
  /** A plan exists and is within its expiry. Apply is possible. */
  | "planned"
  /** Apply is in flight. */
  | "applying"
  /** 202 received. An operation exists and nothing is known about its outcome. */
  | "accepted"
  /** Polling `GET /operations/{id}`. */
  | "verifying"
  /** Verification reached a settled value. */
  | "settled"
  /** Verification returned UNCERTAIN. Not settled, and it will not settle itself. */
  | "uncertain"
  /** The request failed before an operation existed. Safe to retry. */
  | "failed"
  /**
   * Portal stopped watching. The operation did not stop.
   *
   * Not `failed` — nothing went wrong — and not `uncertain`, which is the
   * server's own verdict. This is the client saying it ran out of budget, and
   * it must read differently from both.
   */
  | "abandoned";

export interface DecisionState {
  phase: DecisionPhase;
  /** Belongs to the intent. Reused across every retry (BR-EX-18). */
  requestKey: string;
  planId: string | null;
  operationId: string | null;
  /** What the server acknowledged receiving. Not evidence of an effect. */
  receipt: string | null;
  operationStatus: OperationStatus | null;
  verification: VerificationResult | null;
  /**
   * Why the operation is stopped, verbatim from the server.
   *
   * `execution.command-operation.v1` publishes `blockers` beside a BLOCKED
   * status, and nothing read it: a screen could report that an operation was
   * stopped and never say what stopped it, which leaves an operator to guess
   * between "the relay is off" and "you lack the role".
   */
  blockers: readonly string[];
  /**
   * Whether this operation asked anything of the Trading System.
   *
   * The plan carries the same flag, but the plan is gone once applied and this
   * is the record that outlives it — so after an apply, this is the only
   * published answer to "did that reach the source?".
   */
  sourceSideEffectRequested: boolean;
  /** Set when a repeat used the same key with a different payload (409). */
  conflict: boolean;
  /** How many times the poll has run. Bounded by the caller, not here. */
  polls: number;
  error: string | null;
  note: string | null;
}

export function initialDecision(requestKey: string): DecisionState {
  return {
    phase: "idle",
    requestKey,
    planId: null,
    operationId: null,
    receipt: null,
    operationStatus: null,
    verification: null,
    blockers: [],
    // `true` before anything is known: the same fail-closed direction the
    // readers use, so an intent whose fate has not been reported never reads
    // as one that touched nothing.
    sourceSideEffectRequested: true,
    conflict: false,
    polls: 0,
    error: null,
    note: null,
  };
}

export type DecisionEvent =
  | { type: "PLAN_REQUESTED" }
  | { type: "PLANNED"; planId: string }
  | { type: "PLAN_FAILED"; error: string }
  | { type: "PLAN_CONFLICT" }
  | { type: "APPLY_REQUESTED" }
  /** The 202. Carries an operation id and a receipt, and nothing else. */
  | { type: "APPLY_ACCEPTED"; operationId: string; receipt: string | null }
  | { type: "APPLY_FAILED"; error: string }
  | {
      type: "POLLED";
      status: OperationStatus | null;
      verification: MaybeKnown<VerificationResult> | null;
      blockers?: readonly string[];
      sourceSideEffectRequested?: boolean;
    }
  | { type: "POLL_FAILED"; error: string }
  /**
   * The client stopped watching. The operation did not stop.
   *
   * Distinct from a failure: nothing went wrong, we simply ran out of budget.
   * Without it the panel sat on "Still observing. Nothing has been confirmed."
   * forever while nothing was in fact still observing — a screen claiming to be
   * doing something it had given up on.
   */
  | { type: "POLL_BUDGET_EXHAUSTED" }
  | { type: "RESET"; requestKey: string };

export function decisionReducer(state: DecisionState, event: DecisionEvent): DecisionState {
  switch (event.type) {
    case "PLAN_REQUESTED":
      return { ...state, phase: "planning", error: null, note: "Generating a plan. Nothing is sent yet." };

    case "PLANNED":
      return { ...state, phase: "planned", planId: event.planId, error: null, note: null };

    case "PLAN_FAILED":
      // No operation exists, so nothing is outstanding and a retry is safe.
      return { ...state, phase: "failed", error: event.error, note: "No operation was created." };

    case "PLAN_CONFLICT":
      return {
        ...state,
        phase: "failed",
        conflict: true,
        error: "This request key was already used with a different payload.",
        note: "Start a new command rather than editing this one.",
      };

    case "APPLY_REQUESTED":
      return { ...state, phase: "applying", error: null, note: null };

    case "APPLY_ACCEPTED":
      // The single most important transition in the module. 202 lands here and
      // nowhere near `settled`, whatever the body claimed.
      return {
        ...state,
        phase: "accepted",
        operationId: event.operationId,
        receipt: event.receipt,
        operationStatus: "APPLIED_UNVERIFIED",
        verification: "PENDING",
        note: "Accepted. Nothing is confirmed — this is a receipt, not a result.",
      };

    case "APPLY_FAILED":
      // Deliberately NOT `failed`: apply may have reached the server and the
      // response may have been lost. Treating that as "did not happen" is the
      // mistake that produces a duplicate command.
      return state.operationId
        ? { ...state, phase: "uncertain", error: event.error, note: "The request may have been delivered." }
        : { ...state, phase: "failed", error: event.error, note: "No operation was created." };

    case "POLLED": {
      const verification = event.verification?.known ? event.verification.value : null;
      const unknownToken = event.verification && !event.verification.known ? event.verification.raw : null;
      // Carried into every branch below rather than into one. A poll that
      // reports a blocker while the walk happens to be in "verifying" is the
      // same fact as one that reports it while settling, and putting it on a
      // single branch is how a field ends up published, read, and still
      // invisible on three paths out of four. `??`, not `||`: an empty blocker
      // list is an answer ("nothing is blocking"), not an absence.
      const carried = {
        blockers: event.blockers ?? state.blockers,
        sourceSideEffectRequested:
          event.sourceSideEffectRequested ?? state.sourceSideEffectRequested,
      };

      if (unknownToken) {
        // An unrecognised verification value is not success and not failure. It
        // keeps polling, because the alternative is calling an outcome we
        // cannot read.
        return {
          ...state,
          ...carried,
          phase: "verifying",
          polls: state.polls + 1,
          operationStatus: event.status ?? state.operationStatus,
          note: `Server reported verification "${unknownToken}", which this build does not recognise.`,
        };
      }

      if (verification === "UNCERTAIN") {
        return {
          ...state,
          ...carried,
          phase: "uncertain",
          polls: state.polls + 1,
          operationStatus: event.status ?? state.operationStatus,
          verification,
          note: "The effect may have happened and the Trading System cannot tell us. Escalate; this will not resolve itself.",
        };
      }

      if (verification && isSettled(verification)) {
        return {
          ...state,
          ...carried,
          phase: "settled",
          polls: state.polls + 1,
          operationStatus: event.status ?? state.operationStatus,
          verification,
          note: null,
        };
      }

      return {
        ...state,
        ...carried,
        phase: "verifying",
        polls: state.polls + 1,
        operationStatus: event.status ?? state.operationStatus,
        verification: verification ?? state.verification,
        note: "Still observing. Nothing has been confirmed.",
      };
    }

    case "POLL_BUDGET_EXHAUSTED":
      return {
        ...state,
        phase: "abandoned",
        note: "Portal stopped polling for this operation. It may still be in flight — check the Operations queue or the command journal before deciding again.",
      };

    case "POLL_FAILED":
      // The operation still exists. Losing sight of it is not the same as it
      // having failed, so the phase does not regress to `failed`.
      return { ...state, error: event.error, note: "Lost sight of the operation. It has not been cancelled." };

    case "RESET":
      return initialDecision(event.requestKey);

    default:
      return state;
  }
}

/**
 * Should the caller keep polling?
 *
 * False for `uncertain` — the automatic retry loop stops there per the BR-EX-21
 * ruling — and false once settled. Everything else is still in flight.
 */
export function shouldPoll(state: DecisionState): boolean {
  return state.phase === "accepted" || state.phase === "verifying";
}

/**
 * Did this command do what was asked?
 *
 * The only true answer is a settled `SUCCEEDED`. Written as one condition so
 * that no phase can imply success on its own — `accepted` is the phase this
 * whole module exists to keep away from that word.
 */
export function succeeded(state: DecisionState): boolean {
  return state.phase === "settled" && state.verification === "SUCCEEDED";
}

/** Is the operator still owed an answer? */
export function outstanding(state: DecisionState): boolean {
  return (
    state.phase === "accepted" ||
    state.phase === "verifying" ||
    state.phase === "uncertain" ||
    // Abandoned is outstanding by definition: Portal stopped watching, the
    // operation did not stop. Leaving it out would have let a screen treat a
    // command still in flight as finished business.
    state.phase === "abandoned"
  );
}
