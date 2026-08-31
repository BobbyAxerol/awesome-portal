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
import CC_SNAPSHOT_BUSY from "../../../../../../packages/contracts/fixtures/execution-command-center.busy.valid.json";
import PAPER_OVERVIEW_READY from "../../../../../../packages/contracts/fixtures/execution-paper-overview.ready.valid.json";
import SANDBOX_OVERVIEW_READY from "../../../../../../packages/contracts/fixtures/execution-sandbox-overview.ready.valid.json";
import LIVE_OVERVIEW_EMPTY from "../../../../../../packages/contracts/fixtures/execution-live-overview.empty.valid.json";
import FULL_BLOTTER_PARTIAL from "../../../../../../packages/contracts/fixtures/execution-full-blotter.partial.valid.json";
import PAPER_WORKBENCH_PARTIAL from "../../../../../../packages/contracts/fixtures/execution-paper-workbench.partial.valid.json";
import PAPER_WORKBENCH_VNM_PARTIAL from "../../../../../../packages/contracts/fixtures/execution-paper-workbench-vnm.partial.valid.json";
import QUERY_ANALYTICS_EMPTY from "../../../../../../packages/contracts/fixtures/execution-query-analytics.empty.valid.json";
import COMMAND_TASKS from "../../../../../../packages/contracts/fixtures/execution-command-tasks.valid.json";
import ALPHA_FLEET from "../../../../../../packages/contracts/fixtures/execution-alpha-fleet-list.valid.json";
import BINDINGS_LIST from "../../../../../../packages/contracts/fixtures/execution-bindings-list.valid.json";
import BINDING_DETAIL from "../../../../../../packages/contracts/fixtures/execution-binding-detail.valid.json";
import LIVE_REVIEW from "../../../../../../packages/contracts/fixtures/governance-live-review.valid.json";
import { readKeysetPage } from "../adapter";
import { APPROVAL_ROWS, CONDITION_FIXTURES, EXIT_DETAIL, R1_DETAIL, R2_DETAIL, matchesView } from "./fixtureData";
import {
  readAlphaFleet, readBindingDetail, readBindings, readLiveReview,
  readOperatorTasks, readProfileEnvelope, readQueryAnalytics,
} from "./profileRead";
import type {
  AlphaFleetItem, BindingItem, LiveReviewPayload, ManagerListEnvelope,
  OperatorTaskCatalogue, ProfileEnvelope, QueryAnalytics,
} from "./profileRead";
import { readApprovalRow, readGateR1Detail, readGateR2Detail, readPaperExitDetail, readDecidedRow, readApprovalCreated, readConditionsPage } from "./rows";
import {
  readAnalyticsEnvelope,
  readBindingExposure,
  readCapitalLedger,
  readCapitalPreview,
  readCorrelation,
  readInsightBatch,
  readOrderFunnel,
} from "../analytics";
import { readCommandCatalogue } from "../adminCatalog";
import { readIncidentDetail, readOperationsQueue, readWorkflowResult } from "../operations";
import { readCanaryControlRoom, readSandboxCertification } from "../certification";
import { CANARY_ROOM_FIXTURE, LIVE_FULL_FIXTURE, SANDBOX_CERTIFICATION_FIXTURE } from "../certification.fixtures";
import { readLiveFullOperations } from "../liveFull";
import {
  INCIDENT_OPEN_FIXTURE,
  INCIDENT_RESOLVED_FIXTURE,
  OPERATIONS_QUEUE_FIXTURE,
  OPERATION_WORKFLOW_FIXTURE,
} from "../operations.fixtures";
import { commandPlanRequest, readCommandPlan } from "../commandPlan";
import { COMMAND_PLAN_FIXTURE } from "../adminCatalog.fixtures";
import { COMMAND_CATALOGUE_FIXTURE } from "../adminCatalog.fixtures";
import {
  CAPITAL_LEDGER,
  CAPITAL_PREVIEW_BREACH,
  CAPITAL_PREVIEW_OK,
  CAPITAL_PREVIEW_STALE,
  CORRELATION_ABOVE_LIMIT,
  CORRELATION_AT_LIMIT,
  EXPOSURE_COMPLETE,
  FUNNEL_BOUNDED,
  FUNNEL_COMPLETE,
  INSIGHT_BATCH_FULL,
  INSIGHT_BATCH_MIXED,
} from "../analytics.presentation.fixtures";
import type {
  ApplyReceipt,
  ExecutionApi,
  InboxQuery,
  InboxResult,
  OperationSnapshot,
  Result,
  ApprovalCreateInput,
  ApprovalCreateOutcome,
  AlphaFleetQuery,
  BindingListQuery,
  ConditionsPage,
  WaiverQuery,
} from "./ports";
import { unavailable } from "./ports";
import type { CapitalPreviewInput, InsightBatchInput, DecisionPlan } from "./ports";

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

/**
 * Recently decided — `governance.approval-history.v1` rows (the canonical
 * fixture `execution-governance.approval-history.valid.json` is the shape
 * authority; these three are the hi-fi/cast entries in that shape). The old
 * fixture reused the pending-row shape and parked the outcome inside
 * `blocker_summary`; it also lost AP-341 entirely.
 */
const DECIDED_ROWS: Record<string, unknown>[] = [
  {
    id: "dec_341", approval_id: "AP-341", gate: "R1", subject_id: "av_grid22",
    subject: "Grid v2.2 · RC-49", outcome: "CHANGES_REQUESTED",
    decided_by: { user_id: "usr_minh", username: "Minh" }, decided_at: "2026-08-14T09:00:00Z",
    policy_version: "approval.v3",
    evidence_digest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    approval_version: 2,
  },
  {
    id: "dec_259", approval_id: "AP-259", gate: "R2", subject_id: "av_mm11",
    subject: "MM v1.1 → OKX sandbox", outcome: "APPROVED_WITH_CONDITION",
    decided_by: { user_id: "usr_lan", username: "Lan" }, decided_at: "2026-07-18T14:30:00Z",
    policy_version: "approval.v3",
    evidence_digest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    approval_version: 3,
  },
  {
    id: "dec_px31", approval_id: "PX-31", gate: "PAPER_EXIT", subject_id: "av_mm11",
    subject: "MM v1.1", outcome: "APPROVED",
    decided_by: { user_id: "usr_lan", username: "Lan" }, decided_at: "2026-07-15T10:00:00Z",
    policy_version: "approval.v3",
    evidence_digest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    approval_version: 2,
  },
];

/* Shaped per `EX_BE_05A_GOVERNANCE_EVIDENCE_APPROVAL.md` §5: the detail nests
 * under `data.approval`, the passport is `evidence_manifest.entries[]`, the
 * locks sit under `eligibility`, and the decision in force is the last entry of
 * `decisions[]`. */

/* Wire-shaped, per master plan §10.3. Every capital row names its currency:
 * a strip that implies one number is wrong the moment a portfolio holds two. */


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
  /** Serve the engine's ineligible preview, so the R2 lock is reachable. */
  stalePreview?: boolean;
  /** Blocker codes the plan comes back with. A blocked plan issues no token. */
  planBlockers?: readonly string[];
  /** Serve the funnel whose window is bounded at 4,180 events. */
  boundedFunnel?: boolean;
  /** Serve the batch that carries errors beside ready items. */
  mixedInsights?: boolean;
  /** Serve the correlation that exceeds the packed transport limit. */
  correlationAboveLimit?: boolean;
  /** Serve the resolved incident rather than the open one. */
  resolvedIncident?: boolean;
}

/**
 * The amount the fixture engine answers with a ceiling breach.
 *
 * A constant rather than a magic string so the screen, the fixture and the
 * tests agree on which request trips it.
 */
export const BREACHING_AMOUNT = "600";

/* ── N29 governance consumer — fixture semantics ─────────────────────────────
 * Mirrors the server rules the handoff states: request-key replay, changed-key
 * 409, duplicate open alpha/run rejected WITH the existing approval id, ids
 * validated against the server-owned registries (unknown → 422). State lives
 * at module scope so a retry after navigation still replays.
 */
const CREATE_KNOWN = {
  alphas: new Set(["carry", "grid", "vnmomo"]),
  runs: new Set(["run_5512", "run_5320"]),
  claims: new Set(["clm_31", "clm_29"]),
};
/** Open R1 work in the cast: carry × run_5512 is already AP-201. */
const CREATE_OPEN: ReadonlyMap<string, string> = new Map([["carry|run_5512", "AP-201"]]);
const CREATE_BY_KEY = new Map<string, { payload: string; approvalId: string }>();
let CREATE_SEQ = 400;

/** The register the GET serves — the cast's obligations in contract shape. */

const CREATE_APPROVAL_BASE = {
  gate: "R1", subject_type: "ALPHA_VERSION", release_candidate: null, environment: "RESEARCH",
  target_label: "R1", requester: { user_id: "usr_lan", username: "Lan" }, creator: { user_id: "usr_lan", username: "Lan" },
  status: "PENDING", policy_version: "approval.v3", quorum_met: 0, quorum_required: 1, approval_version: 1,
  evidence_set_hash: "sha256:41bb7d000000000000000000000000000000000000000000000000000000c4aa",
  evidence_complete: true, blocker_count: 0, blocker_summary: null,
  sla_due_at: "2026-09-01T12:00:00.000Z", expires_at: "2026-09-03T12:00:00.000Z",
  created_at: "2026-08-31T12:00:00.000Z", updated_at: "2026-08-31T12:00:00.000Z",
} as const;

export function createFixtureApi(options: FixtureApiOptions = {}): ExecutionApi {
  const down = new Set(options.unavailableEndpoints ?? []);
  let polls = 0;

  function gate<T>(name: keyof ExecutionApi): Result<T> | null {
    return down.has(name)
      ? unavailable(`\`${name}\` is not wired to a real endpoint yet.`)
      : null;
  }

  const fixtureRead = <T>(raw: unknown, reader: (r: unknown) => T | null, what: string): Result<T> => {
    const value = reader(raw);
    return value !== null && value !== undefined ? { ok: true as const, value } : unavailable(`${what} fixture could not be read.`);
  };

  const liveReviewFixture = (approvalId: string): unknown => {
    const backbone = LIVE_REVIEW.governance_backbone as Record<string, unknown>;
    const data = backbone.data as Record<string, unknown>;
    const approval = data.approval as Record<string, unknown>;
    return {
      ...LIVE_REVIEW,
      approval_id: approvalId,
      governance_backbone: {
        ...backbone,
        data: { ...data, approval: { ...approval, approval_id: approvalId } },
      },
    };
  };

  return {
    /* N29-FE-01 lab/test port — serves the canonical contract fixtures. */
    async getCommandCenterSnapshot() {
      const blocked = gate<unknown>("getCommandCenterSnapshot");
      if (blocked) return blocked;
      return { ok: true as const, value: CC_SNAPSHOT_BUSY as unknown };
    },
    async getScreenProfile(screenName: "paper" | "sandbox" | "live" | "blotter") {
      const blocked = gate<ProfileEnvelope>("getScreenProfile");
      if (blocked) return blocked;
      const raw = screenName === "paper" ? PAPER_OVERVIEW_READY : screenName === "sandbox" ? SANDBOX_OVERVIEW_READY : screenName === "live" ? LIVE_OVERVIEW_EMPTY : FULL_BLOTTER_PARTIAL;
      return fixtureRead(raw, readProfileEnvelope, `The ${screenName} overview`);
    },
    async getPaperWorkbenchProfile(_deploymentId: string, variant: "paper" | "vnm" = "paper") {
      const blocked = gate<ProfileEnvelope>("getPaperWorkbenchProfile");
      if (blocked) return blocked;
      return fixtureRead(variant === "vnm" ? PAPER_WORKBENCH_VNM_PARTIAL : PAPER_WORKBENCH_PARTIAL, readProfileEnvelope, "The paper workbench");
    },
    async getQueryAnalytics(_subject: "alphas" | "portfolios", _subjectId: string) {
      const blocked = gate<QueryAnalytics>("getQueryAnalytics");
      if (blocked) return blocked;
      return fixtureRead(QUERY_ANALYTICS_EMPTY, readQueryAnalytics, "The query-analytics envelope");
    },
    async getOperatorTasks() {
      const blocked = gate<OperatorTaskCatalogue>("getOperatorTasks");
      if (blocked) return blocked;
      return fixtureRead(COMMAND_TASKS, readOperatorTasks, "The operator task catalogue");
    },
    async getLiveReview(approvalId: string) {
      const blocked = gate<LiveReviewPayload>("getLiveReview");
      if (blocked) return blocked;
      return fixtureRead(
        liveReviewFixture(approvalId),
        readLiveReview,
        "The live review",
      );
    },
    async getAccountBroker360(_accountId: string) {
      return unavailable("N28_FULL_EXPOSURE_POPULATION_NOT_PUBLISHED: the full exposure population is not published; this screen stays typed unavailable.");
    },
    async getAlphaFleet(_query: AlphaFleetQuery = {}): Promise<Result<ManagerListEnvelope<AlphaFleetItem>>> {
      const blocked = gate<ManagerListEnvelope<AlphaFleetItem>>("getAlphaFleet");
      return blocked ?? fixtureRead(ALPHA_FLEET, readAlphaFleet, "The Alpha Fleet");
    },
    async getBindings(_query: BindingListQuery = {}): Promise<Result<ManagerListEnvelope<BindingItem>>> {
      const blocked = gate<ManagerListEnvelope<BindingItem>>("getBindings");
      return blocked ?? fixtureRead(BINDINGS_LIST, readBindings, "The bindings register");
    },
    async getBindingDetail(bindingId: string, _environment = "paper"): Promise<Result<BindingItem>> {
      const blocked = gate<BindingItem>("getBindingDetail");
      return blocked ?? fixtureRead(
        { ...BINDING_DETAIL, item: { ...BINDING_DETAIL.item, binding_id: bindingId } },
        readBindingDetail,
        "The binding detail",
      );
    },
    async createApprovalRequest(input: ApprovalCreateInput): Promise<ApprovalCreateOutcome> {
      const blocked = gate<never>("createApprovalRequest");
      if (blocked && !blocked.ok) return { kind: "failed", status: blocked.status, reason: blocked.reason };
      const payload = JSON.stringify([input.alphaId, input.evidenceRunId, input.methodologyClaimId, input.summary]);
      const byKey = CREATE_BY_KEY.get(input.requestKey);
      if (byKey) {
        if (byKey.payload !== payload) {
          return { kind: "failed", status: "unavailable", reason: "REQUEST_KEY_REUSED: this request key was already used for a different payload (409). Start a new submit intent." };
        }
        return readApprovalCreated({ schema_version: "governance.approval-create.v1", replayed: true, approval: { ...CREATE_APPROVAL_BASE, approval_id: byKey.approvalId, subject_id: input.alphaId, subject_label: input.alphaId } })!;
      }
      const missing = [
        !CREATE_KNOWN.alphas.has(input.alphaId) ? `alpha_id ${input.alphaId}` : null,
        !CREATE_KNOWN.runs.has(input.evidenceRunId) ? `evidence_run_id ${input.evidenceRunId}` : null,
        !CREATE_KNOWN.claims.has(input.methodologyClaimId) ? `methodology_claim_id ${input.methodologyClaimId}` : null,
      ].filter((x): x is string => x !== null);
      if (missing.length > 0) {
        return { kind: "failed", status: "unavailable", reason: `UNKNOWN_REGISTRY_ID: ${missing.join(" · ")} is not in the server-owned registry (422).` };
      }
      if (input.summary.trim().length < 8) {
        return { kind: "failed", status: "unavailable", reason: "SUMMARY_TOO_SHORT: the summary is the reviewer's first sentence (422)." };
      }
      const dup = CREATE_OPEN.get(`${input.alphaId}|${input.evidenceRunId}`);
      if (dup) {
        return { kind: "duplicate", existingApprovalId: dup, reason: `Open R1 work already exists for ${input.alphaId} × ${input.evidenceRunId} — decide ${dup} instead of opening a twin.` };
      }
      CREATE_SEQ += 1;
      const approvalId = `AP-${CREATE_SEQ}`;
      CREATE_BY_KEY.set(input.requestKey, { payload, approvalId });
      return readApprovalCreated({ schema_version: "governance.approval-create.v1", replayed: false, approval: { ...CREATE_APPROVAL_BASE, approval_id: approvalId, subject_id: input.alphaId, subject_label: input.alphaId } })!;
    },

    async getWaivers(query: WaiverQuery = {}): Promise<Result<ConditionsPage>> {
      const blocked = gate<ConditionsPage>("getWaivers");
      if (blocked) return blocked;
      if (query.after && query.before) {
        return unavailable("A page cannot be requested in both directions at once.");
      }
      const filtered = CONDITION_FIXTURES.filter((c) => !query.state || c.state === query.state);
      const ids = filtered.map((c) => c.condition_id as string);
      let start = 0;
      let end = filtered.length;
      const limit = query.limit ?? 50;
      if (query.after) start = ids.indexOf(query.after) + 1;
      if (query.before) { end = ids.indexOf(query.before); start = Math.max(0, end - limit); }
      const window = filtered.slice(start, Math.min(end, start + limit));
      const page = readConditionsPage({
        schema_version: "governance.conditions-register.v1",
        record_authority: "PORTAL_CONTROL",
        delivery_profile: "portal",
        read_at: "2026-08-31T12:00:00.000Z",
        actor: { user_id: "usr_bobby", username: "bobby", roles: ["ADMIN"] },
        page: {
          rows: window,
          total_count: CONDITION_FIXTURES.length,
          filtered_count: filtered.length,
          next_cursor: start + window.length < filtered.length ? (window[window.length - 1]?.condition_id as string) ?? null : null,
          prev_cursor: start > 0 ? (window[0]?.condition_id as string) ?? null : null,
          has_more: start + window.length < filtered.length,
          has_previous: start > 0,
          applied_filters: [],
          applied_sort: [],
        },
      });
      return page ? { ok: true as const, value: page } : unavailable("The conditions-register fixture could not be read.");
    },

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
            { field: "sla_due_at", direction: "asc" },
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
          counts: {
            pending: APPROVAL_ROWS.length,
            overdue: 1,
            dueSoon: 1,
            // The hi-fi's "Mine (3)": counted over the whole queue, not the view.
            mine: APPROVAL_ROWS.filter((r) => r.needs_you === true && r.inert == null).length,
          },
          // Counted over the whole filter, not the page: that is what makes a
          // dropped separation-of-duty row visible.
          // Counted over the view, so a filter that drops separation-of-duty
          // rows makes the count and the rows disagree in public.
          inertCount: inView.filter((r) => r.inert !== null).length,
          decided: readKeysetPage(
            { rows: DECIDED_ROWS, total_count: DECIDED_ROWS.length, filtered_count: DECIDED_ROWS.length },
            (row) => readDecidedRow(row).row,
          ),
          // The cast's reviewer, in the workflow contract's actor shape.
          actor: { username: "Lan", roles: ["Quant Reviewer", "Ops Approver"] },
          policyVersion: "approval.v3",
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

    async getSandboxCertification() {
      const blocked = gate<never>("getSandboxCertification");
      if (blocked) return blocked as Result<never>;
      const cert = readSandboxCertification(SANDBOX_CERTIFICATION_FIXTURE);
      return cert
        ? { ok: true as const, value: cert }
        : unavailable("The certification response could not be read.");
    },

    async getCanaryControlRoom() {
      const blocked = gate<never>("getCanaryControlRoom");
      if (blocked) return blocked as Result<never>;
      const room = readCanaryControlRoom(CANARY_ROOM_FIXTURE);
      return room
        ? { ok: true as const, value: room }
        : unavailable("The canary control room response could not be read.");
    },

    async getLiveFullOperations() {
      const blocked = gate<never>("getLiveFullOperations");
      if (blocked) return blocked as Result<never>;
      const live = readLiveFullOperations(LIVE_FULL_FIXTURE);
      return live
        ? { ok: true as const, value: live }
        : unavailable("The live full operations response could not be read.");
    },

    async listOperations(query) {
      const blocked = gate<never>("listOperations");
      if (blocked) return blocked as Result<never>;
      if (query.after && query.before) {
        return unavailable("A page cannot be requested in both directions at once.");
      }
      const queue = readOperationsQueue(OPERATIONS_QUEUE_FIXTURE);
      return queue
        ? { ok: true as const, value: queue }
        : unavailable("The operations queue response could not be read.");
    },

    async acknowledgeOperation() {
      const blocked = gate<never>("acknowledgeOperation");
      if (blocked) return blocked as Result<never>;
      const result = readWorkflowResult(OPERATION_WORKFLOW_FIXTURE);
      return result
        ? { ok: true as const, value: result }
        : unavailable("The triage response could not be read.");
    },

    async resolveOperation(input) {
      const blocked = gate<never>("resolveOperation");
      if (blocked) return blocked as Result<never>;
      // The same floors the HTTP adapter enforces, so a screen tested against
      // fixtures cannot pass a request the real endpoint would refuse.
      if (input.reason.trim().length < 8) {
        return unavailable("Resolving an operation needs a reason of at least eight characters.");
      }
      if (!input.evidenceHash.trim()) {
        return unavailable("Resolving an operation needs an evidence reference.");
      }
      const result = readWorkflowResult(OPERATION_WORKFLOW_FIXTURE);
      return result
        ? { ok: true as const, value: result }
        : unavailable("The triage response could not be read.");
    },

    async getIncident() {
      const blocked = gate<never>("getIncident");
      if (blocked) return blocked as Result<never>;
      const source = options.resolvedIncident ? INCIDENT_RESOLVED_FIXTURE : INCIDENT_OPEN_FIXTURE;
      const incident = readIncidentDetail(source);
      return incident
        ? { ok: true as const, value: incident }
        : unavailable("The incident response could not be read.");
    },

    async planCommand(input) {
      const blocked = gate<never>("planCommand");
      if (blocked) return blocked as Result<never>;
      const body = commandPlanRequest(input);
      if (!body.ok) return unavailable(body.reason);
      // The canonical F0 document: BLOCKED, no token, relay DISABLED. Serving a
      // friendlier one here would let the drawer be built against a plan the
      // server never produces.
      const plan = readCommandPlan({
        ...COMMAND_PLAN_FIXTURE,
        command_key: input.commandKey,
      });
      return plan
        ? { ok: true as const, value: plan }
        : unavailable("The command plan response could not be read.");
    },

    async getCommandCatalogue(query) {
      const blocked = gate<never>("getCommandCatalogue");
      if (blocked) return blocked as Result<never>;
      if (query?.riskTier) {
        // Narrowed the way the server would, so the screen's chips exercise a
        // real re-query rather than a filter the fixture pretends to apply.
        // `returned_entries` moves with the rows; `total_entries` does not.
        const all = COMMAND_CATALOGUE_FIXTURE.entries.filter(
          (e) => e.risk_tier === query.riskTier,
        );
        const narrowed = readCommandCatalogue({
          ...COMMAND_CATALOGUE_FIXTURE,
          returned_entries: all.length,
          entries: all,
        });
        return narrowed
          ? { ok: true as const, value: narrowed }
          : unavailable("The command catalogue response could not be read.");
      }
      // The canonical document, not a presentation variant: this catalogue's
      // whole value is that it is complete and unedited, and a trimmed copy
      // would make the screen look finished when it is not.
      const catalogue = readCommandCatalogue(COMMAND_CATALOGUE_FIXTURE);
      return catalogue
        ? { ok: true as const, value: catalogue }
        : unavailable("The command catalogue response could not be read.");
    },

    /**
     * The five analytics reads, served from the PRESENTATION fixtures.
     *
     * Deliberately not from `packages/contracts/fixtures`: those documents are
     * one row each, which is right for a contract example and useless for
     * seeing a screen behave. The canonical documents are loaded directly by
     * `contractFixtures.test.ts`, which is where they belong — proving the
     * reader agrees with the server. These serve the fixtures page, where the
     * job is showing a funnel bounded at 4,180 events and a matrix at the
     * packed limit.
     */
    async getOrderFunnel(_orderId: string) {
      const blocked = gate<never>("getOrderFunnel");
      if (blocked) return blocked as Result<never>;
      const source = options.boundedFunnel ? FUNNEL_BOUNDED : FUNNEL_COMPLETE;
      const funnel = readOrderFunnel(source);
      const envelope = readAnalyticsEnvelope(source);
      return funnel && envelope
        ? { ok: true as const, value: { funnel, envelope } }
        : unavailable("The order funnel response could not be read.");
    },

    async getInsightBatch(_alphaId: string, request: InsightBatchInput) {
      const blocked = gate<never>("getInsightBatch");
      if (blocked) return blocked as Result<never>;
      const source = options.mixedInsights ? INSIGHT_BATCH_MIXED : INSIGHT_BATCH_FULL;
      const batch = readInsightBatch(source, request.portfolioId);
      const envelope = readAnalyticsEnvelope(source);
      return batch && envelope
        ? { ok: true as const, value: { batch, envelope } }
        : unavailable("The insight batch response could not be read.");
    },

    async getCorrelation(_portfolioId: string) {
      const blocked = gate<never>("getCorrelation");
      if (blocked) return blocked as Result<never>;
      const source = options.correlationAboveLimit
        ? CORRELATION_ABOVE_LIMIT
        : CORRELATION_AT_LIMIT;
      const correlation = readCorrelation(source);
      const envelope = readAnalyticsEnvelope(source);
      return correlation && envelope
        ? { ok: true as const, value: { correlation, envelope } }
        : unavailable("The correlation response could not be read.");
    },

    async getCapitalLedger(_portfolioId: string) {
      const blocked = gate<never>("getCapitalLedger");
      if (blocked) return blocked as Result<never>;
      const ledger = readCapitalLedger(CAPITAL_LEDGER);
      const envelope = readAnalyticsEnvelope(CAPITAL_LEDGER);
      return ledger && envelope
        ? { ok: true as const, value: { ledger, envelope } }
        : unavailable("The capital ledger response could not be read.");
    },

    async getBindingExposure(_bindingId: string) {
      const blocked = gate<never>("getBindingExposure");
      if (blocked) return blocked as Result<never>;
      const exposure = readBindingExposure(EXPOSURE_COMPLETE);
      const envelope = readAnalyticsEnvelope(EXPOSURE_COMPLETE);
      return exposure && envelope
        ? { ok: true as const, value: { exposure, envelope } }
        : unavailable("The binding exposure response could not be read.");
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

    async applyPlan(operationId: string, applyToken: string): Promise<Result<ApplyReceipt>> {
      const blocked = gate<ApplyReceipt>("applyPlan");
      if (blocked) return blocked;
      // Both, because both bind: the id says which operation and the token says
      // this caller was the one issued a plan for it.
      if (!applyToken) return unavailable("Apply was called without the plan's token.");
      polls = 0;
      const id = operationId.replace(/^cmd_/, "") || "op";
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
          // This walk models an operation that was relayed, so nothing blocks
          // it and the source was asked. The BLOCKED shape the contract ships
          // is exercised in `commandOperation.test.ts` against the fixture
          // itself rather than modelled a second time here.
          blockers: [],
          relayReceipt: "rcpt_fixture_walk",
          sourceSideEffectRequested: true,
        },
      };
    },
  };
}
