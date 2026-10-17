import { z } from "zod";
import type { AuthSession, PortalUser } from "../domain";
import type { AccessTrustProvider } from "../execution-v2/access-trust";
import { WorkspacesRepository } from "../repos/workspaces";
import { AuthError, AuthService } from "./auth.service";
import { OwnerAccessService } from "./owner-access.service";
import { ownProfile, unmappedTsIdentity, type OwnTsIdentity } from "./profile.contract";

const mapping = z.object({ ts_user_id: z.string().uuid(), revision: z.string().min(1).max(128)
  .regex(/^[^\u0000-\u001f\u007f]+$/u) }).strict();

/** Reuses the installed mapping observation; it is not an entitlement or a
 * second identity provider. No network I/O is performed with Core locks held.
 * Source failures degrade the mapping only; they never change a PATCH receipt. */
export class OwnProfileProjection {
  constructor(private readonly auth: AuthService, private readonly access: OwnerAccessService,
    private readonly workspaces: WorkspacesRepository, private readonly trust?: AccessTrustProvider) {}

  private async current(input: {user: PortalUser; session: AuthSession; workspaceId: string}) {
    if (input.session.userId !== input.user.userId)
      throw new AuthError("SESSION_REQUIRED", "Invalid session.", 401);
    // A retained business-read grant is not membership authority for identity
    // discovery in an arbitrary workspace. Even owner names/roles cannot bypass.
    const user = await this.auth.users.findCurrentSessionInWorkspace({ userId: input.user.userId,
      sessionId: input.session.sessionId, sessionVersion: input.session.sessionVersion, workspaceId: input.workspaceId });
    if (user) return user;
    if (!await this.workspaces.isMember(input.workspaceId, input.user.userId))
      throw new AuthError("PROFILE_WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    throw new AuthError("SESSION_REQUIRED", "Invalid session.", 401);
  }

  async project(input: {user: PortalUser; session: AuthSession; workspaceId: string}) {
    await this.current(input);
    let tsIdentity = unmappedTsIdentity();
    if (this.trust) {
      try {
        const result = await this.trust.verifiedHumanMapping(input.user.userId, input.workspaceId);
        if (result === null) tsIdentity = unmappedTsIdentity("MAPPING_NOT_PUBLISHED");
        else {
          const parsed = mapping.parse(result);
          tsIdentity = { state: "MAPPED", ts_user_id: parsed.ts_user_id,
            mapping_revision: parsed.revision, workspace_id: input.workspaceId,
            observed_at_utc_ms: Date.now(), source_locator: "ELP2-00/ELP2-REQ-00-003" } satisfies OwnTsIdentity;
        }
      } catch { tsIdentity = unmappedTsIdentity("MAPPING_SOURCE_UNAVAILABLE"); }
    }
    const [bindings, access] = await Promise.all([
      this.auth.bindings.findByUser(input.user.userId), this.access.effectiveAccess(input.user.userId),
    ]);
    // Discard a positive mapping if the session/generation or workspace was
    // revoked during source I/O. No cached positive can survive the next read.
    const user = await this.current(input);
    return ownProfile(user, bindings.length, access, tsIdentity);
  }
}
