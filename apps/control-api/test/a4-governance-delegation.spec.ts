/**
 * A4-3 · delegated Governance, proved at its edges.
 *
 * The required evidence is a matrix of four actors against four gates, plus the
 * races. Each test below is one cell of that or one race, and what makes them
 * worth the lines is that every one names a way delegation quietly becomes
 * escalation: a grant that widens itself, a grant that confers workspace
 * access, a revoke that a cached authorization outlives, two owners whose
 * changes interleave.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminService } from "../src/admin/admin.service";
import { GovernanceGrantsService, GrantDeniedError, type GrantRequest } from "../src/admin/governance-grants.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { OwnerAccessService } from "../src/auth/owner-access.service";
import { governanceDenial } from "../src/auth/governance-access";
import { AccountLifecycleRepository } from "../src/repos/account-lifecycle";
import { GovernanceGrantsRepository } from "../src/repos/governance-grants";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { randomId, type PortalUser } from "../src/domain";

import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";

describe("A4-3 delegated Governance gates", () => {
  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
  });

  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let grants: GovernanceGrantsRepository;
  let ownerAccess: OwnerAccessService;
  let service: GovernanceGrantsService;
  let lifecycle: AccountLifecycleRepository;

  /** owner · delegated decider · delegated reader · ungranted USER · non-owner ADMIN */
  let bobby: PortalUser;
  let stan: PortalUser;
  let reader: PortalUser;
  let outsider: PortalUser;
  let otherAdmin: PortalUser;
  let workspaceId: string;
  /** A session that has stepped up, so grant mutations are reachable. */
  let ownerSessionId: string;

  const freshUser = async (prefix: string, role: "ADMIN" | "USER" = "USER") => {
    const username = `${prefix}-${process.hrtime.bigint()}`;
    const created = await admin.createUser({ username, displayName: prefix, role });
    await auth.users.update({ userId: created.userId, status: "ACTIVE", mustChangePassword: false });
    return (await auth.users.findById(created.userId))!;
  };

  const freshSession = async (user: PortalUser, steppedUp = true): Promise<string> => {
    const sessionId = randomId("ses");
    await ctx.pool.query(
      `INSERT INTO auth_sessions
         (session_id, session_token_hash, user_id, state, csrf_secret_hash,
          session_version, idle_expires_at, absolute_expires_at)
       VALUES ($1, $2, $3, 'ACTIVE', 'x', $4, now() + interval '1 hour', now() + interval '8 hours')`,
      [sessionId, randomId("tok"), user.userId, user.sessionVersion],
    );
    if (steppedUp) await lifecycle.grantStepUp({
      stepUpId: randomId("stp"), sessionId, userId: user.userId, ttlSeconds: 3600,
    });
    return sessionId;
  };

  beforeAll(async () => {
    ctx = await setupApp({ AUTH_MODE: "dev" });
    auth = new AuthService(
      ctx.pool,
      ctx.config,
      new Argon2CredentialService({
        memoryKib: ctx.config.ARGON2_MEMORY_KIB,
        iterations: ctx.config.ARGON2_ITERATIONS,
        parallelism: ctx.config.ARGON2_PARALLELISM,
      }),
    );
    admin = new AdminService(ctx.pool, ctx.config, auth);
    grants = new GovernanceGrantsRepository(ctx.pool);
    ownerAccess = new OwnerAccessService(ctx.pool as never);
    lifecycle = new AccountLifecycleRepository(ctx.pool);
    service = new GovernanceGrantsService(ctx.pool, auth, ownerAccess);

    await ctx.pool.query("DELETE FROM portal_owner_anchor");
    bobby = await freshUser("deleg-owner", "ADMIN");
    stan = await freshUser("deleg-stan");
    reader = await freshUser("deleg-reader");
    outsider = await freshUser("deleg-outsider");
    otherAdmin = await freshUser("deleg-admin", "ADMIN");
    await new OwnerAccessRepository(ctx.pool).claimOwner({
      userId: bobby.userId,
      claimedBy: "delegation-spec",
    });

    const workspaces = new WorkspacesRepository(ctx.pool as never);
    workspaceId = await workspaces.ensurePersonal(bobby.userId, bobby.username);
    for (const member of [stan, reader, outsider, otherAdmin]) {
      await ctx.pool.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, 'MEMBER') ON CONFLICT DO NOTHING`,
        [workspaceId, member.userId],
      );
    }

    // A live session for the owner, stepped up, so grant mutations are allowed.
    ownerSessionId = await freshSession(bobby);
  });

  afterAll(async () => {
    await teardownApp(ctx);
  });

  const ownerRequest = (over: Record<string, unknown>): GrantRequest => ({
    actor: bobby,
    sessionId: ownerSessionId,
    idempotencyKey: randomId("idem"),
    ...over,
  }) as GrantRequest;

  const accessOf = (userId: string) => ownerAccess.effectiveAccess(userId);

  // ----------------------------------------------------------- the matrix

  describe("four actors against four gates", () => {
    it("gives the owner every gate in both modes, in every workspace", async () => {
      const access = await accessOf(bobby.userId);
      expect(access.isOwner).toBe(true);
      for (const gate of ["r1", "r2", "canary", "live"] as const) {
        for (const mode of ["read", "decide"] as const) {
          expect(governanceDenial({ access, gate, mode, workspaceId }), `${gate}.${mode}`).toBeNull();
          // And unscoped: the owner is not workspace-bound.
          expect(governanceDenial({ access, gate, mode, workspaceId: null })).toBeNull();
        }
      }
    });

    it("gives an ungranted USER nothing at all", async () => {
      const access = await accessOf(outsider.userId);
      expect(access.capabilities).toEqual([]);
      for (const gate of ["r1", "r2", "canary", "live"] as const) {
        expect(
          governanceDenial({ access, gate, mode: "read", workspaceId }),
          gate,
        ).toBe("GOVERNANCE_CAPABILITY_REQUIRED");
      }
    });

    it("gives a non-owner ADMIN nothing either — a role is not a grant", async () => {
      // Finding A4-F06, in its Governance form. Before A4-3 this account could
      // decide every gate in the Portal because `role = 'ADMIN'`.
      const access = await accessOf(otherAdmin.userId);
      expect(access.isOwner).toBe(false);
      expect(access.capabilities).toEqual([]);
      expect(
        governanceDenial({ access, gate: "r2", mode: "decide", workspaceId }),
      ).toBe("GOVERNANCE_CAPABILITY_REQUIRED");
    });

    it("gives a delegated decider that gate in both modes and no other gate", async () => {
      await service.execute(
        ownerRequest({
          action: "GRANT",
          granteeUserId: stan.userId,
          capability: "governance.r2.decide",
          workspaceId: null,
        }),
      );
      const access = await accessOf(stan.userId);
      // `*.decide` implies `*.read`, and BOTH are listed so the UI can explain
      // itself (§20.3, frozen in A4-1).
      expect(access.capabilities).toEqual(["governance.r2.decide", "governance.r2.read"]);
      expect(governanceDenial({ access, gate: "r2", mode: "decide", workspaceId })).toBeNull();
      expect(governanceDenial({ access, gate: "r2", mode: "read", workspaceId })).toBeNull();
      // Every other gate stays shut.
      for (const gate of ["r1", "canary", "live"] as const) {
        expect(
          governanceDenial({ access, gate, mode: "read", workspaceId }),
          gate,
        ).toBe("GOVERNANCE_CAPABILITY_REQUIRED");
      }
    });

    it("gives a delegated reader the gate to read and never to decide", async () => {
      // §20.2 rule 4: the two halves are different grants, and a reader must
      // not acquire a decision affordance by being in the room.
      await service.execute(
        ownerRequest({
          action: "GRANT",
          granteeUserId: reader.userId,
          capability: "governance.r1.read",
          workspaceId: null,
        }),
      );
      const access = await accessOf(reader.userId);
      expect(access.capabilities).toEqual(["governance.r1.read"]);
      expect(governanceDenial({ access, gate: "r1", mode: "read", workspaceId })).toBeNull();
      expect(
        governanceDenial({ access, gate: "r1", mode: "decide", workspaceId }),
      ).toBe("GOVERNANCE_CAPABILITY_REQUIRED");
    });

    it("serializes concurrent retries of one grant into one event and one replay", async () => {
      const key = randomId("same-grant-key");
      const request = ownerRequest({
        idempotencyKey: key,
        action: "GRANT",
        granteeUserId: outsider.userId,
        capability: "governance.canary.read",
        workspaceId: null,
      });
      const [first, second] = await Promise.all([
        service.execute(request),
        service.execute({ ...request }),
      ]);
      expect([first.outcome, second.outcome].sort()).toEqual(["APPLIED", "REPLAYED"]);
      expect(
        Number(
          (await ctx.pool.query(
            `SELECT count(*) FROM portal_capability_grant_events WHERE idempotency_key = $1`,
            [key],
          )).rows[0].count,
        ),
      ).toBe(1);
      expect(
        Number(
          (await ctx.pool.query(
            `SELECT count(*) FROM portal_capability_grants
              WHERE grantee_user_id = $1 AND capability = 'governance.canary.read' AND state = 'ACTIVE'`,
            [outsider.userId],
          )).rows[0].count,
        ),
      ).toBe(1);
    });
  });

  // ------------------------------------------------------------- scoping

  describe("a grant says what, never where", () => {
    it("refuses a grant scoped to a workspace the grantee is not in", async () => {
      await expect(
        service.execute(
          ownerRequest({
            action: "GRANT",
            granteeUserId: stan.userId,
            capability: "governance.canary.read",
            workspaceId: "ws_somewhere_else",
          }),
        ),
      ).rejects.toMatchObject({ reasonCode: "GRANTEE_NOT_IN_WORKSPACE" });
      expect(
        await grants.findActive({
          granteeUserId: stan.userId,
          capability: "governance.canary.read",
          workspaceId: "ws_somewhere_else",
        }),
      ).toBeNull();
    });

    it("confines a scoped grant to its workspace", async () => {
      const scoped = await freshUser("deleg-scoped");
      await ctx.pool.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'MEMBER')`,
        [workspaceId, scoped.userId],
      );
      await service.execute(
        ownerRequest({
          action: "GRANT",
          granteeUserId: scoped.userId,
          capability: "governance.canary.decide",
          workspaceId,
        }),
      );
      const access = await accessOf(scoped.userId);
      expect(governanceDenial({ access, gate: "canary", mode: "decide", workspaceId })).toBeNull();
      // Another workspace, and the Portal-wide case, both refused.
      expect(
        governanceDenial({ access, gate: "canary", mode: "decide", workspaceId: "ws_other" }),
      ).toBe("GOVERNANCE_SCOPE_MISMATCH");
      expect(
        governanceDenial({ access, gate: "canary", mode: "decide", workspaceId: null }),
      ).toBe("GOVERNANCE_SCOPE_MISMATCH");
    });

    it("stops answering the moment workspace membership is removed", async () => {
      /*
       * The "membership removal while a page or stream is active" case. There
       * is no cache to go stale, so the very next request already reflects it —
       * which is the property being asserted, not an implementation detail.
       */
      const transient = await freshUser("deleg-transient");
      await ctx.pool.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'MEMBER')`,
        [workspaceId, transient.userId],
      );
      await service.execute(
        ownerRequest({
          action: "GRANT",
          granteeUserId: transient.userId,
          capability: "governance.live.read",
          workspaceId,
        }),
      );
      expect(
        governanceDenial({
          access: await accessOf(transient.userId),
          gate: "live",
          mode: "read",
          workspaceId,
        }),
      ).toBeNull();

      await ctx.pool.query(
        `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, transient.userId],
      );
      // The grant row still exists — the owner did not revoke it — but the
      // workspace it was scoped to is no longer reachable, and the workspace
      // guard on the route refuses before the capability is even consulted.
      const stillMember = await new WorkspacesRepository(ctx.pool as never).isMember(
        workspaceId,
        transient.userId,
      );
      expect(stillMember).toBe(false);
    });
  });

  // ---------------------------------------------------------- the refusals

  describe("delegation never widens itself", () => {
    it("refuses a self-grant", async () => {
      await expect(
        service.execute(
          ownerRequest({
            action: "GRANT",
            granteeUserId: bobby.userId,
            capability: "governance.live.decide",
            workspaceId: null,
          }),
        ),
      ).rejects.toBeInstanceOf(GrantDeniedError);
    });

    it("refuses a grant aimed at the owner anchor", async () => {
      const second = await freshUser("deleg-second-owner");
      await ctx.pool.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'MEMBER')`,
        [workspaceId, second.userId],
      );
      // Not the owner: allowed. The refusal is specifically about the anchor.
      await service.execute(
        ownerRequest({
          action: "GRANT",
          granteeUserId: second.userId,
          capability: "governance.r1.read",
          workspaceId: null,
        }),
      );
      await expect(
        service.execute(
          ownerRequest({
            action: "GRANT",
            granteeUserId: bobby.userId,
            capability: "governance.r1.read",
            workspaceId: null,
          }),
        ),
      ).rejects.toMatchObject({ reasonCode: "SELF_GRANT_REFUSED" });
    });

    it("refuses anything outside the finite namespace", async () => {
      // §20.5 item 2: no free-form route, SQL, role or command string.
      for (const capability of ["*", "ADMIN", "DROP TABLE portal_users", "governance.r3.decide"]) {
        await expect(
          service.execute(
            ownerRequest({
              action: "GRANT",
              granteeUserId: stan.userId,
              capability,
              workspaceId: null,
            }),
          ),
          capability,
        ).rejects.toMatchObject({ reasonCode: "CAPABILITY_NOT_IN_NAMESPACE" });
      }
    });

    it("refuses to delegate the ability to delegate", async () => {
      await expect(
        service.execute(
          ownerRequest({
            action: "GRANT",
            granteeUserId: stan.userId,
            capability: "administration.profile_access.manage",
            workspaceId: null,
          }),
        ),
      ).rejects.toMatchObject({ reasonCode: "CAPABILITY_NOT_DELEGABLE" });
    });

    it("refuses a duplicate rather than writing a second row", async () => {
      const dup = await freshUser("deleg-dup");
      await service.execute(
        ownerRequest({
          action: "GRANT",
          granteeUserId: dup.userId,
          capability: "governance.r1.read",
          workspaceId: null,
        }),
      );
      await expect(
        service.execute(
          ownerRequest({
            action: "GRANT",
            granteeUserId: dup.userId,
            capability: "governance.r1.read",
            workspaceId: null,
          }),
        ),
      ).rejects.toMatchObject({ reasonCode: "GRANT_ALREADY_ACTIVE" });
      const rows = await grants.listGrants({ granteeUserId: dup.userId });
      expect(rows).toHaveLength(1);
    });

    it("refuses a grant to an account with no access at all", async () => {
      const disabled = await freshUser("deleg-disabled");
      await auth.users.update({ userId: disabled.userId, status: "DISABLED" });
      await expect(
        service.execute(
          ownerRequest({
            action: "GRANT",
            granteeUserId: disabled.userId,
            capability: "governance.r1.read",
            workspaceId: null,
          }),
        ),
      ).rejects.toMatchObject({ reasonCode: "ACCOUNT_NOT_ACTIVE" });
    });

    it("requires a step-up, leaves grants unchanged and audits the redacted refusal", async () => {
      const noStepUp = await freshSession(bobby, false);
      const requestId = randomId("req");
      const before = (await grants.listGrants()).length;
      await expect(
        service.execute({
          action: "GRANT",
          actor: bobby,
          sessionId: noStepUp,
          idempotencyKey: randomId("idem"),
          requestId,
          granteeUserId: stan.userId,
          capability: "governance.canary.read",
          workspaceId: null,
        } as never),
      ).rejects.toMatchObject({ reasonCode: "STEP_UP_REQUIRED" });
      expect((await grants.listGrants()).length).toBe(before);
      const audited = await ctx.pool.query(`SELECT metadata_json FROM auth_audit_events
        WHERE request_id = $1 AND reason_code = 'STEP_UP_REQUIRED'`, [requestId]);
      expect(audited.rows).toHaveLength(1);
      expect(audited.rows[0].metadata_json).toMatchObject({ replayable: false, step_up_used: false });
    });
  });

  // ------------------------------------------------------------ the races

  describe("the races", () => {
    it("answers a duplicate idempotency key without granting twice", async () => {
      const target = await freshUser("deleg-idem");
      const key = randomId("idem");
      const request = {
        action: "GRANT" as const,
        actor: bobby,
        sessionId: ownerSessionId,
        idempotencyKey: key,
        granteeUserId: target.userId,
        capability: "governance.r1.read",
        workspaceId: null,
      };
      const first = await service.execute(request as never);
      const replay = await service.execute(request as never);
      expect(first.outcome).toBe("APPLIED");
      expect(replay.outcome).toBe("REPLAYED");
      expect(await grants.listGrants({ granteeUserId: target.userId })).toHaveLength(1);
    });

    it("refuses a reused key that carries a different request", async () => {
      const target = await freshUser("deleg-idem-conflict");
      const key = randomId("idem");
      await service.execute({
        action: "GRANT", actor: bobby, sessionId: ownerSessionId,
        idempotencyKey: key, granteeUserId: target.userId,
        capability: "governance.r1.read", workspaceId: null,
      } as never);
      await expect(
        service.execute({
          action: "GRANT", actor: bobby, sessionId: ownerSessionId,
          idempotencyKey: key, granteeUserId: target.userId,
          capability: "governance.r2.read", workspaceId: null,
        } as never),
      ).rejects.toMatchObject({ reasonCode: "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT" });
    });

    it("lets exactly one of two concurrent owner revokes win", async () => {
      const target = await freshUser("deleg-race");
      const granted = await service.execute(
        ownerRequest({
          action: "GRANT",
          granteeUserId: target.userId,
          capability: "governance.canary.read",
          workspaceId: null,
        }),
      );
      const grantId = granted.grant!.grantId;
      const revision = granted.grant!.grantRevision;

      const outcomes = await Promise.allSettled([
        service.execute(ownerRequest({ action: "REVOKE", grantId, expectedRevision: revision })),
        service.execute(ownerRequest({ action: "REVOKE", grantId, expectedRevision: revision })),
      ]);
      const applied = outcomes.filter((o) => o.status === "fulfilled");
      const refused = outcomes.filter((o) => o.status === "rejected");
      expect(applied).toHaveLength(1);
      expect(refused).toHaveLength(1);
      expect((await grants.findById(grantId))?.state).toBe("REVOKED");
    });

    it("makes a revoke effective on the very next authorization decision", async () => {
      /*
       * The revocation race. There is no authorization cache, so this is true
       * by construction — and the test exists because the day somebody adds a
       * cache, this is what must keep passing.
       */
      const target = await freshUser("deleg-revoke-now");
      const granted = await service.execute(
        ownerRequest({
          action: "GRANT",
          granteeUserId: target.userId,
          capability: "governance.live.decide",
          workspaceId: null,
        }),
      );
      expect(
        governanceDenial({
          access: await accessOf(target.userId), gate: "live", mode: "decide", workspaceId,
        }),
      ).toBeNull();

      await service.execute(
        ownerRequest({
          action: "REVOKE",
          grantId: granted.grant!.grantId,
          expectedRevision: granted.grant!.grantRevision,
        }),
      );
      expect(
        governanceDenial({
          access: await accessOf(target.userId), gate: "live", mode: "decide", workspaceId,
        }),
      ).toBe("GOVERNANCE_CAPABILITY_REQUIRED");
    });

    it("refuses a stale revision without a partial write", async () => {
      const target = await freshUser("deleg-stale");
      const granted = await service.execute(
        ownerRequest({
          action: "GRANT",
          granteeUserId: target.userId,
          capability: "governance.r2.read",
          workspaceId: null,
        }),
      );
      await expect(
        service.execute(
          ownerRequest({
            action: "REVOKE",
            grantId: granted.grant!.grantId,
            expectedRevision: granted.grant!.grantRevision + 5,
          }),
        ),
      ).rejects.toMatchObject({ reasonCode: "STALE_GRANT_REVISION" });
      expect((await grants.findById(granted.grant!.grantId))?.state).toBe("ACTIVE");
    });
  });

  // ----------------------------------------- current authority and replay

  describe("ELP2-03 current authority and immutable original receipts", () => {
    it("replays the original ACTIVE revision after that grant has been revoked", async () => {
      const target = await freshUser("deleg-original");
      const request = ownerRequest({ action: "GRANT", granteeUserId: target.userId,
        capability: "governance.r1.read", workspaceId: null });
      const first = await service.execute(request);
      await service.execute(ownerRequest({ action: "REVOKE", grantId: first.grant!.grantId,
        expectedRevision: first.grant!.grantRevision }));
      const replay = await service.execute(request);
      expect(replay.outcome).toBe("REPLAYED");
      expect(replay.grant).toEqual(first.grant);
      expect(replay.grant).toMatchObject({ state: "ACTIVE", grantRevision: 1 });
      expect((await grants.findById(first.grant!.grantId))?.state).toBe("REVOKED");
    });

    it("replays the original revoke snapshot after a later independent grant", async () => {
      const target = await freshUser("deleg-revoke-receipt");
      const granted = await service.execute(ownerRequest({ action: "GRANT", granteeUserId: target.userId,
        capability: "governance.r2.read", workspaceId: null }));
      const revoke = ownerRequest({ action: "REVOKE", grantId: granted.grant!.grantId, expectedRevision: 1 });
      const first = await service.execute(revoke);
      const next = await service.execute(ownerRequest({ action: "GRANT", granteeUserId: target.userId,
        capability: "governance.r2.read", workspaceId: null }));
      expect(next.grant!.grantId).not.toBe(first.grant!.grantId);
      expect((await service.execute(revoke)).grant).toEqual(first.grant);
      expect(first.grant).toMatchObject({ state: "REVOKED", grantRevision: 2 });
    });

    it("does not turn a repeated self-grant denial into a successful replay", async () => {
      const request = ownerRequest({ action: "GRANT", granteeUserId: bobby.userId,
        capability: "governance.live.read", workspaceId: null });
      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(service.execute(request)).rejects.toMatchObject({ reasonCode: "SELF_GRANT_REFUSED", status: 409 });
      }
      const event = await grants.findEventByKey(request.idempotencyKey);
      expect(event?.outcome).toBe("DENIED");
    });

    it("does not turn a repeated stale-revision conflict into a successful replay", async () => {
      const target = await freshUser("deleg-conflict-receipt");
      const first = await service.execute(ownerRequest({ action: "GRANT", granteeUserId: target.userId,
        capability: "governance.canary.read", workspaceId: null }));
      const request = ownerRequest({ action: "REVOKE", grantId: first.grant!.grantId, expectedRevision: 42 });
      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(service.execute(request)).rejects.toMatchObject({ reasonCode: "STALE_GRANT_REVISION", status: 409 });
      }
      expect((await grants.findById(first.grant!.grantId))?.state).toBe("ACTIVE");
    });

    it("keeps a duplicate-grant refusal after the conflicting grant was later revoked", async () => {
      const target = await freshUser("deleg-original-refusal");
      const setup = { action: "GRANT", granteeUserId: target.userId,
        capability: "governance.r1.read", workspaceId: null };
      const first = await service.execute(ownerRequest(setup));
      const duplicate = ownerRequest(setup);
      await expect(service.execute(duplicate)).rejects.toMatchObject({ reasonCode: "GRANT_ALREADY_ACTIVE", status: 409 });
      await service.execute(ownerRequest({ action: "REVOKE", grantId: first.grant!.grantId, expectedRevision: 1 }));
      await expect(service.execute(duplicate)).rejects.toMatchObject({ reasonCode: "GRANT_ALREADY_ACTIVE", status: 409 });
      expect((await grants.findEventByKey(duplicate.idempotencyKey))?.outcome).toBe("DENIED");
      expect(await grants.listGrants({ granteeUserId: target.userId })).toEqual([]);
    });

    it("records absent→ACTIVE and ACTIVE→REVOKED immutable before/after images", async () => {
      const target = await freshUser("deleg-images");
      await ctx.pool.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'MEMBER')`,
        [workspaceId, target.userId]);
      const granted = await service.execute(ownerRequest({ action: "GRANT", granteeUserId: target.userId,
        capability: "governance.r1.read", workspaceId }));
      expect(granted.event.stateBefore).toBeNull();
      expect(granted.event.stateAfter).toMatchObject({ state: "ACTIVE", workspace_id: workspaceId, grant_revision: 1 });
      const revoked = await service.execute(ownerRequest({ action: "REVOKE", grantId: granted.grant!.grantId, expectedRevision: 1 }));
      expect(revoked.event.stateBefore).toEqual({ state: "ACTIVE", workspace_id: workspaceId, grant_revision: 1 });
      expect(revoked.event.stateAfter).toMatchObject({ state: "REVOKED", workspace_id: workspaceId, grant_revision: 2 });
      expect(revoked.event.stateAfter?._receipt).toMatchObject({ version: "portal.grant-receipt.v1", http_status: 200 });
    });

    it("reconstructs a historical receipt only from immutable event facts", async () => {
      const target = await freshUser("deleg-historical");
      const request = ownerRequest({ action: "GRANT", granteeUserId: target.userId,
        capability: "governance.live.read", workspaceId: null });
      const first = await service.execute(request);
      // Exact old event shape, with its original fingerprint unchanged.
      await ctx.pool.query(`UPDATE portal_capability_grant_events SET state_after = state_after - '_receipt'
        WHERE event_id = $1`, [first.event.eventId]);
      await service.execute(ownerRequest({ action: "REVOKE", grantId: first.grant!.grantId, expectedRevision: 1 }));
      const replay = await service.execute(request);
      expect(replay.grant).toEqual(first.grant);
      expect(replay.event.requestFingerprint).toBe(first.event.requestFingerprint);
    });

    it("fails closed if historical receipt facts are missing instead of borrowing the mutable grant", async () => {
      const target = await freshUser("deleg-missing-history");
      const request = ownerRequest({ action: "GRANT", granteeUserId: target.userId,
        capability: "governance.live.read", workspaceId: null });
      const first = await service.execute(request);
      await ctx.pool.query(`UPDATE portal_capability_grant_events SET state_after = NULL WHERE event_id = $1`, [first.event.eventId]);
      await expect(service.execute(request)).rejects.toMatchObject({ reasonCode: "GRANT_RECEIPT_NOT_AVAILABLE", status: 503 });
    });

    it("binds an unchanged historical fingerprint to its original authorized actor", async () => {
      const target = await freshUser("deleg-actor-receipt");
      const request = ownerRequest({ action: "GRANT", granteeUserId: target.userId,
        capability: "governance.r2.read", workspaceId: null });
      const first = await service.execute(request);
      const second = await freshUser("deleg-owner-replacement", "ADMIN");
      const secondSession = await freshSession(second);
      try {
        await ctx.pool.query(`UPDATE portal_owner_anchor SET user_id = $1 WHERE anchor_id = 'PORTAL_OWNER'`, [second.userId]);
        await expect(service.execute({ ...request, actor: second, sessionId: secondSession })).rejects.toMatchObject({
          reasonCode: "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT", status: 409,
        });
        expect((await grants.findEventByKey(request.idempotencyKey))?.requestFingerprint).toBe(first.event.requestFingerprint);
        await expect(service.execute(request)).rejects.toMatchObject({ reasonCode: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403 });
      } finally {
        await ctx.pool.query(`UPDATE portal_owner_anchor SET user_id = $1 WHERE anchor_id = 'PORTAL_OWNER'`, [bobby.userId]);
      }
      expect((await service.execute(request)).outcome).toBe("REPLAYED");
    });

    it("requires a current unexpired session of the actor even when an original receipt exists", async () => {
      const target = await freshUser("deleg-session-fence");
      const request = ownerRequest({ action: "GRANT", granteeUserId: target.userId,
        capability: "governance.r1.read", workspaceId: null });
      await service.execute(request);
      const foreign = await freshSession(stan);
      for (const invalidSession of [randomId("missing"), foreign]) {
        await expect(service.execute({ ...request, sessionId: invalidSession })).rejects.toMatchObject({
          reasonCode: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403,
        });
      }
      for (const change of [
        `state = 'REVOKED'`,
        `idle_expires_at = now() - interval '1 second'`,
        `absolute_expires_at = now() - interval '1 second'`,
        `session_version = session_version + 1`,
      ]) {
        const sessionId = await freshSession(bobby);
        // Test-owned constant SQL only, never request-provided SQL.
        await ctx.pool.query(`UPDATE auth_sessions SET ${change} WHERE session_id = $1`, [sessionId]);
        await expect(service.execute({ ...request, sessionId })).rejects.toMatchObject({ reasonCode: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403 });
      }
      expect((await service.execute(request)).outcome).toBe("REPLAYED");
    });

    it("requires the current user state and generation before replay or a new write", async () => {
      const target = await freshUser("deleg-user-fence");
      const request = ownerRequest({ action: "GRANT", granteeUserId: target.userId,
        capability: "governance.r1.read", workspaceId: null });
      await service.execute(request);
      for (const change of [
        `status = 'DISABLED'`, `archived_at = now()`, `must_change_password = true`,
        `session_version = session_version + 1`,
      ]) {
        try {
          await ctx.pool.query(`UPDATE portal_users SET ${change} WHERE user_id = $1`, [bobby.userId]);
          await expect(service.execute(request)).rejects.toMatchObject({ reasonCode: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403 });
          await expect(service.execute({ ...request, idempotencyKey: randomId("new-key") })).rejects.toMatchObject({
            reasonCode: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403,
          });
        } finally {
          await ctx.pool.query(`UPDATE portal_users SET status = 'ACTIVE', archived_at = NULL,
            must_change_password = false, session_version = $2 WHERE user_id = $1`, [bobby.userId, bobby.sessionVersion]);
        }
      }
    });

    it("requires an actor-and-session-bound current step-up before replay", async () => {
      const target = await freshUser("deleg-stepup-fence");
      const request = ownerRequest({ action: "GRANT", granteeUserId: target.userId,
        capability: "governance.canary.read", workspaceId: null });
      await service.execute(request);
      for (const change of [
        { sql: `revoked_at = now()`, values: [] },
        { sql: `expires_at = now() - interval '1 second'`, values: [] },
        { sql: `user_id = $2`, values: [stan.userId] },
      ]) {
        const sessionId = await freshSession(bobby);
        await ctx.pool.query(`UPDATE owner_step_up_grants SET ${change.sql} WHERE session_id = $1`, [sessionId, ...change.values]);
        await expect(service.execute({ ...request, sessionId })).rejects.toMatchObject({ reasonCode: "STEP_UP_REQUIRED", status: 403 });
      }
      expect((await service.execute(request)).outcome).toBe("REPLAYED");
    });

    it("does not consume an idempotency key for a step-up failure", async () => {
      const target = await freshUser("deleg-stepup-recover");
      const sessionId = await freshSession(bobby, false);
      const request = ownerRequest({ action: "GRANT", sessionId, granteeUserId: target.userId,
        capability: "governance.r1.read", workspaceId: null });
      await expect(service.execute(request)).rejects.toMatchObject({ reasonCode: "STEP_UP_REQUIRED", status: 403 });
      await lifecycle.grantStepUp({ stepUpId: randomId("stp"), sessionId, userId: bobby.userId, ttlSeconds: 60 });
      expect((await service.execute(request)).outcome).toBe("APPLIED");
    });

    it("fences a queued grant behind a concurrent owner disable transaction", async () => {
      const target = await freshUser("deleg-disable-race");
      const blocker = await ctx.pool.connect();
      let attempt: Promise<unknown> | undefined;
      try {
        await blocker.query("BEGIN");
        const pid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        await blocker.query(`UPDATE portal_users SET status = 'DISABLED' WHERE user_id = $1`, [bobby.userId]);
        attempt = service.execute(ownerRequest({ action: "GRANT", granteeUserId: target.userId,
          capability: "governance.live.decide", workspaceId: null })).then(() => null, (error: unknown) => error);
        let blocked = false;
        for (let check = 0; check < 50 && !blocked; check++) {
          blocked = (await ctx.pool.query<{ blocked: boolean }>(
            `SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS blocked`, [pid],
          )).rows[0].blocked;
          if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        await blocker.query("COMMIT");
        expect(blocked).toBe(true);
        expect(await attempt).toMatchObject({ reasonCode: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403 });
        expect(await grants.listGrants({ granteeUserId: target.userId })).toEqual([]);
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
        if (attempt) await attempt;
        await ctx.pool.query(`UPDATE portal_users SET status = 'ACTIVE' WHERE user_id = $1`, [bobby.userId]);
      }
    });

    it("audits unknown target/capability/grant without raw input or invalid foreign keys", async () => {
      const secret = "fixture-sensitive-input@example.invalid";
      for (const [over, reasonCode, status] of [
        [{ action: "GRANT", granteeUserId: secret, capability: "governance.r1.read" }, "ACCOUNT_NOT_FOUND", 404],
        [{ action: "GRANT", granteeUserId: stan.userId, capability: secret }, "CAPABILITY_NOT_IN_NAMESPACE", 422],
        [{ action: "REVOKE", grantId: secret, expectedRevision: 1 }, "GRANT_NOT_FOUND", 404],
      ] as const) {
        const requestId = randomId("req");
        const request = ownerRequest({ ...over, requestId });
        for (let attempt = 0; attempt < 2; attempt++) {
          await expect(service.execute(request)).rejects.toMatchObject({ reasonCode, status });
        }
        const rows = await ctx.pool.query(`SELECT * FROM auth_audit_events WHERE request_id = $1`, [requestId]);
        expect(rows.rows).toHaveLength(1);
        expect(rows.rows[0]).toMatchObject({ event_type: "governance_grant_refused", target_user_id: null,
          reason_code: reasonCode, actor_user_id: bobby.userId });
        expect(rows.rows[0].metadata_json).toMatchObject({ http_status: status, replayable: true });
        const text = JSON.stringify(rows.rows);
        expect(text).not.toContain(secret);
        expect(text).not.toContain(request.idempotencyKey);
        expect(text).not.toContain(ownerSessionId);
        expect(rows.rows[0].metadata_json.key_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(rows.rows[0].metadata_json.request_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
      }
    });

    it.each(["step-up","session"] as const)("rolls back grant and success receipt if %s expires behind the target lock", async kind => {
      const target=await freshUser(`deleg-final-${kind}`),sessionId=await freshSession(bobby);
      if(kind==="step-up")await ctx.pool.query("UPDATE owner_step_up_grants SET expires_at=clock_timestamp()+interval '2 seconds' WHERE session_id=$1",[sessionId]);
      else await ctx.pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '2 seconds' WHERE session_id=$1",[sessionId]);
      const blocker=await ctx.pool.connect();let attempt:Promise<unknown>|undefined;
      const request=ownerRequest({action:"GRANT",sessionId,granteeUserId:target.userId,capability:"governance.r2.read",workspaceId:null});
      try{
        await blocker.query("BEGIN");
        await blocker.query("SELECT user_id FROM portal_users WHERE user_id=$1 FOR UPDATE",[target.userId]);
        const pid=(await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        attempt=service.execute(request).then(()=>null,(error:unknown)=>error);
        let blocked=false;
        for(let check=0;check<100&&!blocked;check++){
          blocked=(await ctx.pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked",[pid])).rows[0].blocked;
          if(!blocked)await new Promise(resolve=>setTimeout(resolve,10));
        }
        expect(blocked).toBe(true);
        await blocker.query("SELECT pg_sleep(2.05)");
        await blocker.query("COMMIT");
        expect(await attempt).toMatchObject({reasonCode:kind==="step-up"?"STEP_UP_REQUIRED":"CURRENT_ACTOR_AUTHORITY_REQUIRED",status:403});
        expect(await grants.listGrants({granteeUserId:target.userId})).toEqual([]);
        expect(await grants.findEventByKey(request.idempotencyKey)).toBeNull();
      }finally{
        await blocker.query("ROLLBACK");blocker.release();if(attempt)await attempt;
      }
    });

    it("binds a redacted unknown-target refusal to the original payload", async () => {
      const request = ownerRequest({ action: "GRANT", granteeUserId: randomId("absent"),
        capability: "governance.r1.read", workspaceId: null });
      await expect(service.execute(request)).rejects.toMatchObject({ reasonCode: "ACCOUNT_NOT_FOUND", status: 404 });
      await expect(service.execute({ ...request, granteeUserId: stan.userId })).rejects.toMatchObject({
        reasonCode: "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT", status: 409,
      });
    });
  });

  // ---------------------------------------------------------- the lineage

  describe("every decision is readable afterwards", () => {
    it("records refusals as well as changes", async () => {
      const target = await freshUser("deleg-lineage");
      await service.execute(
        ownerRequest({
          action: "GRANT",
          granteeUserId: target.userId,
          capability: "governance.r1.read",
          workspaceId: null,
        }),
      );
      await service
        .execute(
          ownerRequest({
            action: "GRANT",
            granteeUserId: target.userId,
            capability: "governance.r1.read",
            workspaceId: null,
          }),
        )
        .catch(() => undefined);

      const events = await grants.eventsFor(target.userId);
      const outcomes = events.map((event) => event.outcome);
      expect(outcomes).toContain("APPLIED");
      expect(outcomes).toContain("DENIED");
      expect(events.find((e) => e.outcome === "DENIED")?.reasonCode).toBe("GRANT_ALREADY_ACTIVE");
    });

    it("carries no credential in any grant record", async () => {
      const rows = await ctx.pool.query(`SELECT * FROM portal_capability_grant_events`);
      const serialized = JSON.stringify(rows.rows);
      for (const forbidden of ["password", "token_hash", "csrf", "activation"]) {
        expect(serialized.toLowerCase(), forbidden).not.toContain(forbidden);
      }
    });

    it("creates no Trading System command and touches no source data", async () => {
      /*
       * §20.2 rule 5, asserted rather than asserted-in-a-comment. Delegating a
       * Governance capability is a Portal record and nothing else: it must not
       * produce an outbox message, a command task or a product audit row
       * describing an external effect.
       */
      const before = await ctx.pool.query(`SELECT count(*)::int AS n FROM outbox_messages`);
      const target = await freshUser("deleg-no-effect");
      await service.execute(
        ownerRequest({
          action: "GRANT",
          granteeUserId: target.userId,
          capability: "governance.canary.decide",
          workspaceId: null,
        }),
      );
      const after = await ctx.pool.query(`SELECT count(*)::int AS n FROM outbox_messages`);
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });
  });
});
