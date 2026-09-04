import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { FastifyRequest } from "fastify";
import { ExecutionRuntimeManifestService } from "./runtime-manifest.service";

const RuntimeManifestQuerySchema = z.object({
  workspace_id: z.string().trim().min(1).max(96).optional(),
}).strict();

export class ExecutionRuntimeManifestError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

interface RuntimeManifestRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/runtime-manifest")
export class ExecutionRuntimeManifestController {
  constructor(
    @Inject(ExecutionRuntimeManifestService) private readonly service: ExecutionRuntimeManifestService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get()
  async manifest(@Req() request: RuntimeManifestRequest, @Query() rawQuery: unknown) {
    const query = RuntimeManifestQuerySchema.safeParse(rawQuery);
    if (!query.success) {
      throw new ExecutionRuntimeManifestError("EDS00_RUNTIME_MANIFEST_QUERY_INVALID", "Invalid query.", 400);
    }
    const workspaceId = query.data.workspace_id ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ExecutionRuntimeManifestError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    }
    return this.service.manifest(workspaceId);
  }
}
