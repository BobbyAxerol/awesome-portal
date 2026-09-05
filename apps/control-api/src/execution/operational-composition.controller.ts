import { Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { ControlApiConfig } from "../config";
import type { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { OperationalCompositionService } from "./operational-composition.service";
import { PortalDerivationError } from "./portal-derivations.service";

interface CompositionRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
}

const QuerySchema = z.object({
  workspace_id: z.string().trim().min(1).max(96).optional(),
  view: z.enum(["r1", "r2", "live"]).optional(),
}).strict();
const RESOURCE_ID = /^[A-Za-z0-9._:@-]{1,191}$/;

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/compositions")
export class OperationalCompositionController {
  constructor(
    @Inject(OperationalCompositionService) private readonly compositions: OperationalCompositionService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("/approvals/:approval_id")
  async approval(@Req() request: CompositionRequest, @Param("approval_id") approvalId: string, @Query() raw: unknown) {
    this.assertId(approvalId);
    const principal = await this.principal(request, raw);
    return this.compositions.approval(principal, approvalId, QuerySchema.parse(raw).view ?? "r1");
  }

  @Get("/exit-reviews/:review_id")
  async exitReview(@Req() request: CompositionRequest, @Param("review_id") reviewId: string, @Query() raw: unknown) {
    this.assertId(reviewId);
    return this.compositions.exitReview(await this.principal(request, raw), reviewId);
  }

  @Get("/waivers")
  async waivers(@Req() request: CompositionRequest, @Query() raw: unknown) {
    return this.compositions.waiversRegister(await this.principal(request, raw));
  }

  @Get("/operations")
  async operations(@Req() request: CompositionRequest, @Query() raw: unknown) {
    return this.compositions.operationsQueue(await this.principal(request, raw));
  }

  @Get("/incidents/:incident_id")
  async incident(@Req() request: CompositionRequest, @Param("incident_id") incidentId: string, @Query() raw: unknown) {
    this.assertId(incidentId);
    return this.compositions.incidentDetail(await this.principal(request, raw), incidentId);
  }

  @Get("/command-center")
  async commandCenter(@Req() request: CompositionRequest, @Query() raw: unknown) {
    return this.compositions.commandCenterSnapshot(await this.principal(request, raw));
  }

  @Get("/admin-action-drawer")
  async adminActionDrawer(@Req() request: CompositionRequest, @Query() raw: unknown) {
    return this.compositions.adminActionDrawer(await this.principal(request, raw));
  }

  private assertId(value: string): void {
    if (!RESOURCE_ID.test(value)) throw new PortalDerivationError("EDS05_RESOURCE_ID_INVALID", 400, "Invalid resource id.");
  }

  private async principal(request: CompositionRequest, raw: unknown) {
    const parsed = QuerySchema.safeParse(raw);
    if (!parsed.success) throw new PortalDerivationError("EDS05_QUERY_INVALID", 400, "Invalid composition query.");
    const workspaceId = parsed.data.workspace_id ?? request.portalWorkspaceId;
    if (workspaceId !== this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID) {
      throw new PortalDerivationError("EDS05_PROJECTION_WORKSPACE_NOT_FOUND", 404, "Workspace not found.");
    }
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new PortalDerivationError("WORKSPACE_NOT_FOUND", 404, "Workspace not found.");
    }
    return { user: request.portalUser, session: request.portalSession, workspaceId };
  }
}
