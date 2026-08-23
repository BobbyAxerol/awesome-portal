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
import { commandBlockedReason, governanceWriteBlocked, type DeliveryPolicy } from "../profile";
import { readApprovalRow, readGateR1Detail, readGateR2Detail, readPaperExitDetail } from "./rows";
import {
  INSIGHT_BATCH_LIMIT,
  readAnalyticsEnvelope,
  readBindingExposure,
  readCapitalLedger,
  readCapitalPreview,
  readCorrelation,
  readInsightBatch,
  readOrderFunnel,
} from "../analytics";
import { analyticsFailureReason, readAnalyticsFailure } from "../analyticsProblem";
import { readCommandCatalogue } from "../adminCatalog";
import { readIncidentDetail, readOperationsQueue, readWorkflowResult } from "../operations";
import { readCanaryControlRoom, readSandboxCertification } from "../certification";
import { readLiveFullOperations } from "../liveFull";
import type { WorkflowResult } from "../operations";
import {
  commandPlanRequest,
  readCommandPlan,
  readPayloadRejection,
  readRelayDenial,
} from "../commandPlan";
import { toConditionWire } from "../conditionWire";
import type {
  ApplyReceipt,
  ExecutionApi,
  InboxQuery,
  InboxResult,
  OperationSnapshot,
  Result,
} from "./ports";
import { isPaperExitDecision, PAPER_EXIT_EXTENSION_DAYS, unavailable } from "./ports";
import type { CapitalPreviewInput, InsightBatchInput } from "./ports";
import type { components } from "@portal/contracts-analytics";
import type { components as GovernanceComponents } from "@portal/contracts-governance";

type PaperExitPlanRequest = GovernanceComponents["schemas"]["PaperExitDecisionPlanRequest"];
type InsightBatchRequest = components["schemas"]["InsightBatchRequest"];

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

/**
 * Double-submit CSRF (`GovernanceController.assertMutationSecurity`).
 *
 * The server requires three things of every mutation, and all three fail
 * closed with a 403: an allowed `Origin`, an `x-portal-csrf` header, and a
 * `__Host-portal_csrf` cookie whose value equals that header. The browser
 * sends the Origin and the cookie on its own; the header is the half only
 * script can add, which is exactly what makes the pair proof that a script on
 * this origin issued the request.
 *
 * The cookie is deliberately NOT `HttpOnly` — it is a token to be echoed, not
 * a secret. The secret is its hash, held in the session server-side.
 */
export const CSRF_COOKIE = "__Host-portal_csrf";
export const CSRF_HEADER = "x-portal-csrf";

export function csrfToken(cookieSource: string = typeof document === "undefined" ? "" : document.cookie): string | null {
  for (const part of cookieSource.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== CSRF_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const token = csrfToken();
  return fetch(`${BASE}${path}`, {
    method: "POST",
    signal,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      // Omitted rather than sent empty when there is no cookie: an empty header
      // is a token that fails comparison, and the 403 that follows would read
      // as "your token is wrong" instead of "you have no session".
      ...(token ? { [CSRF_HEADER]: token } : {}),
    },
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
  return {
    ok: false,
    status: panelStatusForHttp(response.status),
    reason: `${p.code}: ${p.message}`,
  };
}

/**
 * The failure path for an analytics endpoint.
 *
 * Separate from `problem` because the generic one resolves every 422 to
 * `unavailable` — correct for governance routes, which have no client-
 * correctable 422, and wrong for these six, where six of the seven codes are
 * exactly that. Routing analytics through the shared typed adapter is what
 * turns "backend unavailable" into "ask for fewer alphas".
 */
async function analyticsProblem(response: Response): Promise<Result<never>> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // A failure whose body is not JSON still has a status, and the adapter
    // fails closed on the code it cannot find.
  }
  const failure = readAnalyticsFailure(body, response.status);
  return {
    ok: false,
    status: failure.panelStatus,
    reason: analyticsFailureReason(failure),
  };
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

  /**
   * Acknowledge and resolve differ only in their body, and a 409 means the
   * same thing to both: the row moved while the operator was looking at it.
   * Written once because two copies would eventually disagree about that,
   * and the wrong half of that disagreement is a blind retry against a
   * record that has changed.
   */
  const triageMutation = async (
    path: string,
    body: unknown,
  ): Promise<Result<WorkflowResult>> => {
    const blocked = readBlocked();
    if (blocked) return unavailable(blocked);
    const response = await post(path, body, signal);
    if (response.status === 409) {
      return {
        ok: false,
        status: "stale",
        reason:
          "This operation changed while you were looking at it. Reload and review before deciding — repeating the request would apply a decision to a record that has moved.",
      };
    }
    if (!response.ok) return problem(response);
    const result = readWorkflowResult(await response.json());
    return result
      ? { ok: true as const, value: result }
      : unavailable("The triage response could not be read.");
  };

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
                  // Not zero. "0 overdue" is a claim that the queue is clear,
                  // and it is the one an operator most wants to be able to
                  // trust — so it must never be produced by an absent field.
                  overdue: typeof counts.overdue === "number" ? counts.overdue : null,
                  dueSoon: typeof counts.due_soon === "number" ? counts.due_soon : null,
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
      if (!response.ok) return analyticsProblem(response);
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

    async getSandboxCertification(deploymentId) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      const response = await get(
        `/deployments/${encodeURIComponent(deploymentId)}/certification`,
        signal,
      );
      if (!response.ok) return problem(response);
      const cert = readSandboxCertification(await response.json());
      return cert
        ? { ok: true as const, value: cert }
        : unavailable("The certification response could not be read.");
    },

    async getCanaryControlRoom(deploymentId) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      const response = await get(`/deployments/${encodeURIComponent(deploymentId)}/canary`, signal);
      if (!response.ok) return problem(response);
      const room = readCanaryControlRoom(await response.json());
      return room
        ? { ok: true as const, value: room }
        : unavailable("The canary control room response could not be read.");
    },

    async getLiveFullOperations(deploymentId) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      const response = await get(`/deployments/${encodeURIComponent(deploymentId)}/live`, signal);
      if (!response.ok) return problem(response);
      const live = readLiveFullOperations(await response.json());
      return live
        ? { ok: true as const, value: live }
        : unavailable("The live full operations response could not be read.");
    },

    async listOperations(query) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      if (query.after && query.before) {
        // BR-EX-17 again: one direction per request. The server would pick
        // otherwise, and a page whose direction the client did not choose is a
        // page it cannot place.
        return unavailable("A page cannot be requested in both directions at once.");
      }
      const params = new URLSearchParams();
      for (const [key, value] of [
        ["workspace_id", query.workspaceId],
        ["after", query.after],
        ["before", query.before],
        ["triage_state", query.triageState],
        ["environment", query.environment],
        ["source_status", query.sourceStatus],
      ] as const) {
        if (value) params.set(key, value);
      }
      if (query.limit) params.set("limit", String(query.limit));
      const qs = params.toString();
      const response = await get(`/operations${qs ? `?${qs}` : ""}`, signal);
      if (!response.ok) return problem(response);
      const queue = readOperationsQueue(await response.json());
      return queue
        ? { ok: true as const, value: queue }
        : unavailable("The operations queue response could not be read.");
    },

    async acknowledgeOperation(input) {
      return triageMutation(
        `/operations/${encodeURIComponent(input.operationId)}/acknowledge`,
        {
          schema_version: "execution.operation-acknowledge-request.v1",
          workspace_id: input.workspaceId,
          request_key: input.requestKey,
          expected_workflow_version: input.expectedWorkflowVersion,
        },
      );
    },

    async resolveOperation(input) {
      if (input.reason.trim().length < 8) {
        return unavailable("Resolving an operation needs a reason of at least eight characters.");
      }
      if (!input.evidenceHash.trim()) {
        return unavailable("Resolving an operation needs an evidence reference.");
      }
      return triageMutation(
        `/operations/${encodeURIComponent(input.operationId)}/resolve`,
        {
          schema_version: "execution.operation-resolve-request.v1",
          workspace_id: input.workspaceId,
          request_key: input.requestKey,
          expected_workflow_version: input.expectedWorkflowVersion,
          reason: input.reason,
          evidence_hash: input.evidenceHash,
        },
      );
    },

    async getIncident(incidentId, workspaceId) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : "";
      const response = await get(
        `/operations/incidents/${encodeURIComponent(incidentId)}${qs}`,
        signal,
      );
      if (!response.ok) return problem(response);
      const incident = readIncidentDetail(await response.json());
      return incident
        ? { ok: true as const, value: incident }
        : unavailable("The incident response could not be read.");
    },

    async planCommand(input) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);

      const body = commandPlanRequest(input);
      if (!body.ok) return unavailable(body.reason);

      const response = await post("/commands/plans", body.value, signal);

      // Checked before the generic problem mapper: a refused payload is the one
      // failure whose message must never reach the screen, and `problem` builds
      // its reason from exactly that message.
      if (response.status === 422) {
        const parsed = await response.json().catch(() => null);
        const rejection = readPayloadRejection(parsed, 422);
        if (rejection) {
          return { ok: false, status: "insufficient_data", reason: rejection.reason };
        }
        return { ok: false, status: "unavailable", reason: "This command could not be planned." };
      }
      if (response.status === 409) {
        // A key reused with a different payload. Never retried automatically:
        // the server is telling us two different intents share one key, and
        // repeating either would be choosing between them on the operator's
        // behalf.
        return {
          ok: false,
          status: "unavailable",
          reason:
            "REQUEST_KEY_CONFLICT: this request key was already used with a different payload. Start a new command rather than resending this one.",
        };
      }
      if (!response.ok) return problem(response);

      const plan = readCommandPlan(await response.json());
      return plan
        ? { ok: true as const, value: plan }
        : unavailable("The command plan response could not be read.");
    },

    async getCommandCatalogue(query) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      // Every filter is optional and server-owned. An entity target is always
      // the pair, never one half — a `target_id` with no `target_type` names
      // nothing the server can resolve.
      const params = new URLSearchParams();
      if (query?.workspaceId) params.set("workspace_id", query.workspaceId);
      if (query?.environment) params.set("environment", query.environment);
      if (query?.targetType && query?.targetId) {
        params.set("target_type", query.targetType);
        params.set("target_id", query.targetId);
      }
      if (query?.riskTier) params.set("risk_tier", query.riskTier);
      const qs = params.toString();
      const response = await get(`/commands/catalog${qs ? `?${qs}` : ""}`, signal);

      if (response.status === 403) {
        // An answer, not an outage. The reason names no entry and no count:
        // "you may not see this" must not become a way to learn its size.
        return {
          ok: false,
          status: "denied",
          reason: "The command catalogue is available to Admin operators only.",
        };
      }
      if (!response.ok) return problem(response);

      const catalogue = readCommandCatalogue(await response.json());
      return catalogue
        ? { ok: true as const, value: catalogue }
        : unavailable("The command catalogue response could not be read.");
    },

    /**
     * The five analytics reads.
     *
     * Each is the same four steps and they are written out rather than folded
     * into a helper, because the differences are the interesting part: which
     * reader parses the body, and whether the call carries one.
     *
     * `analyticsProblem` rather than `problem` throughout — six of the seven
     * codes these endpoints return are 422s the operator can act on, and the
     * generic mapper resolves every one of them to `unavailable`.
     *
     * Both the parsed object and the envelope, or neither. A figure without its
     * authority and freshness is an unattributed claim about money or risk, and
     * every screen downstream refuses to render one — so it is refused here,
     * where the reason can still be said.
     */
    async getOrderFunnel(orderId: string) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      const response = await get(`/orders/${encodeURIComponent(orderId)}/funnel`, signal);
      if (!response.ok) return analyticsProblem(response);
      const body = await response.json();
      const funnel = readOrderFunnel(body);
      const envelope = readAnalyticsEnvelope(body);
      return funnel && envelope
        ? { ok: true as const, value: { funnel, envelope } }
        : unavailable("The order funnel response could not be read.");
    },

    async getInsightBatch(alphaId: string, request: InsightBatchInput) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      // The server owns the 64 cap. Refused here rather than truncated,
      // because a client that quietly dropped items would answer a question
      // nobody asked and label it as the answer to the one they did.
      if (request.items.length > INSIGHT_BATCH_LIMIT) {
        return unavailable(
          `One batch carries at most ${INSIGHT_BATCH_LIMIT} items; this asked for ${request.items.length}. Ask in pages.`,
        );
      }
      const requestBody: InsightBatchRequest = {
        portfolio_id: request.portfolioId,
        items: request.items.map((item) => ({
          insight_id: item.insightId,
          alpha_id: item.alphaId,
        })),
      };
      const response = await post(
        `/alphas/${encodeURIComponent(alphaId)}/insight-previews`,
        requestBody,
        signal,
      );
      if (!response.ok) return analyticsProblem(response);
      const body = await response.json();
      // The expected portfolio is passed in so a batch computed for another one
      // cannot be rendered as this one's.
      const batch = readInsightBatch(body, request.portfolioId);
      const envelope = readAnalyticsEnvelope(body);
      return batch && envelope
        ? { ok: true as const, value: { batch, envelope } }
        : unavailable("The insight batch response could not be read.");
    },

    async getCorrelation(portfolioId: string) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      const response = await get(
        `/portfolios/${encodeURIComponent(portfolioId)}/correlation`,
        signal,
      );
      if (!response.ok) return analyticsProblem(response);
      const body = await response.json();
      const correlation = readCorrelation(body);
      const envelope = readAnalyticsEnvelope(body);
      return correlation && envelope
        ? { ok: true as const, value: { correlation, envelope } }
        : unavailable("The correlation response could not be read.");
    },

    async getCapitalLedger(portfolioId: string) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      const response = await get(
        `/portfolios/${encodeURIComponent(portfolioId)}/capital-ledger`,
        signal,
      );
      if (!response.ok) return analyticsProblem(response);
      const body = await response.json();
      const ledger = readCapitalLedger(body);
      const envelope = readAnalyticsEnvelope(body);
      return ledger && envelope
        ? { ok: true as const, value: { ledger, envelope } }
        : unavailable("The capital ledger response could not be read.");
    },

    async getBindingExposure(bindingId: string) {
      const blocked = readBlocked();
      if (blocked) return unavailable(blocked);
      const response = await get(
        `/broker-bindings/${encodeURIComponent(bindingId)}/exposure`,
        signal,
      );
      if (!response.ok) return analyticsProblem(response);
      const body = await response.json();
      const exposure = readBindingExposure(body);
      const envelope = readAnalyticsEnvelope(body);
      return exposure && envelope
        ? { ok: true as const, value: { exposure, envelope } }
        : unavailable("The binding exposure response could not be read.");
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
      // A governance decision is a Portal workflow write, not a Trading System
      // command — see `governanceWriteBlocked` for why those are different
      // permissions and what the registry still owes. Planning is gated the
      // same way applying is: a plan the actor could never apply is a form that
      // wastes their time.
      const blocked = governanceWriteBlocked(policy);
      if (blocked) return unavailable(blocked);

      // `expected_approval_version` is a required positive integer. Without one
      // there is nothing to be optimistic about, and inventing a version would
      // decide against a request that may have moved.
      // Bound to a local so the narrowing survives into the request bodies.
      // The original guard was correct at runtime and invisible to the type
      // system, which meant the generated contract could not be used to type
      // the payload at all — the check has to narrow, not merely reject.
      const expectedVersion = input.expectedApprovalVersion;
      if (expectedVersion === null || !Number.isInteger(expectedVersion) || expectedVersion <= 0) {
        return unavailable(
          "This request published no version to decide against, so a plan cannot be made safely.",
        );
      }
      // The schema refuses APPROVE_WITH_CONDITION without a condition, and
      // refuses a condition with anything else. Caught here so the reviewer
      // sees a sentence rather than a 422.
      // The schema's own floor is eight characters. Enforced here so the
      // reviewer reads a sentence instead of a 422 they cannot act on.
      if (input.reason.trim().length < 8) {
        return unavailable("A decision needs a reason of at least eight characters.");
      }
      // Conditions belong to the R1/R2 vocabulary only. Paper Exit has three
      // outcomes and no condition field at all.
      const supplied = input.conditions ?? [];
      if (isPaperExitDecision(input.decision) && supplied.length > 0) {
        return unavailable("A Paper Exit decision takes no conditions.");
      }
      const wantsCondition = input.decision === "APPROVE_WITH_CONDITION";
      if (wantsCondition && supplied.length === 0) {
        return unavailable("Approving with a condition requires the condition itself.");
      }
      if (!wantsCondition && supplied.length > 0) {
        return unavailable("Conditions may only accompany approve-with-condition.");
      }
      // Converted here rather than at the call site so every screen that plans
      // a decision gets the same checks and the same sentences.
      const conditionWire = toConditionWire(supplied);
      if (!conditionWire.ok) return unavailable(conditionWire.reason);

      // ONE route, discriminated by body shape.
      //
      // `GovernanceController.plan` is mounted at `POST /commands/plans` and
      // tries `PaperExitDecisionPlanRequestSchema` first, falling back to
      // `DecisionPlanRequestSchema`. There is no
      // `/governance/approvals/{id}/decision-plans` — this adapter invented it,
      // and every R1 and R2 decision would have 404ed. Corrected against
      // `apps/control-api/src/governance/governance.controller.ts`.
      const decision = input.decision;
      // Typed against the generated declaration, so a field rename upstream
      // fails to compile here rather than 422ing in a browser. The R1 branch
      // has no generated counterpart to bind to — its schema lives in the
      // Control API as zod and is not published as OpenAPI — which is worth
      // knowing and is why only one of these two carries a type.
      const planBody: PaperExitPlanRequest | Record<string, unknown> = isPaperExitDecision(decision)
        ? ({
            schema_version: "governance.paper-exit-decision-plan-request.v1",
            workspace_id: input.workspaceId,
            request_key: input.requestKey,
            command_type: "GOVERNANCE_PAPER_EXIT_DECISION",
            command_version: 1,
            target: { review_id: input.approvalId },
            expected_review_version: expectedVersion,
            payload: {
              decision,
              reason: input.reason,
              // The schema pins this: exactly 14 for an extension, exactly null
              // for anything else. Sending 0, or omitting it, is a 422.
              extension_days: decision === "EXTEND_OBSERVATION" ? PAPER_EXIT_EXTENSION_DAYS : null,
              evidence_hashes: [...(input.evidenceHashes ?? [])],
            },
          } satisfies PaperExitPlanRequest)
        : {
            schema_version: "governance.r1-decision-plan-request.v1",
            workspace_id: input.workspaceId,
            request_key: input.requestKey,
            command_type: "GOVERNANCE_R1_DECISION",
            command_version: 1,
            target: { approval_id: input.approvalId },
            expected_approval_version: expectedVersion,
            payload: {
              decision: input.decision,
              reason: input.reason,
              ...(wantsCondition ? { conditions: conditionWire.value } : {}),
              evidence_hashes: [...(input.evidenceHashes ?? [])],
            },
          };

      const response = await post("/commands/plans", planBody, signal);
      if (response.status === 409) {
        // Two different 409s reach this route and they need different words. A
        // request-key conflict means this key was used with another payload —
        // the operator's own retry, changed. A version conflict means somebody
        // else decided first. Telling a reviewer to "reload and decide again"
        // for the first is wrong, and telling them their key clashed for the
        // second sends them looking at the wrong thing.
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const code = [body.type, body.code, body.title]
          .filter((v): v is string => typeof v === "string")
          .join(" ")
          .toLowerCase();
        if (code.includes("request_key") || code.includes("request-key")) {
          return {
            ok: false,
            status: "unavailable",
            reason: "REQUEST_KEY_CONFLICT: this key was used with a different payload.",
          };
        }
        if (code.includes("version")) {
          return {
            ok: false,
            status: "stale",
            reason:
              "This request was decided or changed while the plan was being made. Reload to see the current state before deciding.",
          };
        }
        return problem(response);
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
      const blocked = governanceWriteBlocked(policy);
      if (blocked) return unavailable(blocked);
      // `/operations/...`, NOT `/governance/operations/...`. The controller
      // mounts these two under the base path directly, and the extra segment
      // made both 404 — the same defect the plan route carried, fixed there and
      // missed here. The OpenAPI agrees:
      // `/api/v1/execution/operations/{operation_id}/apply`.
      const response = await post(
        `/operations/${encodeURIComponent(operationId)}/apply`,
        {
          schema_version: "governance.r1-decision-apply-request.v1",
          workspace_id: workspaceId,
          apply_token: applyToken,
        },
        signal,
      );
      if (response.status === 409) {
        // `RelayDenied`. Routed before the generic mapper because the two facts
        // that matter — whether a retry is permitted, and whether anything
        // reached the Trading System — live in the body and `problem` reads
        // only the code and message.
        const denial = readRelayDenial(await response.json().catch(() => null));
        if (denial) {
          return {
            ok: false,
            // Not `unavailable`: the system answered. It refused.
            status: denial.sourceRequestSent ? "terminal" : "denied",
            reason: denial.text,
          };
        }
      }
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
          // The contract publishes twelve fields and this read two of them.
          // `blockers` is the one that matters most: it is the difference
          // between "stopped" and "stopped because the relay is disabled".
          blockers: Array.isArray(data.blockers)
            ? data.blockers.filter((b): b is string => typeof b === "string")
            : [],
          relayReceipt: typeof data.relay_receipt === "string" ? data.relay_receipt : null,
          // `!== false`: an unreadable flag must not report that nothing
          // reached the Trading System.
          sourceSideEffectRequested: data.source_side_effect_requested !== false,
        },
      };
    },
  };
}
