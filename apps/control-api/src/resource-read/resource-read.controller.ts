import { Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { z } from "zod";
import { ControlApiConfig } from "../config";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { RESOURCE_KINDS, ResourceKind, ResourceReadService } from "./resource-read.service";

interface ResourceReadRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
}

const ResourceQuerySchema = z.object({
  workspace_id: z.string().trim().min(1).max(96).optional(),
  environment: z.enum(["paper", "sandbox", "live"]).optional(),
}).strict();

const RESOURCE_ID = /^[A-Za-z0-9._:@-]{1,160}$/;

/**
 * Four named product-resource BFFs.  These are intentionally distinct from
 * the generic Manager-v2 relation surface: a browser supplies only a product
 * resource id and receives a server-resolved, relation-safe resource DTO.
 */
@UseGuards(SessionGuard)
@Controller("/api/v1/execution/resources")
export class ResourceReadController {
  constructor(
    @Inject(ResourceReadService) private readonly resources: ResourceReadService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("/alphas/:resource_id")
  alpha(@Req() request: ResourceReadRequest, @Param("resource_id") id: string, @Query() raw: unknown) {
    return this.read(request, "ALPHA", id, raw);
  }

  @Get("/portfolios/:resource_id")
  portfolio(@Req() request: ResourceReadRequest, @Param("resource_id") id: string, @Query() raw: unknown) {
    return this.read(request, "PORTFOLIO", id, raw);
  }

  @Get("/accounts/:resource_id")
  account(@Req() request: ResourceReadRequest, @Param("resource_id") id: string, @Query() raw: unknown) {
    return this.read(request, "ACCOUNT", id, raw);
  }

  @Get("/bindings/:resource_id")
  binding(@Req() request: ResourceReadRequest, @Param("resource_id") id: string, @Query() raw: unknown) {
    return this.read(request, "BINDING", id, raw);
  }

  private async read(request: ResourceReadRequest, kind: ResourceKind, resourceId: string, raw: unknown) {
    if (!(RESOURCE_KINDS as readonly string[]).includes(kind) || !RESOURCE_ID.test(resourceId)) {
      throw new ResourceReadError("EDS04_RESOURCE_ID_INVALID", 400);
    }
    const query = ResourceQuerySchema.safeParse(raw);
    if (!query.success) throw new ResourceReadError("EDS04_RESOURCE_QUERY_INVALID", 400);
    const workspaceId = query.data.workspace_id ?? request.portalWorkspaceId;
    // The accepted local projection is deliberately bound to one configured
    // Portal workspace.  A caller may select it explicitly if they are a
    // member, but must never use a different workspace id as a label around
    // data read from that projection.
    if (workspaceId !== this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID) {
      throw new ResourceReadError("EDS04_PROJECTION_WORKSPACE_NOT_FOUND", 404);
    }
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ResourceReadError("WORKSPACE_NOT_FOUND", 404);
    }
    return this.resources.read(
      { user: request.portalUser, session: request.portalSession, workspaceId },
      kind,
      resourceId,
      query.data.environment,
    );
  }
}

export class ResourceReadError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
