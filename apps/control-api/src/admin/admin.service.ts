import { randomId } from "../domain";
import { Pool } from "pg";
import { ControlApiConfig } from "../config";
import { AuthService } from "../auth/auth.service";
import { randomToken, sha256 } from "../auth/argon";

export class AdminService {
  constructor(
    private readonly pool: Pool,
    private readonly config: ControlApiConfig,
    private readonly auth: AuthService,
  ) {}

  async createUser(input: {
    username: string;
    displayName: string;
    role: "ADMIN" | "USER";
  }): Promise<{ userId: string; username: string }> {
    const username = input.username.trim();
    if (!/^[a-z][a-z0-9._-]{1,63}$/.test(username)) {
      throw new Error("username must be a lowercase safe identifier");
    }
    const existing = await this.auth.users.findByUsername(username);
    if (existing) {
      throw new Error("username already exists");
    }
    const user = await this.auth.users.create({
      userId: randomId("usr"),
      username,
      displayName: input.displayName || username,
      role: input.role,
    });
    await this.auth.audit.record({
      eventType: "user_created",
      targetUserId: user.userId,
      result: "SUCCESS",
      metadata: { role: input.role },
    });
    return { userId: user.userId, username: user.username };
  }

  async resetCredential(userId: string): Promise<{ activationToken: string }> {
    const user = await this.auth.users.findById(userId);
    if (!user) throw new Error("user not found");
    const token = randomToken(24);
    const expiresAt = new Date(Date.now() + this.config.ACTIVATION_TTL_SECONDS * 1000);
    await this.auth.credentials.revokeActivationCredentials(userId);
    await this.auth.credentials.createActivation({
      activationId: randomId("act"),
      userId,
      tokenHash: sha256(token),
      expiresAt,
      createdBy: "admin",
    });
    await this.auth.users.update({ userId, mustChangePassword: true });
    await this.auth.users.bumpSessionVersion(userId);
    await this.auth.sessions.revokeAllForUser(userId, "credential_reset");
    await this.auth.audit.record({
      eventType: "activation_credential_reset",
      targetUserId: userId,
      result: "SUCCESS",
    });
    return { activationToken: token };
  }

  async revokeSessions(userId: string): Promise<void> {
    const user = await this.auth.users.findById(userId);
    if (!user) throw new Error("user not found");
    await this.auth.sessions.revokeAllForUser(userId, "admin_revoke");
    await this.auth.audit.record({
      eventType: "sessions_revoked",
      targetUserId: userId,
      result: "SUCCESS",
    });
  }

  async disable(userId: string): Promise<void> {
    const user = await this.auth.users.findById(userId);
    if (!user) throw new Error("user not found");
    await this.auth.users.update({ userId, status: "DISABLED" });
    await this.auth.sessions.revokeAllForUser(userId, "admin_disable");
    await this.auth.audit.record({
      eventType: "user_disabled",
      targetUserId: userId,
      result: "SUCCESS",
    });
  }
}
