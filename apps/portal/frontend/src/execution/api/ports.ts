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
import type { MirrorIntegrity } from "../mirrorIntegrity";
import type {
  AlphaFleetItem, BindingItem, LiveReviewPayload, ManagerListEnvelope,
  OperatorTaskCatalogue, OperatorTaskRunResult, PortfolioListEnvelope, ProfileEnvelope, QueryAnalytics,
} from "./profileRead";
import type { KeysetPage, PanelStatus } from "../contracts";
import type { StageDrift } from "../hifiInsight";
import type { CompositionName, OperationalComposition } from "../operationalComposition";
import type { ApprovalRow, DecidedRow } from "../screens/ApprovalInbox";
import type { GateR1Detail, GateR2Detail, PaperExitDetail } from "./rows";
import type {
  AnalyticsEnvelope,
  BindingExposure,
  CapitalLedger,
  CapitalPreview,
  Correlation,
  CrossEquity,
  InsightBatch,
  OrderFunnel,
} from "../analytics";
import type { ConditionalGroupRead, SourceHealthRead } from "../derivedReads";
import type { RuntimeManifest } from "../runtimeManifest";
import type { StagedActivation } from "../stagedActivation";
import type { ScreenContract } from "../screenContracts";
import type { CommandCatalogue } from "../adminCatalog";
import type { CommandPlan, CommandPlanRequestInput } from "../commandPlan";
import type { IncidentDetail, OperationsQueue, WorkflowResult } from "../operations";
import type { CanaryControlRoom, SandboxCertification } from "../certification";
import type { LiveFullOperations } from "../liveFull";
import type { TypedCondition } from "../components/conditions";
import type { FinancialChartPayload, FinancialChartQuery, FinancialEnvironment } from "./financialChart";
import type { AlphaActivity, DeploymentQuality, PortfolioCapital, SourceHealth } from "./derivations";
import type { MarketCandlesPayload, MarketCandlesQuery } from "./marketCandles";
import type { MarketContextCandles, MarketContextQuery } from "./marketContext";
import type { RelationPage, RelationPageQuery } from "./managerRelations";
import type { ObservedTimeline, ObservedTimelineQuery } from "./observedTimeline";
import type { SubjectActivityPage, SubjectActivityQuery } from "./subjectActivity";

export type Result<T> =
  | { ok: true; value: T; warnings?: readonly string[] }
  | { ok: false; status: Exclude<PanelStatus, "ok">; reason: string };

/**
 * `CapitalPreviewRequest`, in the frontend's casing.
 *
 * All three are required by the schema. `portfolioId` and `currency` are not
 * yet published on the R2 review row — see the backend request in
 * `FRONTEND_HANDOFF.md` §8.3 — so today they are supplied by the caller.
 */
/**
 * `InsightBatchRequest`, in the frontend's casing.
 *
 * The schema caps `items` at 64. The cap is not enforced here — the server owns
 * it and a client that silently truncated would hide a request the operator
 * made — but `INSIGHT_BATCH_LIMIT` states it so a caller can page instead.
 */
export interface InsightBatchInput {
  portfolioId: string;
  items: readonly { insightId: string; alphaId: string }[];
}

export interface CapitalPreviewInput {
  portfolioId: string;
  requestedAmount: string;
  currency: string;
}

export interface InboxQuery {
  filter: string;
  /** Mutually exclusive, per BR-EX-17. Passing both is a caller bug. */
  after?: string | null;
  before?: string | null;
  limit?: number;
  /**
   * PHASE 6 (round 2): the workspace the URL named, when it named one.
   *
   * Omitted means "the caller's own". Every screen omitted it, so the one
   * PENDING approval on dev — which lives in another workspace — read as
   * "0 PENDING" rather than as "none in this workspace".
   */
  workspaceId?: string;
}

export interface InboxResult {
  page: KeysetPage<ApprovalRow>;
  counts: { pending: number; overdue: number | null; dueSoon: number | null; mine?: number | null } | null;
  /** Server-counted over the whole filter. See `ApprovalInbox.inertCount`. */
  inertCount?: number | null;
  /**
   * Recently decided, its own page. A decided request in the pending list is an
   * action item that is not one, so the two never share a query.
   */
  decided?: KeysetPage<DecidedRow> | null;
  /** The workflow contract's actor object (hi-fi header: "you are Lan · roles"). */
  actor?: { username: string; roles: readonly string[] } | null;
  policyVersion?: string | null;
}

/** What apply returned. A 202 and nothing more (master plan §7.3). */
/**
 * What planning returned.
 *
 * `blockers` is the field that matters: a plan may come back well-formed and
 * still be un-appliable, and the first version of this port dropped it and
 * applied anyway. `applyToken` is null exactly when the server declined to
 * issue one, which is the same condition.
 */
/**
 * The three outcomes Paper Exit speaks (`Decision.outcome` in
 * `execution-governance-paper-exit.v1`). Kept as a predicate rather than a
 * second port method because the Control API mounts one plan route and
 * discriminates on the body — so the branch belongs to the payload, not the
 * call site.
 */
export type PaperExitDecision = "PROMOTE" | "EXTEND_OBSERVATION" | "REJECT";

const PAPER_EXIT_DECISIONS: readonly string[] = ["PROMOTE", "EXTEND_OBSERVATION", "REJECT"];

export function isPaperExitDecision(decision: string): decision is PaperExitDecision {
  return PAPER_EXIT_DECISIONS.includes(decision);
}

/** The schema pins the extension to one term; it is not a free number. */
export const PAPER_EXIT_EXTENSION_DAYS = 14;

export interface DecisionPlan {
  operationId: string;
  applyToken: string | null;
  blockers: readonly { code: string }[];
  warnings: readonly { code: string }[];
  expectedApprovalVersion: number | null;
  riskTier: string | null;
}

export interface ApplyReceipt {
  operationId: string;
  receipt: string | null;
}

export interface OperationSnapshot {
  status: string | null;
  /** Raw token preserved; `decision.ts` decides what it means. */
  verificationRaw: string | null;
  /**
   * Why nothing was relayed, verbatim.
   *
   * `execution.command-operation.v1` publishes this beside a BLOCKED status and
   * this port carried two fields out of the contract's twelve, so the reason an
   * operation was stuck never left the transport.
   */
  blockers: readonly string[];
  /** The contract's `relay_receipt`. Evidence of what the relay did. */
  relayReceipt: string | null;
  /** Whether this operation asked anything of the Trading System. */
  sourceSideEffectRequested: boolean;
}


/* ── N29 governance consumer (codex handoff 2026-08-31) ──────────────────── */

/** `POST /governance/approvals` — the loop's entry door, server-validated. */
export interface ApprovalCreateInput {
  /** Stable per submit INTENT; reused only to retry the same payload. */
  requestKey: string;
  alphaId: string;
  evidenceRunId: string;
  methodologyClaimId: string;
  summary: string;
}

/**
 * The four states the entry screen binds (N29 §4). `duplicate` carries the
 * existing approval so the UI can link it instead of apologizing; `failed`
 * carries the typed problem. A thrown fetch becomes `failed` with
 * `offline: true` — the request key survives for a retry of the SAME payload.
 */
export type ApprovalCreateOutcome =
  | {
      kind: "created" | "replayed";
      approvalId: string;
      subjectLabel: string;
      status: string;
      slaDueAt: string | null;
      policyVersion: string | null;
      quorumRequired: number | null;
      requester: string | null;
    }
  | { kind: "duplicate"; existingApprovalId: string | null; reason: string }
  | { kind: "failed"; status: PanelStatus; reason: string; offline?: boolean };

export type WaiverStateCode = "OPEN" | "WAIVED" | "EXPIRING" | "LAPSED";

export interface ConditionRow {
  conditionId: string;
  approvalId: string;
  gate: string;
  subjectId: string;
  subjectLabel: string;
  environment: string;
  kind: string;
  /** Server-computed. The client renders it and never re-derives it. */
  state: WaiverStateCode;
  label: string;
  statement: string;
  owner: string;
  dueAt: string | null;
  /** Dangerous flag: an unreadable value must block, never wave through. */
  blocking: boolean;
  policyVersion: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ConditionsPage {
  rows: readonly ConditionRow[];
  totalCount: number | null;
  filteredCount: number | null;
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
  hasPrevious: boolean;
  /** Server read time — the anchor every due display counts from. */
  readAt: string | null;
}

export interface WaiverQuery {
  state?: WaiverStateCode;
  after?: string;
  before?: string;
  limit?: number;
}

export interface ManagerListQuery {
  environment?: "all" | "paper" | "sandbox" | "live";
  after?: string;
  before?: string;
  limit?: number;
  sort?: string;
}

export interface AlphaFleetQuery extends ManagerListQuery {
  search?: string;
  stage?: string;
  owner?: string;
  health?: string;
}

export interface BindingListQuery extends ManagerListQuery {
  environment?: "paper" | "sandbox" | "live";
  search?: string;
  venue?: string;
  state?: string;
}

export interface BlotterQuery {
  after?: string;
  before?: string;
  limit?: number;
  status?: string;
  status_bucket?: "FILLED" | "PARTIAL" | "REJECTED" | "OPEN";
  venue?: string;
  symbol?: string;
  side?: "BUY" | "SELL";
  sort?: "submitted_at_desc" | "submitted_at_asc" | "updated_at_desc";
}

export interface ExecutionApi {
  /** Optional on fixtures; real clients share only in-flight GETs in this scope. */
  withReadSignal?(signal: AbortSignal): ExecutionApi;
  getReviewCaptureCapabilities(workspaceId: string): Promise<Result<import("./reviewCapture").ReviewCaptureCapabilities>>;
  captureR2(input: import("./reviewCapture").R2CaptureInput): Promise<Result<import("./reviewCapture").ReviewCapture>>;
  createPaperExit(input: import("./reviewCapture").PaperExitCreateInput): Promise<Result<import("./reviewCapture").ReviewCapture>>;
  captureSandboxNote(input: import("./reviewCapture").SandboxNoteInput): Promise<Result<import("./reviewCapture").ReviewCapture>>;
  /** `GET /api/v1/execution/governance/approvals` */
  listApprovals(query: InboxQuery): Promise<Result<InboxResult>>;
  createApprovalRequest(input: ApprovalCreateInput): Promise<ApprovalCreateOutcome>;
  /* ── N29-FE-01 same-origin screen BFF (codex closeout 2026-08-31) ──────── */
  /** `GET /command-center` — the product snapshot (PRE-IAM-03). */
  getCommandCenterSnapshot(): Promise<Result<unknown>>;
  /** `GET /screens/{paper|sandbox|live|blotter}` — N22/N23 profile envelopes. */
  getScreenProfile(screen: "paper" | "sandbox" | "live" | "blotter"): Promise<Result<ProfileEnvelope>>;
  /** Exact, server-filtered Paper blotter page. */
  getBlotterProfile(query?: BlotterQuery): Promise<Result<ProfileEnvelope>>;
  /** `GET /compositions/{name}` — a screen's payload plus its cross-cutting evidence. */
  getOperationalComposition(name: CompositionName, query?: Readonly<Record<string, string | number | undefined>>): Promise<Result<OperationalComposition>>;
  /** `GET /alphas/{id}/stage-drift` — one alpha's equity per stage, one calendar. */
  getStageDrift(alphaId: string, days?: number): Promise<Result<StageDrift>>;
  /** `GET /alphas/equity-sparklines` — every alpha's 30-day series in one read. */
  getEquitySparklines(environment?: "paper" | "sandbox" | "live"): Promise<Result<Record<string, readonly number[]>>>;
  /** `GET /screens/paper/{id}[/vn-market]` — the workbench envelope. */
  getPaperWorkbenchProfile(deploymentId: string, variant?: "paper" | "vnm"): Promise<Result<ProfileEnvelope>>;
  /** `GET /{alphas|portfolios}/{id}/query-analytics` — N25 envelope. */
  /**
   * `options.sourceFacts: false` asks the server to leave the raw fact groups
   * empty — for screens that read those rows from the subject BFF and would
   * otherwise download them twice.
   */
  getQueryAnalytics(
    subject: "alphas" | "portfolios" | "deployments",
    subjectId: string,
    options?: { sourceFacts?: boolean; environment?: FinancialEnvironment; accountId?: string },
  ): Promise<Result<QueryAnalytics>>;
  /** `GET /commands/tasks` — the N27 operator task catalogue. */
  getOperatorTasks(): Promise<Result<OperatorTaskCatalogue>>;
  /** Runs only a server-classified CONNECTED R0 task. */
  runOperatorTask(taskId: string, params: Readonly<Record<string, string | number | boolean | null>>): Promise<Result<OperatorTaskRunResult>>;
  /** `GET /governance/approvals/{id}/live` — `governance.live-review.v1`. */
  getLiveReview(approvalId: string, workspaceId?: string): Promise<Result<LiveReviewPayload>>;
  /** `GET /screens/accounts/{id}` — N28 typed unavailable until published. */
  getAccountBroker360(accountId: string): Promise<Result<ProfileEnvelope>>;
  /** EDS-04 exact resource BFFs. Each resolves the resource server-side first. */
  getAlpha360Resource(alphaId: string): Promise<Result<ProfileEnvelope>>;
  getPortfolio360Resource(portfolioId: string): Promise<Result<ProfileEnvelope>>;
  getAccount360Resource(accountId: string): Promise<Result<ProfileEnvelope>>;
  getBindingResource(bindingId: string): Promise<Result<ProfileEnvelope>>;
  /** EDS-07 `GET /views/equity-chart` — viewport-sized financial series with its sampling metadata. */
  getFinancialChart(query: FinancialChartQuery): Promise<Result<FinancialChartPayload>>;
  /** EDS-05 `GET /derivations/source-health` */
  getSourceHealth(environment: FinancialEnvironment): Promise<Result<SourceHealth>>;
  /** EDS-05 `GET /derivations/deployments/{id}/execution-quality` */
  getDeploymentQuality(deploymentId: string, environment: FinancialEnvironment): Promise<Result<DeploymentQuality>>;
  /** EDS-05 `GET /derivations/portfolios/{id}/capital` */
  getPortfolioCapital(portfolioId: string, environment: FinancialEnvironment): Promise<Result<PortfolioCapital>>;
  /** EDS-05 `GET /derivations/alphas/{id}/activity` */
  getAlphaActivity(alphaId: string, environment: FinancialEnvironment): Promise<Result<AlphaActivity>>;
  /** `GET /market/venue-candles` — venue public klines (Trade Replay market context; `/market/candles` is the Manager market context). */
  getMarketCandles(query: MarketCandlesQuery): Promise<Result<MarketCandlesPayload>>;
  /**
   * The Trading System's own bars (market-context BFF, EDS-10b/11R4).
   *
   * A second source, not a replacement: the venue series says what the exchange
   * published and this one says what the Trading System recorded, and where a
   * fill sits between them is the finding. Callers try this first and fall back
   * to the venue reading, naming which one they drew.
   */
  getMarketContextCandles(query: MarketContextQuery): Promise<Result<MarketContextCandles>>;
  /** EDS-09b / EDS-10b observed timeline BFF (`/views/observed-timeline`) — a Portal observation, never a replay. */
  getObservedTimeline(query: ObservedTimelineQuery): Promise<Result<ObservedTimeline>>;
  /** EDS-11R1 named relation BFF (G9): one bounded page of a screen-bound Manager relation; the Portal continuation goes back unchanged. */
  getManagerRelationPage(query: RelationPageQuery): Promise<Result<RelationPage>>;
  /**
   * BR-EX-81 exact subject history through the Portal durable retained-current
   * mirror.  This is deliberately separate from the generic relation page:
   * callers cannot choose a Manager relation, source cursor or source host.
   */
  getSubjectActivity(query: SubjectActivityQuery): Promise<Result<SubjectActivityPage>>;
  /** `GET /alphas` — BR-EX-72 bounded Fleet projection. */
  getAlphaFleet(query?: AlphaFleetQuery): Promise<Result<ManagerListEnvelope<AlphaFleetItem>>>;
  /** `GET /portfolios` — BR-EX-76 all-profile portfolio identity list. */
  listPortfolios(): Promise<Result<PortfolioListEnvelope>>;
  /** `GET /broker-bindings` — BR-EX-72 bounded binding projection. */
  getBindings(query?: BindingListQuery): Promise<Result<ManagerListEnvelope<BindingItem>>>;
  /** `GET /broker-bindings/{id}` — narrow, non-secret binding detail. */
  getBindingDetail(bindingId: string, environment?: "paper" | "sandbox" | "live"): Promise<Result<BindingItem>>;

  getWaivers(query?: WaiverQuery): Promise<Result<ConditionsPage>>;
  /** `GET /api/v1/execution/governance/approvals/{id}/r1` */
  getGateR1(approvalId: string, workspaceId?: string): Promise<Result<GateR1Detail>>;
  /** `GET /api/v1/execution/governance/approvals/{id}/r2` */
  getGateR2(approvalId: string, workspaceId?: string): Promise<Result<GateR2Detail>>;
  /**
   * `POST /api/v1/execution/approvals/{approvalId}/capital-preview`
   *
   * A POST, and not because it mutates anything — it does not. The engine needs
   * the portfolio, the amount and the currency to compute against, and the
   * published operation takes them as a body. Writing it as a GET with a query
   * string, which is what this was until the generated types were consulted,
   * produces a 405 against the real service.
   *
   * Its own call rather than a field of `getGateR2`, because the preview is
   * recomputed when the amount changes and the rest of the review is not.
   * Folding them together would either refetch the whole review on every
   * keystroke or serve a preview for an amount the reviewer has already moved
   * past — the second being the dangerous one.
   */
  /** `GET /api/v1/execution/deployments/{id}/certification` */
  getSandboxCertification(deploymentId: string): Promise<Result<SandboxCertification>>;
  /** `GET /api/v1/execution/deployments/{id}/canary` */
  getCanaryControlRoom(deploymentId: string): Promise<Result<CanaryControlRoom>>;
  /** `GET /api/v1/execution/deployments/{id}/live` */
  getLiveFullOperations(deploymentId: string): Promise<Result<LiveFullOperations>>;
  /**
   * `GET /api/v1/execution/operations` — the triage queue.
   *
   * Cursors are opaque and mutually exclusive, exactly as the inbox's are: a
   * page requested in both directions is a page whose position the client
   * cannot place.
   */
  listOperations(query: {
    workspaceId?: string;
    after?: string;
    before?: string;
    limit?: number;
    triageState?: string;
    environment?: string;
    sourceStatus?: string;
  }): Promise<Result<OperationsQueue>>;
  /**
   * `POST /api/v1/execution/operations/{id}/acknowledge`
   *
   * A Portal record. `expected_workflow_version` is mandatory, and a 409 means
   * the row moved — refresh and review, never blind retry.
   */
  acknowledgeOperation(input: {
    operationId: string;
    workspaceId: string;
    requestKey: string;
    expectedWorkflowVersion: number;
  }): Promise<Result<WorkflowResult>>;
  /**
   * `POST /api/v1/execution/operations/{id}/resolve`
   *
   * Requires a reason AND an evidence hash. Acknowledging first is the server's
   * rule as well as the screen's.
   */
  resolveOperation(input: {
    operationId: string;
    workspaceId: string;
    requestKey: string;
    expectedWorkflowVersion: number;
    reason: string;
    evidenceHash: string;
  }): Promise<Result<WorkflowResult>>;
  /** `GET /api/v1/execution/operations/incidents/{id}` */
  getIncident(incidentId: string, workspaceId?: string): Promise<Result<IncidentDetail>>;
  /**
   * `POST /api/v1/execution/commands/plans` with the EXECUTION_COMMAND body.
   *
   * Distinct from `planDecision`, which plans a GOVERNANCE decision on the same
   * route. Same endpoint, different envelope — the controller discriminates on
   * the body, and folding the two together here would make the caller choose a
   * shape by guessing.
   */
  planCommand(input: CommandPlanRequestInput): Promise<Result<CommandPlan>>;
  /**
   * `GET /api/v1/execution/commands/catalog` — ADMIN only.
   *
   * A 403 for a non-ADMIN actor is not a failure to report as "unavailable":
   * it is an answer, and the catalogue must not leak through the error text.
   * The adapter maps it to `denied` with a sentence that names neither an entry
   * nor a count.
   */
  getCommandCatalogue(query?: {
    workspaceId?: string;
    environment?: string;
    targetType?: string;
    targetId?: string;
    riskTier?: string;
  }): Promise<Result<CommandCatalogue>>;
  /**
   * The five analytics reads, alongside the capital preview that was already
   * here. Each returns its parsed domain object with the envelope beside it —
   * both or neither, for the reason the preview states: a figure without its
   * authority and freshness is an unattributed claim, and every one of these
   * screens exists to attribute.
   *
   * `GET /api/v1/execution/orders/{orderId}/funnel`
   */
  getOrderFunnel(
    orderId: string,
  ): Promise<Result<{ funnel: OrderFunnel; envelope: AnalyticsEnvelope }>>;
  /**
   * `POST /api/v1/execution/alphas/{alphaId}/insight-previews`
   *
   * A POST because the batch is a body, not a query string: the schema caps it
   * at 64 items and a URL cannot carry them safely.
   */
  getInsightBatch(
    alphaId: string,
    request: InsightBatchInput,
  ): Promise<Result<{ batch: InsightBatch; envelope: AnalyticsEnvelope }>>;
  /** `GET /api/v1/execution/portfolios/{portfolioId}/correlation` */
  getCorrelation(
    portfolioId: string,
    environment?: FinancialEnvironment,
  ): Promise<Result<{ correlation: Correlation; envelope: AnalyticsEnvelope }>>;
  /** `GET /api/v1/execution/portfolios/{portfolioId}/capital-ledger` */
  getCapitalLedger(
    portfolioId: string,
    environment?: FinancialEnvironment,
  ): Promise<Result<{ ledger: CapitalLedger; envelope: AnalyticsEnvelope }>>;
  /**
   * `GET /api/v1/execution/runtime-manifest`
   *
   * The server's own page/byte/cursor bounds. Read once per session; the
   * screens take their limits from it instead of writing them down.
   */
  /** `GET /derivations/source-health` — per-profile health, in one read. */
  getSourceHealthRead(): Promise<Result<SourceHealthRead>>;
  /**
   * `GET /governance/approvals/history` — decisions already taken.
   *
   * Rows come back as `DecidedRow`, read by the same parser the inbox has
   * always used for this contract.
   */
  getApprovalHistory(workspaceId?: string): Promise<Result<{ rows: readonly DecidedRow[]; totalCount: number | null; deliveryProfile: string | null }>>;
  /** `GET /derivations/conditional-groups/{groupId}` — the legs of one group. */
  getConditionalGroup(groupId: string, environment: string): Promise<Result<ConditionalGroupRead>>;
  /**
   * `GET /activation/capabilities` — what the owner has switched on.
   *
   * A read, never a grant: nothing in this Portal changes an activation.
   */
  getActivationCapabilities(): Promise<Result<StagedActivation>>;
  getRuntimeManifest(): Promise<Result<RuntimeManifest>>;
  /**
   * `GET /api/v1/execution/screen-contracts`
   *
   * The catalogue the parity gate compares against the registry, and the place
   * a screen learns that the server does not serve it.
   */
  getScreenContracts(): Promise<Result<readonly ScreenContract[]>>;
  /**
   * `GET /api/v1/execution/portfolios/{portfolioId}/cross-equity`
   *
   * The Cross-portfolio panel's standings, aggregated by the store. The screen
   * used to build these by draining the whole equity relation in the browser.
   */
  getCrossEquity(
    portfolioId: string,
    environment?: FinancialEnvironment,
  ): Promise<Result<{ crossEquity: CrossEquity; envelope: AnalyticsEnvelope }>>;
  /** `GET /durable-mirror/integrity` — the mirror's own gap and conflict aggregate. */
  getMirrorIntegrity(environment: "paper" | "sandbox" | "live"): Promise<Result<MirrorIntegrity>>;
  /** `GET /api/v1/execution/broker-bindings/{bindingId}/exposure` */
  getBindingExposure(
    bindingId: string,
  ): Promise<Result<{ exposure: BindingExposure; envelope: AnalyticsEnvelope }>>;
  getCapitalPreview(
    approvalId: string,
    request: CapitalPreviewInput,
  ): Promise<Result<{ preview: CapitalPreview; envelope: AnalyticsEnvelope }>>;
  /** `GET /api/v1/execution/governance/exit-reviews/{id}` */
  getPaperExit(reviewId: string): Promise<Result<PaperExitDetail>>;
  /** `POST /api/v1/execution/governance/approvals/{id}/decision-plans` */
  /**
   * Plan a governance decision.
   *
   * Shaped to `DecisionPlanRequestSchema` in the Control API rather than to the
   * generic command envelope the first draft imagined. Four things that schema
   * requires and the first version did not send: a literal `schema_version`, a
   * `workspace_id`, `expected_approval_version` as a **positive integer**, and
   * a `condition` whenever the decision is `APPROVE_WITH_CONDITION` — the
   * schema rejects that decision without one, and rejects a condition with any
   * other decision.
   */
  planDecision(input: {
    /** Approval or exit-review identifier. One command type, two subjects. */
    approvalId: string;
    workspaceId: string;
    decision:
      | "APPROVE"
      | "DENY"
      | "APPROVE_WITH_CONDITION"
      /** N09: typed request-changes verb — requires a reason like every decision. */
      | "REQUEST_CHANGES"
      | "PROMOTE"
      | "EXTEND_OBSERVATION"
      | "REJECT";
    /** The schema floor is eight characters; a one-word reason is refused. */
    reason: string;
    /**
     * Required for `APPROVE_WITH_CONDITION`, refused for anything else.
     *
     * Typed objects, not a flattened string (BR-EX-29). The server checks each
     * one for an owner, compares its expiry against its deadline and rejects
     * duplicates — none of which is possible against prose, which is why the
     * singular `condition` is gone from the write path entirely.
     */
    conditions?: readonly TypedCondition[];
    /**
     * Optimistic concurrency, as an integer.
     *
     * `null` means the row did not publish one; the caller must not invent a
     * version, because a plan that claims the wrong one either fails loudly or
     * decides against a request that has moved.
     */
    expectedApprovalVersion: number | null;
    evidenceHashes?: readonly string[];
    /** BR-EX-18. Belongs to the intent, reused across retries of that intent. */
    requestKey: string;
  }): Promise<Result<DecisionPlan>>;
  /**
   * `POST /api/v1/execution/operations/{id}/apply` — returns 202 only.
   *
   * The operation id travels in the path and the token in the body, which is
   * what the route actually is — my first rewrite of this put both in a body
   * at `/governance/operations/apply`, a path that does not exist. The token is
   * what binds this apply to that plan; re-deriving the pair client-side would
   * let an apply reach a plan it was never issued for.
   */
  applyPlan(
    operationId: string,
    applyToken: string,
    workspaceId: string,
  ): Promise<Result<ApplyReceipt>>;
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
