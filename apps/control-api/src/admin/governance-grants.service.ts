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
  grant: CapabilityGrant | null;
}

/** Transaction-bound repositories for an exact authority mutation. */
interface GrantMutationRepositories {
  grants: GovernanceGrantsRepository;
  anchor: OwnerAccessRepository;
  lifecycle: AccountLifecycleRepository;
  users: UsersRepository;
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
    const output = await this.withTransaction<GrantExecution>(request.idempotencyKey, async (tx) => {
      const prior = await tx.grants.findEventByKey(request.idempotencyKey);
      if (prior) {
        if (prior.requestFingerprint !== fingerprint) {
          return {
            denial: new GrantDeniedError(
              "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT",
              "That idempotency key was used for a different request. Use a new key.",
            ),
          };
        }
        return {
          outcome: "REPLAYED",
          event: prior,
          grant: prior.grantId ? await tx.grants.findById(prior.grantId) : null,
        };
      }

      /*
       * A grant change is as consequential as an account change, so it carries
       * the same proof: the owner re-authenticated in THIS session, recently.
       */
      const steppedUp = (await tx.lifecycle.activeStepUpExpiry(request.sessionId)) !== null;
      if (!steppedUp) {
        return {
          denial: new GrantDeniedError(
            "STEP_UP_REQUIRED",
            "Re-enter your password to change who may decide a Governance gate.",
            403,
          ),
        };
      }

      return request.action === "GRANT"
        ? this.grant(request, fingerprint, tx)
        : this.revoke(request, fingerprint, tx);
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
      // role or command string is accepted — and an unknown value is refused
      // before anything is read, so it cannot even be used to probe.
      throw new GrantDeniedError(
        "CAPABILITY_NOT_IN_NAMESPACE",
        "That is not a Portal capability.",
        422,
      );
    }
    const granteeUserId = request.granteeUserId ?? "";
    const grantee = await tx.users.findById(granteeUserId);
    if (!grantee) {
      throw new GrantDeniedError("ACCOUNT_NOT_FOUND", "No such account.", 404);
    }

    const refusal = await this.refuseImpossibleGrant(request, grantee, capability, tx);
    if (refusal) {
      await this.record(tx, request, fingerprint, null, "DENIED", refusal.reasonCode, granteeUserId, capability);
      return { denial: refusal };
    }

    const existing = await tx.grants.findActive({
      granteeUserId,
      capability,
      workspaceId: request.workspaceId ?? null,
    });
    if (existing) {
      await this.record(
        tx, request, fingerprint, existing, "DENIED", "GRANT_ALREADY_ACTIVE", granteeUserId, capability,
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
        tx, request, fingerprint, concurrent, "DENIED", "GRANT_ALREADY_ACTIVE", granteeUserId, capability,
      );
      return {
        denial: new GrantDeniedError(
          "GRANT_ALREADY_ACTIVE",
          `${grantee.username} already holds ${capability} in that scope.`,
        ),
      };
    }
    const event = await this.record(
      tx, request, fingerprint, created, "APPLIED", null, granteeUserId, capability,
    );
    return { outcome: "APPLIED", event, grant: created };
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
        tx, request, fingerprint, existing, "DENIED", "GRANT_ALREADY_REVOKED",
        existing.granteeUserId, existing.capability,
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
        tx, request, fingerprint, existing, "CONFLICT", "STALE_GRANT_REVISION",
        existing.granteeUserId, existing.capability,
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
      tx, request, fingerprint, revoked, "APPLIED", null,
      existing.granteeUserId, existing.capability,
    );
    return { outcome: "APPLIED", event, grant: revoked };
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
    grant: CapabilityGrant | null,
    outcome: "APPLIED" | "CONFLICT" | "DENIED",
    reasonCode: string | null,
    granteeUserId: string,
    capability: string,
  ): Promise<GrantEvent> {
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
      stateBefore: grant
        ? { state: grant.state, workspace_id: grant.workspaceId, grant_revision: grant.grantRevision }
        : null,
      stateAfter:
        outcome === "APPLIED" && grant
          ? { state: grant.state, workspace_id: grant.workspaceId, grant_revision: grant.grantRevision }
          : null,
      requestId: request.requestId,
      stepUpUsed: true,
    });
  }

  /** One atomic authority change, including its idempotency lineage. */
  private async withTransaction<T>(
    idempotencyKey: string,
    operation: (tx: GrantMutationRepositories) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    let begun = false;
    try {
      await client.query("BEGIN");
      begun = true;
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `governance-grant:${idempotencyKey}`,
      ]);
      const result = await operation({
        grants: new GovernanceGrantsRepository(client),
        anchor: new OwnerAccessRepository(client),
        lifecycle: new AccountLifecycleRepository(client),
        users: new UsersRepository(client),
        workspaces: new WorkspacesRepository(client),
      });
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
