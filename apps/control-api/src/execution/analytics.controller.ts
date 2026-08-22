import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { AnalyticsProxyError, ExecutionAnalyticsProxy } from "./analytics.proxy";

interface AnalyticsRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class ExecutionAnalyticsController {
  constructor(@Inject(ExecutionAnalyticsProxy) private readonly proxy: ExecutionAnalyticsProxy) {}

  @Post("/approvals/:approvalId/capital-preview")
  capitalPreview(@Req() request: AnalyticsRequest, @Param("approvalId") id: string, @Body() body: unknown) {
    return this.invoke(() => this.proxy.capitalPreview(principal(request), id, body));
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

function principal(request: AnalyticsRequest) {
  return {
    user: request.portalUser,
    session: request.portalSession,
    workspaceId: request.portalWorkspaceId,
  };
}
