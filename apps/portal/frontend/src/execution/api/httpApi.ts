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
  readKeysetPage,
  readOperation,
  readProblem,
} from "../adapter";
import type { RiskTier } from "../contracts";
import { commandBlockedReason, type DeliveryPolicy } from "../profile";
import { readApprovalRow, readGateR1Detail, readGateR2Detail, readPaperExitDetail } from "./rows";
import { readAnalyticsEnvelope, readCapitalPreview } from "../analytics";
import type {
  ApplyReceipt,
  ExecutionApi,
  InboxQuery,
  InboxResult,
  OperationSnapshot,
  Result,
} from "./ports";
import { unavailable } from "./ports";
import type { CapitalPreviewInput } from "./ports";
import type { components } from "@portal/contracts-analytics";

type CapitalPreviewRequest = components["schemas"]["CapitalPreviewRequest"];

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

      // `view`, not `filter`. The BFF reads `raw.view` and falls back to
      // "INBOX" for anything it does not recognise
      // (`governance/contracts.ts` approvalListQuery), so sending the wrong
      // name silently served the inbox for every chip — an operator pressing
      // "Overdue" got a list that looked right and was not.
      const params = new URLSearchParams({ view: query.filter });
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
          // Its own query when the endpoint offers one; absent is not empty.
          decided: null,
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

    async getCapitalPreview(approvalId: string, request: CapitalPreviewInput) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      // Typed against the generated schema, so a field rename upstream fails to
      // compile here rather than 400ing in a browser. This call was a GET with
      // a query string until the generated types were read; the operation is a
      // POST and the difference is a 405.
      const requestBody: CapitalPreviewRequest = {
        portfolio_id: request.portfolioId,
        requested_amount: request.requestedAmount,
        currency: request.currency,
      };
      const response = await post(
        `/approvals/${encodeURIComponent(approvalId)}/capital-preview`,
        requestBody,
        signal,
      );
      if (!response.ok) return problem(response);
      const body = await response.json();
      const preview = readCapitalPreview(body);
      const envelope = readAnalyticsEnvelope(body);
      // Both or neither. A preview without its envelope is an unattributed
      // claim about money, and Gate R2 refuses to render one either way — so
      // it is refused here, where the reason can still be stated.
      return preview && envelope
        ? { ok: true as const, value: { preview, envelope } }
        : unavailable("The capital preview response could not be read.");
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

      // `expected_approval_version` is a required positive integer. Without one
      // there is nothing to be optimistic about, and inventing a version would
      // decide against a request that may have moved.
      if (!Number.isInteger(input.expectedApprovalVersion) || (input.expectedApprovalVersion ?? 0) <= 0) {
        return unavailable(
          "This request published no version to decide against, so a plan cannot be made safely.",
        );
      }
      // The schema refuses APPROVE_WITH_CONDITION without a condition, and
      // refuses a condition with anything else. Caught here so the reviewer
      // sees a sentence rather than a 422.
      const wantsCondition = input.decision === "APPROVE_WITH_CONDITION";
      const condition = input.condition?.trim() ?? "";
      if (wantsCondition && condition.length < 8) {
        return unavailable("Approving with a condition requires the condition itself.");
      }
      if (!wantsCondition && condition.length > 0) {
        return unavailable("A condition may only accompany approve-with-condition.");
      }

      const response = await post(
        `/governance/approvals/${encodeURIComponent(input.approvalId)}/decision-plans`,
        {
          schema_version: "governance.r1-decision-plan-request.v1",
          workspace_id: input.workspaceId,
          request_key: input.requestKey,
          command_type: "GOVERNANCE_R1_DECISION",
          command_version: 1,
          target: { approval_id: input.approvalId },
          expected_approval_version: input.expectedApprovalVersion,
          payload: {
            decision: input.decision,
            reason: input.reason,
            ...(wantsCondition ? { condition } : {}),
            evidence_hashes: [...(input.evidenceHashes ?? [])],
          },
        },
        signal,
      );
      if (response.status === 409) {
        // Distinguished from every other 409 by the published problem type,
        // not by assuming what a 409 on this route must mean.
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const code = typeof body.type === "string" ? body.type : "";
        return {
          ok: false,
          status: "unavailable",
          reason: code.includes("request-key")
            ? "REQUEST_KEY_CONFLICT: this key was used with a different payload."
            : `The approval moved while this plan was being made. ${code || "Reload and decide again."}`,
        };
      }
      if (!response.ok) return problem(response);
      const body = (await response.json()) as Record<string, unknown>;
      const operationId = typeof body.operation_id === "string" ? body.operation_id : null;
      if (!operationId) return unavailable("The plan response carried no operation id.");
      const list = (raw: unknown) =>
        Array.isArray(raw)
          ? raw.flatMap((entry) => {
              const code = (entry as Record<string, unknown> | null)?.code;
              return typeof code === "string" ? [{ code }] : [];
            })
          : [];
      return {
        ok: true,
        value: {
          operationId,
          applyToken: typeof body.apply_token === "string" ? body.apply_token : null,
          blockers: list(body.blockers),
          warnings: list(body.warnings),
          expectedApprovalVersion:
            typeof body.expected_approval_version === "number"
              ? body.expected_approval_version
              : null,
          riskTier: typeof body.risk_tier === "string" ? body.risk_tier : null,
        },
      };
    },

    async applyPlan(
      operationId: string,
      applyToken: string,
      workspaceId: string,
    ): Promise<Result<ApplyReceipt>> {
      const blocked = commandBlocked("R1");
      if (blocked) return unavailable(blocked);
      const response = await post(
        `/governance/operations/${encodeURIComponent(operationId)}/apply`,
        {
          schema_version: "governance.r1-decision-apply-request.v1",
          workspace_id: workspaceId,
          apply_token: applyToken,
        },
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
      const response = await get(
        `/governance/operations/${encodeURIComponent(operationId)}`,
        signal,
      );
      if (!response.ok) return problem(response);
      const body = (await response.json()) as Record<string, unknown>;
      const data = (body.data as Record<string, unknown>) ?? body;
      // The endpoint publishes `status` ∈ {PENDING, SUCCEEDED, EXPIRED} and no
      // `verification_result` at all. Reading the latter meant the token was
      // always absent, the walk never left "unknown", and a decision that had
      // actually succeeded was never reported as succeeded. `verification_result`
      // is read first only so this keeps working the day the richer field is
      // published (audit H8 asks for both).
      const raw =
        typeof data.verification_result === "string"
          ? data.verification_result
          : typeof data.status === "string"
            ? data.status
            : null;
      return {
        ok: true,
        value: {
          status: typeof data.status === "string" ? data.status : null,
          verificationRaw: raw,
        },
      };
    },
  };
}
