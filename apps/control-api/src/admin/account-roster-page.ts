import { z } from "zod";

import type { PortalUser, Role } from "../domain";
import { KeysetCursorCodec, queryFingerprint } from "../query/cursor";
import { QueryContractError, type NormalizedFilter } from "../query/contracts";
import { projectAccount } from "../repos/account-lifecycle";
import type { RosterCountsRow } from "../repos/users";

/**
 * BE-P23 · the owner roster as a keyset page.
 *
 * `GET /api/admin/accounts` keeps its unpaged answer for a caller that sends no
 * query (the V1 Users screen, the CLI smoke): that is the transition. The
 * moment a caller sends `limit`, `cursor`, `q`, `role` or `state` the read is
 * paged, bounded and counted, and the body gains `page` and `counts`. Nothing
 * else in the body changes, so a reader of the old shape still reads this one.
 *
 * - order: `username` ascending. `username` is UNIQUE, so the order is total
 *   and a cursor needs no tie-break; the unique index serves the range scan.
 * - cursor: the engine's signed `KeysetCursorCodec` token, bound to the owner
 *   who was given it (workspace slot), the filters and the limit. A cursor from
 *   another owner, another filter or another limit is refused as changed; an
 *   expired or forged one is refused as invalid. Neither names an account.
 * - counts: exact and taken in the same statement as the rows (one snapshot).
 * - authorization: unchanged. `OwnerAccessGuard` runs before this and decides
 *   who may read; nothing here widens it, and a refusal never says whether an
 *   account matched.
 */

export const ROSTER_RESOURCE_ID = "portal.account-roster.v1";
export const ROSTER_DEFAULT_LIMIT = 50;
export const ROSTER_MAX_LIMIT = 200;
export const ROSTER_MAX_QUERY = 64;

type RosterState = "INVITED" | "ACTIVE" | "DISABLED" | "ARCHIVED";

export const RosterQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(ROSTER_MAX_LIMIT).default(ROSTER_DEFAULT_LIMIT),
    cursor: z.string().min(1).max(4096).optional(),
    q: z.string().trim().max(ROSTER_MAX_QUERY).optional(),
    role: z.enum(["ADMIN", "USER"]).optional(),
    state: z.enum(["INVITED", "ACTIVE", "DISABLED", "ARCHIVED"]).optional(),
  })
  .strict();
export type RosterQuery = z.infer<typeof RosterQuerySchema>;

export interface RosterStore {
  rosterPage(input: {
    limit: number;
    afterUsername: string | null;
    q: string | null;
    role: Role | null;
    state: RosterState | null;
    now: Date;
  }): Promise<{ counts: RosterCountsRow; rows: PortalUser[] }>;
}

/** A refusal with a fixed sentence: never the offending cursor, filter or driver text. */
export class RosterQueryError extends Error {
  constructor(readonly reasonCode: string, message: string, readonly status: number) {
    super(message);
  }
}

/** True when the caller asked for a page. An empty query keeps the unpaged answer. */
export function isPagedRoster(raw: unknown): boolean {
  return typeof raw === "object" && raw !== null && Object.keys(raw).length > 0;
}

export function parseRosterQuery(raw: unknown): RosterQuery {
  const parsed = RosterQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new RosterQueryError("ROSTER_QUERY_INVALID", "The roster query is not valid.", 400);
  }
  return parsed.data;
}

const searchOf = (query: RosterQuery): string | null => (query.q === undefined || query.q === "" ? null : query.q);

function filtersOf(query: RosterQuery): NormalizedFilter[] {
  const out: NormalizedFilter[] = [];
  const q = searchOf(query);
  if (q !== null) out.push({ field: "q", op: "contains", value: q.toLowerCase(), values: [q.toLowerCase()] });
  if (query.role) out.push({ field: "role", op: "eq", value: query.role, values: [query.role] });
  if (query.state) out.push({ field: "account_state", op: "eq", value: query.state, values: [query.state] });
  return out;
}

export interface RosterPageBody {
  accounts: ReturnType<typeof projectAccount>[];
  page: { limit: number; returned_count: number; has_more: boolean; next_cursor: string | null };
  counts: {
    total: number;
    matching: number;
    by_state: RosterCountsRow["byState"];
    by_role: RosterCountsRow["byRole"];
    locked: number;
    awaiting_first_password: number;
  };
}

export async function readRosterPage(input: {
  store: RosterStore;
  codec: KeysetCursorCodec;
  ownerUserId: string;
  query: RosterQuery;
  now?: Date;
}): Promise<RosterPageBody> {
  const { store, codec, ownerUserId, query } = input;
  const fingerprint = queryFingerprint({
    resourceId: ROSTER_RESOURCE_ID,
    limit: query.limit,
    filters: filtersOf(query),
    sort: [{ field: "username", direction: "asc" }],
  });
  let afterUsername: string | null = null;
  if (query.cursor !== undefined) {
    try {
      const boundary = codec.decode(query.cursor, {
        resourceId: ROSTER_RESOURCE_ID,
        workspaceId: ownerUserId,
        direction: "after",
        queryFingerprint: fingerprint,
        boundarySize: 1,
      });
      if (typeof boundary[0] !== "string" || boundary[0] === "") {
        throw new QueryContractError("INVALID_CURSOR", "Invalid query cursor.");
      }
      afterUsername = boundary[0];
    } catch (error) {
      if (!(error instanceof QueryContractError)) throw error;
      if (error.code === "CURSOR_CONTEXT_MISMATCH") {
        throw new RosterQueryError("ROSTER_CURSOR_CHANGED", "The roster cursor belongs to a different query. Reload the roster.", 409);
      }
      if (error.code === "CURSOR_EXPIRED") {
        throw new RosterQueryError("ROSTER_CURSOR_EXPIRED", "The roster cursor has expired. Reload the roster.", 409);
      }
      throw new RosterQueryError("ROSTER_CURSOR_INVALID", "The roster cursor is not valid.", 400);
    }
  }
  // One instant for the counts (SQL) and for every printed row: a lock expiring mid-read cannot split them.
  const now = input.now ?? new Date();
  const read = await store.rosterPage({
    limit: query.limit,
    afterUsername,
    q: searchOf(query),
    role: query.role ?? null,
    state: query.state ?? null,
    now,
  });
  // The statement asks for limit + 1 so "is there more" is a fact, not a guess from a full page.
  const more = read.rows.length > query.limit;
  const rows = read.rows.slice(0, query.limit);
  const last = rows[rows.length - 1];
  return {
    accounts: rows.map((row) => projectAccount(row, now)),
    page: {
      limit: query.limit,
      returned_count: rows.length,
      has_more: more,
      next_cursor:
        more && last
          ? codec.encode({
              resource_id: ROSTER_RESOURCE_ID,
              workspace_id: ownerUserId,
              direction: "after",
              query_fingerprint: fingerprint,
              boundary: [last.username],
            })
          : null,
    },
    counts: {
      total: read.counts.total,
      matching: read.counts.matching,
      by_state: read.counts.byState,
      by_role: read.counts.byRole,
      locked: read.counts.locked,
      awaiting_first_password: read.counts.awaitingFirstPassword,
    },
  };
}
