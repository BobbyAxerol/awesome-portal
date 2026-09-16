import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";

import { CONTROL_API_POOL } from "../tokens";
import {
  OwnerAccessRepository,
  PORTAL_CAPABILITIES,
  withImpliedReads,
  type PortalCapability,
} from "../repos/owner-access";
import { GovernanceGrantsRepository } from "../repos/governance-grants";

/**
 * A4-1 · what this caller may actually do, decided on the server.
 *
 * The browser receives the RESULT of this computation and never the inputs to
 * it (§20.2 rule 1). There is no "is the username bobby" here and no role
 * string handed to the client to re-evaluate: the frontend's only job is to
 * render a capability set it was given.
 *
 * Owner is not a superset of grants by accident — it is one by rule. The owner
 * holds the entire finite namespace, because §20.3 assigns every capability to
 * the owner initially and A4-3 delegates outward from there.
 */
export interface EffectiveAccess {
  userId: string;
  /** True only when the anchor exists and names exactly this user. */
  isOwner: boolean;
  /** The finite §20.3 set this caller holds, `*.read` implied from `*.decide`. */
  capabilities: PortalCapability[];
  /**
   * Why owner-only surfaces are unavailable, when they are.
   *
   * `OWNER_ANCHOR_UNCLAIMED` is the honest answer for a Portal that has never
   * run the bootstrap claim: nobody is the owner yet, which is different from
   * "you are not the owner" and must not be reported as the same thing.
   */
  ownerState: "OWNER" | "NOT_OWNER" | "OWNER_ANCHOR_UNCLAIMED";
  /**
   * A4-3 · which workspace each delegated capability applies in.
   *
   * `null` in the list means "every workspace this person is already a member
   * of" — a grant says what somebody may DO, never where they may go, so it
   * cannot widen membership. The owner holds every capability unscoped, which
   * is why their entry is a single `null`.
   *
   * Published alongside `capabilities` rather than folded into it because the
   * UI has to be able to explain *why* a gate is available on one deployment
   * and not another, and a flat list cannot say that.
   */
  scopes: Record<string, (string | null)[]>;
}

@Injectable()
export class OwnerAccessService {
  private readonly repo: OwnerAccessRepository;
  private readonly grants: GovernanceGrantsRepository;

  constructor(@Inject(CONTROL_API_POOL) pool: Pool) {
    this.repo = new OwnerAccessRepository(pool);
    this.grants = new GovernanceGrantsRepository(pool);
  }

  /**
   * Fails closed on every path.
   *
   * A database error here is not "allow and log"; it is "not the owner". The
   * cost of being wrong in the permissive direction is an unauthorized account
   * mutation, and the cost of being wrong in the restrictive direction is a
   * visible error the operator can act on.
   */
  async effectiveAccess(userId: string): Promise<EffectiveAccess> {
    let anchorUserId: string | null = null;
    let anchorReadable = true;
    try {
      const anchor = await this.repo.ownerAnchor();
      anchorUserId = anchor?.userId ?? null;
    } catch {
      anchorReadable = false;
    }

    if (anchorUserId !== null && anchorUserId === userId) {
      return {
        userId,
        isOwner: true,
        capabilities: [...PORTAL_CAPABILITIES].sort(),
        ownerState: "OWNER",
        scopes: Object.fromEntries(PORTAL_CAPABILITIES.map((c) => [c, [null]])),
      };
    }

    /*
     * A4-3 · a non-owner holds exactly what has been granted to them.
     *
     * Read at decision time, every time. There is no cache to invalidate, which
     * is how §20.5 item 1's "takes effect immediately for HTTP and SSE" is kept
     * true by construction rather than by a TTL somebody has to remember.
     *
     * `withImpliedReads` is the A4-1 semantic, unchanged: a `*.decide` grant
     * implies the matching `*.read`, and the response lists BOTH so the UI can
     * explain why a control is visible.
     */
    const granted = await this.grants.activeGrantsFor(userId);
    const capabilities = withImpliedReads(granted.map((grant) => grant.capability));

    const scopes: Record<string, (string | null)[]> = {};
    for (const grant of granted) {
      (scopes[grant.capability] ??= []).push(grant.workspaceId);
      // An implied read is readable wherever the decide it came from is.
      const implied = grant.capability.replace(/\.decide$/, ".read");
      if (implied !== grant.capability) {
        (scopes[implied] ??= []).push(grant.workspaceId);
      }
    }

    return {
      userId,
      isOwner: false,
      capabilities,
      ownerState: anchorReadable && anchorUserId === null ? "OWNER_ANCHOR_UNCLAIMED" : "NOT_OWNER",
      scopes,
    };
  }

  /** The owner's `user_id`, or `null` when the anchor is absent or unreadable. */
  async ownerUserId(): Promise<string | null> {
    try {
      return (await this.repo.ownerAnchor())?.userId ?? null;
    } catch {
      return null;
    }
  }

  async isOwner(userId: string): Promise<boolean> {
    return (await this.effectiveAccess(userId)).isOwner;
  }
}
