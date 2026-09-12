import { Logger } from "@nestjs/common";
import { Body, Controller, Get, Inject, Optional, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import {
  CapitalPreviewApprovalScope,
  GovernanceRepository,
} from "../governance/governance.repository";
import {
  AnalyticsProxyError,
  analyticsResource,
  ExecutionAnalyticsProxy,
  type QueryAnalyticsSubjectKind,
} from "./analytics.proxy";
import {
  LocalQueryAnalyticsService,
  type ObservedTimelineRequest,
} from "./local-query-analytics.service";
import { Portfolio360LocalService } from "./portfolio360-local.service";
import { ExecutionLocalReadAuthority } from "./local-read-authority";

interface AnalyticsRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class ExecutionAnalyticsController {
  private static readonly log = new Logger("ExecutionAnalyticsController");
  constructor(
    @Inject(ExecutionAnalyticsProxy) private readonly proxy: ExecutionAnalyticsProxy,
    @Inject(GovernanceRepository) private readonly governance: GovernanceRepository,
    @Inject(LocalQueryAnalyticsService) private readonly localAnalytics: LocalQueryAnalyticsService,
    @Inject(ExecutionLocalReadAuthority) private readonly readAuthority: ExecutionLocalReadAuthority,
    @Optional()
    @Inject(Portfolio360LocalService)
    private readonly portfolio360?: Portfolio360LocalService,
  ) {}

  @Post("/approvals/:approvalId/capital-preview")
  async capitalPreview(
    @Req() request: AnalyticsRequest,
    @Param("approvalId") id: string,
    @Body() body: unknown,
  ) {
    analyticsResource("gate-r2", id);
    if (request.portalUser.role !== "ADMIN") {
      throw new AnalyticsProxyError("ANALYTICS_APPROVAL_REVIEW_FORBIDDEN", 403);
    }
    const scope = await this.governance.capitalPreviewScope(
      request.portalWorkspaceId,
      id,
    );
    if (!scope) {
      throw new AnalyticsProxyError("ANALYTICS_APPROVAL_SCOPE_NOT_FOUND", 404);
    }
    const bound = bindCapitalPreviewRequest(body, scope);
    return this.invoke(() => this.proxy.capitalPreview(principal(request), id, bound));
  }

  @Get("/orders/:orderId/funnel")
  orderFunnel(@Req() request: AnalyticsRequest, @Param("orderId") id: string) {
    return this.invoke(() => this.proxy.orderFunnel(principal(request), id));
  }

  @Post("/alphas/:alphaId/insight-previews")
  insightPreviews(@Req() request: AnalyticsRequest, @Param("alphaId") id: string, @Body() body: unknown) {
    return this.invoke(() => this.proxy.insightPreviews(principal(request), id, body));
  }

  /*
   * Portfolio 360's two panels, local first.
   *
   * The upstream analytics cell answers 503 for both on this profile, and the
   * Portal already holds what they need: the correlation pairs come from the
   * same daily closes the analytics envelope uses, and the ledger from the
   * `portfolio-capital-ledger` relation the Overview's Configuration log
   * already draws. The proxy stays as the fallback for deployments where the
   * upstream does serve them.
   */
  /**
   * Every alpha's 30-day equity sparkline in one read, so the Fleet can draw
   * the column inline instead of one request per row on expand.
   */
  @Get("/alphas/equity-sparklines")
  async equitySparklines(@Req() request: AnalyticsRequest, @Query() raw: unknown) {
    const query = SparklineQuerySchema.safeParse(raw);
    if (!query.success) throw new AnalyticsProxyError("ANALYTICS_QUERY_INVALID", 400);
    const authorized = await this.readAuthority.authorize(request, query.data.environment ?? "paper");
    return this.invoke(() => this.localAnalytics.equitySparklines(
      authorized, query.data.environment ?? "paper", query.data.days ?? 30,
    ));
  }

  /** One alpha's equity in every stage it runs in, on one calendar. */
  @Get("/alphas/:alphaId/stage-drift")
  async stageDrift(@Req() request: AnalyticsRequest, @Param("alphaId") id: string, @Query() raw: unknown) {
    const query = SparklineQuerySchema.omit({ environment: true }).safeParse(raw);
    if (!query.success) throw new AnalyticsProxyError("ANALYTICS_QUERY_INVALID", 400);
    // No `days` means everything the mirror holds: the charts default to All.
    const authorized = await this.readAuthority.authorize(request);
    return this.invoke(() => this.localAnalytics.stageDrift(
      authorized, id, query.data.days,
    ));
  }

  @Get("/portfolios/:portfolioId/correlation")
  async portfolioCorrelation(@Req() request: AnalyticsRequest, @Param("portfolioId") id: string, @Query() raw: unknown = {}) {
    const environment = panelEnvironment(raw);
    if (this.portfolio360?.enabled()) {
      const authorized = await this.readAuthority.authorize(request, environment);
      return this.invoke(() => this.portfolio360!.correlation(authorized, id, environment));
    }
    if (environment !== "paper") throw new AnalyticsProxyError("ANALYTICS_PROFILE_NOT_SUPPORTED", 404);
    return this.invoke(() => this.proxy.portfolioCorrelation(principal(request), id));
  }

  @Get("/portfolios/:portfolioId/capital-ledger")
  async capitalLedger(@Req() request: AnalyticsRequest, @Param("portfolioId") id: string, @Query() raw: unknown = {}) {
    const environment = panelEnvironment(raw);
    if (this.portfolio360?.enabled()) {
      const authorized = await this.readAuthority.authorize(request, environment);
      return this.invoke(() => this.portfolio360!.capitalLedger(authorized, id, environment));
    }
    if (environment !== "paper") throw new AnalyticsProxyError("ANALYTICS_PROFILE_NOT_SUPPORTED", 404);
    return this.invoke(() => this.proxy.capitalLedger(principal(request), id));
  }

  /**
   * Phase 1: the Cross-portfolio panel, answered by the store instead of by a
   * 35-page walk in the browser. There is no upstream equivalent to fall back
   * to, so when the local projection is off this says so in its own words
   * rather than proxying a request the cell has never accepted.
   */
  @Get("/portfolios/:portfolioId/cross-equity")
  async portfolioCrossEquity(@Req() request: AnalyticsRequest, @Param("portfolioId") id: string, @Query() raw: unknown = {}) {
    const environment = panelEnvironment(raw);
    if (!this.portfolio360?.enabled()) {
      return this.invoke(() => Promise.reject(new AnalyticsProxyError("ANALYTICS_DISABLED", 404)));
    }
    const authorized = await this.readAuthority.authorize(request, environment);
    return this.invoke(() => this.portfolio360!.crossEquity(authorized, id, environment));
  }

  @Get("/broker-bindings/:bindingId/exposure")
  bindingExposure(@Req() request: AnalyticsRequest, @Param("bindingId") id: string) {
    return this.invoke(() => this.proxy.bindingExposure(principal(request), id));
  }

  @Get("/deployments/:deploymentId/query-analytics")
  deploymentQueryAnalytics(
    @Req() request: AnalyticsRequest,
    @Param("deploymentId") id: string,
    @Query() query: unknown,
  ) {
    return this.queryAnalytics(request, "deployment", id, query);
  }

  @Get("/alphas/:alphaId/query-analytics")
  alphaQueryAnalytics(@Req() request: AnalyticsRequest, @Param("alphaId") id: string, @Query() query: unknown) {
    return this.queryAnalytics(request, "alpha", id, query);
  }

  @Get("/portfolios/:portfolioId/query-analytics")
  portfolioQueryAnalytics(
    @Req() request: AnalyticsRequest,
    @Param("portfolioId") id: string,
    @Query() query: unknown,
  ) {
    return this.queryAnalytics(request, "portfolio", id, query);
  }

  @Get("/live-gates/:approvalId/query-analytics")
  liveGateQueryAnalytics(@Req() request: AnalyticsRequest, @Param("approvalId") id: string) {
    return this.queryAnalytics(request, "live-gate", id);
  }

  /**
   * EDS-10b's named panel BFF.  It deliberately accepts a small fixed
   * resource vocabulary instead of a Manager relation/schema/path selector.
   * Its optional continuation is Portal-signed and projection-bound; a browser
   * can never receive or submit a source cursor.
   */
  @Get("/views/observed-timeline")
  async observedTimeline(@Req() request: AnalyticsRequest, @Query() rawQuery: unknown) {
    const parsed = ObservedTimelineQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new AnalyticsProxyError("EDS10_OBSERVED_TIMELINE_QUERY_INVALID", 400);
    const query: ObservedTimelineRequest = {
      environment: parsed.data.environment,
      subjectKind: parsed.data.subject_kind,
      subjectId: parsed.data.subject_id,
      ...(parsed.data.limit === undefined ? {} : { limit: parsed.data.limit }),
      ...(parsed.data.after === undefined ? {} : { after: parsed.data.after }),
    };
    const authorized = await this.readAuthority.authorize(request, query.environment);
    return this.invoke(() => this.localAnalytics.observedTimeline(authorized, query));
  }

  @Get("/deployments/paper/:deploymentId/projection/:panel")
  paperWorkbenchPanel(
    @Req() request: AnalyticsRequest,
    @Param("deploymentId") deploymentId: string,
    @Param("panel") rawPanel: string,
    @Query() rawQuery: unknown,
  ) {
    const panel = ShadowPanelSchema.safeParse(rawPanel);
    const query = ShadowPanelQuerySchema.safeParse(rawQuery);
    if (!panel.success || !query.success) {
      throw new AnalyticsProxyError("N07_QUERY_INVALID", 400);
    }
    return this.invoke(() =>
      this.proxy.paperWorkbenchPanel(
        principal(request),
        deploymentId,
        panel.data,
        shadowQueryBody(query.data),
      ),
    );
  }

  private async invoke(operation: () => Promise<unknown>): Promise<unknown> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AnalyticsProxyError) throw error;
      // The typed 502 stays; the operator gets the failure class and a bounded message in the log.
      ExecutionAnalyticsController.log.warn(JSON.stringify({ event: "analytics_upstream_error", error_class: error instanceof Error ? error.constructor.name : typeof error, message: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200) }));
      throw new AnalyticsProxyError("ANALYTICS_UPSTREAM_UNAVAILABLE", 502);
    }
  }

  /**
   * Phase 5: a caller may now say it draws no raw facts.
   *
   * The narrow form has existed since the Paper Workbench needed it — 3.9 MB
   * of 7 MB there were raw groups the screen never read — but only a
   * server-side caller could ask for it. A browser could not, so Alpha 360 and
   * Portfolio 360 downloaded 4 500 and 4 731 rows they then ignored, because
   * both screens read the same rows from the subject BFF instead.
   *
   * The default is unchanged: `source_facts` omitted means the full form, so
   * no existing caller sees a different answer.
   */
  private async queryAnalytics(
    request: AnalyticsRequest,
    subjectKind: QueryAnalyticsSubjectKind,
    subjectId: string,
    rawQuery: unknown = {},
  ) {
    const query = QueryAnalyticsQuerySchema.safeParse(rawQuery ?? {});
    if (!query.success) {
      return this.invoke(() => Promise.reject(new AnalyticsProxyError("ANALYTICS_QUERY_INVALID", 400)));
    }
    if (this.localAnalytics.enabled()) {
      const environment = query.data.environment ?? (subjectKind === "live-gate" ? "live" : "paper");
      if (subjectKind === "live-gate" && environment !== "live") {
        throw new AnalyticsProxyError("ANALYTICS_PROFILE_MISMATCH", 400);
      }
      const authorized = await this.readAuthority.authorize(request, environment);
      return this.invoke(() => this.localAnalytics.query(
        authorized, subjectKind, subjectId,
        { sourceFacts: query.data.source_facts !== false, environment, accountId: query.data.account_id },
      ));
    }
    if (query.data.account_id || (query.data.environment && query.data.environment !== (subjectKind === "live-gate" ? "live" : "paper"))) {
      throw new AnalyticsProxyError("ANALYTICS_PROFILE_NOT_SUPPORTED", 404);
    }
    return this.invoke(() =>
      this.proxy.managerQueryAnalytics(principal(request), subjectKind, subjectId),
    );
  }
}

/**
 * `source_facts=false` asks for the derived branches with the raw groups
 * emptied. Strict: an unknown key is a caller believing in a parameter that
 * does not exist, and answering it as if it did is how a screen ends up sure
 * it filtered something.
 */
const QueryAnalyticsQuerySchema = z.object({
  source_facts: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  environment: z.enum(["paper", "sandbox", "live"]).optional(),
  account_id: z.string().regex(/^[A-Za-z0-9._:-]{1,192}$/).optional(),
}).strict();

function panelEnvironment(raw: unknown) {
  const parsed = z.object({ environment: z.enum(["paper", "sandbox", "live"]).default("paper") }).strict().safeParse(raw ?? {});
  if (!parsed.success) throw new AnalyticsProxyError("ANALYTICS_QUERY_INVALID", 400);
  return parsed.data.environment;
}

const SparklineQuerySchema = z.object({
  environment: z.enum(["paper", "sandbox", "live"]).optional(),
  days: z.coerce.number().int().min(2).max(365).optional(),
}).strict();

const CapitalPreviewRequestSchema = z.object({
  portfolio_id: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
  requested_amount: z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,28})?$/).max(96),
  currency: z.string().regex(/^[A-Z0-9]{2,12}$/),
}).strict();

const ShadowPanelSchema = z.enum(["orders", "positions"]);
const ObservedTimelineQuerySchema = z.object({
  environment: z.enum(["paper", "sandbox", "live"]),
  subject_kind: z.enum(["deployment", "alpha", "portfolio", "account"]),
  subject_id: z.string().regex(/^[A-Za-z0-9._:-]{1,192}$/),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  after: z.string().min(1).max(4096).optional(),
}).strict();
const ShadowPanelQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(250).default(100),
  status: z.string().trim().min(1).max(512).optional(),
  currency: z.string().trim().min(1).max(256).optional(),
  instrument_id: z.string().trim().min(1).max(256).optional(),
  sort: z.enum(["as_of", "projection_sequence", "status", "currency"]).default("as_of"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  after: z.string().min(1).max(4096).optional(),
  before: z.string().min(1).max(4096).optional(),
}).strict().refine((value) => !(value.after && value.before));

type ShadowPanelQuery = z.infer<typeof ShadowPanelQuerySchema>;

export function shadowQueryBody(query: ShadowPanelQuery) {
  const filters: Array<{ field: string; operator: string; values: string[] }> = [];
  const list = (value: string, maximum: number): string[] => {
    const values = value.split(",").map((item) => item.trim());
    if (
      values.length === 0 ||
      values.length > maximum ||
      values.some((item) => item.length === 0 || item.length > 256)
    ) {
      throw new AnalyticsProxyError("N07_QUERY_INVALID", 400);
    }
    return values;
  };
  if (query.status) {
    filters.push({ field: "status", operator: "in", values: list(query.status, 20) });
  }
  if (query.currency) {
    filters.push({ field: "currency", operator: "in", values: list(query.currency, 12) });
  }
  if (query.instrument_id) {
    filters.push({ field: "instrument_id", operator: "contains", values: [query.instrument_id] });
  }
  return {
    limit: query.limit,
    filters,
    sorts: [{ field: query.sort, direction: query.direction }],
    after: query.after,
    before: query.before,
  };
}

/** Prevents a client-controlled body from escaping the approval's immutable R2 scope. */
export function bindCapitalPreviewRequest(
  body: unknown,
  scope: CapitalPreviewApprovalScope,
): z.infer<typeof CapitalPreviewRequestSchema> {
  const parsed = CapitalPreviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new AnalyticsProxyError("ANALYTICS_CAPITAL_PREVIEW_REQUEST_INVALID", 400);
  }
  if (
    parsed.data.portfolio_id !== scope.portfolioId ||
    parsed.data.currency !== scope.currency
  ) {
    throw new AnalyticsProxyError("ANALYTICS_APPROVAL_SCOPE_MISMATCH", 403);
  }
  return parsed.data;
}

function principal(request: AnalyticsRequest) {
  return {
    user: request.portalUser,
    session: request.portalSession,
    workspaceId: request.portalWorkspaceId,
  };
}
