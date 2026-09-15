import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  AdminInputError,
  AdminNotFoundError,
  AdminService,
  OwnerProtectedError,
} from "./admin.service";
import { AuthError, AuthService } from "../auth/auth.service";
import { OwnerAccessGuard } from "./owner-access.guard";

const CreateUserSchema = z.object({
  username: z.string().min(1).max(64),
  display_name: z.string().min(1).max(120),
  role: z.enum(["ADMIN", "USER"]),
});

const PatchUserSchema = z.object({
  display_name: z.string().min(1).max(120).optional(),
  role: z.enum(["ADMIN", "USER"]).optional(),
});

function publicUser(user: {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
  lockedUntil: Date | null;
  createdAt: Date;
  disabledAt: Date | null;
}) {
  return {
    user_id: user.userId,
    username: user.username,
    display_name: user.displayName,
    role: user.role,
    status: user.status,
    must_change_password: user.mustChangePassword,
    locked_until: user.lockedUntil?.toISOString() ?? null,
    created_at: user.createdAt.toISOString(),
    disabled_at: user.disabledAt?.toISOString() ?? null,
  };
}

/**
 * A4-1 · answer with this service's own words, or with none at all.
 *
 * `error instanceof Error ? error.message : "…"` reads as careful and is the
 * opposite: an `Error` is exactly what a driver throws, so the guarded branch
 * was the leaking one. Only a refusal this service composed (`AdminInputError`)
 * is echoed; anything else becomes a fixed sentence, and the real text stays in
 * the server log where it belongs.
 *
 * The status follows the same split: a missing user is a 404, a refusal the
 * owner can act on is a 409, and an unexpected failure is a 500 rather than a
 * 404 that invites a retry against a route that is not broken in that way.
 */
export function adminFailure(error: unknown, code: string, fallback: string): AuthError {
  if (error instanceof AdminNotFoundError) {
    return new AuthError(code, error.message, 404);
  }
  if (error instanceof OwnerProtectedError) {
    return new AuthError("OWNER_PROTECTED", error.message, 409);
  }
  if (error instanceof AdminInputError) {
    return new AuthError(code, error.message, 409);
  }
  return new AuthError(code, fallback, 500);
}

/*
 * A4-1 · owner-only, server-enforced.
 *
 * `AdminGuard` (session + `role === "ADMIN"`) is replaced by `OwnerAccessGuard`,
 * which additionally requires the owner anchor and — on every mutation — an
 * allowed Origin and a valid CSRF pair. Finding A4-F05: these six routes mutate
 * real accounts and had neither check on the server, while the frontend's
 * `x-portal-csrf` header was doing all the work. Client behaviour is not a
 * security boundary.
 *
 * `no-store` is declared per route rather than globally because it is not
 * decoration here: `reset-credential` returns a PLAINTEXT activation
 * credential, and §20.2 rule 7 requires it to be one-view and uncacheable. It
 * was previously returned with no cache directive at all.
 */
@UseGuards(OwnerAccessGuard)
@Controller("/api/admin")
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly admin: AdminService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Header("Cache-Control", "no-store")
  @Get("/users")
  async listUsers(@Req() request: FastifyRequest) {
    void request;
    const users = await this.auth.users.list();
    return { users: users.map(publicUser) };
  }

  @Header("Cache-Control", "no-store")
  @Post("/users")
  async createUser(@Body() body: unknown) {
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new AuthError("INVALID_REQUEST", "Invalid data.", 400);
    }
    try {
      const user = await this.admin.createUser({
        username: parsed.data.username,
        displayName: parsed.data.display_name,
        role: parsed.data.role,
      });
      return { user_id: user.userId, username: user.username };
    } catch (error) {
      throw adminFailure(error, "USER_CREATE_FAILED", "User creation failed.");
    }
  }

  @Header("Cache-Control", "no-store")
  @Patch("/users/:user_id")
  async patchUser(@Param("user_id") userId: string, @Body() body: unknown) {
    const parsed = PatchUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new AuthError("INVALID_REQUEST", "Invalid data.", 400);
    }
    const user = await this.auth.users.update({
      userId,
      displayName: parsed.data.display_name,
      role: parsed.data.role,
    });
    if (!user) {
      throw new AuthError("USER_NOT_FOUND", "User not found.", 404);
    }
    if (parsed.data.role) {
      await this.auth.users.bumpSessionVersion(userId);
      await this.auth.sessions.revokeAllForUser(userId, "role_change");
      await this.auth.audit.record({
        eventType: "role_changed",
        targetUserId: userId,
        result: "SUCCESS",
        metadata: { role: parsed.data.role },
      });
    }
    return publicUser(user);
  }

  @Header("Cache-Control", "no-store")
  @Post("/users/:user_id/reset-credential")
  async resetCredential(@Param("user_id") userId: string) {
    try {
      const { activationToken } = await this.admin.resetCredential(userId);
      return { activation_token: activationToken };
    } catch (error) {
      throw adminFailure(error, "RESET_FAILED", "Credential reset failed.");
    }
  }

  @Header("Cache-Control", "no-store")
  @Post("/users/:user_id/revoke-sessions")
  async revokeSessions(@Param("user_id") userId: string) {
    try {
      await this.admin.revokeSessions(userId);
      return { revoked: true };
    } catch (error) {
      throw adminFailure(error, "REVOKE_FAILED", "Session revocation failed.");
    }
  }

  @Header("Cache-Control", "no-store")
  @Post("/users/:user_id/disable")
  async disable(@Param("user_id") userId: string) {
    try {
      await this.admin.disable(userId);
      return { disabled: true };
    } catch (error) {
      throw adminFailure(error, "DISABLE_FAILED", "Disable failed.");
    }
  }
}
