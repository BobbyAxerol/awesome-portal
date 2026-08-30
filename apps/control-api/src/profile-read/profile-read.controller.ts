import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ProfileOverviewQuerySchema } from "./contracts";
import { ProfileReadService } from "./profile-read.service";

interface ProfileReadRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/screens")
export class ProfileReadController {
  constructor(
    @Inject(ProfileReadService) private readonly profiles: ProfileReadService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get("/sandbox")
  sandbox(@Req() request: ProfileReadRequest, @Query() raw: unknown) {
    return this.overview(request, raw, "sandbox");
  }

  @Get("/live")
  live(@Req() request: ProfileReadRequest, @Query() raw: unknown) {
    return this.overview(request, raw, "live");
  }

  private async overview(
    request: ProfileReadRequest,
    raw: unknown,
    environment: "sandbox" | "live",
  ) {
    const query = ProfileOverviewQuerySchema.safeParse(raw);
    if (!query.success) throw new ProfileReadError("N23_QUERY_INVALID", 400);
    const workspaceId = query.data.workspace_id ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ProfileReadError("WORKSPACE_NOT_FOUND", 404);
    }
    return this.profiles.overview({
      user: request.portalUser,
      session: request.portalSession,
      workspaceId,
    }, environment);
  }
}

export class ProfileReadError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
