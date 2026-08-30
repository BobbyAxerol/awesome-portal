import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
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

interface AnalyticsRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class ExecutionAnalyticsController {
  constructor(
    @Inject(ExecutionAnalyticsProxy) private readonly proxy: ExecutionAnalyticsProxy,
    @Inject(GovernanceRepository) private readonly governance: GovernanceRepository,
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

  @Get("/portfolios/:portfolioId/correlation")
  portfolioCorrelation(@Req() request: AnalyticsRequest, @Param("portfolioId") id: string) {
    return this.invoke(() => this.proxy.portfolioCorrelation(principal(request), id));
  }

  @Get("/portfolios/:portfolioId/capital-ledger")
  capitalLedger(@Req() request: AnalyticsRequest, @Param("portfolioId") id: string) {
    return this.invoke(() => this.proxy.capitalLedger(principal(request), id));
  }

  @Get("/broker-bindings/:bindingId/exposure")
  bindingExposure(@Req() request: AnalyticsRequest, @Param("bindingId") id: string) {
    return this.invoke(() => this.proxy.bindingExposure(principal(request), id));
  }

  @Get("/deployments/:deploymentId/query-analytics")
  deploymentQueryAnalytics(
    @Req() request: AnalyticsRequest,
    @Param("deploymentId") id: string,
  ) {
    return this.queryAnalytics(request, "deployment", id);
  }

  @Get("/alphas/:alphaId/query-analytics")
  alphaQueryAnalytics(@Req() request: AnalyticsRequest, @Param("alphaId") id: string) {
    return this.queryAnalytics(request, "alpha", id);
  }

  @Get("/portfolios/:portfolioId/query-analytics")
  portfolioQueryAnalytics(
    @Req() request: AnalyticsRequest,
    @Param("portfolioId") id: string,
  ) {
    return this.queryAnalytics(request, "portfolio", id);
  }

  @Get("/live-gates/:approvalId/query-analytics")
  liveGateQueryAnalytics(@Req() request: AnalyticsRequest, @Param("approvalId") id: string) {
    return this.queryAnalytics(request, "live-gate", id);
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
      throw new AnalyticsProxyError("ANALYTICS_UPSTREAM_UNAVAILABLE", 502);
    }
  }

  private queryAnalytics(
    request: AnalyticsRequest,
    subjectKind: QueryAnalyticsSubjectKind,
    subjectId: string,
  ) {
    return this.invoke(() =>
      this.proxy.managerQueryAnalytics(principal(request), subjectKind, subjectId),
    );
  }
}

const CapitalPreviewRequestSchema = z.object({
  portfolio_id: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
  requested_amount: z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,28})?$/).max(96),
  currency: z.string().regex(/^[A-Z0-9]{2,12}$/),
}).strict();

const ShadowPanelSchema = z.enum(["orders", "positions"]);
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
