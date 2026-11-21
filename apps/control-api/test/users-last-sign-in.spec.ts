import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { UsersRepository, ROSTER_PAGE_SQL, ROSTER_LAST_SIGN_IN_SQL } from "../src/repos/users";
import { readRosterPage, parseRosterQuery } from "../src/admin/account-roster-page";
import { KeysetCursorCodec } from "../src/query/cursor";
import { projectAccount, withLastSignIn } from "../src/repos/account-lifecycle";

const now = new Date("2026-10-23T04:00:00.000Z");
const signedInAt = new Date("2026-10-22T08:17:00.000Z");
const row = (at: unknown = signedInAt) => ({
  user_id: "TEST_ONLY_user", username: "tester", display_name: "Tester", role: "USER", status: "ACTIVE",
  must_change_password: false, failed_login_count: 0, locked_until: null, session_version: 1,
  created_at: now, updated_at: now, disabled_at: null, account_revision: 1, archived_at: null,
  last_sign_in_at: at,
  total_count: 1, matching_count: 1, n_invited: 0, n_active: 1, n_disabled: 0, n_archived: 0,
  n_admin: 0, n_user: 1, n_locked: 0, n_awaiting: 0,
});
const repository = (rows: unknown[]) => {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query, users: new UsersRepository({ query } as unknown as Pool) };
};

describe("roster sign-in fact from retained successful interactive audit", () => {
  it("uses actor=target success events, excluding auto/acceptance sessions and keeping one snapshot", () => {
    expect(ROSTER_LAST_SIGN_IN_SQL).toContain("max(a.occurred_at)");
    expect(ROSTER_LAST_SIGN_IN_SQL).toContain("a.event_type = 'login_succeeded' AND a.result = 'SUCCESS'");
    expect(ROSTER_LAST_SIGN_IN_SQL).toContain("a.actor_user_id = page.user_id AND a.target_user_id = page.user_id");
    expect(ROSTER_LAST_SIGN_IN_SQL).toContain("a.reason_code IS DISTINCT FROM 'PREVIEW_AUTO_LOGIN'");
    expect(ROSTER_PAGE_SQL).toContain(`${ROSTER_LAST_SIGN_IN_SQL} AS last_sign_in_at`);
    expect(ROSTER_PAGE_SQL).not.toContain("auth_sessions");
  });

  it("publishes a retained successful fact in paged roster, without adding it to immutable audit state", async () => {
    const { query, users } = repository([row()]);
    const result = await readRosterPage({ store: users, ownerUserId: "TEST_ONLY_owner", query: parseRosterQuery({ limit: 5 }), now,
      codec: new KeysetCursorCodec({ activeKeyId: "k1", keys: { k1: "k".repeat(40) }, ttlSeconds: 60 }) });
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.accounts[0]).toHaveProperty("last_sign_in_at", signedInAt.toISOString());
    const generic = await users.findById("TEST_ONLY_user");
    expect(generic).not.toHaveProperty("lastSignInAt");
    expect(projectAccount(generic!, now)).not.toHaveProperty("last_sign_in_at");
    expect(result.counts.total).toBe(1);
  });

  it("uses the same audited fact for unpaged roster without modifying generic list", async () => {
    const { query, users } = repository([row()]);
    const [user] = await users.listRoster();
    expect(withLastSignIn(projectAccount(user, now), user.lastSignInAt).last_sign_in_at).toBe(signedInAt.toISOString());
    expect(query.mock.calls[0][0]).toContain(ROSTER_LAST_SIGN_IN_SQL);
    expect((await users.list())[0]).not.toHaveProperty("lastSignInAt");
  });

  for (const missing of [null, undefined, new Date(NaN), new Date(-1), "2026-10-22T08:17:00Z"])
    it(`omits missing/unreadable audit instead of claiming never: ${String(missing)}`, async () => {
      const { users } = repository([{ ...row(), last_sign_in_at: missing }]);
      const [user] = await users.listRoster();
      expect(user).not.toHaveProperty("lastSignInAt");
      expect(withLastSignIn(projectAccount(user, now), user.lastSignInAt)).not.toHaveProperty("last_sign_in_at");
    });
});
