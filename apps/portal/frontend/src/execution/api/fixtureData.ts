/**
 * Raw governance fixture data — contract-shaped objects shared by the unit
 * double (`fixtureApi`) and the e2e BFF double (`e2e/bffDouble.ts`).
 *
 * Kept free of JSON imports on purpose: the Playwright Node loader does not
 * resolve JSON modules the way Vite does, and this file is on its import
 * path. One source of truth, two consumers, no second feature model.
 */
export const APPROVAL_ROWS: Record<string, unknown>[] = [
  {
    approval_id: "AP-352",
    gate: "R2",
    subject: "Carry v3.2 → PF-MAIN",
    target: "sandbox · OKX TESTNET",
    blocker_count: 1,
    blocker_summary: "broker sync stale",
    sla: { age_minutes: 1560, budget_minutes: 1440, due_at: "2026-08-21T09:00:00Z" },
    quorum_met: 0,
    quorum_required: 2,
    inert: null,
    needs_you: true,
  },
  {
    approval_id: "AP-201",
    gate: "R1",
    subject: "RSI v1.7 · RC-41",
    target: "research",
    blocker_count: 0,
    blocker_summary: "none",
    sla: { age_minutes: 120, budget_minutes: 1440 },
    quorum_met: 1,
    quorum_required: 2,
    inert: null,
    needs_you: true,
  },
  {
    approval_id: "EX-771",
    gate: "PAPER_EXIT",
    subject: "Grid v2.1 · dep_94",
    target: "→ sandbox · DERIBIT",
    blocker_count: 0,
    blocker_summary: "observation gate met",
    sla: { age_minutes: 240, budget_minutes: 2880 },
    quorum_met: 0,
    quorum_required: 1,
    inert: null,
    needs_you: true,
  },
  {
    approval_id: "AP-360",
    gate: "R1",
    subject: "MeanRev v0.3 · RC-52",
    target: "research",
    blocker_count: 2,
    blocker_summary: "audit replay failed",
    sla: { age_minutes: 360, budget_minutes: 1440 },
    quorum_met: 0,
    quorum_required: 2,
    // Blocked before review: the request itself is not decidable yet, which is
    // a different reason to be inert than "not you".
    inert: "BLOCKED",
    needs_you: false,
  },
  {
    approval_id: "AP-311",
    gate: "LIVE_GATE",
    subject: "Grid v2.1 → BINANCE",
    target: "live · dual approval",
    blocker_count: 0,
    blocker_summary: "none",
    sla: { age_minutes: 1440, budget_minutes: 4320 },
    quorum_met: 1,
    quorum_required: 2,
    // The separation-of-duty row. Dimmed and still counted, because its
    // visibility is the proof that separation of duties is working.
    inert: "SELF",
    needs_you: false,
  },
];

export const R1_DETAIL: Record<string, unknown> = {
  approval: {
    approval_id: "AP-201",
    subject_label: "RSI v1.7",
    release_candidate: "RC-41",
    quorum_met: 1,
    quorum_required: 2,
    policy_version: "approval.v3",
    creator: "Minh",
    expected_version: "v7",
    sla: { age_minutes: 120, budget_minutes: 1440 },
  },
  actor: "Lan",
  eligibility: {
    can_approve: true,
    can_approve_with_condition: true,
    can_deny: true,
    can_request_changes: true,
    locks: [],
  },
  decisions: [],
  evidence_manifest: {
    entries: [
      { label: "alpha version", value: "av_2041", note: "· supersedes av_1988", verification: "✓ verified" },
      { label: "artifact digest", value: "sha256:9f3c1a…e2", verification: "✓ verified" },
      { label: "entrypoint", value: "rsi_pkg.strategy:RsiAlpha" },
      { label: "final audit run", value: "run_5512", note: "/ attempt 2 · replay", verification: "✓ reproduced" },
      { label: "engine", value: "quantbt 1.0.8 · image sha256:77bd…a1", verification: "✓ verified" },
      { label: "datasets", value: "3 snapshots · universe univ_88", verification: "PASS" },
    ],
  },
  checklist: [
    { label: "exact engine / data / version pinned by digest", outcome: "pass" },
    { label: "final audit replay reproducible (checksum match)", outcome: "pass" },
    { label: "outer OOS policy satisfied — holdout untouched by selection", outcome: "pass" },
    { label: "parameter stability ≥ threshold across folds", outcome: "pass" },
    { label: "execution assumptions declared (fee/slippage/latency)", outcome: "pass" },
    {
      label: "capacity evidence limited — volume data covers top-3 symbols only",
      outcome: "watch",
      suggestion: "suggested condition below",
    },
  ],
};

export const R2_DETAIL: Record<string, unknown> = {
  approval: {
    // §3 names the screen's data: AP-352 Carry v3.2 → PF-MAIN. The cast puts
    // that approval on dep_77, OKX TESTNET, sandbox — not on the BINANCE paper
    // deployment, whose R2 is AP-207. And Carry v3.2's R1 is AP-101; the
    // AP-201 an earlier fixture used belongs to RSI, a different alpha.
    approval_id: "AP-352",
    // BR-EX-23, delivered: the review row names what the capital preview is
    // computed against, so the screen no longer substitutes a fixture literal.
    portfolio_id: "PF-MAIN",
    currency: "USDT",
    requested_amount: "50.000000000000000001",
    subject_label: "Carry v3.2 → PF-MAIN · Sandbox · OKX TESTNET",
    deployment_candidate: "DC-91",
    release_candidate: "RC-41",
    artifact_digest: "sha256:9f3c1a…e2",
    policy_version: "approval.v3",
    plan_author: "Stan",
    quorum_met: 0,
    quorum_required: 2,
    expected_version: "v3",
    sla: { age_minutes: 960, budget_minutes: 1440 },
  },
  actor: "Lan",
  r1_reference: {
    approval_id: "AP-101",
    state: "APPROVED",
    href: "/governance/approvals/AP-101/r1",
    expiry: "2026-11-01",
    digest: "sha256:c81f2d4a…7e",
    decided_by: "Minh",
    decided_at: "2026-07-30",
  },
  eligibility: { can_approve: true, can_approve_with_condition: true, can_deny: true, can_request_changes: true, locks: [] },
  grant_name: "paper_activation_authorization",
  readiness: [
    {
      title: "Account & risk plan",
      entries: [
        { label: "account (new)", value: "acct-sbx-carry-okx", revision: "account policy rev 7" },
        { label: "margin", value: "MARGIN · CROSS · 2x · settle USDT", revision: "account policy rev 7" },
        { label: "risk profile", value: "max order 5,000 · DD 8% · daily loss 3%", revision: "rev 12" },
        { label: "matcher config", value: "taker 4.0bp · latency 120ms", revision: "rev 3" },
      ],
    },
  ],
  capital: [
    { label: "allocated capital", currency: "USDT", before: "0.00", after: "50,000.00" },
    { label: "max capital", currency: "USDT", before: "0.00", after: "100,000.00" },
    { label: "portfolio weight", currency: "%", before: "0.0", after: "12.0" },
    { label: "concentration top-3", currency: "%", before: "44.0", after: "46.0", note: "within policy ceiling 55%" },
  ],
};

export const EXIT_DETAIL: Record<string, unknown> = {
  review: {
    review_id: "EX-771",
    // The stage being left, so the rail draws the right current step. The same
    // template serves the Sandbox and Canary exits, and a rail that assumed
    // paper would be wrong on two of the three screens it exists for.
    stage: "PAPER_OBSERVATION",
    deployment_id: "dep_94",
    subject_label: "Grid v2.1 · dep_94 · DERIBIT",
    promote_to: "SANDBOX_VALIDATION",
    quorum_met: 0,
    quorum_required: 1,
    expected_version: "v2",
    sla: { age_minutes: 240, budget_minutes: 2880 },
  },
  actor: "Lan",
  approver_role: "Ops Approver",
  gate_met: true,
  gate_summary: "30 / 30 days · 312 / 300 trades · 2 / 2 restart cycles",
  policy_id: "obs_29",
  // The Paper Exit vocabulary, in full. `can_approve_with_condition` is carried
  // because the payload publishes it, not because this screen offers it — the
  // three outcomes here are PROMOTE, EXTEND_OBSERVATION and REJECT.
  eligibility: {
    can_approve: true,
    can_approve_with_condition: true,
    can_deny: true,
    can_extend_observation: true,
    can_reject: true,
    separation_of_duties: "OK",
    locks: [],
  },
  recommendation: "Approve promotion with the carried capacity condition.",
  // `governance.paper-exit.v1` publishes the plan as PREVIEW_ONLY (canonical
  // fixture); the screen had been saying "not published" over a published field.
  activation_plan: {
    mode: "PREVIEW_ONLY",
    target_stage: "SANDBOX_VALIDATION",
    authority_semantics: "APPROVAL_CREATES_PROMOTION_GRANT_ONLY",
    external_side_effect_requested: false,
  },
  lineage: [
    { label: "artifact", value: "sha256:41bb7d…c4" },
    { label: "R1", value: "AP-118", href: "/governance/approvals/AP-118/r1" },
    { label: "R2", value: "AP-152", href: "/governance/approvals/AP-152/r2" },
    { label: "observation policy", value: "obs_29" },
    { label: "evidence pack", value: "ep_4471 · digest e9a2…" },
  ],
  panels: [
    {
      title: "Observation coverage",
      source: "obs_29",
      findings: [
        { label: "30 / 30 days · 312 / 300 trades · 2 / 2 restart cycles", outcome: "pass", href: "/deployments/paper/dep_94#sessions", source_label: "sessions" },
        { label: "data freshness violations: 0 · coverage 99.6%", outcome: "pass", href: "/deployments/paper/dep_94#sessions", source_label: "sessions" },
      ],
    },
    {
      title: "Drift vs approved evidence",
      source: "run_5498",
      findings: [
        { label: "hit rate −1.1pt · avg trade net −0.04pt — within band", outcome: "pass", href: "/research/quantbt/runs/run_5498", source_label: "run 5498" },
        { label: "fee drag +0.006pt · signal→fill +70ms — non-blocking", outcome: "watch", href: "/deployments/blotter?deployment=dep_94", source_label: "blotter" },
        { label: "slippage", outcome: "insufficient", carries_to: "sandbox certification", href: "/deployments/blotter?deployment=dep_94", source_label: "blotter" },
      ],
    },
    {
      title: "Limits & operational health",
      findings: [
        { label: "max DD −1.4% / 6% · worst daily loss −0.6% / 3%", outcome: "pass", href: "/deployments/paper/dep_94", source_label: "workbench" },
        { label: "rejects 0.2% / 0.5% · dead letters 0", outcome: "pass", href: "/execution/operations?deployment=dep_94", source_label: "operations" },
      ],
    },
    {
      title: "Portfolio fit — observed vs expected",
      source: "720 samples · corr.v1",
      findings: [
        { label: "ρ vs benchmark: expected 0.18 → observed 0.21 — within band", outcome: "pass", href: "/deployments/portfolios/pf_main", source_label: "portfolio" },
        { label: "contribution +1,842.00 USDC · concentration unchanged", outcome: "pass", href: "/deployments/portfolios/pf_main", source_label: "portfolio" },
      ],
    },
  ],
};

export const CONDITION_FIXTURES: readonly Record<string, unknown>[] = [
  { condition_id: "cn_101", approval_id: "AP-352", gate: "R2", subject: { id: "dep_74", label: "Carry v3.2" }, environment: "PAPER", kind: "RESTRICTION", state: "OPEN", label: "Capacity re-measure", statement: "Capacity at target weight 2.4× < 3× — re-measure at 30d live volume.", owner: { user_id: "usr_lan", username: "Lan" }, due_at: "2026-09-10T21:26:41.000Z", blocking: false, policy_version: "approval.v3", created_at: "2026-08-18T09:00:00.000Z", updated_at: "2026-08-29T09:00:00.000Z" },
  { condition_id: "cn_102", approval_id: "EX-771", gate: "PAPER_EXIT", subject: { id: "dep_94", label: "Grid v2.1" }, environment: "PAPER", kind: "WARNING", state: "OPEN", label: "Slippage carries to cert", statement: "Slippage evidence carries into sandbox certification — measured, not assumed.", owner: { user_id: "usr_stan", username: "Stan" }, due_at: null, blocking: false, policy_version: "approval.v3", created_at: "2026-08-21T09:00:00.000Z", updated_at: "2026-08-28T09:00:00.000Z" },
  { condition_id: "cn_103", approval_id: "AP-259", gate: "R2", subject: { id: "dep_88", label: "Grid v2.1" }, environment: "LIVE", kind: "RESTRICTION", state: "EXPIRING", label: "Daily-loss cap while canary runs", statement: "Daily-loss cap −3.0% while canary runs (risk profile rev 12).", owner: { user_id: "usr_lan", username: "Lan" }, due_at: "2026-09-02T09:14:27.000Z", blocking: false, policy_version: "approval.v3", created_at: "2026-07-28T09:00:00.000Z", updated_at: "2026-08-30T09:00:00.000Z" },
  { condition_id: "cn_104", approval_id: "AP-207", gate: "R2", subject: { id: "binding", label: "shared binding" }, environment: "SANDBOX", kind: "RESTRICTION", state: "OPEN", label: "Flatten before NET→HEDGE", statement: "Hedge-mode flatten check before NET→HEDGE flip on shared binding.", owner: { user_id: "usr_stan", username: "Stan" }, due_at: null, blocking: true, policy_version: "approval.v3", created_at: "2026-08-12T09:00:00.000Z", updated_at: "2026-08-27T09:00:00.000Z" },
  { condition_id: "cn_105", approval_id: "AP-201", gate: "R1", subject: { id: "dep_74", label: "Carry v3.2" }, environment: "PAPER", kind: "WARNING", state: "OPEN", label: "WFO fold-6 re-check", statement: "WFO fold-6 dispersion re-check after 60d live data.", owner: { user_id: "usr_minh", username: "Minh" }, due_at: "2026-10-09T16:45:03.000Z", blocking: false, policy_version: "approval.v3", created_at: "2026-08-14T09:00:00.000Z", updated_at: "2026-08-26T09:00:00.000Z" },
  { condition_id: "cn_106", approval_id: "PX-31", gate: "PAPER_EXIT", subject: { id: "dep_vnm", label: "VnMomo v0.9" }, environment: "PAPER", kind: "LINEAGE", state: "WAIVED", label: "Runbook documented", statement: "VN venue-calendar pause behaviour documented in runbook — waiver recorded on the exit decision.", owner: { user_id: "usr_stan", username: "Stan" }, due_at: null, blocking: false, policy_version: "approval.v3", created_at: "2026-08-15T09:00:00.000Z", updated_at: "2026-08-21T09:00:00.000Z" },
  { condition_id: "cn_107", approval_id: "AP-311", gate: "LIVE_GATE", subject: { id: "dep_88", label: "Grid v2.1" }, environment: "LIVE", kind: "WAIVER", state: "WAIVED", label: "Capacity waiver — canary step", statement: "Capacity waiver granted for the canary step — expires with a gate_live policy revision change.", owner: { user_id: "usr_lan", username: "Lan" }, due_at: null, blocking: false, policy_version: "gate_live.rev3", created_at: "2026-08-26T09:00:00.000Z", updated_at: "2026-08-29T09:00:00.000Z" },
  { condition_id: "cn_108", approval_id: "AP-198", gate: "R1", subject: { id: "rsi_v09", label: "RSI v0.9" }, environment: "RESEARCH", kind: "RESTRICTION", state: "LAPSED", label: "Re-review evidence expired", statement: "RSI v0.9 re-review evidence window lapsed before resubmission — blocking any new request for this alpha until re-run.", owner: { user_id: "usr_lan", username: "Lan" }, due_at: "2026-08-24T05:37:12.000Z", blocking: true, policy_version: "approval.v3", created_at: "2026-07-01T09:00:00.000Z", updated_at: "2026-08-24T12:00:01.000Z" },
];

/**
 * The eight views `EX-BE-05a` §3 supports, as a predicate.
 *
 * The fixture applied none of them: it echoed the view back and returned the
 * same rows, so every chip looked wired and changed nothing. That is worse than
 * an unwired chip, because it is indistinguishable from a working one.
 *
 * The real filters are server-side and allowlisted (BR-EX-02) — this is the
 * shape of the answer, not the implementation of it. What it exercises is the
 * client's half: that a view change resets the cursor, that the counts follow
 * the view, and that an empty view is not reported as an empty queue.
 */
export function matchesView(row: Record<string, unknown>, view: string): boolean {
  const gate = String(row.gate ?? "");
  const target = String(row.target ?? "").toLowerCase();
  const sla = (row.sla ?? {}) as Record<string, unknown>;
  const overdue =
    typeof sla.age_minutes === "number" &&
    typeof sla.budget_minutes === "number" &&
    sla.age_minutes > sla.budget_minutes;

  switch (view) {
    case "ALL":
      return true;
    // "Mine" in the hi-fi: what this actor is expected to act on. It is not
    // "everything I can see" — that is ALL, and conflating them is how a
    // triage queue stops being a triage queue.
    case "INBOX":
      return row.needs_you === true;
    case "R1":
      return gate === "R1";
    case "PAPER":
      return target.includes("paper");
    case "SANDBOX":
      return target.includes("sandbox");
    case "LIVE_GATES":
      return gate === "LIVE_GATE" || target.includes("live");
    case "EXIT_REVIEWS":
      return gate === "PAPER_EXIT" || gate === "SANDBOX_EXIT";
    case "OVERDUE":
      return overdue;
    default:
      // An unrecognised view returns nothing rather than everything. Falling
      // back to ALL would show a full queue under a filter that was never
      // applied, which is the same lie in a different direction.
      return false;
  }
}
