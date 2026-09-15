import { Pool } from "pg";
import {
  AuthSession,
  ContextState,
  GENERIC_LOGIN_ERROR,
  PortalPrincipal,
  PortalUser,
  VerifiedAccessIdentity,
  normalizeEmail,
  randomId,
} from "../domain";
import { ControlApiConfig } from "../config";
import { AuditRepository } from "../repos/audit";
import { BindingsRepository } from "../repos/bindings";
import { CredentialsRepository } from "../repos/credentials";
import { SessionsRepository } from "../repos/sessions";
import { UsersRepository } from "../repos/users";
import { Argon2CredentialService, constantTimeEqual, randomToken, sha256 } from "./argon";
import { CloudflareJwtError, CloudflareJwtVerifier } from "./cloudflare";
import { isAcceptablePassword, validatePassword } from "./policy";
import { PrincipalService } from "./principal";

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export interface SessionResult {
  sessionId: string;
  token: string;
  csrfToken: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export interface AuthContextResult {
  state: ContextState;
  principal: PortalPrincipal | null;
  accessIdentity: { sub: string; email: string } | null;
}

type CredentialProof =
  | { kind: "ACTIVATION"; activationId: string }
  | { kind: "PASSWORD"; activationId: null };

export class AuthService {
  readonly users: UsersRepository;
  readonly bindings: BindingsRepository;
  readonly credentials: CredentialsRepository;
  readonly sessions: SessionsRepository;
  readonly audit: AuditRepository;
  readonly verifier: CloudflareJwtVerifier | null;

  constructor(
    readonly pool: Pool,
    readonly config: ControlApiConfig,
    readonly argon2: Argon2CredentialService,
  ) {
    this.users = new UsersRepository(pool);
    this.bindings = new BindingsRepository(pool);
    this.credentials = new CredentialsRepository(pool);
    this.sessions = new SessionsRepository(pool);
    this.audit = new AuditRepository(pool);
    this.verifier =
      config.AUTH_MODE === "dev"
        ? null
        : new CloudflareJwtVerifier({
            issuer: config.CLOUDFLARE_ACCESS_ISSUER!,
            audience: config.CLOUDFLARE_ACCESS_AUD!,
            jwksUri: config.CLOUDFLARE_ACCESS_JWKS_URI!,
            allowedEmailDomain: config.CLOUDFLARE_ALLOWED_EMAIL_DOMAIN,
            jwksCacheTtlSeconds: config.JWKS_CACHE_TTL_SECONDS,
          });
  }

  // ------------------------------------------------------------- access

  async verifyAccessIdentity(
    assertion: string | undefined,
    devEmail: string | undefined,
  ): Promise<VerifiedAccessIdentity> {
    if (this.config.AUTH_MODE === "dev") {
      const email = /^[a-z0-9._%+-]+@azdag\.com$/.test(devEmail ?? "")
        ? devEmail!
        : "dev@azdag.com";
      return {
        sub: `dev-${normalizeEmail(email)}`,
        email,
        normalizedEmail: normalizeEmail(email),
        iss: "dev",
        aud: "dev",
        authenticationTime: new Date(),
        tokenExpiresAt: new Date(Date.now() + 60_000),
      };
    }
    return this.verifier!.verify(assertion);
  }

  // ------------------------------------------------------------ context

  async context(
    assertion: string | undefined,
    sessionToken: string | undefined,
    devEmail: string | undefined,
  ): Promise<AuthContextResult> {
    let identity: VerifiedAccessIdentity;
    try {
      identity = await this.verifyAccessIdentity(assertion, devEmail);
    } catch (error) {
      await this.audit.record({
        eventType: "access_jwt_rejected",
        accessSubject: null,
        result: "DENIED",
        reasonCode: error instanceof CloudflareJwtError ? error.code : "ACCESS_JWT_INVALID",
      });
      return { state: "ACCESS_REQUIRED", principal: null, accessIdentity: null };
    }

    let session = sessionToken ? await this.sessionFromToken(sessionToken) : null;
    if (session && session.state !== "ACTIVE") {
      session = null;
    }
    if (session) {
      const user = await this.users.findById(session.userId);
      if (user && user.status === "DISABLED") {
        return {
          state: "ACCOUNT_DISABLED",
          principal: null,
          accessIdentity: { sub: identity.sub, email: identity.email },
        };
      }
      if (user && user.mustChangePassword) {
        return {
          state: "PASSWORD_CHANGE_REQUIRED",
          principal: null,
          accessIdentity: { sub: identity.sub, email: identity.email },
        };
      }
      if (user) {
        const principal = await this.principalFor(user, session);
        return {
          state: "AUTHENTICATED",
          principal,
          accessIdentity: { sub: identity.sub, email: identity.email },
        };
      }
    }

    const binding = await this.bindings.findByProviderIdentity(
      identity.iss,
      identity.sub,
    );
    if (!binding) {
      return {
        state: "APP_LOGIN_REQUIRED",
        principal: null,
        accessIdentity: { sub: identity.sub, email: identity.email },
      };
    }
    await this.bindings.touch(binding.bindingId);
    const user = await this.users.findById(binding.userId);
    if (!user) {
      return {
        state: "APP_LOGIN_REQUIRED",
        principal: null,
        accessIdentity: { sub: identity.sub, email: identity.email },
      };
    }
    if (user.status === "DISABLED") {
      return {
        state: "ACCOUNT_DISABLED",
        principal: null,
        accessIdentity: { sub: identity.sub, email: identity.email },
      };
    }
    /*
     * A4-1 item 4 · the activation dead end.
     *
     * Everything above has already been proved: Cloudflare Access verified
     * this identity, and the binding says this identity IS this Portal user.
     * Only here — never before — is it safe to say more than the generic
     * answer, because the only person who can read it is the account's own
     * holder asking about their own account.
     *
     * The condition is narrow on purpose. `must_change_password` means login
     * accepts an activation credential and nothing else (`verifyCredential`);
     * no usable activation therefore means no possible credential, not a wrong
     * one. Reported as APP_LOGIN_REQUIRED, that account is invited to retype a
     * credential that cannot exist, forever, while each attempt walks it
     * closer to a lockout.
     *
     * Deliberately NOT reached when a live session exists: a first-login user
     * mid-change-password has already CONSUMED their activation, so they have
     * no usable one by definition. That branch returns PASSWORD_CHANGE_REQUIRED
     * above and must keep doing so — testing recovery there would divert every
     * legitimate first login into a dead end.
     */
    if (
      user.mustChangePassword &&
      !(await this.credentials.hasUsableActivation(user.userId))
    ) {
      await this.audit.recordSecurityDecision({
        eventType: "activation_recovery_required",
        targetUserId: user.userId,
        result: "DENIED",
        reasonCode: "NO_USABLE_ACTIVATION",
      });
      return {
        state: "ACTIVATION_RECOVERY_REQUIRED",
        principal: null,
        accessIdentity: { sub: identity.sub, email: identity.email },
      };
    }
    // Without a Portal session the user must complete 01B first: the
    // activation/password login creates the session (and its CSRF secret)
    // that PASSWORD_CHANGE_REQUIRED's change-password call depends on.
    // Reporting PASSWORD_CHANGE_REQUIRED here strands an unauthenticated
    // visitor on frame 01C with no CSRF token (observed 2026-08-25).
    return {
      state: "APP_LOGIN_REQUIRED",
      principal: null,
      accessIdentity: { sub: identity.sub, email: identity.email },
    };
  }

  // -------------------------------------------------------------- login

  async login(input: {
    assertion: string | undefined;
    devEmail?: string;
    username: string;
    credential: string;
    requestId?: string;
    sourceIp?: string;
  }): Promise<SessionResult> {
    let identity: VerifiedAccessIdentity;
    try {
      identity = await this.verifyAccessIdentity(input.assertion, input.devEmail);
    } catch (error) {
      await this.audit.record({
        eventType: "login_denied_access",
        result: "DENIED",
        reasonCode: error instanceof CloudflareJwtError ? error.code : "ACCESS_JWT_INVALID",
        requestId: input.requestId,
        sourceIp: input.sourceIp,
      });
      throw new AuthError("ACCESS_REQUIRED", GENERIC_LOGIN_ERROR, 401);
    }

    const user = await this.users.findByUsername(input.username.trim());
    if (!user || user.status === "DISABLED") {
      await this.audit.record({
        eventType: "login_failed_unknown_user",
        targetUserId: user?.userId ?? null,
        accessSubject: identity.sub,
        result: "FAILURE",
        reasonCode: "UNKNOWN_OR_DISABLED_USER",
        requestId: input.requestId,
        sourceIp: input.sourceIp,
      });
      throw new AuthError("INVALID_CREDENTIALS", GENERIC_LOGIN_ERROR, 401);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.record({
        eventType: "login_denied_locked",
        targetUserId: user.userId,
        accessSubject: identity.sub,
        result: "DENIED",
        reasonCode: "ACCOUNT_LOCKED",
        requestId: input.requestId,
        sourceIp: input.sourceIp,
      });
      /*
       * A4-1 · the code said what the message was careful not to.
       *
       * The message here has always been the generic one, but the response
       * also carries `error.code`, and `ACCOUNT_LOCKED` appears for exactly
       * one username at a time. That answers two questions a stranger should
       * not be able to ask — does this account exist, and is it currently
       * locked — and the second is what tells an attacker their own lockout
       * campaign is working. Indistinguishable on the wire; the reason lives
       * in the `login_denied_locked` audit row, where the owner can read it
       * and nobody else can.
       */
      throw new AuthError("INVALID_CREDENTIALS", GENERIC_LOGIN_ERROR, 401);
    }

    const binding = await this.bindings.findByProviderIdentity(
      identity.iss,
      identity.sub,
    );
    if (binding && binding.userId !== user.userId) {
      await this.audit.record({
        eventType: "login_denied_binding_conflict",
        targetUserId: user.userId,
        accessSubject: identity.sub,
        result: "DENIED",
        reasonCode: "IDENTITY_BINDING_CONFLICT",
        requestId: input.requestId,
        sourceIp: input.sourceIp,
      });
      throw new AuthError("INVALID_CREDENTIALS", GENERIC_LOGIN_ERROR, 401);
    }
    const emailBinding = await this.bindings.findByProviderEmail(
      identity.iss,
      identity.email,
    );
    if (emailBinding && emailBinding.userId !== user.userId) {
      await this.audit.record({
        eventType: "login_denied_binding_conflict",
        targetUserId: user.userId,
        accessSubject: identity.sub,
        result: "DENIED",
        reasonCode: "IDENTITY_BINDING_CONFLICT",
        requestId: input.requestId,
        sourceIp: input.sourceIp,
      });
      throw new AuthError("INVALID_CREDENTIALS", GENERIC_LOGIN_ERROR, 401);
    }

    const credentialProof = await this.verifyCredential(user, input.credential);
    if (!credentialProof) {
      const attempts = await this.users.recordFailedLogin(
        user.userId,
        this.config.LOGIN_LOCK_ATTEMPTS,
        // A4-F07: this value was declared and never read. The lock duration
        // was a hard-coded SQL interval, so the environment variable was inert.
        this.config.LOGIN_LOCK_SECONDS,
      );
      await this.audit.record({
        eventType: "login_failed_credential",
        targetUserId: user.userId,
        accessSubject: identity.sub,
        result: "FAILURE",
        reasonCode: "INVALID_CREDENTIAL",
        requestId: input.requestId,
        sourceIp: input.sourceIp,
        metadata: { failedLoginCount: attempts },
      });
      /*
       * A4-1 item 6 · the lock lifecycle, recorded where it happens.
       *
       * `recordFailedLogin` sets `locked_until` in the same UPDATE that
       * increments the counter, so the lock had no event of its own: the only
       * trace was a counter that happened to cross a threshold. An owner
       * asking "why can this account not log in" had to re-derive the rule.
       */
      if (attempts >= this.config.LOGIN_LOCK_ATTEMPTS) {
        await this.audit.recordSecurityDecision({
          eventType: "account_locked",
          targetUserId: user.userId,
          result: "DENIED",
          reasonCode: "FAILED_LOGIN_THRESHOLD",
          requestId: input.requestId,
          metadata: {
            failedLoginCount: attempts,
            lockSeconds: this.config.LOGIN_LOCK_SECONDS,
          },
        });
      }
      /*
       * The response stays generic — this row is the only place the truth is
       * said. An account whose every activation is spent cannot succeed at
       * this prompt no matter what it types, and without this event the owner
       * sees a user who "keeps getting the password wrong" rather than a user
       * who needs a new activation.
       */
      if (
        user.mustChangePassword &&
        !(await this.credentials.hasUsableActivation(user.userId))
      ) {
        await this.audit.recordSecurityDecision({
          eventType: "login_denied_activation_unusable",
          targetUserId: user.userId,
          result: "DENIED",
          reasonCode: "NO_USABLE_ACTIVATION",
          requestId: input.requestId,
        });
      }
      if (attempts >= this.config.LOGIN_FAILED_DELAY_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      throw new AuthError("INVALID_CREDENTIALS", GENERIC_LOGIN_ERROR, 401);
    }

    await this.users.resetLoginCounters(user.userId);
    const wasInvited = user.status === "INVITED" && !binding;
    if (wasInvited) {
      await this.bindings.create({
        bindingId: randomId("bnd"),
        userId: user.userId,
        issuer: identity.iss,
        subject: identity.sub,
        email: identity.email,
      });
      await this.users.update({ userId: user.userId, mustChangePassword: true });
      await this.audit.record({
        eventType: "identity_bound",
        actorUserId: user.userId,
        targetUserId: user.userId,
        accessSubject: identity.sub,
        result: "SUCCESS",
        requestId: input.requestId,
        sourceIp: input.sourceIp,
      });
    } else if (binding) {
      await this.bindings.touch(binding.bindingId);
    }

    await this.audit.record({
      eventType: "login_succeeded",
      actorUserId: user.userId,
      targetUserId: user.userId,
      accessSubject: identity.sub,
      result: "SUCCESS",
      requestId: input.requestId,
      sourceIp: input.sourceIp,
    });
    return this.createSession(
      user,
      identity,
      credentialProof.activationId,
      input.requestId,
    );
  }

  private async verifyCredential(
    user: PortalUser,
    credential: string,
  ): Promise<CredentialProof | null> {
    if (user.mustChangePassword) {
      const activation = await this.credentials.consumeUsableActivation(
        user.userId,
        sha256(credential),
      );
      return activation
        ? { kind: "ACTIVATION", activationId: activation.activationId }
        : null;
    }
    if (user.status !== "ACTIVE") return null;
    const password = await this.credentials.findPassword(user.userId);
    if (!password) return null;
    return (await this.argon2.verify(password.passwordHash, credential))
      ? { kind: "PASSWORD", activationId: null }
      : null;
  }

  // ------------------------------------------------------------ sessions

  async sessionFromToken(
    token: string | undefined,
  ): Promise<Awaited<ReturnType<SessionsRepository["findByTokenHash"]>> | null> {
    if (!token) return null;
    const row = await this.sessions.findByTokenHash(sha256(token));
    if (!row) return null;
    const now = new Date();
    if (
      row.state === "ACTIVE" &&
      (row.absoluteExpiresAt <= now || row.idleExpiresAt <= now)
    ) {
      await this.sessions.revokeSession(row.sessionId, "expired");
      return { ...row, state: "EXPIRED" as const };
    }
    return row;
  }

  private async createSession(
    user: PortalUser,
    identity: VerifiedAccessIdentity,
    activationId: string | null,
    requestId: string | undefined,
  ): Promise<SessionResult> {
    const token = randomToken(32);
    const csrfToken = randomToken(24);
    const now = new Date();
    const session: SessionResult = {
      sessionId: randomId("ses"),
      token,
      csrfToken,
      idleExpiresAt: new Date(now.getTime() + this.config.SESSION_IDLE_SECONDS * 1000),
      absoluteExpiresAt: new Date(now.getTime() + this.config.SESSION_ABSOLUTE_SECONDS * 1000),
    };
    await this.sessions.create({
      sessionId: session.sessionId,
      tokenHash: sha256(token),
      userId: user.userId,
      accessSubject: identity.sub,
      accessTokenExpiresAt: identity.tokenExpiresAt,
      csrfSecretHash: sha256(csrfToken),
      activationId,
      sessionVersion: user.sessionVersion,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    });
    return session;
  }

  private async principalFor(
    user: PortalUser,
    session: NonNullable<Awaited<ReturnType<SessionsRepository["findByTokenHash"]>>>,
  ): Promise<PortalPrincipal> {
    const principal: PortalPrincipal = {
      principalId: user.userId,
      username: user.username,
      accessSubject: session.accessSubject,
      accessEmail: null,
      role: user.role,
      authnMethods: ["cloudflare_access", "local_password"],
      sessionId: session.sessionId,
      mustChangePassword: user.mustChangePassword,
      issuedAt: new Date().toISOString(),
      policyVersion: "auth-policy-v1",
      exp: Math.floor(Date.now() / 1000) + 60,
    };
    return principal;
  }

  principalToken(
    user: PortalUser,
    session: NonNullable<Awaited<ReturnType<SessionsRepository["findByTokenHash"]>>>,
    principalSecret: string,
  ): string {
    const service = new PrincipalService(principalSecret);
    return service.sign({
      principalId: user.userId,
      username: user.username,
      accessSubject: session.accessSubject,
      accessEmail: null,
      role: user.role,
      authnMethods: ["cloudflare_access", "local_password"],
      sessionId: session.sessionId,
      mustChangePassword: user.mustChangePassword,
      issuedAt: new Date().toISOString(),
    });
  }

  // ------------------------------------------------------ password change

  async changePassword(input: {
    sessionToken: string;
    csrfToken: string;
    currentPassword: string;
    newPassword: string;
    requestId?: string;
  }): Promise<void> {
    const session = await this.sessionFromToken(input.sessionToken);
    if (!session || session.state !== "ACTIVE") {
      throw new AuthError("SESSION_REQUIRED", "Invalid session.", 401);
    }
    if (!constantTimeEqual(sha256(input.csrfToken), session.csrfSecretHash)) {
      throw new AuthError("CSRF_INVALID", "CSRF token is invalid.", 403);
    }
    const user = await this.users.findById(session.userId);
    if (!user) {
      throw new AuthError("SESSION_REQUIRED", "Invalid session.", 401);
    }
    /*
     * A4-1 · a disabled account performs no credential operations.
     *
     * `AdminService.disable` revokes sessions a moment after it writes the
     * status, and a request already in flight lands in that gap. Letting it
     * through meant a terminated account could still set a password — and,
     * before the status write below was narrowed, write itself back to ACTIVE
     * and clear `disabled_at` with it. Checked here as well as there because
     * the refusal is the real rule; the narrowed write is what stops any
     * future caller from undoing a revocation by accident.
     */
    if (user.status === "DISABLED") {
      await this.audit.record({
        eventType: "password_change_denied",
        actorUserId: user.userId,
        result: "DENIED",
        reasonCode: "ACCOUNT_DISABLED",
        requestId: input.requestId,
      });
      throw new AuthError("SESSION_REQUIRED", "Invalid session.", 401);
    }
    const currentCredentialMatches = session.activationId
      ? await this.credentials.matchesConsumedActivation({
          activationId: session.activationId,
          userId: user.userId,
          tokenHash: sha256(input.currentPassword),
        })
      : await (async () => {
          const credential = await this.credentials.findPassword(user.userId);
          return credential
            ? this.argon2.verify(credential.passwordHash, input.currentPassword)
            : false;
        })();
    if (!currentCredentialMatches) {
      await this.audit.record({
        eventType: "password_change_denied",
        actorUserId: user.userId,
        result: "DENIED",
        reasonCode: "INVALID_CURRENT_PASSWORD",
        requestId: input.requestId,
      });
      throw new AuthError("INVALID_CREDENTIALS", GENERIC_LOGIN_ERROR, 401);
    }
    const policyError = validatePassword(input.newPassword);
    if (policyError) {
      throw new AuthError(policyError.code, policyError.message, 422);
    }
    if (!isAcceptablePassword(input.newPassword)) {
      throw new AuthError("PASSWORD_REJECTED", "Password does not meet the policy.", 422);
    }
    const { hash, parametersJson } = await this.argon2.hash(input.newPassword);
    await this.credentials.upsertPassword({
      credentialId: randomId("pwd"),
      userId: user.userId,
      passwordHash: hash,
      parametersJson,
    });
    /*
     * A4-1 · order these two so a crash cannot strand the account.
     *
     * These four writes are not one transaction. With the revoke first, a
     * process death between it and the update left: a usable new password, no
     * activation, and `must_change_password` still true — an account that
     * login will only accept an activation for, and that has none. Permanent,
     * and only an owner reset could undo it.
     *
     * Clearing the flag first inverts the failure: a crash in the new window
     * leaves a spent activation row behind (already `used_at IS NOT NULL`, so
     * useless for login) while the user simply signs in with the password they
     * just set. Same happy path, recoverable failure instead of a dead end.
     */
    await this.users.update({
      userId: user.userId,
      /*
       * A4-1 · setting a password completes an invitation; it never reverses a
       * revocation.
       *
       * This wrote `ACTIVE` unconditionally, which is right for the INVITED
       * user it was built for and wrong for everyone else: a holder of a live
       * session whose account was disabled mid-request could call
       * change-password and write their own status back to ACTIVE, clearing
       * `disabled_at` with it. Revoking access is the owner's decision under
       * §20.2 rule 3, and a self-service form must not be able to undo it. An
       * INVITED account is promoted; any other status is left exactly as the
       * owner set it.
       */
      status: user.status === "INVITED" ? "ACTIVE" : undefined,
      mustChangePassword: false,
    });
    await this.credentials.revokeActivationCredentials(user.userId);
    await this.users.bumpSessionVersion(user.userId);
    await this.sessions.revokeAllForUser(user.userId, "password_change");
    await this.audit.record({
      eventType: "password_changed",
      actorUserId: user.userId,
      targetUserId: user.userId,
      result: "SUCCESS",
      requestId: input.requestId,
    });
  }

  // ------------------------------------------------------------- logout

  async logout(sessionToken: string | undefined, requestId?: string): Promise<void> {
    if (!sessionToken) return;
    const row = await this.sessions.findByTokenHash(sha256(sessionToken));
    if (!row) return;
    await this.sessions.revokeSession(row.sessionId, "logout");
    await this.audit.record({
      eventType: "logout",
      actorUserId: row.userId,
      result: "SUCCESS",
      requestId,
    });
  }
}
