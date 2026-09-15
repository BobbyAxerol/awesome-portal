import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";

import { CONTROL_API_POOL } from "../tokens";
import { OwnerAccessRepository, PORTAL_CAPABILITIES, type PortalCapability } from "../repos/owner-access";

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
}

@Injectable()
export class OwnerAccessService {
  private readonly repo: OwnerAccessRepository;

  constructor(@Inject(CONTROL_API_POOL) pool: Pool) {
    this.repo = new OwnerAccessRepository(pool);
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
      };
    }

    /*
     * A4: every capability in §20.3 starts owner-only, so a non-owner holds
     * none. A4-3 adds the grant table and replaces this empty list with the
     * grantee's ACTIVE grants (through `withImpliedReads`, which is frozen
     * here in A4-1 as part of the capability semantics).
     */
    return {
      userId,
      isOwner: false,
      capabilities: [],
      ownerState: anchorReadable && anchorUserId === null ? "OWNER_ANCHOR_UNCLAIMED" : "NOT_OWNER",
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
