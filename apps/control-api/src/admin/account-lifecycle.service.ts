import { createHash } from "node:crypto";
import { Pool } from "pg";

import { ControlApiConfig } from "../config";
import { AuthService } from "../auth/auth.service";
import { randomToken, sha256 } from "../auth/argon";
import { PortalUser, Role, accountStateOf, randomId } from "../domain";
import { OwnerAccessRepository } from "../repos/owner-access";
import {
  AccountLifecycleRepository,
  LifecycleAction,
  LifecycleOperationRecord,
  STEP_UP_ACTIONS,
  projectAccount,
} from "../repos/account-lifecycle";

/**
 * A4-2 · the owner account control plane.
 *
 * The difference between this and the account table it replaces is that
 * nothing here is an edit. Every change is a named operation that says what it
 * is acting on, which revision it believes is current, whether the owner
 * re-authenticated for it, what it changed, and how to undo it — and every one
 * of those is recorded whether it succeeded or not.
 *
 * Three rules shape the whole file:
 *
 *  1. **The server never handles another person's password.** There is no
 *     operation that sets or reads one. Recovering an account means issuing a
 *     fresh activation credential and letting its holder choose their own.
 *  2. **An activation is one-view and non-replayable.** It is returned exactly
 *     once, on the response that minted it. A replayed idempotency key returns
 *     the recorded outcome WITHOUT it, and a second issue against a still-live
 *     activation is refused by name rather than quietly minting another.
 *  3. **Nothing is deleted.** "Archive" is disable plus a lineage marker, and
 *     the account, its audit rows and its operation history all remain.
 */

/** A refusal this service composed, whose text is safe to show the owner. */
export class LifecycleDeniedError extends Error {
  constructor(
    readonly reasonCode: string,
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

export interface LifecycleRequest {
  action: LifecycleAction;
  actor: PortalUser;
  sessionId: string;
  /** Absent only for CREATE_INVITED, which has no account to pin yet. */
  targetUserId?: string;
  expectedRevision?: number;
  idempotencyKey: string;
  requestId?: string | null;
  /** CREATE_INVITED and UPDATE_PROFILE payload. */
  username?: string;
  displayName?: string;
  role?: Role;
  /** ISSUE_ACTIVATION only: revoke a live activation and mint another. */
  reissue?: boolean;
}

export interface LifecycleResult {
  outcome: "APPLIED" | "REPLAYED";
  operation: LifecycleOperationRecord;
  account: PortalUser;
  /**
   * Present ONLY on the response that minted it, and never on a replay. The
   * controller sends it with `Cache-Control: no-store` and it is written
   * nowhere else — not to the operation row, not to an audit row, not to a log.
   */
  activationToken?: string;
}

/** What each action undoes, written for a human reading the log in an incident. */
const ROLLBACK: Record<LifecycleAction, string> = {
  CREATE_INVITED:
    "Archive the account. It has never been signed into, so no access is withdrawn by doing so.",
  UPDATE_PROFILE:
    "Apply UPDATE_PROFILE again with the display name and role recorded in state_before.",
  ISSUE_ACTIVATION:
    "Issue a fresh activation, which revokes this one. A credential cannot be un-issued.",
  REVOKE_SESSIONS:
    "None needed: the holder signs in again with their existing credential.",
  DISABLE: "ENABLE the account, which restores access through a fresh activation.",
  ENABLE: "DISABLE the account again; the activation issued here is revoked with it.",
  ARCHIVE: "ENABLE the account, which clears the archive marker and issues a fresh activation.",
};

export class AccountLifecycleService {
  private readonly lifecycle: AccountLifecycleRepository;
  private readonly ownerAccess: OwnerAccessRepository;

  constructor(
    private readonly pool: Pool,
    private readonly config: ControlApiConfig,
    private readonly auth: AuthService,
  ) {
    this.lifecycle = new AccountLifecycleRepository(pool);
    this.ownerAccess = new OwnerAccessRepository(pool);
  }

  // --------------------------------------------------------------- step-up

  /**
   * Re-authenticate the owner for this session.
   *
   * Takes the owner's OWN password and verifies it against their own
   * credential — the only place in this control plane a password is handled at
   * all, and it is the caller's own. A wrong one is refused without saying
   * whether the account has a password at all.
   */
  async stepUp(input: {
    actor: PortalUser;
    sessionId: string;
    password: string;
  }): Promise<{ expiresAt: Date }> {
    const credential = await this.auth.credentials.findPassword(input.actor.userId);
    const ok =
      credential !== null &&
      (await this.auth.argon2.verify(credential.passwordHash, input.password));
    if (!ok) {
      // Same cost whether or not a credential row exists, for the reason
      // A4-FE-BE-GAP-02 gives: the fast path is the answer.
      if (credential === null) await this.auth.argon2.verifyAgainstDecoy();
      await this.auth.audit.recordSecurityDecision({
        eventType: "owner_step_up_denied",
        actorUserId: input.actor.userId,
        result: "DENIED",
        reasonCode: "STEP_UP_CREDENTIAL_REJECTED",
      });
      throw new LifecycleDeniedError(
        "STEP_UP_REJECTED",
        "That password was not accepted.",
        403,
      );
    }
    const expiresAt = await this.lifecycle.grantStepUp({
      stepUpId: randomId("stp"),
      sessionId: input.sessionId,
      userId: input.actor.userId,
      ttlSeconds: this.config.OWNER_STEP_UP_TTL_SECONDS,
    });
    await this.auth.audit.recordSecurityDecision({
      eventType: "owner_step_up_granted",
      actorUserId: input.actor.userId,
      result: "SUCCESS",
      reasonCode: "STEP_UP_PASSWORD_VERIFIED",
    });
    return { expiresAt };
  }

  stepUpExpiry(sessionId: string): Promise<Date | null> {
    return this.lifecycle.activeStepUpExpiry(sessionId);
  }

  // ----------------------------------------------------------------- reads

  /**
   * The roster, carrying nothing the screen does not need.
   *
   * §20.5 item 1 excludes hashes, tokens, Cloudflare subject and email, session
   * ids and audit internals. `projectAccount` is the single definition of what
   * may leave this service, so a field added to `PortalUser` does not silently
   * become a field the browser receives.
   */
  async roster(): Promise<ReturnType<typeof projectAccount>[]> {
    const users = await this.auth.users.list();
    return users.map(projectAccount);
  }

  async detail(userId: string) {
    const user = await this.auth.users.findById(userId);
    if (!user) {
      throw new LifecycleDeniedError("ACCOUNT_NOT_FOUND", "No such account.", 404);
    }
    return {
      account: projectAccount(user),
      history: await this.lifecycle.historyFor(user.userId),
    };
  }

  // ------------------------------------------------------------ operations

  async execute(request: LifecycleRequest): Promise<LifecycleResult> {
    const fingerprint = fingerprintOf(request);

    /*
     * Idempotency first, before any check that could change state.
     *
     * A replay must answer with what happened the first time, not run again —
     * a retried DISABLE that re-executes is harmless, a retried
     * ISSUE_ACTIVATION that re-executes silently invalidates the credential
     * the owner is in the middle of reading out. The replay deliberately
     * carries no `activationToken`: the one view has already happened.
     */
    const prior = await this.lifecycle.findByIdempotencyKey(request.idempotencyKey);
    if (prior) {
      if (prior.requestFingerprint !== fingerprint) {
        throw new LifecycleDeniedError(
          "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT",
          "That idempotency key was used for a different request. Use a new key.",
        );
      }
      const account = await this.auth.users.findById(prior.targetUserId);
      if (!account) {
        throw new LifecycleDeniedError("ACCOUNT_NOT_FOUND", "No such account.", 404);
      }
      return { outcome: "REPLAYED", operation: prior, account };
    }

    const stepUpExpiry = await this.lifecycle.activeStepUpExpiry(request.sessionId);
    const steppedUp = stepUpExpiry !== null;
    if (STEP_UP_ACTIONS.has(request.action) && !steppedUp) {
      throw new LifecycleDeniedError(
        "STEP_UP_REQUIRED",
        "Re-enter your password to confirm this action.",
        403,
      );
    }

    if (request.action === "CREATE_INVITED") {
      return this.createInvited(request, fingerprint, steppedUp);
    }
    return this.applyToExisting(request, fingerprint, steppedUp);
  }

  // ------------------------------------------------------------- create

  private async createInvited(
    request: LifecycleRequest,
    fingerprint: string,
    steppedUp: boolean,
  ): Promise<LifecycleResult> {
    const username = (request.username ?? "").trim();
    if (!/^[a-z][a-z0-9._-]{1,63}$/.test(username)) {
      throw new LifecycleDeniedError(
        "USERNAME_INVALID",
        "A username must start with a letter and use only lowercase letters, digits, dot, underscore or hyphen.",
        422,
      );
    }
    if (await this.auth.users.findByUsername(username)) {
      throw new LifecycleDeniedError(
        "USERNAME_TAKEN",
        "That username already belongs to an account.",
      );
    }
    const created = await this.auth.users.create({
      userId: randomId("usr"),
      username,
      displayName: request.displayName?.trim() || username,
      role: request.role ?? "USER",
    });
    /*
     * Created WITHOUT an activation, deliberately.
     *
     * Minting one here would hand the owner a credential at the moment they
     * are least ready to deliver it — mid-form, before they have decided how
     * it reaches the person. ISSUE_ACTIVATION is its own step-up-protected
     * action, so the one view happens when the owner asks for it.
     */
    const after = projectAccount(created);
    const operation = await this.lifecycle.record({
      operationId: randomId("alo"),
      idempotencyKey: request.idempotencyKey,
      action: "CREATE_INVITED",
      targetUserId: created.userId,
      actorUserId: request.actor.userId,
      expectedRevision: 0,
      resultingRevision: created.accountRevision,
      requestFingerprint: fingerprint,
      outcome: "APPLIED",
      stateBefore: {
        user_id: "",
        username,
        display_name: "",
        role: "",
        account_state: "ABSENT",
        must_change_password: false,
        account_revision: 0,
        locked: false,
      },
      stateAfter: after,
      rollbackDescription: ROLLBACK.CREATE_INVITED,
      requestId: request.requestId,
      stepUpUsed: steppedUp,
    });
    await this.auditOperation("CREATE_INVITED", request, created.userId, "SUCCESS", "APPLIED");
    return { outcome: "APPLIED", operation, account: created };
  }

  // ------------------------------------------------- everything else

  private async applyToExisting(
    request: LifecycleRequest,
    fingerprint: string,
    steppedUp: boolean,
  ): Promise<LifecycleResult> {
    if (!request.targetUserId || request.expectedRevision === undefined) {
      throw new LifecycleDeniedError(
        "TARGET_REQUIRED",
        "This action needs a target account and the revision you are acting on.",
        422,
      );
    }
    const before = await this.auth.users.findById(request.targetUserId);
    if (!before) {
      // Not recorded: the operation log references portal_users, and an
      // operation against an account that does not exist has nothing to be
      // the history OF.
      throw new LifecycleDeniedError("ACCOUNT_NOT_FOUND", "No such account.", 404);
    }

    const anchor = await this.ownerAccess.ownerAnchor();
    const targetIsOwner = anchor?.userId === before.userId;
    const guard = ownerSelfProtection(request, targetIsOwner);
    if (guard) {
      await this.recordRefusal(request, before, fingerprint, steppedUp, "DENIED", guard.reasonCode);
      throw guard;
    }

    /*
     * ISSUE_ACTIVATION is checked BEFORE the revision is consumed, because a
     * still-live activation is not a conflict about the account — it is a
     * question about the credential, and the answer must not be "your screen
     * is stale".
     */
    if (request.action === "ISSUE_ACTIVATION" && !request.reissue) {
      if (await this.auth.credentials.hasUsableActivation(before.userId)) {
        await this.recordRefusal(
          request, before, fingerprint, steppedUp, "DENIED", "ACTIVATION_ALREADY_ISSUED",
        );
        throw new LifecycleDeniedError(
          "ACTIVATION_ALREADY_ISSUED",
          "An activation credential is already live for this account. Reissue to revoke it and issue another.",
        );
      }
    }

    const change = changeFor(request);
    const after = await this.auth.users.applyLifecycleChange({
      userId: before.userId,
      expectedRevision: request.expectedRevision,
      ...change,
    });
    if (!after) {
      /*
       * The guarded UPDATE matched nothing, and the account exists — so the
       * revision moved under this request. Recorded as CONFLICT rather than
       * thrown silently: "somebody else changed this account while you were
       * looking at it" is exactly the thing an owner needs to be able to read
       * back afterwards.
       */
      const current = await this.auth.users.findById(before.userId);
      await this.recordRefusal(
        request, before, fingerprint, steppedUp, "CONFLICT", "STALE_ACCOUNT_REVISION",
      );
      throw new LifecycleDeniedError(
        "STALE_ACCOUNT_REVISION",
        `This account has changed since you loaded it (now revision ${current?.accountRevision ?? "unknown"}). Refresh and try again.`,
      );
    }

    const activationToken = await this.applySideEffects(request, after);
    const operation = await this.lifecycle.record({
      operationId: randomId("alo"),
      idempotencyKey: request.idempotencyKey,
      action: request.action,
      targetUserId: after.userId,
      actorUserId: request.actor.userId,
      expectedRevision: request.expectedRevision,
      resultingRevision: after.accountRevision,
      requestFingerprint: fingerprint,
      outcome: "APPLIED",
      stateBefore: projectAccount(before),
      stateAfter: projectAccount(after),
      rollbackDescription: ROLLBACK[request.action],
      requestId: request.requestId,
      stepUpUsed: steppedUp,
    });
    await this.auditOperation(request.action, request, after.userId, "SUCCESS", "APPLIED");
    return activationToken
      ? { outcome: "APPLIED", operation, account: after, activationToken }
      : { outcome: "APPLIED", operation, account: after };
  }

  /**
   * The parts that are not a column change: sessions, credentials, counters.
   *
   * Returns the activation token when this action minted one — the single
   * place in the control plane that produces plaintext, and it is handed
   * straight back to the caller and stored nowhere.
   */
  private async applySideEffects(
    request: LifecycleRequest,
    account: PortalUser,
  ): Promise<string | undefined> {
    switch (request.action) {
      case "UPDATE_PROFILE":
        // A role change alters what the session is allowed to do, so the
        // session must be re-established rather than carry the old answer.
        if (request.role !== undefined) await this.invalidateAccess(account.userId);
        return undefined;

      case "REVOKE_SESSIONS":
        await this.invalidateAccess(account.userId);
        return undefined;

      case "DISABLE":
      case "ARCHIVE":
        await this.auth.credentials.revokeActivationCredentials(account.userId);
        await this.invalidateAccess(account.userId);
        return undefined;

      case "ISSUE_ACTIVATION":
      case "ENABLE":
        return this.mintActivation(account);

      default:
        return undefined;
    }
  }

  /**
   * Withdraw everything a live session carries.
   *
   * The session-version bump and the revoke are both needed: the revoke ends
   * the sessions that exist, and the bump means a cookie that somehow survives
   * is refused by `OwnerAccessGuard`'s version comparison.
   */
  private async invalidateAccess(userId: string): Promise<void> {
    await this.auth.users.bumpSessionVersion(userId);
    await this.auth.sessions.revokeAllForUser(userId, "owner_lifecycle_action");
    await this.lifecycle.revokeStepUpsForUser(userId);
  }

  private async mintActivation(account: PortalUser): Promise<string> {
    const token = randomToken(24);
    await this.auth.credentials.revokeActivationCredentials(account.userId);
    await this.auth.credentials.createActivation({
      activationId: randomId("act"),
      userId: account.userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + this.config.ACTIVATION_TTL_SECONDS * 1000),
      createdBy: "owner",
    });
    /*
     * A4-1 finding A4-F07: an owner reset that leaves the lock in place hands
     * out a credential the account cannot use until the lock ages out.
     */
    await this.auth.users.resetLoginCounters(account.userId);
    await this.invalidateAccess(account.userId);
    return token;
  }

  private async recordRefusal(
    request: LifecycleRequest,
    before: PortalUser,
    fingerprint: string,
    steppedUp: boolean,
    outcome: "DENIED" | "CONFLICT",
    reasonCode: string,
  ): Promise<void> {
    await this.lifecycle.record({
      operationId: randomId("alo"),
      idempotencyKey: request.idempotencyKey,
      action: request.action,
      targetUserId: before.userId,
      actorUserId: request.actor.userId,
      expectedRevision: request.expectedRevision ?? 0,
      resultingRevision: null,
      requestFingerprint: fingerprint,
      outcome,
      reasonCode,
      stateBefore: projectAccount(before),
      stateAfter: null,
      rollbackDescription: "None: nothing was changed.",
      requestId: request.requestId,
      stepUpUsed: steppedUp,
    });
    await this.auditOperation(
      request.action,
      request,
      before.userId,
      outcome === "DENIED" ? "DENIED" : "FAILURE",
      reasonCode,
    );
  }

  /**
   * The identity-trail half of the record.
   *
   * Carries the action, who did it and to whom — and nothing else. The payload,
   * the before/after projection and the rollback text stay in
   * `account_lifecycle_operations`; `recordSecurityDecision` has nowhere to put
   * an address, an access subject or a user agent, which is the point.
   */
  private async auditOperation(
    action: LifecycleAction,
    request: LifecycleRequest,
    targetUserId: string,
    result: "SUCCESS" | "DENIED" | "FAILURE",
    reasonCode: string,
  ): Promise<void> {
    await this.auth.audit.recordSecurityDecision({
      eventType: result === "SUCCESS" ? "account_lifecycle_applied" : "account_lifecycle_refused",
      actorUserId: request.actor.userId,
      targetUserId,
      result,
      reasonCode: `${action}:${reasonCode}`,
      requestId: request.requestId,
    });
  }
}

/**
 * The owner cannot remove its own ability to administer the Portal.
 *
 * `claimOwner` refuses to move an anchor once claimed, and `OwnerAccessGuard`
 * admits only an ACTIVE owner — so an owner who archives, disables or demotes
 * themselves leaves a Portal with no reachable administration and no route
 * back, recoverable only with shell access to the deploy host. §20.2 rule 6
 * asks that access changes be reversible where safe; these are not safe, so
 * they are refused rather than confirmed in a dialog.
 */
function ownerSelfProtection(
  request: LifecycleRequest,
  targetIsOwner: boolean,
): LifecycleDeniedError | null {
  if (!targetIsOwner) return null;
  if (request.action === "ARCHIVE") {
    return new LifecycleDeniedError(
      "OWNER_ANCHOR_PROTECTED",
      "The Portal owner's account cannot be archived: ownership would become unreachable.",
    );
  }
  if (request.action === "DISABLE") {
    return new LifecycleDeniedError(
      "OWNER_ANCHOR_PROTECTED",
      "The Portal owner's account cannot be disabled: ownership would become unreachable.",
    );
  }
  if (request.action === "UPDATE_PROFILE" && request.role === "USER") {
    return new LifecycleDeniedError(
      "OWNER_ANCHOR_PROTECTED",
      "The Portal owner cannot be demoted while they hold the owner anchor.",
    );
  }
  return null;
}

/** The column change each action makes, if any. */
function changeFor(request: LifecycleRequest): {
  displayName?: string;
  role?: Role;
  status?: PortalUser["status"];
  mustChangePassword?: boolean;
  archived?: boolean;
} {
  switch (request.action) {
    case "UPDATE_PROFILE":
      return {
        ...(request.displayName !== undefined
          ? { displayName: request.displayName.trim() }
          : {}),
        ...(request.role !== undefined ? { role: request.role } : {}),
      };
    case "ISSUE_ACTIVATION":
      // The account goes back to "must use an activation", which is what makes
      // the credential usable and the old password unreachable.
      return { mustChangePassword: true };
    case "DISABLE":
      return { status: "DISABLED" };
    case "ARCHIVE":
      return { status: "DISABLED", archived: true };
    case "ENABLE":
      /*
       * §20.5 item 3: enable never silently revives an old password. Clearing
       * the archive marker and setting `must_change_password` means login
       * accepts ONLY the fresh activation minted alongside it, so whatever
       * password the account once had can never be used again — without
       * deleting the credential row and losing the lineage.
       */
      return { status: "ACTIVE", archived: false, mustChangePassword: true };
    default:
      return {};
  }
}

/**
 * A digest of what the request asked for.
 *
 * The idempotency key alone cannot tell a retry from a different request that
 * happens to reuse the key; this is what makes that distinguishable. The actor
 * and session are excluded on purpose — the same operation retried from a new
 * session is still the same operation.
 */
function fingerprintOf(request: LifecycleRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        request.action,
        request.targetUserId ?? null,
        request.expectedRevision ?? null,
        request.username ?? null,
        request.displayName ?? null,
        request.role ?? null,
        request.reissue ?? false,
      ]),
      "utf8",
    )
    .digest("hex");
}
