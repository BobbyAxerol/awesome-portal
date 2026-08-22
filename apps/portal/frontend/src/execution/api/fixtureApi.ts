/**
 * The fixture implementation.
 *
 * This is what the screens actually run on today, and it is deliberately a full
 * implementation of the port rather than a handful of canned objects. It
 * exercises the same code path the HTTP client will: rows go through
 * `readApprovalRow`, the page goes through `readKeysetPage`, apply returns a
 * 202-shaped receipt and the poll walks a real verification sequence.
 *
 * That matters because the bugs worth catching before the endpoint exists are
 * the ones in the mapping, not the ones in `fetch`. A fixture that returned
 * finished `ApprovalRow` objects would test nothing.
 */
import { readKeysetPage } from "../adapter";
import { readApprovalRow, readGateR1Detail, readGateR2Detail, readPaperExitDetail } from "./rows";
import { readAnalyticsEnvelope, readCapitalPreview } from "../analytics";
import {
  CAPITAL_PREVIEW_BREACH,
  CAPITAL_PREVIEW_OK,
  CAPITAL_PREVIEW_STALE,
} from "../analytics.fixtures";
import type {
  ApplyReceipt,
  ExecutionApi,
  InboxQuery,
  InboxResult,
  OperationSnapshot,
  Result,
} from "./ports";
import { unavailable } from "./ports";
import type { CapitalPreviewInput, DecisionPlan } from "./ports";

/** Wire-shaped, snake_case, exactly as the endpoint will send it. */
/* The five pending rows of the Approval Inbox hi-fi, and they are the cast's.
 *
 * An earlier fixture drifted: it invented AP-341, gave AP-259 an R1 gate it
 * does not have, put AP-352 on BINANCE paper when the cast has it on OKX
 * TESTNET sandbox, and used AP-259 as the separation-of-duty row when the cast
 * and the hi-fi both use AP-311. CANONICAL_CAST.md is explicit that it wins
 * over a screen, and here the screen was right and the fixture was wrong.
 *
 * AP-259 and AP-341 belong in Recently decided, which is where the hi-fi puts
 * them. */
const APPROVAL_ROWS: Record<string, unknown>[] = [
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

/** Recently decided — where the hi-fi and the cast both put these three. */
const DECIDED_ROWS: Record<string, unknown>[] = [
  {
    approval_id: "AP-259",
    gate: "R2",
    subject: "MM v1.1 → OKX sandbox",
    target: "sandbox · OKX",
    blocker_count: 0,
    blocker_summary: "approved with conditions",
    sla: { age_minutes: 0, budget_minutes: 1440 },
    quorum_met: 2,
    quorum_required: 2,
    inert: null,
    needs_you: false,
  },
  {
    approval_id: "PX-31",
    gate: "PAPER_EXIT",
    subject: "MM v1.1",
    target: "→ sandbox",
    blocker_count: 0,
    blocker_summary: "approved",
    sla: { age_minutes: 0, budget_minutes: 2880 },
    quorum_met: 1,
    quorum_required: 1,
    inert: null,
    needs_you: false,
  },
];

/* Shaped per `EX_BE_05A_GOVERNANCE_EVIDENCE_APPROVAL.md` §5: the detail nests
 * under `data.approval`, the passport is `evidence_manifest.entries[]`, the
 * locks sit under `eligibility`, and the decision in force is the last entry of
 * `decisions[]`. */
const R1_DETAIL: Record<string, unknown> = {
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

/* Wire-shaped, per master plan §10.3. Every capital row names its currency:
 * a strip that implies one number is wrong the moment a portfolio holds two. */
const R2_DETAIL: Record<string, unknown> = {
  approval: {
    // §3 names the screen's data: AP-352 Carry v3.2 → PF-MAIN. The cast puts
    // that approval on dep_77, OKX TESTNET, sandbox — not on the BINANCE paper
    // deployment, whose R2 is AP-207. And Carry v3.2's R1 is AP-101; the
    // AP-201 an earlier fixture used belongs to RSI, a different alpha.
    approval_id: "AP-352",
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
  eligibility: { can_approve: true, can_approve_with_condition: true, can_deny: true, locks: [] },
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

const EXIT_DETAIL: Record<string, unknown> = {
  review: {
    review_id: "EX-771",
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
  eligibility: { can_approve: true, can_approve_with_condition: true, can_deny: true },
  recommendation: "Approve promotion with the carried capacity condition.",
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

/**
 * The verification sequence a poll walks.
 *
 * PENDING → ACKNOWLEDGED → SUCCEEDED, one step per poll. Deliberately more than
 * one step: a fixture that returned SUCCEEDED on the first poll would let a
 * screen that closes on the first response look correct.
 */
const VERIFICATION_WALK = ["PENDING", "ACKNOWLEDGED", "SUCCEEDED"] as const;

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
function matchesView(row: Record<string, unknown>, view: string): boolean {
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

/** Opaque to the caller, which is the only property that matters here. */
function encodeCursor(row: Record<string, unknown>): string {
  return `c_${String(row.approval_id)}`;
}

function decodeCursor(cursor: string): string {
  return cursor.replace(/^c_/, "");
}

export interface FixtureApiOptions {
  /** Endpoints named here answer `unavailable`, to exercise that path. */
  unavailableEndpoints?: readonly (keyof ExecutionApi)[];
  /** Forces the poll to end UNCERTAIN rather than SUCCEEDED. */
  uncertain?: boolean;
  /** Forces a 409 on plan. */
  conflict?: boolean;
  /** Serve the engine's ineligible preview, so the R2 lock is reachable. */
  stalePreview?: boolean;
  /** Blocker codes the plan comes back with. A blocked plan issues no token. */
  planBlockers?: readonly string[];
}

/**
 * The amount the fixture engine answers with a ceiling breach.
 *
 * A constant rather than a magic string so the screen, the fixture and the
 * tests agree on which request trips it.
 */
export const BREACHING_AMOUNT = "600";

export function createFixtureApi(options: FixtureApiOptions = {}): ExecutionApi {
  const down = new Set(options.unavailableEndpoints ?? []);
  let polls = 0;

  function gate<T>(name: keyof ExecutionApi): Result<T> | null {
    return down.has(name)
      ? unavailable(`\`${name}\` is not wired to a real endpoint yet.`)
      : null;
  }

  return {
    async listApprovals(query: InboxQuery): Promise<Result<InboxResult>> {
      const blocked = gate<InboxResult>("listApprovals");
      if (blocked) return blocked;
      if (query.after && query.before) {
        return unavailable("A page cannot be requested in both directions at once.");
      }

      // Cursors are honoured rather than ignored. A fixture that returns the
      // same page whatever the cursor lets a paging bug through unnoticed,
      // which is the one thing the container's paging code needs exercised.
      // Filter first, then page. Paging a filtered set is the only order that
      // makes the cursor mean anything — a cursor into the unfiltered list
      // would land somewhere arbitrary once a view is applied, which is exactly
      // why the contract voids a cursor when the filter changes.
      const inView = APPROVAL_ROWS.filter((r) => matchesView(r, query.filter));

      const size = query.limit ?? 2;
      const start = query.after
        ? inView.findIndex((r) => r.approval_id === decodeCursor(query.after as string)) + 1
        : query.before
          ? Math.max(
              0,
              inView.findIndex((r) => r.approval_id === decodeCursor(query.before as string)) - size,
            )
          : 0;
      const slice = inView.slice(start, start + size);

      const gaps: string[] = [];
      // Through the same mapper the HTTP client uses. The point of the fixture
      // is to exercise this, not to bypass it.
      const page = readKeysetPage(
        {
          rows: slice,
          // Total is the whole queue; filtered is this view. Two numbers,
          // because "5 pending, 1 in this view" is the sentence an operator
          // needs and one number cannot say it.
          total_count: APPROVAL_ROWS.length,
          filtered_count: inView.length,
          next_cursor:
            start + size < inView.length && slice.length > 0
              ? encodeCursor(slice[slice.length - 1])
              : null,
          prev_cursor: start > 0 ? encodeCursor(slice[0]) : null,
          has_more: start + size < inView.length,
          has_previous: start > 0,
          applied_filters: [{ field: "view", op: "eq", value: query.filter }],
          applied_sort: [
            { field: "sla_state", direction: "desc" },
            { field: "approval_id", direction: "asc" },
          ],
        },
        (row) => {
          const read = readApprovalRow(row);
          gaps.push(...read.gaps);
          return read.row;
        },
      );

      return {
        ok: true,
        value: {
          page,
          counts: { pending: APPROVAL_ROWS.length, overdue: 1, dueSoon: 1 },
          // Counted over the whole filter, not the page: that is what makes a
          // dropped separation-of-duty row visible.
          // Counted over the view, so a filter that drops separation-of-duty
          // rows makes the count and the rows disagree in public.
          inertCount: inView.filter((r) => r.inert !== null).length,
          decided: readKeysetPage(
            { rows: DECIDED_ROWS, total_count: DECIDED_ROWS.length, filtered_count: DECIDED_ROWS.length },
            (row) => readApprovalRow(row).row,
          ),
        },
        warnings: gaps,
      };
    },

    async getGateR1(approvalId: string) {
      const blocked = gate<ReturnType<typeof readGateR1Detail>>("getGateR1");
      if (blocked) return blocked as Result<never>;
      const detail = readGateR1Detail({
        ...R1_DETAIL,
        approval: { ...(R1_DETAIL.approval as object), approval_id: approvalId },
      });
      return detail
        ? { ok: true as const, value: detail, warnings: detail.gaps }
        : unavailable("The review response could not be read.");
    },

    async getGateR2(approvalId: string) {
      const blocked = gate<ReturnType<typeof readGateR2Detail>>("getGateR2");
      if (blocked) return blocked as Result<never>;
      const detail = readGateR2Detail({
        ...R2_DETAIL,
        approval: { ...(R2_DETAIL.approval as object), approval_id: approvalId },
      });
      return detail
        ? { ok: true as const, value: detail, warnings: detail.gaps }
        : unavailable("The R2 review response could not be read.");
    },

    async getCapitalPreview(_approvalId: string, request: CapitalPreviewInput) {
      const blocked = gate<never>("getCapitalPreview");
      if (blocked) return blocked as Result<never>;
      // Three engine outcomes, selected by the amount so the states are
      // reachable from the screen rather than only from a test. The client is
      // not deciding anything about the money here — it is choosing which
      // canned engine response to stand in for, exactly as the other fixtures
      // choose which canned row set to return.
      const source = options.stalePreview
        ? CAPITAL_PREVIEW_STALE
        : request.requestedAmount === BREACHING_AMOUNT
          ? CAPITAL_PREVIEW_BREACH
          : CAPITAL_PREVIEW_OK;
      const preview = readCapitalPreview(source);
      const envelope = readAnalyticsEnvelope(source);
      return preview && envelope
        ? { ok: true as const, value: { preview, envelope } }
        : unavailable("The capital preview response could not be read.");
    },

    async getPaperExit(reviewId: string) {
      const blocked = gate<ReturnType<typeof readPaperExitDetail>>("getPaperExit");
      if (blocked) return blocked as Result<never>;
      const detail = readPaperExitDetail({
        ...EXIT_DETAIL,
        review: { ...(EXIT_DETAIL.review as object), review_id: reviewId },
      });
      return detail
        ? { ok: true as const, value: detail, warnings: detail.gaps }
        : unavailable("The exit review response could not be read.");
    },

    async planDecision(input): Promise<Result<DecisionPlan>> {
      const blocked = gate<DecisionPlan>("planDecision");
      if (blocked) return blocked;
      if (options.conflict) {
        return unavailable("REQUEST_KEY_CONFLICT: this key was used with a different payload.");
      }
      const id = `cmd_${input.requestKey.slice(-8)}`;
      // A plan that comes back with blockers is well-formed and un-appliable.
      // The fixture serves it so the screen path that must stop is reachable
      // without a server; `applyToken` is null under exactly that condition,
      // as it is on the real endpoint.
      const blockers = options.planBlockers ?? [];
      return {
        ok: true,
        value: {
          operationId: id,
          applyToken: blockers.length > 0 ? null : `gat1.fixture.${id}.${"a".repeat(43)}`,
          blockers: blockers.map((code) => ({ code })),
          warnings: [],
          expectedApprovalVersion: input.expectedApprovalVersion,
          riskTier: "R1",
        },
      };
    },

    async applyPlan(applyToken: string): Promise<Result<ApplyReceipt>> {
      const blocked = gate<ApplyReceipt>("applyPlan");
      if (blocked) return blocked;
      polls = 0;
      const id = applyToken.split(".")[2] ?? "op";
      // A receipt. Not a result.
      return { ok: true, value: { operationId: `op_${id}`, receipt: `rcpt_${id}` } };
    },

    async pollOperation(): Promise<Result<OperationSnapshot>> {
      const blocked = gate<OperationSnapshot>("pollOperation");
      if (blocked) return blocked;
      const index = Math.min(polls, VERIFICATION_WALK.length - 1);
      polls += 1;
      const terminal = index === VERIFICATION_WALK.length - 1;
      return {
        ok: true,
        value: {
          status: terminal ? "VERIFIED" : "APPLIED_UNVERIFIED",
          verificationRaw: terminal && options.uncertain ? "UNCERTAIN" : VERIFICATION_WALK[index],
        },
      };
    },
  };
}
