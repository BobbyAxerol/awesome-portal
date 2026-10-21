/**
 * BE-P23 · the owner roster as a keyset page: the page logic over an in-memory store (no PG).
 *
 * The store here mimics what `UsersRepository.rosterPage` answers (username order, limit + 1,
 * exact counts); the SQL itself is proved by `be-p23-users-roster-keyset.pg.spec.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  isPagedRoster, parseRosterQuery, readRosterPage, RosterQueryError, ROSTER_DEFAULT_LIMIT, ROSTER_MAX_LIMIT,
  type RosterStore,
} from "../src/admin/account-roster-page";
import type { PortalUser } from "../src/domain";
import { KeysetCursorCodec } from "../src/query/cursor";
import type { RosterCountsRow } from "../src/repos/users";

const KEY = "k".repeat(40);
const NOW = new Date("2026-10-20T08:00:00.000Z");

function user(i: number, patch: Partial<PortalUser> = {}): PortalUser {
  return {
    userId: `usr_${String(i).padStart(4, "0")}`, username: `user${String(i).padStart(4, "0")}`, displayName: `Account ${i}`,
    role: i <= 3 ? "ADMIN" : "USER", status: "ACTIVE", mustChangePassword: false, failedLoginCount: 0, lockedUntil: null,
    sessionVersion: 0, createdAt: NOW, updatedAt: NOW, disabledAt: null, accountRevision: 1, archivedAt: null, ...patch,
  } as PortalUser;
}

const stateOf = (u: PortalUser) => (u.archivedAt ? "ARCHIVED" : u.status);

/** What the SQL statement answers, over a list that is deliberately NOT in username order. */
function fakeStore(all: PortalUser[], calls: unknown[] = []): RosterStore {
  return {
    async rosterPage(input) {
      calls.push(input);
      const needle = input.q?.toLowerCase() ?? null;
      const matches = (u: PortalUser) =>
        (needle === null || u.username.toLowerCase().includes(needle) || u.displayName.toLowerCase().includes(needle)) &&
        (input.role === null || u.role === input.role) && (input.state === null || stateOf(u) === input.state);
      const ordered = [...all].sort((a, b) => (a.username < b.username ? -1 : a.username > b.username ? 1 : 0));
      const rows = ordered.filter((u) => matches(u) && (input.afterUsername === null || u.username > input.afterUsername)).slice(0, input.limit + 1);
      const count = (fn: (u: PortalUser) => boolean) => all.filter(fn).length;
      const counts: RosterCountsRow = {
        total: all.length, matching: count(matches),
        byState: { INVITED: count((u) => stateOf(u) === "INVITED"), ACTIVE: count((u) => stateOf(u) === "ACTIVE"), DISABLED: count((u) => stateOf(u) === "DISABLED"), ARCHIVED: count((u) => stateOf(u) === "ARCHIVED") },
        byRole: { ADMIN: count((u) => u.role === "ADMIN"), USER: count((u) => u.role === "USER") },
        locked: count((u) => u.lockedUntil !== null && u.lockedUntil > input.now),
        awaitingFirstPassword: count((u) => u.mustChangePassword && stateOf(u) !== "ARCHIVED"),
      };
      return { counts, rows };
    },
  };
}

const codec = (now = () => Math.floor(NOW.getTime() / 1000)) =>
  new KeysetCursorCodec({ activeKeyId: "k1", keys: { k1: KEY }, ttlSeconds: 60, now });
const roster = (n: number) => Array.from({ length: n }, (_, i) => user(n - i)); // reverse of username order

async function walk(store: RosterStore, query: Record<string, unknown>, owner = "usr_owner", c = codec()) {
  const seen: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  for (;;) {
    const body = await readRosterPage({ store, codec: c, ownerUserId: owner, query: parseRosterQuery({ ...query, ...(cursor ? { cursor } : {}) }), now: NOW });
    pages += 1;
    seen.push(...body.accounts.map((a) => a.user_id));
    expect(body.page.returned_count).toBe(body.accounts.length);
    expect(body.page.has_more).toBe(body.page.next_cursor !== null);
    if (body.page.next_cursor === null) return { seen, pages, last: body };
    cursor = body.page.next_cursor;
    if (pages > 50) throw new Error("runaway paging");
  }
}

describe("the query: bounded, closed, and only a query makes it a page", () => {
  it("no query keeps the unpaged answer; any known key pages", () => {
    expect(isPagedRoster({})).toBe(false);
    expect(isPagedRoster(undefined)).toBe(false);
    for (const key of ["limit", "cursor", "q", "role", "state"]) expect(isPagedRoster({ [key]: "x" })).toBe(true);
  });

  it("defaults to 50, allows 1..200, and refuses everything else by a fixed code", () => {
    expect(parseRosterQuery({ q: "a" }).limit).toBe(ROSTER_DEFAULT_LIMIT);
    expect(parseRosterQuery({ limit: "200" }).limit).toBe(ROSTER_MAX_LIMIT);
    expect(parseRosterQuery({ limit: "1" }).limit).toBe(1);
    for (const bad of [{ limit: "0" }, { limit: "201" }, { limit: "-1" }, { limit: "1.5" }, { limit: "x" }, { role: "SUPER" }, { state: "GONE" },
      { q: "x".repeat(65) }, { cursor: "" }, { cursor: "c".repeat(4097) }, { sort: "role" }, { limit: ["1", "2"] }]) {
      expect(() => parseRosterQuery(bad), JSON.stringify(bad)).toThrow(RosterQueryError);
      try { parseRosterQuery(bad); } catch (error) {
        expect((error as RosterQueryError).reasonCode).toBe("ROSTER_QUERY_INVALID");
        expect((error as RosterQueryError).status).toBe(400);
        expect((error as RosterQueryError).message).toBe("The roster query is not valid.");
      }
    }
  });
});

describe("the walk: stable order, no gap, no repeat, bounded", () => {
  it("walks 123 accounts at 50 per page in username order, 3 pages, exactly once each", async () => {
    const all = roster(123);
    const { seen, pages, last } = await walk(fakeStore(all), { limit: "50" });
    expect(pages).toBe(3);
    expect(seen).toHaveLength(123);
    expect(new Set(seen).size).toBe(123);
    expect(seen).toEqual([...seen].sort());
    expect(last.page.returned_count).toBe(23);
    expect(last.counts.total).toBe(123);
  });

  it("asks the store for at most limit + 1 rows and never returns more than limit", async () => {
    const calls: { limit: number }[] = [];
    const body = await readRosterPage({ store: fakeStore(roster(300), calls), codec: codec(), ownerUserId: "o", query: parseRosterQuery({ limit: "200" }), now: NOW });
    expect(calls[0]!.limit).toBe(200);
    expect(body.accounts).toHaveLength(200);
    expect(body.page).toMatchObject({ limit: 200, returned_count: 200, has_more: true });
  });

  it("an exact fit is not 'more': 50 accounts at limit 50 is one page with a null cursor", async () => {
    const body = await readRosterPage({ store: fakeStore(roster(50)), codec: codec(), ownerUserId: "o", query: parseRosterQuery({ limit: "50" }), now: NOW });
    expect(body.page).toEqual({ limit: 50, returned_count: 50, has_more: false, next_cursor: null });
  });

  it("an empty roster is an empty page with exact zero counts", async () => {
    const body = await readRosterPage({ store: fakeStore([]), codec: codec(), ownerUserId: "o", query: parseRosterQuery({ limit: "10" }), now: NOW });
    expect(body.accounts).toEqual([]);
    expect(body.page).toEqual({ limit: 10, returned_count: 0, has_more: false, next_cursor: null });
    expect(body.counts).toMatchObject({ total: 0, matching: 0, locked: 0, awaiting_first_password: 0 });
  });

  it("the cursor carries the last username only, as an opaque signed token", async () => {
    const body = await readRosterPage({ store: fakeStore(roster(10)), codec: codec(), ownerUserId: "o", query: parseRosterQuery({ limit: "3" }), now: NOW });
    const token = body.page.next_cursor!;
    expect(token.startsWith("kc1.k1.")).toBe(true);
    expect(token.length).toBeLessThan(4096);
    expect(Buffer.from(token.split(".")[2]!, "base64url").toString()).toContain("user0003");
  });
});

describe("filters are the server's, and counts stay roster-wide", () => {
  const mixed = [
    ...roster(20),
    user(21, { status: "INVITED", mustChangePassword: true, displayName: "Lan Tran" }),
    user(22, { status: "DISABLED" }),
    user(23, { archivedAt: NOW, status: "DISABLED", mustChangePassword: true }),
    user(24, { lockedUntil: new Date(NOW.getTime() + 60_000) }),
    user(25, { lockedUntil: new Date(NOW.getTime() - 60_000) }),
  ];

  it("q matches username or display name, case-insensitively; matching is the filtered total, the rest are roster-wide", async () => {
    const { seen, last } = await walk(fakeStore(mixed), { q: "LAN TRAN", limit: "5" });
    expect(seen).toEqual(["usr_0021"]);
    expect(last.counts.matching).toBe(1);
    expect(last.counts.total).toBe(25);
    expect(last.counts.by_state).toEqual({ INVITED: 1, ACTIVE: 22, DISABLED: 1, ARCHIVED: 1 });
    expect(last.counts.by_role).toEqual({ ADMIN: 3, USER: 22 });
  });

  it("role and state compose, and an archived account is ARCHIVED whatever its stored status", async () => {
    expect((await walk(fakeStore(mixed), { state: "ARCHIVED" })).seen).toEqual(["usr_0023"]);
    expect((await walk(fakeStore(mixed), { state: "DISABLED" })).seen).toEqual(["usr_0022"]);
    expect((await walk(fakeStore(mixed), { role: "ADMIN", state: "ACTIVE" })).seen).toEqual(["usr_0001", "usr_0002", "usr_0003"]);
    expect((await walk(fakeStore(mixed), { role: "ADMIN", state: "INVITED" })).seen).toEqual([]);
  });

  it("locked counts only an unexpired lock; awaiting-first-password excludes archived", async () => {
    const { last } = await walk(fakeStore(mixed), { limit: "200" });
    expect(last.counts.locked).toBe(1);
    expect(last.counts.awaiting_first_password).toBe(1);
  });

  it("the whole wire row is the sanitized projection: no hash, token, session or timestamps", async () => {
    const body = await readRosterPage({ store: fakeStore(mixed), codec: codec(), ownerUserId: "o", query: parseRosterQuery({ q: "lan" }), now: NOW });
    expect(Object.keys(body.accounts[0]!).sort()).toEqual(["account_revision", "account_state", "display_name", "locked", "must_change_password", "role", "user_id", "username"]);
  });
});

describe("the cursor is bound: another owner, filter, limit, key or time is refused by a fixed code, never by naming an account", () => {
  const first = async (query: Record<string, unknown>, owner = "usr_owner", c = codec()) =>
    (await readRosterPage({ store: fakeStore(roster(30)), codec: c, ownerUserId: owner, query: parseRosterQuery(query), now: NOW })).page.next_cursor!;
  const read = (query: Record<string, unknown>, owner = "usr_owner", c = codec()) =>
    readRosterPage({ store: fakeStore(roster(30)), codec: c, ownerUserId: owner, query: parseRosterQuery(query), now: NOW });
  const refusal = async (promise: Promise<unknown>) => {
    try { await promise; } catch (error) { return error as RosterQueryError; }
    throw new Error("expected a refusal");
  };

  it("replays on the same query and owner", async () => {
    const cursor = await first({ limit: "10" });
    const second = await read({ limit: "10", cursor });
    expect(second.accounts[0]!.username).toBe("user0011");
  });

  it("another owner, another limit, another q/role/state: ROSTER_CURSOR_CHANGED (409)", async () => {
    const cursor = await first({ limit: "10" });
    for (const [query, owner] of [[{ limit: "10", cursor }, "usr_other"], [{ limit: "11", cursor }, "usr_owner"],
      [{ limit: "10", cursor, q: "user" }, "usr_owner"], [{ limit: "10", cursor, role: "USER" }, "usr_owner"], [{ limit: "10", cursor, state: "ACTIVE" }, "usr_owner"]] as const) {
      const error = await refusal(read({ ...query }, owner));
      expect(error.reasonCode, JSON.stringify(query)).toBe("ROSTER_CURSOR_CHANGED");
      expect(error.status).toBe(409);
      expect(error.message).not.toMatch(/user\d{4}|usr_/);
    }
  });

  it("a forged, truncated, re-signed-with-another-key or non-token cursor: ROSTER_CURSOR_INVALID (400)", async () => {
    const cursor = await first({ limit: "10" });
    const other = new KeysetCursorCodec({ activeKeyId: "k1", keys: { k1: "z".repeat(40) }, ttlSeconds: 60, now: () => Math.floor(NOW.getTime() / 1000) });
    const foreign = await first({ limit: "10" }, "usr_owner", other);
    const parts = cursor.split(".");
    for (const bad of [cursor.slice(0, -4), `${parts[0]}.${parts[1]}.${parts[2]}.AAAA`, "not-a-cursor", foreign, "kc1.k1..", `${cursor}.x`]) {
      const error = await refusal(read({ limit: "10", cursor: bad }));
      expect(error.reasonCode, bad).toBe("ROSTER_CURSOR_INVALID");
      expect(error.status).toBe(400);
    }
  });

  it("an expired cursor: ROSTER_CURSOR_EXPIRED (409), judged by the signing clock", async () => {
    const cursor = await first({ limit: "10" });
    const later = codec(() => Math.floor(NOW.getTime() / 1000) + 61);
    const error = await refusal(read({ limit: "10", cursor }, "usr_owner", later));
    expect(error.reasonCode).toBe("ROSTER_CURSOR_EXPIRED");
    expect(error.status).toBe(409);
  });

  it("a validly signed cursor with a boundary of the wrong type is invalid, not a crash", async () => {
    const c = codec();
    // Re-use the engine to sign a numeric boundary under the real context, then replay it.
    const probe = await readRosterPage({ store: fakeStore(roster(30)), codec: c, ownerUserId: "usr_owner", query: parseRosterQuery({ limit: "10" }), now: NOW });
    const real = probe.page.next_cursor!;
    const payload = JSON.parse(Buffer.from(real.split(".")[2]!, "base64url").toString());
    const forged = c.encode({ resource_id: payload.resource_id, workspace_id: payload.workspace_id, direction: "after", query_fingerprint: payload.query_fingerprint, boundary: [7] });
    const error = await refusal(read({ limit: "10", cursor: forged }));
    expect(error.reasonCode).toBe("ROSTER_CURSOR_INVALID");
  });
});

describe("a driver failure is not this module's to word", () => {
  it("propagates the store's error unchanged for the controller's fixed 500 sentence", async () => {
    const boom: RosterStore = { rosterPage: async () => { throw new Error("connection string postgres://secret"); } };
    await expect(readRosterPage({ store: boom, codec: codec(), ownerUserId: "o", query: parseRosterQuery({ limit: "5" }), now: NOW })).rejects.toThrow("connection string");
  });
});
