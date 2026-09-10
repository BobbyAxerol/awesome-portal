import { Controller, Logger, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { screenEnvelopeV2From, screenResponseMetrics, wantsScreenV2 } from "../execution/screen-envelope-v2";
import { FastifyRequest } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { AccountBrokerQuerySchema, ProfileOverviewQuerySchema } from "./contracts";
import { ProfileReadService } from "./profile-read.service";

interface ProfileReadRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/screens")
export class ProfileReadController {
  private readonly screenLog = new Logger("ExecutionScreenResponse");

  constructor(
    @Inject(ProfileReadService) private readonly profiles: ProfileReadService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get("/sandbox")
  async sandbox(@Req() request: ProfileReadRequest, @Query() raw: unknown) {
    return this.negotiate(request, await this.overview(request, raw, "sandbox"));
  }

  @Get("/live")
  async live(@Req() request: ProfileReadRequest, @Query() raw: unknown) {
    return this.negotiate(request, await this.overview(request, raw, "live"));
  }

  @Get("/accounts/:account_id")
  async account(
    @Req() request: ProfileReadRequest,
    @Param("account_id") accountId: string,
    @Query() raw: unknown,
  ) {
    const query = AccountBrokerQuerySchema.safeParse(raw);
    if (!query.success || !/^[A-Za-z0-9._:-]{1,128}$/.test(accountId)) {
      throw new ProfileReadError("PHASE2_ACCOUNT_QUERY_INVALID", 400);
    }
    const workspaceId = query.data.workspace_id ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ProfileReadError("WORKSPACE_NOT_FOUND", 404);
    }
    return this.profiles.accountBroker({
      user: request.portalUser,
      session: request.portalSession,
      workspaceId,
    }, accountId, query.data.environment);
  }

  /**
   * V2 is the envelope the services build. A caller that does not ask for the
   * V2 media type gets V1 rebuilt from it, so the duplicate branch exists only
   * in the legacy response and never alongside V2.
   */
  private negotiate(request: FastifyRequest, envelope: unknown): unknown {
    const v1 = envelope as Record<string, unknown>;
    const wantsV2 = wantsScreenV2(request.headers.accept);
    const body = wantsV2 ? screenEnvelopeV2From(v1) : v1;
    const operation = String(v1.schema_version ?? "unknown").replace(/\.v[12]$/, "");
    // Per named operation, so the label set stays bounded no matter how many
    // deployments or workspaces exist.
    this.screenLog.log(JSON.stringify({
      event: "execution_screen_response",
      ...screenResponseMetrics(operation, wantsV2 ? "v2" : "v1", body),
    }));
    return body;
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
