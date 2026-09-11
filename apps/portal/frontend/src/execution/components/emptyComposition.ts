/**
 * PHASE 8 (round 2) · what a detail screen shows when the record it is about
 * does not exist.
 *
 * Three of these five screens answered an absent record with one line —
 * `UNAVAILABLE APPROVAL_NOT_FOUND: Approval not found.` and nothing else — so a
 * reader following a stale link learned neither what a Gate R1 review contains
 * nor who would put one there. Two more kept a truthful sentence but still
 * dropped every panel. The reviewed hierarchy is the teaching part of the
 * screen and it survives the record being absent.
 *
 * WHY THIS IS AN ALLOWLIST AND NOT A RULE
 *
 * The first draft of this phase proposed a blanket exit gate: no detail screen
 * under 400 characters when empty. Codex rejected it (BE-R2 handoff §3) and was
 * right to. A length threshold is satisfied by padding, and padding is exactly
 * the failure this phase exists to prevent. What matters is not how much a
 * screen says but whether each sentence is one we can stand behind.
 *
 * So every panel below is named individually, and the test is a single
 * question:
 *
 *   When the record is absent, is "this panel has nothing to show" TRUE?
 *
 * It is true for a panel SCOPED TO THE MISSING RECORD: no approval means no
 * decision checklist, and saying so states a fact.
 *
 * It is false for a panel scoped to ANYTHING ELSE. `Certifications in progress`
 * lists other certifications; this screen never asked for them, so calling that
 * panel empty claims the result of a query we did not run. Those panels are
 * left out entirely rather than described wrongly — a missing panel is honest,
 * a panel labelled empty on no evidence is not.
 *
 * It is also false for a CONDITIONAL panel that exists only in one failure
 * mode. `Why this preview cannot be decided against` appears when a capital
 * preview arrives undecidable. Naming it on an empty screen promises a panel
 * that a healthy record never draws.
 */

/** A screen whose subject is a single record that may be absent. */
export type EmptyRecordScreen =
  | "gate-r1"
  | "gate-r2"
  | "gate-live"
  | "canary-control-room"
  | "sandbox-certification";

export interface EmptyPanelSpec {
  /** Exactly the title the populated branch draws, minus any interpolated id. */
  readonly title: string;
  /**
   * What this panel holds once the record exists. One clause, present tense,
   * no promise about when.
   */
  readonly holds: string;
  /**
   * F10 — the source relation this panel reads, where it reads exactly one.
   * The finding asks that an operator be able to tell "no findings" apart from
   * "not consumed", and only a relation name does that.
   */
  readonly relation?: string;
}

export interface EmptyCompositionSpec {
  /** Which `RECORD_PRODUCERS` entry supplies the screen-level sentence. */
  readonly recordKind: "incident" | "sandbox-certification" | "canary-envelope" | "paper-exit-review" | "governance-approval";
  /** Panels that are scoped to the missing record, in reviewed order. */
  readonly panels: readonly EmptyPanelSpec[];
  /**
   * Panels the populated branch draws that are deliberately NOT drawn when the
   * record is absent, each with the reason. Kept in code, not in a comment, so
   * a later reader can see the decision was made rather than forgotten — and so
   * the test can assert the two lists never overlap.
   */
  readonly withheld: readonly { readonly title: string; readonly because: string }[];
}

const DECISION_PANEL: EmptyPanelSpec = {
  title: "Decision — structured, immutable once submitted",
  holds: "the approve, deny or attach-condition record once a reviewer submits one",
  relation: "governance_approval_decisions",
};

export const EMPTY_COMPOSITION: Record<EmptyRecordScreen, EmptyCompositionSpec> = {
  "gate-r1": {
    recordKind: "governance-approval",
    panels: [
      { title: "Artifact passport — immutable", holds: "the digest, lineage and build facts of the artifact under review", relation: "execution_artifact_passports" },
      { title: "Decision checklist", holds: "each research-evidence check and its outcome", relation: "governance_approval_checklists" },
      { title: "Known limitations & proposed restrictions", holds: "limitations the author published and restrictions a reviewer proposes" },
      DECISION_PANEL,
    ],
    withheld: [],
  },
  "gate-r2": {
    recordKind: "governance-approval",
    panels: [
      { title: "Portfolio fit", holds: "how this deployment sits against the portfolio it would join" },
      { title: "Gate criteria — policy vs evidence", holds: "each readiness criterion beside the evidence offered for it" },
      { title: "Capital change preview — execution vocabulary", holds: "the capital movement this approval would authorise" },
      { title: "Observation policy", holds: "the observation window the request proposes" },
      DECISION_PANEL,
    ],
    withheld: [
      {
        title: "Why this preview cannot be decided against",
        because: "it is drawn only when a capital preview arrives without an authority envelope. Naming it on an absent record promises a panel a healthy review never draws.",
      },
    ],
  },
  "gate-live": {
    recordKind: "governance-approval",
    panels: [
      { title: "Canary record", holds: "the canary deployment this approval would promote" },
      { title: "Canary evidence — published branches", holds: "each evidence branch the canary published, and its state" },
      { title: "Current source — live facts", holds: "the live source state, freshness and completeness at decision time" },
      { title: "Drift vs paper twin", holds: "the measured divergence between this canary and its paper twin" },
      { title: "Capital step toward target", holds: "the capital step this approval would take" },
      { title: "Gate criteria — policy vs canary evidence", holds: "each live-gate criterion beside the canary evidence offered for it" },
      { title: "What approval changes", holds: "what changes in the running system if this is approved" },
      DECISION_PANEL,
    ],
    withheld: [],
  },
  "canary-control-room": {
    recordKind: "canary-envelope",
    panels: [
      { title: "Canary envelope", holds: "the limits, duration and blockers the envelope sets" },
      { title: "Exit readiness", holds: "each exit gate and whether it is met" },
      { title: "Guard rule", holds: "the guard rules armed for this canary" },
      { title: "Live positions & open orders", holds: "positions and open orders held under this canary" },
      { title: "Live vs Paper vs Backtest — same artifact digest", holds: "the three runs of one artifact digest side by side" },
      { title: "Portfolio marginal contribution", holds: "what this canary adds to the portfolio it runs in" },
      { title: "Incidents · reconciliation", holds: "incidents and reconciliation findings raised against this canary", relation: "manager.reconciliation:reconciliation_findings" },
    ],
    withheld: [],
  },
  "sandbox-certification": {
    recordKind: "sandbox-certification",
    panels: [
      { title: "Certification steps", holds: "each certification step and its evaluation" },
      { title: "Order-type certification", holds: "each order type this certification exercises" },
      { title: "Physical broker state", holds: "the broker's own view of this account" },
      { title: "Internal virtual state", holds: "Portal's projected view, for comparison with the broker" },
      { title: "Difference", holds: "every field where the two views disagree" },
      { title: "Execution quality — evidence so far", holds: "fills, slippage and latency measured during certification" },
      { title: "Cleanup checklist — exit precondition", holds: "what must be cleaned up before this certification can exit" },
      { title: "Reconciliation findings", holds: "findings raised while reconciling against the broker", relation: "manager.reconciliation:reconciliation_findings" },
    ],
    withheld: [
      {
        title: "Certifications in progress",
        because: "it lists certifications other than this one. The screen never asked for that list, so calling it empty would report a query we did not run.",
      },
      {
        title: "Promotion plans",
        because: "it is scoped to the portfolio, not to this certification. Its content does not depend on the missing record and we hold no answer for it here.",
      },
    ],
  },
};
