import { Body, Controller, Get, Header, HttpCode, Inject, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthSession, PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ControlApiConfig } from "../config";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { mutationSecurityDenial, MUTATION_SECURITY_MESSAGE } from "../auth/mutation-security";
import { CommandCenterError } from "./command-center.service";
import { VisitDigestService } from "./visit-digest.service";

type Request = FastifyRequest & { portalUser: PortalUser; portalSession: AuthSession & { csrfSecretHash: string }; portalWorkspaceId: string; portalViewerWorkspaceId?: string };
const digestQuery = z.object({workspace_id:z.string().min(1).max(96).optional()}).strict();
const seenRequest = z.object({ snapshot_revision: z.string().regex(/^[0-9a-f]{64}$/),
  expected_baseline_version: z.number().int().min(0).max(2147483646) }).strict();
@UseGuards(SessionGuard)
@Controller("/api/v1/execution/visit-digest")
export class VisitDigestController {
  constructor(@Inject(VisitDigestService) private readonly service: VisitDigestService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {}
  private async principal(request: Request, query: unknown) {
    const parsed=digestQuery.safeParse(query??{});
    if(!parsed.success)throw new CommandCenterError("VISIT_DIGEST_INPUT_INVALID","Check the workspace query.",400);
    const workspaceId = parsed.data.workspace_id ?? request.portalWorkspaceId;
    if (!workspaceId || !await this.workspaces.isMember(workspaceId, request.portalUser.userId))
      throw new CommandCenterError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    return { user: request.portalUser, session: request.portalSession, workspaceId,
      viewerWorkspaceId: request.portalViewerWorkspaceId ?? request.portalWorkspaceId };
  }
  @Get("") @Header("Cache-Control", "private, no-store")
  async read(@Req() request: Request, @Query() query?: unknown) {
    return this.service.read(await this.principal(request, query));
  }
  @Post("/seen") @HttpCode(200) @Header("Cache-Control", "private, no-store")
  async seen(@Req() request: Request, @Body() body: unknown, @Query() query?: unknown) {
    const denial = mutationSecurityDenial(request, { csrfSecretHash: request.portalSession.csrfSecretHash, allowedOrigin: this.config.PORTAL_PUBLIC_ORIGIN });
    if (denial) throw new CommandCenterError(denial, MUTATION_SECURITY_MESSAGE[denial], 403);
    const parsed = seenRequest.safeParse(body);
    if (!parsed.success) throw new CommandCenterError("VISIT_DIGEST_INPUT_INVALID", "Check the digest revision and baseline version.", 400);
    return this.service.seen(await this.principal(request, query), parsed.data);
  }
}
