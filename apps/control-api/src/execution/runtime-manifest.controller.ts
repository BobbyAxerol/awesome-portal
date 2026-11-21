import { Controller, Get, Header, Inject, Optional, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthSession, PortalUser } from "../domain";
import { ExecutionReadScopes, ExecutionReadScopeError } from "../execution-v2/read-scope";
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
  portalSession: AuthSession;
  portalViewerWorkspaceId?: string;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/runtime-manifest")
export class ExecutionRuntimeManifestController {
  constructor(
    @Inject(ExecutionRuntimeManifestService) private readonly service: ExecutionRuntimeManifestService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Optional() @Inject(ExecutionReadScopes) private readonly scopes?: ExecutionReadScopes,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async manifest(@Req() request: RuntimeManifestRequest, @Query() rawQuery: unknown) {
    const query = RuntimeManifestQuerySchema.safeParse(rawQuery);
    if (!query.success) {
      throw new ExecutionRuntimeManifestError("EDS00_RUNTIME_MANIFEST_QUERY_INVALID", "Invalid query.", 400);
    }
    const workspaceId = query.data.workspace_id ?? request.portalWorkspaceId;
    if (!(await this.workspaces.canReadExecution(workspaceId, request.portalUser.userId))) {
      throw new ExecutionRuntimeManifestError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    }
    const principal = { user: request.portalUser, session: request.portalSession, workspaceId,
      viewerWorkspaceId: request.portalViewerWorkspaceId ?? request.portalWorkspaceId };
    // This legacy DTO mixes catalogue evidence with runtime configuration.
    // Business-read permission cannot authorize the technical part. Keep the
    // separate public contract-authority endpoint usable; do not silently
    // redact an old schema into a different success response.
    if (this.scopes && await this.scopes.coreSelectionMode(principal) === "SCOPED_V2")
      throw new ExecutionRuntimeManifestError("RUNTIME_MANIFEST_TECHNICAL_FIELDS_NOT_COMMISSIONED",
        "Runtime technical metadata policy is not commissioned.", 503);
    const result = this.service.manifest(workspaceId);
    if (this.scopes && await this.scopes.coreSelectionMode(principal) !== "LEGACY_COMPATIBILITY")
      throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
    return result;
  }
}
