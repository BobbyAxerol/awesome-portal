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
import { readApprovalRow, readGateR1Detail } from "./rows";
import type {
  ApplyReceipt,
  ExecutionApi,
  InboxQuery,
  InboxResult,
  OperationSnapshot,
  Result,
} from "./ports";
import { unavailable } from "./ports";

/** Wire-shaped, snake_case, exactly as the endpoint will send it. */
const APPROVAL_ROWS: Record<string, unknown>[] = [
  {
    approval_id: "AP-352",
    gate: "R2",
    subject: "Carry v3.2 → PF-MAIN",
    target: "paper · BINANCE",
    blocker_count: 1,
    blocker_summary: "broker sync stale",
    sla: { age_minutes: 1560, budget_minutes: 1440, due_at: "2026-08-21T09:00:00Z" },
    quorum_met: 0,
    quorum_required: 2,
    inert: null,
    needs_you: true,
  },
  {
    approval_id: "AP-341",
    gate: "R2",
    subject: "MM v1.1 → OKX sandbox",
    target: "sandbox · OKX",
    blocker_count: 0,
    blocker_summary: "none",
    sla: { age_minutes: 360, budget_minutes: 1440 },
    quorum_met: 1,
    quorum_required: 2,
    inert: "QUORUM",
    needs_you: false,
  },
  {
    approval_id: "AP-259",
    gate: "R1",
    subject: "Grid v2.2 · RC-49",
    target: "research · R1",
    blocker_count: 0,
    blocker_summary: "none",
    sla: { age_minutes: 240, budget_minutes: 2880 },
    quorum_met: 0,
    quorum_required: 2,
    inert: "SELF",
    needs_you: false,
  },
  {
    approval_id: "EX-771",
    gate: "PAPER_EXIT",
    subject: "Grid v2.1 · dep_94",
    target: "paper · BINANCE",
    blocker_count: 0,
    blocker_summary: "observation gate met",
    sla: { age_minutes: 540, budget_minutes: 2880 },
    quorum_met: 0,
    quorum_required: 2,
    inert: null,
    needs_you: true,
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

/**
 * The verification sequence a poll walks.
 *
 * PENDING → ACKNOWLEDGED → SUCCEEDED, one step per poll. Deliberately more than
 * one step: a fixture that returned SUCCEEDED on the first poll would let a
 * screen that closes on the first response look correct.
 */
const VERIFICATION_WALK = ["PENDING", "ACKNOWLEDGED", "SUCCEEDED"] as const;

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
}

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
      const size = query.limit ?? 2;
      const start = query.after
        ? APPROVAL_ROWS.findIndex((r) => r.approval_id === decodeCursor(query.after as string)) + 1
        : query.before
          ? Math.max(
              0,
              APPROVAL_ROWS.findIndex((r) => r.approval_id === decodeCursor(query.before as string)) - size,
            )
          : 0;
      const slice = APPROVAL_ROWS.slice(start, start + size);

      const gaps: string[] = [];
      // Through the same mapper the HTTP client uses. The point of the fixture
      // is to exercise this, not to bypass it.
      const page = readKeysetPage(
        {
          rows: slice,
          total_count: APPROVAL_ROWS.length + 1,
          filtered_count: APPROVAL_ROWS.length,
          next_cursor: start + size < APPROVAL_ROWS.length ? encodeCursor(slice[slice.length - 1]) : null,
          prev_cursor: start > 0 ? encodeCursor(slice[0]) : null,
          has_more: start + size < APPROVAL_ROWS.length,
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
          counts: { pending: APPROVAL_ROWS.length + 1, overdue: 1, dueSoon: 1 },
          // Counted over the whole filter, not the page: that is what makes a
          // dropped separation-of-duty row visible.
          inertCount: APPROVAL_ROWS.filter((r) => r.inert !== null).length,
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

    async planDecision(input) {
      const blocked = gate<{ planId: string }>("planDecision");
      if (blocked) return blocked;
      if (options.conflict) {
        return unavailable("REQUEST_KEY_CONFLICT: this key was used with a different payload.");
      }
      return { ok: true, value: { planId: `cmd_${input.requestKey.slice(3, 11)}` } };
    },

    async applyPlan(planId: string): Promise<Result<ApplyReceipt>> {
      const blocked = gate<ApplyReceipt>("applyPlan");
      if (blocked) return blocked;
      polls = 0;
      // A receipt. Not a result.
      return { ok: true, value: { operationId: `op_${planId.slice(4)}`, receipt: `rcpt_${planId.slice(4)}` } };
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
