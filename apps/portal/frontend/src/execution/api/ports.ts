/**
 * The Execution API port.
 *
 * One interface, two implementations. Screens depend on the interface, so the
 * day `EX-BE-05a` publishes its row and OpenAPI contract the change is swapping
 * which implementation is provided — not touching a screen.
 *
 * Every method returns a `Result` rather than throwing. A thrown error has one
 * shape at the call site and this surface needs several: denied, unavailable,
 * stale and partial provoke different responses from a human, and collapsing
 * them into `catch (e)` is how they end up as one grey error box.
 */
import type { KeysetPage, PanelStatus } from "../contracts";
import type { ApprovalRow } from "../screens/ApprovalInbox";
import type { GateR1Detail } from "./rows";

export type Result<T> =
  | { ok: true; value: T; warnings?: readonly string[] }
  | { ok: false; status: Exclude<PanelStatus, "ok">; reason: string };

export interface InboxQuery {
  filter: string;
  /** Mutually exclusive, per BR-EX-17. Passing both is a caller bug. */
  after?: string | null;
  before?: string | null;
  limit?: number;
}

export interface InboxResult {
  page: KeysetPage<ApprovalRow>;
  counts: { pending: number; overdue: number; dueSoon: number } | null;
  /** Server-counted over the whole filter. See `ApprovalInbox.inertCount`. */
  inertCount?: number | null;
}

/** What apply returned. A 202 and nothing more (master plan §7.3). */
export interface ApplyReceipt {
  operationId: string;
  receipt: string | null;
}

export interface OperationSnapshot {
  status: string | null;
  /** Raw token preserved; `decision.ts` decides what it means. */
  verificationRaw: string | null;
}

export interface ExecutionApi {
  /** `GET /api/v1/execution/governance/approvals` */
  listApprovals(query: InboxQuery): Promise<Result<InboxResult>>;
  /** `GET /api/v1/execution/governance/approvals/{id}/r1` */
  getGateR1(approvalId: string): Promise<Result<GateR1Detail>>;
  /** `POST /api/v1/execution/commands/plans` */
  planDecision(input: {
    approvalId: string;
    decision: "APPROVE" | "DENY" | "APPROVE_WITH_CONDITION";
    reason: string;
    /** Optimistic concurrency. Rejected server-side if the approval moved. */
    expectedVersion: string | null;
    /** BR-EX-18. Belongs to the intent, reused across retries. */
    requestKey: string;
  }): Promise<Result<{ planId: string }>>;
  /** `POST /api/v1/execution/operations/{id}/apply` — returns 202 only. */
  applyPlan(planId: string, requestKey: string): Promise<Result<ApplyReceipt>>;
  /** `GET /api/v1/execution/operations/{id}` */
  pollOperation(operationId: string): Promise<Result<OperationSnapshot>>;
}

/** Shorthand for the state every unwired endpoint is in today. */
export function unavailable(reason: string): Result<never> {
  return { ok: false, status: "unavailable", reason };
}

export function denied(reason: string): Result<never> {
  return { ok: false, status: "denied", reason };
}
