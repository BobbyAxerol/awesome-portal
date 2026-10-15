import { Body, Controller, Get, Inject, Patch, Req, Res, UseGuards } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { AccountLifecycleService, LifecycleDeniedError } from "../admin/account-lifecycle.service";
import { AuthError, AuthService } from "./auth.service";
import { OwnerAccessService } from "./owner-access.service";
import { mutationSecurityDenial, MUTATION_SECURITY_MESSAGE } from "./mutation-security";
import { OwnProfilePatch, ownProfile } from "./profile.contract";

type ProfileRequest = FastifyRequest & {
  portalUser: PortalUser;
  portalSession: { sessionId: string; csrfSecretHash: string };
};

@Controller("/api/auth/profile")
@UseGuards(SessionGuard)
export class ProfileController {
  constructor(@Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccountLifecycleService) private readonly lifecycle: AccountLifecycleService,
    @Inject(OwnerAccessService) private readonly access: OwnerAccessService) {}

  private async project(user: PortalUser) {
    return ownProfile(user, (await this.auth.bindings.findByUser(user.userId)).length,
      await this.access.effectiveAccess(user.userId));
  }

  @Get()
  async read(@Req() request: ProfileRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Cache-Control", "private, no-store");
    return this.project(request.portalUser);
  }

  @Patch()
  async update(@Req() request: ProfileRequest, @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Cache-Control", "private, no-store");
    const denial = mutationSecurityDenial(request, {
      csrfSecretHash: request.portalSession.csrfSecretHash, allowedOrigin: this.auth.config.PORTAL_PUBLIC_ORIGIN,
    });
    if (denial) throw new AuthError(denial, MUTATION_SECURITY_MESSAGE[denial], 403);
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
      profile: await this.project(result.account) };
  }
}
