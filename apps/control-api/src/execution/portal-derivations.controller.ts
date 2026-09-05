import { Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { ControlApiConfig } from "../config";
import type { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { PortalDerivationError, PortalDerivationsService } from "./portal-derivations.service";

interface DerivationRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
}

const QuerySchema = z.object({
  workspace_id: z.string().trim().min(1).max(96).optional(),
  environment: z.enum(["paper", "sandbox", "live"]).optional(),
}).strict();
const RESOURCE_ID = /^[A-Za-z0-9._:@-]{1,160}$/;

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/derivations")
export class PortalDerivationsController {
  constructor(
    @Inject(PortalDerivationsService) private readonly derivations: PortalDerivationsService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("/source-health")
  async sourceHealth(@Req() request: DerivationRequest, @Query() raw: unknown) {
    const query = await this.principal(request, raw);
    return this.derivations.sourceHealth(query.principal, query.environment);
  }

  @Get("/deployments/:deployment_id/execution-quality")
  async executionQuality(@Req() request: DerivationRequest, @Param("deployment_id") deploymentId: string, @Query() raw: unknown) {
    if (!RESOURCE_ID.test(deploymentId)) throw new PortalDerivationError("EDS05_RESOURCE_ID_INVALID", 400, "Invalid deployment id.");
    const query = await this.principal(request, raw, true);
    return this.derivations.deploymentQuality(query.principal, deploymentId, query.environment!);
  }

  @Get("/conditional-groups/:group_id")
  async conditionalLegs(@Req() request: DerivationRequest, @Param("group_id") groupId: string, @Query() raw: unknown) {
    if (!RESOURCE_ID.test(groupId)) throw new PortalDerivationError("EDS05_RESOURCE_ID_INVALID", 400, "Invalid conditional group id.");
    const query = await this.principal(request, raw, true);
    return this.derivations.conditionalLegs(query.principal, groupId, query.environment!);
  }

  @Get("/portfolios/:portfolio_id/capital")
  async portfolioCapital(@Req() request: DerivationRequest, @Param("portfolio_id") portfolioId: string, @Query() raw: unknown) {
    if (!RESOURCE_ID.test(portfolioId)) throw new PortalDerivationError("EDS05_RESOURCE_ID_INVALID", 400, "Invalid portfolio id.");
    const query = await this.principal(request, raw, true);
    return this.derivations.portfolioCapital(query.principal, portfolioId, query.environment!);
  }

  @Get("/alphas/:alpha_id/activity")
  async alphaActivity(@Req() request: DerivationRequest, @Param("alpha_id") alphaId: string, @Query() raw: unknown) {
    if (!RESOURCE_ID.test(alphaId)) throw new PortalDerivationError("EDS05_RESOURCE_ID_INVALID", 400, "Invalid alpha id.");
    const query = await this.principal(request, raw, true);
    return this.derivations.alphaActivity(query.principal, alphaId, query.environment!);
  }

  private async principal(request: DerivationRequest, raw: unknown, requireEnvironment = false) {
    const parsed = QuerySchema.safeParse(raw);
    if (!parsed.success) throw new PortalDerivationError("EDS05_QUERY_INVALID", 400, "Invalid derivation query.");
    const workspaceId = parsed.data.workspace_id ?? request.portalWorkspaceId;
    // Every derivation is a label-safe view of the one accepted local
    // projection.  Membership alone must not let another workspace relabel
    // that projection's facts.
    if (workspaceId !== this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID) {
      throw new PortalDerivationError("EDS05_PROJECTION_WORKSPACE_NOT_FOUND", 404, "Workspace not found.");
    }
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new PortalDerivationError("WORKSPACE_NOT_FOUND", 404, "Workspace not found.");
    }
    if (requireEnvironment && !parsed.data.environment) {
      throw new PortalDerivationError("EDS05_ENVIRONMENT_REQUIRED", 400, "Environment is required.");
    }
    return {
      principal: { user: request.portalUser, session: request.portalSession, workspaceId },
      environment: parsed.data.environment,
    };
  }
}
