import { createHash } from "node:crypto";
import { Pool } from "pg";

import { AuthService } from "../auth/auth.service";
import { OwnerAccessService } from "../auth/owner-access.service";
import { PortalUser, randomId } from "../domain";
import {
  GovernanceGrantsRepository,
  type CapabilityGrant,
  type GrantEvent,
} from "../repos/governance-grants";
import { OwnerAccessRepository, isPortalCapability, type PortalCapability } from "../repos/owner-access";
import { WorkspacesRepository } from "../repos/workspaces";
import { AccountLifecycleRepository } from "../repos/account-lifecycle";
import { UsersRepository } from "../repos/users";
import { SessionsRepository } from "../repos/sessions";

/**
 * A4-3 · the owner's policy surface.
 *
 * Bobby says who may read a Governance gate and who may record its Portal
 * decision. Everything this service refuses, it refuses by name and records —
 * §20.5 item 5 lists five of them, and each is a specific way a delegation
 * system quietly becomes an escalation system:
 *
 *  - **self-grant** — the actor cannot be the grantee. Authority that can
 *    widen itself is not delegated authority.
 *  - **owner removal** — the owner's authority is the anchor, not a row. A
 *    grant row aimed at the owner would imply it is revocable, and revoking it
 *    would do nothing while looking like it did something.
 *  - **duplicate** — refused by name rather than producing a second row that a
 *    later revoke would only half remove.
 *  - **cross-workspace** — a grant says what somebody may DO, never where they
 *    may go. Scoping one to a workspace they are not a member of would look
 *    like access they do not have.
 *  - **stale revision** — the revoke is pinned to the revision the owner was
 *    looking at, so two owners cannot interleave.
 *
 * None of them writes anything first. A refusal leaves the grant table exactly
 * as it was.
 */

export class GrantDeniedError extends Error {
  constructor(
    readonly reasonCode: string,
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

export interface GrantRequest {
  action: "GRANT" | "REVOKE";
  actor: PortalUser;
  sessionId: string;
  idempotencyKey: string;
  requestId?: string | null;
  /** GRANT: who receives it. REVOKE: derived from the grant. */
  granteeUserId?: string;
  capability?: string;
  workspaceId?: string | null;
  /** REVOKE only. */
  grantId?: string;
  expectedRevision?: number;
}

export interface GrantResult {
  outcome: "APPLIED" | "REPLAYED";
  event: GrantEvent;
  grant: GrantReceipt | null;
}

/** Exactly the public v1 receipt, not the current mutable grant row. */
type GrantReceipt = Pick<CapabilityGrant,
  "grantId" | "granteeUserId" | "capability" | "workspaceId" | "state" | "grantRevision">;

/** Transaction-bound repositories for an exact authority mutation. */
interface GrantMutationRepositories {
  grants: GovernanceGrantsRepository;
  anchor: OwnerAccessRepository;
  lifecycle: AccountLifecycleRepository;
  users: UsersRepository;
  sessions: SessionsRepository;
  workspaces: WorkspacesRepository;
}

type GrantExecution = GrantResult | { denial: GrantDeniedError };

export class GovernanceGrantsService {
  private readonly grants: GovernanceGrantsRepository;

  constructor(
    private readonly pool: Pool,
    private readonly auth: AuthService,
    private readonly ownerAccess: OwnerAccessService,
  ) {
    this.grants = new GovernanceGrantsRepository(pool);
  }

  // ------------------------------------------------------------------ read

  /**
   * The whole policy, as one matrix the owner can read in a glance.
   *
   * Grouped by person rather than by capability because that is the question
   * an owner actually asks — "what can Stan do" — and because a list ordered
   * by capability makes it easy to revoke the right permission from the wrong
   * person.
   */
  async policy(): Promise<{
    accounts: {
      user_id: string;
      username: string;
      display_name: string;
      is_owner: boolean;
      account_state: string;
      capabilities: { capability: string; grant_id: string; workspace_id: string | null; grant_revision: number }[];
    }[];
  }> {
    const [users, grants, ownerUserId] = await Promise.all([
      this.auth.users.list(),
      this.grants.listGrants(),
      this.ownerAccess.ownerUserId(),
    ]);
    return {
      accounts: users.map((user) => ({
        user_id: user.userId,
        username: user.username,
        display_name: user.displayName,
        is_owner: user.userId === ownerUserId,
        account_state: user.archivedAt !== null ? "ARCHIVED" : user.status,
        capabilities: grants
          .filter((grant) => grant.granteeUserId === user.userId)
          .map((grant) => ({
            capability: grant.capability,
            grant_id: grant.grantId,
            workspace_id: grant.workspaceId,
            grant_revision: grant.grantRevision,
          })),
      })),
    };
  }

  async activityFor(granteeUserId: string): Promise<GrantEvent[]> {
    return this.grants.eventsFor(granteeUserId);
  }

  // ----------------------------------------------------------------- write

  async execute(request: GrantRequest): Promise<GrantResult> {
    const fingerprint = fingerprintOf(request);
    const keyDigest = `sha256:${createHash("sha256").update(request.idempotencyKey, "utf8").digest("hex")}`;
    const output = await this.withTransaction(request, async (tx) => {
      const actor = await tx.users.lockById(request.actor.userId);
      const authorized = actor && actor.status === "ACTIVE" && !actor.archivedAt && !actor.mustChangePassword &&
        actor.sessionVersion === request.actor.sessionVersion &&
        await tx.sessions.lockActiveLease(request.sessionId, actor.userId, actor.sessionVersion);
      const ownerUserId = await tx.grants.lockOwnerAnchorUserId();
      if (!authorized || ownerUserId !== actor?.userId) {
        const denial = new GrantDeniedError("CURRENT_ACTOR_AUTHORITY_REQUIRED", "Access denied.", 403);
        await this.recordRedactedRefusal(tx, request, keyDigest, fingerprint, denial, actor?.userId ?? null, false, false);
        return { denial };
      }

      // A receipt is not a credential: recheck today's owner, session and proof
      // BEFORE exposing a prior outcome or writing a new authority change.
      const steppedUp = (await tx.lifecycle.lockActiveStepUpExpiry(request.sessionId, actor.userId)) !== null;
      if (!steppedUp) {
        const denial = new GrantDeniedError(
          "STEP_UP_REQUIRED", "Re-enter your password to change who may decide a Governance gate.", 403,
        );
        await this.recordRedactedRefusal(tx, request, keyDigest, fingerprint, denial, actor.userId, false, false);
        return { denial };
      }

      const prior = await tx.grants.findEventByKey(request.idempotencyKey);
      if (prior) {
        // Do not rewrite fingerprintOf: historical fingerprints intentionally
        // retain their original byte sequence. Bind their actor separately.
        if (prior.actorUserId !== actor.userId || prior.requestFingerprint !== fingerprint) {
          const denial = new GrantDeniedError("IDEMPOTENCY_KEY_PAYLOAD_CONFLICT",
            "That idempotency key was used for a different request. Use a new key.");
          await this.recordRedactedRefusal(tx, request, keyDigest, fingerprint, denial, actor.userId, true, false);
          return { denial };
        }
        if (prior.outcome === "DENIED" || prior.outcome === "CONFLICT") {
          return { denial: new GrantDeniedError(prior.reasonCode ?? "PREVIOUS_OPERATION_REFUSED",
            "This access change was refused. Refresh before starting a new request.", originalHttpStatus(prior)) };
        }
        const receipt = grantReceiptFromEvent(prior);
        if (!receipt) {
          return { denial: new GrantDeniedError("GRANT_RECEIPT_NOT_AVAILABLE",
            "The original access receipt is unavailable.", 503) };
        }
        return {
          outcome: "REPLAYED",
          event: prior,
          grant: receipt,
        };
      }
      const earlyRefusal = await tx.grants.findRefusalByKey(keyDigest);
      if (earlyRefusal) {
        if (!Number.isInteger(earlyRefusal.httpStatus) || earlyRefusal.httpStatus < 400 || earlyRefusal.httpStatus > 599 ||
            typeof earlyRefusal.reasonCode !== "string" || !/^[A-Z0-9_]+$/.test(earlyRefusal.reasonCode)) {
          return { denial: new GrantDeniedError("GRANT_RECEIPT_NOT_AVAILABLE", "The original access receipt is unavailable.", 503) };
        }
        if (earlyRefusal.actorUserId !== actor.userId || earlyRefusal.requestFingerprint !== `sha256:${fingerprint}`) {
          const denial = new GrantDeniedError("IDEMPOTENCY_KEY_PAYLOAD_CONFLICT",
            "That idempotency key was used for a different request. Use a new key.");
          await this.recordRedactedRefusal(tx, request, keyDigest, fingerprint, denial, actor.userId, true, false);
          return { denial };
        }
        return { denial: new GrantDeniedError(earlyRefusal.reasonCode,
          "This access change was refused. Refresh before starting a new request.", earlyRefusal.httpStatus) };
      }

      try {
        return request.action === "GRANT"
          ? await this.grant(request, fingerprint, tx)
          : await this.revoke(request, fingerprint, tx);
      } catch (error) {
        if (!(error instanceof GrantDeniedError)) throw error;
        // Namespace/unknown-target errors have no valid FK for the legacy
        // grant-event table. Persist their original refusal without raw input.
        await this.recordRedactedRefusal(tx, request, keyDigest, fingerprint, error, actor.userId, true, true);
        return { denial: error };
      }
    });
    if ("denial" in output) throw output.denial;
    return output;
  }

  private async grant(
    request: GrantRequest,
    fingerprint: string,
    tx: GrantMutationRepositories,
  ): Promise<GrantExecution> {
    const capability = request.capability ?? "";
    if (!isPortalCapability(capability)) {
      // §20.5 item 2: only the finite §20.3 namespace. No free-form route, SQL,
      // role or command string is accepted. An unknown value is refused before
      // any target lookup, and its raw text never reaches the audit receipt.
      throw new GrantDeniedError(
        "CAPABILITY_NOT_IN_NAMESPACE",
        "That is not a Portal capability.",
        422,
      );
    }
    const granteeUserId = request.granteeUserId ?? "";
    const grantee = await tx.users.lockById(granteeUserId);
    if (!grantee) {
      throw new GrantDeniedError("ACCOUNT_NOT_FOUND", "No such account.", 404);
    }

    const refusal = await this.refuseImpossibleGrant(request, grantee, capability, tx);
    if (refusal) {
      await this.record(tx, request, fingerprint, null, null, "DENIED", refusal.reasonCode, granteeUserId, capability, refusal.status);
      return { denial: refusal };
    }

    const existing = await tx.grants.findActive({
      granteeUserId,
      capability,
      workspaceId: request.workspaceId ?? null,
    });
    if (existing) {
      await this.record(
        tx, request, fingerprint, existing, existing, "DENIED", "GRANT_ALREADY_ACTIVE", granteeUserId, capability, 409,
      );
      return {
        denial: new GrantDeniedError(
          "GRANT_ALREADY_ACTIVE",
          `${grantee.username} already holds ${capability} in that scope.`,
        ),
      };
    }

    const created = await tx.grants.insertGrantIfAbsent({
      grantId: randomId("grn"),
      granteeUserId,
      capability,
      workspaceId: request.workspaceId ?? null,
      issuedBy: request.actor.userId,
    });
    if (!created) {
      /* A different idempotency key won the unique active-grant race. */
      const concurrent = await tx.grants.findActive({
        granteeUserId,
        capability,
        workspaceId: request.workspaceId ?? null,
      });
      await this.record(
        tx, request, fingerprint, concurrent, concurrent, "DENIED", "GRANT_ALREADY_ACTIVE", granteeUserId, capability, 409,
      );
      return {
        denial: new GrantDeniedError(
          "GRANT_ALREADY_ACTIVE",
          `${grantee.username} already holds ${capability} in that scope.`,
        ),
      };
    }
    const event = await this.record(
      tx, request, fingerprint, null, created, "APPLIED", null, granteeUserId, capability, 201,
    );
    return { outcome: "APPLIED", event, grant: projectGrant(created) };
  }

  private async revoke(
    request: GrantRequest,
    fingerprint: string,
    tx: GrantMutationRepositories,
  ): Promise<GrantExecution> {
    const existing = request.grantId ? await tx.grants.findById(request.grantId) : null;
    if (!existing) {
      throw new GrantDeniedError("GRANT_NOT_FOUND", "No such grant.", 404);
    }
    if (existing.state === "REVOKED") {
      // Not an error worth a conflict: the owner wanted it gone and it is gone.
      // Recorded so the attempt is still visible in the lineage.
      await this.record(
        tx, request, fingerprint, existing, existing, "DENIED", "GRANT_ALREADY_REVOKED",
        existing.granteeUserId, existing.capability, 409,
      );
      return {
        denial: new GrantDeniedError(
          "GRANT_ALREADY_REVOKED",
          "That grant has already been revoked.",
        ),
      };
    }

    const revoked = await tx.grants.revokeGrant({
      grantId: existing.grantId,
      expectedRevision: request.expectedRevision ?? -1,
      revokedBy: request.actor.userId,
    });
    if (!revoked) {
      await this.record(
        tx, request, fingerprint, existing, existing, "CONFLICT", "STALE_GRANT_REVISION",
        existing.granteeUserId, existing.capability, 409,
      );
      return {
        denial: new GrantDeniedError(
          "STALE_GRANT_REVISION",
          `This grant has changed since you loaded it (now revision ${existing.grantRevision}). Refresh and try again.`,
        ),
      };
    }

    /*
     * §20.5 item 1: the change takes effect immediately for HTTP and SSE.
     *
     * It already does — `effectiveAccess` reads the grants at decision time and
     * there is no cache — so nothing is invalidated here. What IS withdrawn is
     * the step-up the grantee may hold, because a revoked decider should not
     * keep a pre-authorized window open on a destructive action.
     */
    await tx.lifecycle.revokeStepUpsForUser(existing.granteeUserId);

    const event = await this.record(
      tx, request, fingerprint, existing, revoked, "APPLIED", null,
      existing.granteeUserId, existing.capability, 200,
    );
    return { outcome: "APPLIED", event, grant: projectGrant(revoked) };
  }

  /** The five refusals §20.5 item 5 names, none of which writes first. */
  private async refuseImpossibleGrant(
    request: GrantRequest,
    grantee: PortalUser,
    capability: PortalCapability,
    tx: GrantMutationRepositories,
  ): Promise<GrantDeniedError | null> {
    if (grantee.userId === request.actor.userId) {
      return new GrantDeniedError(
        "SELF_GRANT_REFUSED",
        "You cannot grant a capability to yourself. Authority that can widen itself is not delegated authority.",
      );
    }

    const anchor = await tx.anchor.ownerAnchor();
    const ownerUserId = anchor?.userId ?? null;
    if (ownerUserId !== null && grantee.userId === ownerUserId) {
      return new GrantDeniedError(
        "OWNER_ANCHOR_PROTECTED",
        "The Portal owner already holds every capability through the owner anchor. A grant row would imply it could be revoked, which it cannot.",
      );
    }

    if (grantee.archivedAt !== null || grantee.status === "DISABLED") {
      return new GrantDeniedError(
        "ACCOUNT_NOT_ACTIVE",
        `${grantee.username} has no access to the Portal, so a Governance capability would mean nothing. Enable the account first.`,
      );
    }

    const workspaceId = request.workspaceId ?? null;
    if (workspaceId !== null && !(await tx.workspaces.isMember(workspaceId, grantee.userId))) {
      return new GrantDeniedError(
        "GRANTEE_NOT_IN_WORKSPACE",
        `${grantee.username} is not a member of that workspace. A grant says what somebody may do, never where they may go.`,
      );
    }

    // `administration.*` is owner-only in A4 by §20.3. Delegating it would be
    // delegating the ability to delegate, which this phase does not do.
    if (capability.startsWith("administration.")) {
      return new GrantDeniedError(
        "CAPABILITY_NOT_DELEGABLE",
        "Administration capabilities stay with the Portal owner in this release.",
      );
    }
    return null;
  }

  private record(
    tx: GrantMutationRepositories,
    request: GrantRequest,
    fingerprint: string,
    before: CapabilityGrant | null,
    after: CapabilityGrant | null,
    outcome: "APPLIED" | "CONFLICT" | "DENIED",
    reasonCode: string | null,
    granteeUserId: string,
    capability: string,
    httpStatus: number,
  ): Promise<GrantEvent> {
    const grant = after ?? before;
    return tx.grants.recordEvent({
      eventId: randomId("gre"),
      idempotencyKey: request.idempotencyKey,
      grantId: grant?.grantId ?? null,
      granteeUserId,
      capability,
      action: request.action,
      actorUserId: request.actor.userId,
      expectedRevision: request.expectedRevision ?? 0,
      resultingRevision: outcome === "APPLIED" ? (grant?.grantRevision ?? null) : null,
      requestFingerprint: fingerprint,
      outcome,
      reasonCode,
      stateBefore: stateImage(before),
      stateAfter: {
        ...(stateImage(after) ?? {}),
        _receipt: { version: "portal.grant-receipt.v1", http_status: httpStatus, grant: after ? projectGrant(after) : null },
      },
      requestId: request.requestId,
      stepUpUsed: true,
    });
  }

  private recordRedactedRefusal(
    tx: GrantMutationRepositories, request: GrantRequest, keyDigest: string, fingerprint: string,
    denial: GrantDeniedError, actorUserId: string | null, stepUpUsed: boolean, replayable: boolean,
  ): Promise<void> {
    return tx.grants.recordRefusal({ actorUserId, keyDigest, requestFingerprint: fingerprint,
      reasonCode: denial.reasonCode, httpStatus: denial.status, stepUpUsed, replayable, requestId: request.requestId });
  }

  /** One atomic authority change, including its idempotency lineage. */
  private async withTransaction(
    request: GrantRequest,
    operation: (tx: GrantMutationRepositories) => Promise<GrantExecution>,
  ): Promise<GrantExecution> {
    const client = await this.pool.connect();
    let begun = false;
    try {
      await client.query("BEGIN");
      begun = true;
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `governance-grant:${request.idempotencyKey}`,
      ]);
      // Preserve actor→session→anchor ordering across account/grant mutations.
      // Lock the anchor only after actor/session locks inside the callback.
      const tx = {
        grants: new GovernanceGrantsRepository(client),
        anchor: new OwnerAccessRepository(client),
        lifecycle: new AccountLifecycleRepository(client),
        users: new UsersRepository(client),
        sessions: new SessionsRepository(client),
        workspaces: new WorkspacesRepository(client),
      };
      const result = await operation(tx);
      if (!("denial" in result)) {
        // A row lock does not freeze time. A proof/session can expire while
        // waiting for a target lock; abort the whole mutation, not just its
        // response, if that happened. This fence is outside the inner catch.
        if (!await tx.sessions.lockActiveLease(request.sessionId,request.actor.userId,request.actor.sessionVersion)) {
          throw new GrantDeniedError("CURRENT_ACTOR_AUTHORITY_REQUIRED", "Access denied.", 403);
        }
        if (!await tx.lifecycle.lockActiveStepUpExpiry(request.sessionId,request.actor.userId)) {
          throw new GrantDeniedError("STEP_UP_REQUIRED", "Re-enter your password before changing access.", 403);
        }
      }
      await client.query("COMMIT");
      begun = false;
      return result;
    } catch (error) {
      if (begun) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original application/database error.
        }
      }
      if (error instanceof GrantDeniedError &&
          ["CURRENT_ACTOR_AUTHORITY_REQUIRED","STEP_UP_REQUIRED"].includes(error.reasonCode)) {
        // The failed final fence rolled the grant and success receipt back.
        // Keep a redacted refusal separately; it must not consume the key.
        const actor = await new UsersRepository(this.pool).findById(request.actor.userId);
        await this.grants.recordRefusal({actorUserId:actor?.userId??null,
          keyDigest:`sha256:${createHash("sha256").update(request.idempotencyKey,"utf8").digest("hex")}`,
          requestFingerprint:fingerprintOf(request),reasonCode:error.reasonCode,httpStatus:error.status,
          stepUpUsed:false,replayable:false,requestId:request.requestId});
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

function fingerprintOf(request: GrantRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        request.action,
        request.granteeUserId ?? null,
        request.capability ?? null,
        request.workspaceId ?? null,
        request.grantId ?? null,
        request.expectedRevision ?? null,
      ]),
      "utf8",
    )
    .digest("hex");
}

function projectGrant(grant: CapabilityGrant): GrantReceipt {
  return { grantId: grant.grantId, granteeUserId: grant.granteeUserId,
    capability: grant.capability, workspaceId: grant.workspaceId,
    state: grant.state, grantRevision: grant.grantRevision };
}

function stateImage(grant: CapabilityGrant | null): Record<string, unknown> | null {
  return grant ? { state: grant.state, workspace_id: grant.workspaceId, grant_revision: grant.grantRevision } : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function originalHttpStatus(event: GrantEvent): number {
  const receipt = objectValue(event.stateAfter?._receipt);
  const status = receipt?.http_status;
  return receipt?.version === "portal.grant-receipt.v1" && typeof status === "number" &&
    Number.isInteger(status) && status >= 400 && status <= 599 ? status : 409;
}

function grantReceiptFromEvent(event: GrantEvent): GrantReceipt | null {
  const stored = objectValue(event.stateAfter?._receipt);
  if (stored) {
    if (stored.version !== "portal.grant-receipt.v1") return null;
    const grant = objectValue(stored.grant);
    if (!grant || typeof grant.grantId !== "string" || grant.grantId !== event.grantId ||
        grant.granteeUserId !== event.granteeUserId || grant.capability !== event.capability ||
        !isPortalCapability(String(grant.capability)) ||
        !(grant.workspaceId === null || typeof grant.workspaceId === "string") ||
        !(grant.state === "ACTIVE" || grant.state === "REVOKED") ||
        typeof grant.grantRevision !== "number" || !Number.isSafeInteger(grant.grantRevision) ||
        grant.grantRevision < 1 || grant.grantRevision !== event.resultingRevision) return null;
    return { grantId: grant.grantId, granteeUserId: event.granteeUserId,
      capability: event.capability as PortalCapability, workspaceId: grant.workspaceId,
      state: grant.state, grantRevision: grant.grantRevision };
  }
  // A historical immutable event already captured these six public fields.
  // Missing historical facts are not repaired by borrowing today's grant row.
  const state = event.stateAfter;
  if (!event.grantId || !isPortalCapability(event.capability) || !state ||
      !(state.workspace_id === null || typeof state.workspace_id === "string") ||
      !(state.state === "ACTIVE" || state.state === "REVOKED") ||
      typeof state.grant_revision !== "number" || !Number.isSafeInteger(state.grant_revision) ||
      state.grant_revision < 1 || state.grant_revision !== event.resultingRevision) return null;
  return { grantId: event.grantId, granteeUserId: event.granteeUserId,
    capability: event.capability, workspaceId: state.workspace_id,
    state: state.state, grantRevision: state.grant_revision };
}
