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
  sessionTokenFrom,
  setSessionCookies,
} from "./cookies";
import {
  MUTATION_SECURITY_MESSAGE,
  mutationSecurityDenial,
  originDenial,
} from "./mutation-security";

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
    /*
     * A4-FE-BE-GAP-03 · a missing Origin is a denial here too.
     *
     * `originAllowed` on its own returns TRUE for a request that carries no
     * Origin header at all, so anything that simply omitted it walked past
     * this gate. Login has no session yet and therefore no CSRF secret to
     * compare against, so the Origin half is the whole of what can apply —
     * but it now applies properly.
     */
    const originRefusal = originDenial(request, this.auth.config.PORTAL_PUBLIC_ORIGIN);
    if (originRefusal) {
      throw new AuthError(originRefusal, MUTATION_SECURITY_MESSAGE[originRefusal], 403);
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
    const parsed = ChangePasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new AuthError("INVALID_REQUEST", "Invalid data.", 400);
    }
    const sessionToken = sessionTokenFrom(request);
    if (!sessionToken) {
      throw new AuthError("SESSION_REQUIRED", "Invalid session.", 401);
    }
    const session = await this.auth.sessionFromToken(sessionToken);
    if (!session || session.state !== "ACTIVE") {
      throw new AuthError("SESSION_REQUIRED", "Invalid session.", 401);
    }
    /*
     * A4-FE-BE-GAP-03 · the full shared decision, not the drifted pair.
     *
     * This route carried both omissions the shared module was written to end:
     * `originAllowed` bare, so a request with no Origin passed; and a CSRF
     * header compared ONLY against the session's stored hash, never against
     * the `__Host-portal_csrf` cookie. The cookie comparison is what makes
     * double-submit mean anything — without it the header alone is the proof,
     * and the whole point is that it must be a header a form cannot set AND a
     * value only same-origin script can read.
     *
     * Of every route in this controller this is the one that most deserves it:
     * it replaces a credential.
     */
    const csrfHeader = request.headers[CSRF_HEADER] as string | undefined;
    const denial = mutationSecurityDenial(request, {
      csrfSecretHash: session.csrfSecretHash,
      allowedOrigin: this.auth.config.PORTAL_PUBLIC_ORIGIN,
    });
    if (denial) {
      throw new AuthError(denial, MUTATION_SECURITY_MESSAGE[denial], 403);
    }
    if (!csrfHeader) {
      // Unreachable: the decision above returns CSRF_MISSING for an absent
      // header. Written out so the guarantee lives in the type system and not
      // only in a comment a refactor can outlive.
      throw new AuthError(
        "CSRF_MISSING",
        MUTATION_SECURITY_MESSAGE.CSRF_MISSING,
        403,
      );
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
    /*
     * A4-FE-BE-GAP-03 · Origin only, deliberately.
     *
     * A cross-origin page sends its own Origin, so this alone stops a forced
     * logout. CSRF is NOT required: this route clears the cookies even when
     * the session is already dead, and a user holding a dead session has no
     * usable CSRF secret to present. Demanding one would leave exactly the
     * people who most need to sign out unable to.
     */
    const originRefusal = originDenial(request, this.auth.config.PORTAL_PUBLIC_ORIGIN);
    if (originRefusal) {
      throw new AuthError(originRefusal, MUTATION_SECURITY_MESSAGE[originRefusal], 403);
    }
    await this.auth.logout(
      sessionTokenFrom(request),
      (request.headers["x-request-id"] as string | undefined) ?? undefined,
    );
    clearSessionCookies(reply);
    return { state: "LOGGED_OUT" };
  }
}
