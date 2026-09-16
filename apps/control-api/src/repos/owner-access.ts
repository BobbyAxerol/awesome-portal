import { Pool, PoolClient } from "pg";

/**
 * A4-1 · the owner anchor and the finite capability namespace.
 *
 * Every read here fails closed. An absent anchor, an ambiguous one, or a
 * database error all produce "not the owner" rather than "probably fine" —
 * §20.2 rule 1 makes ownership a server fact, and a fact you could not read is
 * not a fact you may assume.
 *
 * Nothing in this file writes an anchor except `claimOwner`, which the
 * protected bootstrap CLI calls. There is deliberately no API-reachable path
 * to it: §20.3 requires the owner to be established from protected bootstrap
 * input and never inferred from anything a browser supplies.
 */

/** The finite §20.3 namespace, duplicated nowhere else — the DB CHECK mirrors it. */
export const PORTAL_CAPABILITIES = [
  "administration.users.manage",
  "administration.profile_access.manage",
  "governance.r1.read",
  "governance.r1.decide",
  "governance.r2.read",
  "governance.r2.decide",
  "governance.canary.read",
  "governance.canary.decide",
  "governance.live.read",
  "governance.live.decide",
] as const;

export type PortalCapability = (typeof PORTAL_CAPABILITIES)[number];

export function isPortalCapability(value: string): value is PortalCapability {
  return (PORTAL_CAPABILITIES as readonly string[]).includes(value);
}

/**
 * `*.decide` implies `*.read` for server evaluation.
 *
 * §20.3 requires the response to still list BOTH, so the UI can explain why a
 * control is visible. Implication happens here, once, rather than in each
 * caller deciding for itself what a decide grant also means.
 */
export function withImpliedReads(
  capabilities: Iterable<PortalCapability>,
): PortalCapability[] {
  const out = new Set<PortalCapability>();
  for (const capability of capabilities) {
    out.add(capability);
    const implied = capability.replace(/\.decide$/, ".read");
    if (implied !== capability && isPortalCapability(implied)) out.add(implied);
  }
  return [...out].sort();
}

export interface OwnerAnchor {
  userId: string;
  claimedAt: Date;
  claimedBy: string | null;
}

export class OwnerAccessRepository {
  constructor(private readonly pool: Pool | PoolClient) {}

  /**
   * The single owner, or `null` when there is not exactly one.
   *
   * The schema already CHECK-constrains the anchor to one row, so a second row
   * cannot exist. The `rowCount !== 1` guard is not redundant with it: it also
   * covers the ordinary, expected case of a Portal that has never been
   * claimed, and it makes "ambiguous" behave like "absent" rather than like
   * "pick the first one".
   */
  async ownerAnchor(): Promise<OwnerAnchor | null> {
    const result = await this.pool.query<{
      user_id: string;
      claimed_at: Date;
      claimed_by: string | null;
    }>(
      `SELECT user_id, claimed_at, claimed_by
         FROM portal_owner_anchor
        WHERE anchor_id = 'PORTAL_OWNER'`,
    );
    if (result.rowCount !== 1) return null;
    const row = result.rows[0];
    return { userId: row.user_id, claimedAt: row.claimed_at, claimedBy: row.claimed_by };
  }

  /**
   * Claim the owner anchor. Bootstrap-only, idempotent, never reassigning.
   *
   * Re-running bootstrap with the same owner is a no-op. Running it with a
   * DIFFERENT user is refused loudly rather than silently moving ownership: a
   * quiet reassignment is how an operator loses a Portal to a typo, and
   * §20.2 rule 8 forbids a migration or seed that changes who holds authority.
   */
  async claimOwner(input: {
    userId: string;
    claimedBy: string;
    client?: PoolClient;
  }): Promise<{ outcome: "CLAIMED" | "ALREADY_OWNER"; ownerUserId: string }> {
    const runner = input.client ?? this.pool;
    const inserted = await runner.query<{ user_id: string }>(
      `INSERT INTO portal_owner_anchor (anchor_id, user_id, claimed_by)
            VALUES ('PORTAL_OWNER', $1, $2)
       ON CONFLICT (anchor_id) DO NOTHING
         RETURNING user_id`,
      [input.userId, input.claimedBy],
    );
    if (inserted.rowCount === 1) {
      return { outcome: "CLAIMED", ownerUserId: inserted.rows[0].user_id };
    }
    const existing = await runner.query<{ user_id: string }>(
      `SELECT user_id FROM portal_owner_anchor WHERE anchor_id = 'PORTAL_OWNER'`,
    );
    const ownerUserId = existing.rows[0]?.user_id ?? null;
    if (ownerUserId === null) {
      // The INSERT was skipped and no row exists: the anchor was removed
      // between the two statements. Refuse rather than retry into a race.
      throw new Error("portal owner anchor is not readable after a skipped claim");
    }
    if (ownerUserId !== input.userId) {
      throw new Error(
        "portal owner anchor is already claimed by a different user; " +
          "reassigning ownership is an explicit owner decision, not a bootstrap side effect",
      );
    }
    return { outcome: "ALREADY_OWNER", ownerUserId };
  }

}
