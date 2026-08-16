import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { z } from "zod";
import { AdminService } from "./admin.service";
import { AuthError, AuthService } from "../auth/auth.service";
import { AdminGuard } from "./rbac.guard";

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

@UseGuards(AdminGuard)
@Controller("/api/admin")
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly admin: AdminService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("/users")
  async listUsers(@Req() request: FastifyRequest) {
    void request;
    const users = await this.auth.users.list();
    return { users: users.map(publicUser) };
  }

  @Post("/users")
  async createUser(@Body() body: unknown) {
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new AuthError("INVALID_REQUEST", "Dữ liệu không hợp lệ.", 400);
    }
    try {
      const user = await this.admin.createUser({
        username: parsed.data.username,
        displayName: parsed.data.display_name,
        role: parsed.data.role,
      });
      return { user_id: user.userId, username: user.username };
    } catch (error) {
      throw new AuthError(
        "USER_CREATE_FAILED",
        error instanceof Error ? error.message : "Tạo user thất bại.",
        409,
      );
    }
  }

  @Patch("/users/:user_id")
  async patchUser(@Param("user_id") userId: string, @Body() body: unknown) {
    const parsed = PatchUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new AuthError("INVALID_REQUEST", "Dữ liệu không hợp lệ.", 400);
    }
    const user = await this.auth.users.update({
      userId,
      displayName: parsed.data.display_name,
      role: parsed.data.role,
    });
    if (!user) {
      throw new AuthError("USER_NOT_FOUND", "User không tồn tại.", 404);
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

  @Post("/users/:user_id/reset-credential")
  async resetCredential(@Param("user_id") userId: string) {
    try {
      const { activationToken } = await this.admin.resetCredential(userId);
      return { activation_token: activationToken };
    } catch (error) {
      throw new AuthError(
        "RESET_FAILED",
        error instanceof Error ? error.message : "Reset thất bại.",
        404,
      );
    }
  }

  @Post("/users/:user_id/revoke-sessions")
  async revokeSessions(@Param("user_id") userId: string) {
    try {
      await this.admin.revokeSessions(userId);
      return { revoked: true };
    } catch (error) {
      throw new AuthError(
        "REVOKE_FAILED",
        error instanceof Error ? error.message : "Revoke thất bại.",
        404,
      );
    }
  }

  @Post("/users/:user_id/disable")
  async disable(@Param("user_id") userId: string) {
    try {
      await this.admin.disable(userId);
      return { disabled: true };
    } catch (error) {
      throw new AuthError(
        "DISABLE_FAILED",
        error instanceof Error ? error.message : "Disable thất bại.",
        404,
      );
    }
  }
}
