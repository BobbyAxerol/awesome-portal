import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { AuthService } from "../auth/auth.service";
import { OwnerAccessService, type EffectiveAccess } from "../auth/owner-access.service";
import type { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import { sessionTokenFrom } from "../auth/cookies";
import {
  MUTATION_SECURITY_MESSAGE,
  mutationSecurityDenial,
} from "../auth/mutation-security";

/**
 * A4-1 · the one guard every owner-only administration route stands behind.
 *
 * `AdminGuard` checks a live session and `role === "ADMIN"` and stops there
 * (finding A4-F05). That leaves the six `/api/admin/*` account mutations with
 * no server-side Origin or CSRF enforcement at all, while seven other
 * controllers each carry their own hand-copied version of both. This guard
 * closes that gap using the shared decision in `auth/mutation-security`, so
 * there is no eighth copy.
 *
 * Order matters and is deliberate:
 *
 *   1. session — an anonymous caller learns nothing beyond 401
 *   2. user is ACTIVE — a disabled account's live cookie stops here
 *   3. owner anchor — the authorization decision, from the server's own row
 *   4. Origin + CSRF — only for mutations
 *
 * Owner is checked BEFORE CSRF so that a non-owner probing an admin route gets
 * the same 403 whether or not they bothered to forge a CSRF token. Reversing
 * the two would turn the CSRF error into an oracle that says "you would have
 * been allowed".
 */
@Injectable()
export class OwnerAccessGuard implements CanActivate {
  /*
   * Config is INJECTED, not loaded here.
   *
   * A `loadConfig()` call in a class-field initializer runs while Nest is
   * constructing the provider, so a config it cannot resolve takes down app
   * construction rather than failing one request. Every one of the sixteen
   * specs that boot the app crashed on exactly that. The rest of this codebase
   * injects `CONTROL_API_CONFIG`; so does this.
   */
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(OwnerAccessService) private readonly ownerAccess: OwnerAccessService,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const requestId = (request.headers["x-request-id"] as string | undefined) ?? null;
    const mutation = isMutation(request.method);

    /*
     * A4-1 item 6 · every refusal of an owner-only route leaves a row.
     *
     * The response deliberately says the same thing at every stage ("Invalid
     * session." / "Access denied."), which is right for the caller and useless
     * for the owner. `stage` is the part that only the server sees: it is the
     * difference between an expired cookie, a disabled account and somebody
     * probing the admin surface. It carries no username, no token, no address
     * and no browser payload — `recordSecurityDecision` has nowhere to put
     * them.
     */
    const deny = async (stage: string, userId: string | null) => {
      await this.auth.audit.recordSecurityDecision({
        eventType: "owner_step_up_denied",
        actorUserId: userId,
        result: "DENIED",
        reasonCode: stage,
        requestId,
        metadata: { method: request.method, mutation },
      });
    };

    const token = sessionTokenFrom(request);
    if (!token) {
      await deny("NO_SESSION_COOKIE", null);
      throw new UnauthorizedException("Invalid session.");
    }

    const session = await this.auth.sessionFromToken(token);
    // `sessionFromToken` returns REVOKED and EXPIRED rows rather than null, so
    // the state check is not optional — it is the check.
    if (!session || session.state !== "ACTIVE") {
      await deny(session ? `SESSION_${session.state}` : "SESSION_UNKNOWN", session?.userId ?? null);
      throw new UnauthorizedException("Invalid session.");
    }

    const user = await this.auth.users.findById(session.userId);
    if (!user || user.status !== "ACTIVE") {
      await deny(user ? `USER_${user.status}` : "USER_MISSING", session.userId);
      throw new UnauthorizedException("Invalid session.");
    }

    /*
     * A4-1 · a half-finished login does not administer the Portal.
     *
     * `SessionGuard` refuses `mustChangePassword` and this guard did not, so a
     * session minted from a one-time activation credential — before any
     * password exists — carried full owner authority over every account. That
     * inverts the point of the activation flow: whoever holds the one-time
     * string for ten minutes could create users, reset credentials and disable
     * accounts without ever knowing a password, and the real owner would find
     * the work already done. The activation is a key to finish signing up, not
     * a key to the building.
     */
    if (user.mustChangePassword) {
      await deny("PASSWORD_CHANGE_PENDING", user.userId);
      throw new UnauthorizedException("Invalid session.");
    }

    // Defence in depth, stated accurately: all three `bumpSessionVersion` call
    // sites (changePassword, resetCredential, role change) already call
    // `revokeAllForUser` beside them, so this is not closing an open hole
    // today. But `sessionFromToken` compares no version of its own, so the
    // moment a fourth call site forgets the revoke, this is the only thing
    // between a superseded cookie and an account mutation.
    if (session.sessionVersion !== user.sessionVersion) {
      await deny("SESSION_VERSION_SUPERSEDED", user.userId);
      throw new UnauthorizedException("Invalid session.");
    }

    const access = await this.ownerAccess.effectiveAccess(user.userId);
    if (!access.isOwner) {
      await deny(access.ownerState, user.userId);
      // One message for "not the owner" and for "nobody is the owner yet". The
      // distinction is real and is reported on /access/self to an authenticated
      // caller; it is not spent here, where it would tell a prober whether the
      // Portal has an owner to attack.
      throw new ForbiddenException("Access denied.");
    }

    if (mutation) {
      const denial = mutationSecurityDenial(request, {
        csrfSecretHash: (session as { csrfSecretHash?: string }).csrfSecretHash ?? "",
        allowedOrigin: this.config.PORTAL_PUBLIC_ORIGIN,
      });
      if (denial) {
        await deny(denial, user.userId);
        throw new ForbiddenException(MUTATION_SECURITY_MESSAGE[denial]);
      }
      /*
       * Granted is recorded for mutations only. A step-up is what authorizes a
       * CHANGE; recording one for every owner page load would bury the six
       * rows that matter under a stream of reads, and an audit trail nobody
       * can read is not an audit trail.
       */
      await this.auth.audit.recordSecurityDecision({
        eventType: "owner_step_up_granted",
        actorUserId: user.userId,
        result: "SUCCESS",
        reasonCode: "OWNER_ANCHOR_MATCHED",
        requestId,
        metadata: { method: request.method },
      });
    }

    const state = request as unknown as {
      portalUser: typeof user;
      portalSession: typeof session;
      portalAccess: EffectiveAccess;
    };
    state.portalUser = user;
    state.portalSession = session;
    state.portalAccess = access;
    return true;
  }
}

/** GET and HEAD are reads; everything else changes something. */
function isMutation(method: string): boolean {
  const verb = method.toUpperCase();
  return verb !== "GET" && verb !== "HEAD" && verb !== "OPTIONS";
}
