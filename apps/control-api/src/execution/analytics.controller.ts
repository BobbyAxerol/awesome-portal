import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
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

  private async invoke(operation: () => Promise<unknown>): Promise<unknown> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AnalyticsProxyError) throw error;
      throw new AnalyticsProxyError("ANALYTICS_UPSTREAM_UNAVAILABLE", 502);
    }
  }
}

const CapitalPreviewRequestSchema = z.object({
  portfolio_id: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
  requested_amount: z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,28})?$/).max(96),
  currency: z.string().regex(/^[A-Z0-9]{2,12}$/),
}).strict();

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
