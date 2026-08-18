import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthError, AuthService } from "./auth.service";
import {
  ACCESS_ASSERTION_HEADER,
  CSRF_COOKIE,
  CSRF_HEADER,
  clearSessionCookies,
  csrfCookieFrom,
  originAllowed,
  sessionTokenFrom,
  setSessionCookies,
} from "./cookies";
import { sha256, constantTimeEqual } from "./argon";

const LoginSchema = z.object({
  username: z.string().min(1).max(64),
  credential: z.string().min(1).max(128),
});

const ChangePasswordSchema = z.object({
  current_password: z.string().min(1).max(128),
  new_password: z.string().min(1).max(128),
});

@Controller("/api/auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get("/context")
  async context(@Req() request: FastifyRequest) {
    const assertion = request.headers[ACCESS_ASSERTION_HEADER] as string | undefined;
    const devEmail =
      this.auth.config.AUTH_MODE === "dev"
        ? (request.headers["x-dev-access-email"] as string | undefined)
        : undefined;
    const result = await this.auth.context(assertion, sessionTokenFrom(request), devEmail);
    return {
      state: result.state,
      principal: result.principal,
      access_identity: result.accessIdentity,
    };
  }

  @Get("/csrf")
  async csrf(@Req() request: FastifyRequest) {
    const csrf = csrfCookieFrom(request);
    return { csrf_token: csrf ?? null };
  }

  @Post("/login")
  async login(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    if (!originAllowed(request, this.auth.config.PORTAL_PUBLIC_ORIGIN)) {
      throw new AuthError("ORIGIN_DENIED", "Origin not allowed.", 403);
    }
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new AuthError("INVALID_REQUEST", "Invalid login data.", 400);
    }
    const assertion = request.headers[ACCESS_ASSERTION_HEADER] as string | undefined;
    const devEmail =
      this.auth.config.AUTH_MODE === "dev"
        ? (request.headers["x-dev-access-email"] as string | undefined)
        : undefined;
    const result = await this.auth.login({
      assertion,
      devEmail,
      username: parsed.data.username,
      credential: parsed.data.credential,
      requestId: (request.headers["x-request-id"] as string | undefined) ?? undefined,
      sourceIp: (request.headers["x-forwarded-for"] as string | undefined) ?? request.ip,
    });
    setSessionCookies(reply, result.token, result.csrfToken, result.absoluteExpiresAt);
    return {
      state: "AUTHENTICATED",
      session_id: result.sessionId,
      idle_expires_at: result.idleExpiresAt.toISOString(),
      absolute_expires_at: result.absoluteExpiresAt.toISOString(),
    };
  }

  @Post("/change-password")
  async changePassword(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    if (!originAllowed(request, this.auth.config.PORTAL_PUBLIC_ORIGIN)) {
      throw new AuthError("ORIGIN_DENIED", "Origin not allowed.", 403);
    }
    const parsed = ChangePasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new AuthError("INVALID_REQUEST", "Invalid data.", 400);
    }
    const sessionToken = sessionTokenFrom(request);
    if (!sessionToken) {
      throw new AuthError("SESSION_REQUIRED", "Invalid session.", 401);
    }
    const csrfHeader = request.headers[CSRF_HEADER] as string | undefined;
    if (!csrfHeader) {
      throw new AuthError("CSRF_REQUIRED", "CSRF token is missing.", 403);
    }
    const session = await this.auth.sessionFromToken(sessionToken);
    if (!session || session.state !== "ACTIVE") {
      throw new AuthError("SESSION_REQUIRED", "Invalid session.", 401);
    }
    if (!constantTimeEqual(sha256(csrfHeader), session.csrfSecretHash)) {
      throw new AuthError("CSRF_INVALID", "CSRF token is invalid.", 403);
    }
    await this.auth.changePassword({
      sessionToken,
      csrfToken: csrfHeader,
      currentPassword: parsed.data.current_password,
      newPassword: parsed.data.new_password,
      requestId: (request.headers["x-request-id"] as string | undefined) ?? undefined,
    });
    clearSessionCookies(reply);
    return { state: "PASSWORD_CHANGED" };
  }

  @Post("/logout")
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    if (!originAllowed(request, this.auth.config.PORTAL_PUBLIC_ORIGIN)) {
      throw new AuthError("ORIGIN_DENIED", "Origin not allowed.", 403);
    }
    await this.auth.logout(
      sessionTokenFrom(request),
      (request.headers["x-request-id"] as string | undefined) ?? undefined,
    );
    clearSessionCookies(reply);
    return { state: "LOGGED_OUT" };
  }
}
