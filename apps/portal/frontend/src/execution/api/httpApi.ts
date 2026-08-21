/**
 * The real HTTP implementation.
 *
 * It is complete and it currently answers `unavailable` for everything, which
 * is the correct behaviour rather than a stub. Registry revision 4 ships every
 * screen with `query_enabled: false` and all four command tiers off, so the
 * policy gate below refuses before a request is made.
 *
 * Refusing early rather than letting the request fail is the deny-by-default
 * rule applied to the network: a call the registry has already said no to is
 * not worth making, and a 403 arriving thirty seconds later is a worse
 * explanation than the one the registry can give immediately.
 *
 * When `EX-BE-05a` publishes its contract, what changes here is the row
 * mapping. The transport, the error mapping and the policy gate are done.
 */
import {
  panelStatusForHttp,
  readEnum,
  readKeysetPage,
  readOperation,
  readProblem,
} from "../adapter";
import type { RiskTier } from "../contracts";
import { commandBlockedReason, type DeliveryPolicy } from "../profile";
import { readApprovalRow, readGateR1Detail, readGateR2Detail, readPaperExitDetail } from "./rows";
import type {
  ApplyReceipt,
  ExecutionApi,
  InboxQuery,
  InboxResult,
  OperationSnapshot,
  Result,
} from "./ports";
import { unavailable } from "./ports";

const BASE = "/api/v1/execution";

/** Same-origin only. The browser never talks to the AWS edge (master plan §9.1). */
async function get(path: string, signal?: AbortSignal): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    signal,
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
}

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    signal,
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function problem(response: Response): Promise<Result<never>> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // A failure whose body is not JSON is still a failure with a status.
  }
  const p = readProblem(body, response.status);
  return { ok: false, status: panelStatusForHttp(response.status) as never, reason: `${p.code}: ${p.message}` };
}

export interface HttpApiOptions {
  /** Registry revision 4 policy for the screen this client serves. */
  policy: DeliveryPolicy | null;
  signal?: AbortSignal;
}

export function createHttpApi({ policy, signal }: HttpApiOptions): ExecutionApi {
  /** R0 covers every read on this surface. */
  function readBlocked(): string | null {
    return commandBlockedReason(policy, "R0");
  }

  function commandBlocked(tier: RiskTier): string | null {
    return commandBlockedReason(policy, tier);
  }

  return {
    async listApprovals(query: InboxQuery): Promise<Result<InboxResult>> {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      if (query.after && query.before) {
        // BR-EX-17: mutually exclusive. Sending both would let the server pick,
        // and a page whose direction the client did not choose is a page it
        // cannot place.
        return unavailable("A page cannot be requested in both directions at once.");
      }

      const params = new URLSearchParams({ filter: query.filter });
      if (query.after) params.set("after", query.after);
      if (query.before) params.set("before", query.before);
      if (query.limit) params.set("limit", String(query.limit));

      const response = await get(`/governance/approvals?${params}`, signal);
      if (!response.ok) return problem(response);

      const body = (await response.json()) as Record<string, unknown>;
      const gaps: string[] = [];
      const page = readKeysetPage(body, (row) => {
        const read = readApprovalRow(row);
        gaps.push(...read.gaps);
        return read.row;
      });
      const counts = body.counts as Record<string, unknown> | undefined;

      return {
        ok: true,
        value: {
          page,
          // Absent counts stay absent. The header states the gap rather than
          // rendering zeros it was not given.
          counts:
            counts && typeof counts.pending === "number"
              ? {
                  pending: counts.pending,
                  overdue: typeof counts.overdue === "number" ? counts.overdue : 0,
                  dueSoon: typeof counts.due_soon === "number" ? counts.due_soon : 0,
                }
              : null,
        },
        warnings: gaps,
      };
    },

    async getGateR1(approvalId: string) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      const response = await get(`/governance/approvals/${encodeURIComponent(approvalId)}/r1`, signal);
      if (!response.ok) return problem(response);
      const detail = readGateR1Detail(await response.json());
      return detail
        ? { ok: true as const, value: detail, warnings: detail.gaps }
        : unavailable("The review response could not be read.");
    },

    async getGateR2(approvalId: string) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      const response = await get(`/governance/approvals/${encodeURIComponent(approvalId)}/r2`, signal);
      if (!response.ok) return problem(response);
      const detail = readGateR2Detail(await response.json());
      return detail
        ? { ok: true as const, value: detail, warnings: detail.gaps }
        : unavailable("The R2 review response could not be read.");
    },

    async getPaperExit(reviewId: string) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      const response = await get(`/governance/exit-reviews/${encodeURIComponent(reviewId)}`, signal);
      if (!response.ok) return problem(response);
      const detail = readPaperExitDetail(await response.json());
      return detail
        ? { ok: true as const, value: detail, warnings: detail.gaps }
        : unavailable("The exit review response could not be read.");
    },

    async planDecision(input) {
      // A governance decision is a Portal workflow write. R1 is the lowest tier
      // that covers an operational command, and planning one is gated the same
      // way applying it is — a plan the actor could never apply is a form that
      // wastes their time.
      const blocked = commandBlocked("R1");
      if (blocked) return unavailable(blocked);
      const response = await post(
        "/commands/plans",
        {
          command_type: "governance.approval.decide",
          request_key: input.requestKey,
          target: { approval_id: input.approvalId },
          expected_version: input.expectedVersion,
          payload: { decision: input.decision, reason: input.reason },
        },
        signal,
      );
      if (response.status === 409) {
        return { ok: false, status: "unavailable", reason: "REQUEST_KEY_CONFLICT: this key was used with a different payload." };
      }
      if (!response.ok) return problem(response);
      const body = (await response.json()) as Record<string, unknown>;
      const planId = typeof body.plan_id === "string" ? body.plan_id : null;
      return planId ? { ok: true, value: { planId } } : unavailable("The plan response carried no plan id.");
    },

    async applyPlan(planId: string, requestKey: string): Promise<Result<ApplyReceipt>> {
      const blocked = commandBlocked("R1");
      if (blocked) return unavailable(blocked);
      const response = await post(
        `/operations/${encodeURIComponent(planId)}/apply`,
        { request_key: requestKey },
        signal,
      );
      if (!response.ok && response.status !== 202) return problem(response);

      // Read with the status, so a body claiming SUCCEEDED alongside a 202 is
      // resolved the safe way — see `readOperation`.
      const op = readOperation(await response.json(), response.status);
      return op.operationId
        ? { ok: true, value: { operationId: op.operationId, receipt: op.receipt } }
        : unavailable("Apply was accepted but returned no operation id, so it cannot be verified.");
    },

    async pollOperation(operationId: string): Promise<Result<OperationSnapshot>> {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      const response = await get(`/operations/${encodeURIComponent(operationId)}`, signal);
      if (!response.ok) return problem(response);
      const body = (await response.json()) as Record<string, unknown>;
      const data = (body.data as Record<string, unknown>) ?? body;
      const verification = readEnum(data.verification_result, [
        "PENDING",
        "ACKNOWLEDGED",
        "SUCCEEDED",
        "FAILED",
        "DENIED",
        "PARTIAL",
        "UNCERTAIN",
        "EXPIRED",
      ] as const);
      return {
        ok: true,
        value: {
          status: typeof data.status === "string" ? data.status : null,
          // The raw token travels on even when unrecognised. `decision.ts`
          // keeps polling rather than naming an outcome it cannot read.
          verificationRaw: verification ? (verification.known ? verification.value : verification.raw) : null,
        },
      };
    },
  };
}
