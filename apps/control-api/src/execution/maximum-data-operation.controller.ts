import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import {
  MaximumDataOperationError,
  MaximumDataOperationService,
} from "./maximum-data-operation.service";

const DeploymentPageQuerySchema = z.object({
  workspace_id: z.string().trim().min(1).max(96).optional(),
  environment: z.enum(["paper", "sandbox", "live"]).default("paper"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().min(1).max(128).optional(),
}).strict();

interface MaximumDataRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalSession: AuthSession;
  portalWorkspaceId: string;
}

/**
 * Same-origin product BFF.  It intentionally has no generic route, schema,
 * relation, profile, source or Edge target parameters.
 */
@UseGuards(SessionGuard)
@Controller("/api/v1/execution/manager")
export class MaximumDataOperationController {
  constructor(
    @Inject(MaximumDataOperationService) private readonly operations: MaximumDataOperationService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get("/deployments")
  async deployments(@Req() request: MaximumDataRequest, @Query() raw: unknown) {
    const query = DeploymentPageQuerySchema.safeParse(raw);
    if (!query.success) throw new MaximumDataOperationError("EDS01_OPERATION_QUERY_INVALID", 400);
    const workspaceId = query.data.workspace_id ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new MaximumDataOperationError("WORKSPACE_NOT_FOUND", 404);
    }
    return this.operations.deploymentPage(
      { user: request.portalUser, session: request.portalSession, workspaceId },
      {
        environment: query.data.environment,
        limit: query.data.limit,
        ...(query.data.cursor ? { cursor: query.data.cursor } : {}),
      },
    );
  }
}
