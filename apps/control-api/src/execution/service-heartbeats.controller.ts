import { Controller, Get, Header, Inject, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { ExecutionReadScopeError } from "../execution-v2/read-scope";
import { serviceHeartbeatsQuerySchema } from "../execution-v2/service-heartbeats.contract";
import { ExecutionServiceHeartbeatsService } from "./service-heartbeats.service";
type Request = FastifyRequest & { portalUser: PortalUser; portalSession: AuthSession;
  portalWorkspaceId: string; portalViewerWorkspaceId?: string };

@Controller("/api/v1/execution/technical/service-heartbeats")
@UseGuards(SessionGuard)
export class ExecutionServiceHeartbeatsController {
  constructor(@Inject(ExecutionServiceHeartbeatsService) private readonly service: ExecutionServiceHeartbeatsService) {}
  @Get() @Header("Cache-Control", "private, no-store")
  async read(@Req() request: Request, @Query() raw: unknown) {
    const parsed = serviceHeartbeatsQuerySchema.safeParse(raw);
    if (!parsed.success) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
    return this.service.read({ user: request.portalUser, session: request.portalSession,
      workspaceId: parsed.data.workspace_id ?? request.portalWorkspaceId,
      viewerWorkspaceId: request.portalViewerWorkspaceId ?? request.portalWorkspaceId }, parsed.data);
  }
}
