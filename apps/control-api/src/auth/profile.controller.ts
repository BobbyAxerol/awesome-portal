import { Body, Controller, Get, Inject, Patch, Req, Res, UseGuards } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { AccountLifecycleService, LifecycleDeniedError } from "../admin/account-lifecycle.service";
import { AuthError, AuthService } from "./auth.service";
import { mutationSecurityDenial, MUTATION_SECURITY_MESSAGE } from "./mutation-security";
import { OwnProfilePatch, OwnProfileQuery } from "./profile.contract";
import { OwnProfileProjection } from "./profile-projection";
import { WorkspacesRepository } from "../repos/workspaces";

type ProfileRequest = FastifyRequest & {
  portalUser: PortalUser;
  portalSession: AuthSession & { csrfSecretHash: string };
  portalWorkspaceId: string;
};

@Controller("/api/auth/profile")
@UseGuards(SessionGuard)
export class ProfileController {
  constructor(@Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccountLifecycleService) private readonly lifecycle: AccountLifecycleService,
    @Inject(OwnProfileProjection) private readonly projection: OwnProfileProjection,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository) {}

  private async workspace(request: ProfileRequest) {
    const query = OwnProfileQuery.safeParse(request.query);
    if (!query.success) throw new AuthError("PROFILE_QUERY_INVALID", "Invalid profile context.", 400);
    const id = query.data.workspace_id ?? request.portalWorkspaceId;
    if (!await this.workspaces.isMember(id, request.portalUser.userId))
      throw new AuthError("PROFILE_WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    return id;
  }

  @Get()
  async read(@Req() request: ProfileRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Cache-Control", "private, no-store");
    return this.projection.project({ user: request.portalUser, session: request.portalSession,
      workspaceId: await this.workspace(request) });
  }

  @Patch()
  async update(@Req() request: ProfileRequest, @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Cache-Control", "private, no-store");
    const denial = mutationSecurityDenial(request, {
      csrfSecretHash: request.portalSession.csrfSecretHash, allowedOrigin: this.auth.config.PORTAL_PUBLIC_ORIGIN,
    });
    if (denial) throw new AuthError(denial, MUTATION_SECURITY_MESSAGE[denial], 403);
    // Validate the selected context before any display-name mutation occurs.
    const workspaceId = await this.workspace(request);
    const parsed = OwnProfilePatch.safeParse(body);
    if (!parsed.success) throw new AuthError("PROFILE_FIELDS_INVALID", "Only a display name and current revision are accepted.", 400);
    const key = request.headers["x-portal-idempotency-key"];
    if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
      throw new AuthError("IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.", 400);
    }
    const result = await this.lifecycle.updateOwnProfile({ actor: request.portalUser,
      sessionId: request.portalSession.sessionId, displayName: parsed.data.display_name,
      expectedRevision: parsed.data.expected_revision, idempotencyKey: key,
      requestId: typeof request.headers["x-request-id"] === "string" ? request.headers["x-request-id"] : undefined })
      .catch((error: unknown) => {
        if (error instanceof LifecycleDeniedError) throw new AuthError(error.reasonCode, error.message, error.status);
        throw error;
      });
    return { schema_version: "portal.profile-operation.v1", outcome: result.outcome,
      operation_id: result.operation.operationId, resulting_revision: result.operation.resultingRevision,
      profile: await this.projection.project({ user: result.account, session: request.portalSession, workspaceId }) };
  }
}
