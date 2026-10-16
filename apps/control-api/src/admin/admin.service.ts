import { randomId } from "../domain";
import { Pool } from "pg";
import { ControlApiConfig } from "../config";
import { AuthService } from "../auth/auth.service";
import { randomToken, sha256 } from "../auth/argon";
import { OwnerAccessRepository } from "../repos/owner-access";
import { withTransaction } from "../db/pool";
import { UsersRepository } from "../repos/users";
import { CredentialsRepository } from "../repos/credentials";
import { SessionsRepository } from "../repos/sessions";
import { AuditRepository } from "../repos/audit";

/**
 * A refusal this service composed on purpose, and whose text is safe to show.
 *
 * A4-1 · the six admin routes used to answer every failure with
 * `error.message`, which is the deliberate copy below for the cases they were
 * written for and the raw text of a driver exception for every case they were
 * not — a connection string, a constraint name, a query fragment. Splitting
 * the type is what lets the controller echo the first and never the second,
 * without an allowlist of strings that drifts the moment someone edits one.
 */
export class AdminInputError extends Error {}

/** The subject of the change does not exist. */
export class AdminNotFoundError extends AdminInputError {}

/** Refusal of a change that would leave the Portal with no reachable owner. */
export class OwnerProtectedError extends AdminInputError {}

export class AdminService {
  private readonly ownerAccess: OwnerAccessRepository;

  constructor(
    private readonly pool: Pool,
    private readonly config: ControlApiConfig,
    private readonly auth: AuthService,
  ) {
    // Built from the pool the way `AuthService` builds its own repositories,
    // so every existing construction site keeps working unchanged.
    this.ownerAccess = new OwnerAccessRepository(pool);
  }

  async createUser(input: {
    username: string;
    displayName: string;
    role: "ADMIN" | "USER";
  }): Promise<{ userId: string; username: string }> {
    const username = input.username.trim();
    if (!/^[a-z][a-z0-9._-]{1,63}$/.test(username)) {
      throw new AdminInputError("username must be a lowercase safe identifier");
    }
    const existing = await this.auth.users.findByUsername(username);
    if (existing) {
      throw new AdminInputError("username already exists");
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
    const token = randomToken(24);
    const expiresAt = new Date(Date.now() + this.config.ACTIVATION_TTL_SECONDS * 1000);
    // This legacy bootstrap/test path must be as atomic as the owner-facing
    // lifecycle writer. In particular a drain refusal at the user mutation
    // must roll back both activation revocation and the new activation row.
    return withTransaction(this.pool, async db => {
      await db.query("SET LOCAL lock_timeout='1500ms'");
      await db.query("SET LOCAL statement_timeout='5000ms'");
      const users = new UsersRepository(db), credentials = new CredentialsRepository(db);
      const sessions = new SessionsRepository(db), audit = new AuditRepository(db);
      const user = await users.lockById(userId);
      if (!user) throw new AdminNotFoundError("user not found");
      await credentials.revokeActivationCredentials(userId);
      await credentials.createActivation({
        activationId: randomId("act"),
        userId,
        tokenHash: sha256(token),
        expiresAt,
        createdBy: "admin",
      });
      await users.update({ userId, mustChangePassword: true });
      /*
       * A4-1 item 5 · a reset clears the lock.
       *
       * `resetLoginCounters` existed and was wired to exactly one caller: a
       * SUCCESSFUL login. So the one person who could clear a lock was the
       * person who had just got in — which a locked-out user by definition
       * cannot do. `changePassword` needs a live session and so is unreachable
       * too. The result was that an owner credential reset handed out a fresh
       * activation the account could not use until the lock aged out, and the
       * sticky counter then re-locked it on the next mistake.
       */
      await users.resetLoginCounters(userId);
      /*
       * A4-1 item 6 · the other half of the lock lifecycle.
       *
       * `account_locked` says an account stopped working; without its mirror,
       * the audit trail never says it started working again, and "is Stan still
       * locked out?" stays a question you answer by reading a table.
       */
      if (user.lockedUntil !== null || user.failedLoginCount > 0) {
        await audit.recordSecurityDecision({
          eventType: "account_lock_cleared",
          targetUserId: userId,
          result: "SUCCESS",
          reasonCode: "OWNER_CREDENTIAL_RESET",
          metadata: { clearedFailedLoginCount: user.failedLoginCount },
        });
      }
      await users.bumpSessionVersion(userId);
      await sessions.revokeAllForUser(userId, "credential_reset");
      await audit.record({
        eventType: "activation_credential_reset",
        targetUserId: userId,
        result: "SUCCESS",
      });
      return { activationToken: token };
    });
  }

  async revokeSessions(userId: string): Promise<void> {
    const user = await this.auth.users.findById(userId);
    if (!user) throw new AdminNotFoundError("user not found");
    await this.auth.sessions.revokeAllForUser(userId, "admin_revoke");
    await this.auth.audit.record({
      eventType: "sessions_revoked",
      targetUserId: userId,
      result: "SUCCESS",
    });
  }

  async disable(userId: string): Promise<void> {
    const user = await this.auth.users.findById(userId);
    if (!user) throw new AdminNotFoundError("user not found");
    /*
     * A4-1 · the owner cannot disable the owner.
     *
     * `OwnerAccessGuard` admits only an ACTIVE user who holds the anchor, and
     * `claimOwner` refuses to move an anchor that is already claimed. So a
     * disabled owner is a Portal with no reachable administration at all and
     * no route back: not to re-enable the account, not to hand the anchor to
     * anyone else. One mis-click on one's own row ends account management for
     * good, recoverable only with shell access to the deploy host.
     *
     * §20.2 rule 8 asks that access changes be reversible where safe. This one
     * is not safe, so it is refused here rather than confirmed in a dialog:
     * transferring ownership is a deliberate decision (A4-3), and until such a
     * transfer exists the anchored owner's account stays reachable.
     */
    const anchor = await this.ownerAccess.ownerAnchor();
    if (anchor?.userId === userId) {
      throw new OwnerProtectedError(
        "the Portal owner's account cannot be disabled; ownership would become unreachable",
      );
    }
    await this.auth.users.update({ userId, status: "DISABLED" });
    await this.auth.sessions.revokeAllForUser(userId, "admin_disable");
    await this.auth.audit.record({
      eventType: "user_disabled",
      targetUserId: userId,
      result: "SUCCESS",
    });
  }
}
