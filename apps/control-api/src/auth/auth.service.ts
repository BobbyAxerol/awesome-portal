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
    if (user.mustChangePassword) {
      return {
        state: "PASSWORD_CHANGE_REQUIRED",
        principal: null,
        accessIdentity: { sub: identity.sub, email: identity.email },
      };
    }
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
      throw new AuthError("ACCOUNT_LOCKED", GENERIC_LOGIN_ERROR, 401);
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

    const verified = await this.verifyCredential(user, input.credential);
    if (!verified) {
      const attempts = await this.users.recordFailedLogin(
        user.userId,
        this.config.LOGIN_LOCK_ATTEMPTS,
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
    return this.createSession(user, identity, input.requestId);
  }

  private async verifyCredential(
    user: PortalUser,
    credential: string,
  ): Promise<boolean> {
    if (user.status === "INVITED") {
      const activation = await this.credentials.findUsableActivation(
        user.userId,
        sha256(credential),
      );
      if (!activation) return false;
      await this.credentials.markActivationUsed(activation.activationId);
      return true;
    }
    const password = await this.credentials.findPassword(user.userId);
    if (!password) return false;
    return this.argon2.verify(password.passwordHash, credential);
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
      throw new AuthError("SESSION_REQUIRED", "Phiên đăng nhập không hợp lệ.", 401);
    }
    if (!constantTimeEqual(sha256(input.csrfToken), session.csrfSecretHash)) {
      throw new AuthError("CSRF_INVALID", "CSRF token không hợp lệ.", 403);
    }
    const user = await this.users.findById(session.userId);
    if (!user) {
      throw new AuthError("SESSION_REQUIRED", "Phiên đăng nhập không hợp lệ.", 401);
    }
    const credential = await this.credentials.findPassword(user.userId);
    if (credential && !(await this.argon2.verify(credential.passwordHash, input.currentPassword))) {
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
      throw new AuthError("PASSWORD_REJECTED", "Mật khẩu không đạt chính sách.", 422);
    }
    const { hash, parametersJson } = await this.argon2.hash(input.newPassword);
    await this.credentials.upsertPassword({
      credentialId: randomId("pwd"),
      userId: user.userId,
      passwordHash: hash,
      parametersJson,
    });
    await this.credentials.revokeActivationCredentials(user.userId);
    await this.users.update({
      userId: user.userId,
      status: "ACTIVE",
      mustChangePassword: false,
    });
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
