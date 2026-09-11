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
  | "sandbox-certification"
  | "incident"
  | "paper-exit-review"
  | "live-full-operations"
  | "paper-workbench";

export interface EmptyPanelSpec {
  /** Exactly the title the populated branch draws, minus any interpolated id. */
  readonly title: string;
  /**
   * What is missing, in this panel's own words — `PanelState`'s `title` slot,
   * which exists for exactly this ("a screen's own name for this state, when
   * it has a better one than the shared vocabulary").
   *
   * Eight panels all headed "Nothing to show" is the repeated boilerplate the
   * BE-R2 handoff rules out, and on the Gate Live screenshot it was the
   * loudest thing on the page while the informative line sat underneath in
   * grey. Naming the specific absence costs the same pixels and scans.
   */
  readonly missing: string;
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
  readonly recordKind: "incident" | "sandbox-certification" | "canary-envelope" | "paper-exit-review" | "governance-approval" | "deployment";
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
  missing: "No decision",
  holds: "the approve, deny or attach-condition record once a reviewer submits one",
  relation: "governance_approval_decisions",
};

export const EMPTY_COMPOSITION: Record<EmptyRecordScreen, EmptyCompositionSpec> = {
  "gate-r1": {
    recordKind: "governance-approval",
    panels: [
      { title: "Artifact passport — immutable", missing: "No artifact passport", holds: "the digest, lineage and build facts of the artifact under review", relation: "execution_artifact_passports" },
      { title: "Decision checklist", missing: "No checklist", holds: "each research-evidence check and its outcome", relation: "governance_approval_checklists" },
      { title: "Known limitations & proposed restrictions", missing: "No limitations published", holds: "limitations the author published and restrictions a reviewer proposes" },
      DECISION_PANEL,
    ],
    withheld: [],
  },
  "gate-r2": {
    recordKind: "governance-approval",
    panels: [
      { title: "Portfolio fit", missing: "No fit assessment", holds: "how this deployment sits against the portfolio it would join" },
      { title: "Gate criteria — policy vs evidence", missing: "No criteria", holds: "each readiness criterion beside the evidence offered for it" },
      { title: "Capital change preview — execution vocabulary", missing: "No capital preview", holds: "the capital movement this approval would authorise" },
      { title: "Observation policy", missing: "No observation policy", holds: "the observation window the request proposes" },
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
      { title: "Canary record", missing: "No canary record", holds: "the canary deployment this approval would promote" },
      { title: "Canary evidence — published branches", missing: "No evidence branches", holds: "each evidence branch the canary published, and its state" },
      { title: "Current source — live facts", missing: "No live facts", holds: "the live source state, freshness and completeness at decision time" },
      { title: "Drift vs paper twin", missing: "No drift measurement", holds: "the measured divergence between this canary and its paper twin" },
      { title: "Capital step toward target", missing: "No capital step", holds: "the capital step this approval would take" },
      { title: "Gate criteria — policy vs canary evidence", missing: "No criteria", holds: "each live-gate criterion beside the canary evidence offered for it" },
      { title: "What approval changes", missing: "No change summary", holds: "what changes in the running system if this is approved" },
      DECISION_PANEL,
    ],
    withheld: [],
  },
  "canary-control-room": {
    recordKind: "canary-envelope",
    panels: [
      { title: "Canary envelope", missing: "No envelope", holds: "the limits, duration and blockers the envelope sets" },
      { title: "Exit readiness", missing: "No exit gates", holds: "each exit gate and whether it is met" },
      { title: "Guard rule", missing: "No guard rules", holds: "the guard rules armed for this canary" },
      { title: "Live positions & open orders", missing: "No positions", holds: "positions and open orders held under this canary" },
      { title: "Live vs Paper vs Backtest — same artifact digest", missing: "No comparison", holds: "the three runs of one artifact digest side by side" },
      { title: "Portfolio marginal contribution", missing: "No contribution figures", holds: "what this canary adds to the portfolio it runs in" },
      { title: "Incidents · reconciliation", missing: "No incidents or findings", holds: "incidents and reconciliation findings raised against this canary", relation: "manager.reconciliation:reconciliation_findings" },
    ],
    withheld: [],
  },
  "sandbox-certification": {
    recordKind: "sandbox-certification",
    panels: [
      { title: "Certification steps", missing: "No steps", holds: "each certification step and its evaluation" },
      { title: "Order-type certification", missing: "No order types", holds: "each order type this certification exercises" },
      { title: "Physical broker state", missing: "No broker state", holds: "the broker's own view of this account" },
      { title: "Internal virtual state", missing: "No projected state", holds: "Portal's projected view, for comparison with the broker" },
      { title: "Difference", missing: "No comparison", holds: "every field where the two views disagree" },
      { title: "Execution quality — evidence so far", missing: "No execution evidence", holds: "fills, slippage and latency measured during certification" },
      { title: "Cleanup checklist — exit precondition", missing: "No cleanup checklist", holds: "what must be cleaned up before this certification can exit" },
      { title: "Reconciliation findings", missing: "No findings", holds: "findings raised while reconciling against the broker", relation: "manager.reconciliation:reconciliation_findings" },
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

  /*
   * Incident Detail and Paper Exit Review each solved this before the frame
   * existed and each solved it in its own file. Three implementations of one
   * idea is three places for it to drift, and neither copy went through the
   * allowlist question, so neither had to say which of its panels would be
   * dishonest when empty. They are registry entries now.
   */
  incident: {
    recordKind: "incident",
    panels: [
      { title: "Timeline", missing: "No timeline", holds: "each event in the order the system recorded it" },
      { title: "Operations taken", missing: "No operations", holds: "every operator action taken against this incident" },
      { title: "Evidence", missing: "No evidence", holds: "the artefacts attached while the incident was open" },
      { title: "Resolution gates", missing: "No gates", holds: "each condition that must hold before this can be resolved" },
      { title: "Annotations", missing: "No annotations", holds: "notes reviewers left on this incident" },
    ],
    withheld: [],
  },
  "paper-exit-review": {
    recordKind: "paper-exit-review",
    panels: [
      { title: "Observation coverage", missing: "No coverage", holds: "how much of the observation window this deployment actually ran" },
      { title: "Drift vs approved evidence", missing: "No drift measurement", holds: "the divergence between paper behaviour and the evidence R1 approved" },
      { title: "Execution quality", missing: "No execution evidence", holds: "fills, slippage and latency measured during the observation" },
      { title: "Risk and reconciliation", missing: "No findings", holds: "risk breaches and reconciliation findings raised during paper" },
    ],
    withheld: [],
  },
  "live-full-operations": {
    recordKind: "deployment",
    panels: [
      { title: "Open exposure & orders", missing: "No exposure", holds: "positions and working orders this deployment holds right now" },
      { title: "Broker & reconciliation truth", missing: "No broker truth", holds: "the broker's own view beside Portal's projection" },
      { title: "Broker mismatch", missing: "No mismatch", holds: "every field where the two views disagree" },
      { title: "Guard rules", missing: "No guard rules", holds: "the guard rules armed against this deployment" },
      { title: "Incidents & protective actions", missing: "No incidents", holds: "incidents raised and the protective actions taken" },
    ],
    withheld: [
      {
        title: "Contribution & edge evidence · 30d",
        because: "it is a thirty-day window over the portfolio, not over this deployment record. With no deployment the window is not empty, it is unasked, and reporting it empty would claim a query we did not run.",
      },
    ],
  },
  "paper-workbench": {
    recordKind: "deployment",
    panels: [
      { title: "Observation gate", missing: "No observation gate", holds: "each criterion the paper observation must meet before exit" },
      { title: "Equity vs approved research evidence", missing: "No equity series", holds: "the paper equity curve beside the research evidence it was approved on" },
      { title: "Drift vs approved evidence", missing: "No drift measurement", holds: "where paper behaviour has diverged from that evidence" },
      { title: "Orders and fills overlay", missing: "No orders or fills", holds: "orders and fills laid over the same window" },
      { title: "Portfolio contribution and rolling correlation", missing: "No contribution figures", holds: "what this deployment adds to its portfolio, and how it moves with the rest" },
    ],
    withheld: [
      {
        title: "Deployments in paper",
        because: "it lists every other deployment running in paper. This screen never asked for that list, so an absent deployment here says nothing at all about it.",
      },
      {
        title: "Observation report — preview",
        because: "it is drawn only once an observation report can be produced. Naming it on an absent deployment promises a panel that a healthy screen draws only at the end of the window.",
      },
    ],
  },
};
