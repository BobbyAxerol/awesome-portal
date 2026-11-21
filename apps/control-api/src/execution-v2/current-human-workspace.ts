import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { AuthError } from "../auth/auth.service";
import { withTransaction } from "../db/pool";
import { WorkspacesRepository } from "../repos/workspaces";
import type { AccessActor } from "./access.contract";
import { accessDigest } from "./access-policy";
import { CurrentHumanLeaseError } from "./current-human-candidate";
import { CurrentHumanMutations, type CurrentHumanMutationBinding } from "./current-human-mutations";

const id = z.string().min(1).max(128).regex(/^[^\u0000-\u001f\u007f]+$/).refine(value => value === value.trim());
const actorSchema = z.object({ user_id: id, session_id: id,
  session_generation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict();

/** Optional private current-session writer. No credentials, source authority,
 * request usernames or operator bypass are accepted. The Core repositories
 * remain the identity/workspace SSOT and preserve personal-workspace selection. */
export class CurrentHumanWorkspaceProvisioner {
  constructor(private readonly pool: Pool, private readonly coordinator: CurrentHumanMutations) {
    if (!coordinator.usesPool(pool)) throw new Error("CURRENT_HUMAN_MUTATION_POOL_MISMATCH");
  }

  private invalidSession(): never { throw new AuthError("SESSION_REQUIRED", "Invalid session.", 401); }

  private async current(db: PoolClient, actor: AccessActor): Promise<{ username: string }> {
    const result = await db.query<{ username: string }>(`SELECT u.username FROM portal_users u
      JOIN auth_sessions s ON s.user_id=u.user_id
      WHERE u.user_id=$1 AND u.status='ACTIVE' AND NOT u.must_change_password
        AND u.archived_at IS NULL AND u.session_version=$2 AND s.session_id=$3
        AND s.session_version=$2 AND s.state='ACTIVE'
        AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
      FOR SHARE OF u,s`, [actor.user_id, actor.session_generation, actor.session_id]);
    if (result.rowCount !== 1) this.invalidSession();
    return result.rows[0];
  }

  private async owned(db: PoolClient, userId: string, workspaceId?: string): Promise<string | null> {
    const result = await db.query<{ workspace_id: string }>(`SELECT w.workspace_id FROM workspaces w
      JOIN workspace_members m ON m.workspace_id=w.workspace_id
      WHERE w.owner_user_id=$1 AND m.user_id=$1 AND ($2::text IS NULL OR w.workspace_id=$2)
      ORDER BY w.created_at LIMIT 1 FOR SHARE OF w,m`, [userId, workspaceId ?? null]);
    return result.rows[0]?.workspace_id ?? null;
  }

  private binding(actor: AccessActor): CurrentHumanMutationBinding {
    return { family: "WORKSPACE_PROVISIONING", operation: "ENSURE_PERSONAL", actor_id: actor.user_id,
      session_id: actor.session_id, session_revision: actor.session_generation, target_id: actor.user_id,
      key_digest: accessDigest(["portal.current-human.workspace.ensure-personal.key.v1",
        actor.user_id, actor.session_id, actor.session_generation]),
      request_digest: accessDigest({ purpose: "portal.current-human.workspace.ensure-personal.request.v1",
        owner_user_id: actor.user_id }) };
  }

  async ensure(input: AccessActor): Promise<string> {
    const parsed = actorSchema.safeParse(input);
    if (!parsed.success) this.invalidSession();
    // Zod detaches the exact actor before any await. A caller cannot substitute
    // a different user/session or generation while recovery is in flight.
    const actor = Object.freeze(parsed.data), binding = this.binding(actor);
    try {
      const existing = await withTransaction(this.pool, async db => {
        await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
        await this.current(db, actor);
        const workspace = await this.owned(db, actor.user_id);
        // Do not strand a prior pending drain or bypass an immutable terminal
        // receipt merely because a workspace now exists. Existing intents use
        // the coordinator's exact receipt/recovery path; this query never writes.
        const prior = await db.query("SELECT 1 FROM elp210_candidate.mutations WHERE key_digest=$1", [binding.key_digest]);
        await this.current(db, actor); // Wall clock may advance during DB waits.
        return prior.rowCount ? null : workspace;
      }).catch(error => {
        // The coordinator must still see an exact-bound expired/revoked retry:
        // its authorize fails again, but abort-only recovery can release a
        // previously PENDING drain after genuine signed terminal readback.
        // This never turns a stale actor into permission to apply or replay.
        if (error instanceof AuthError && error.code === "SESSION_REQUIRED") return null;
        throw error;
      });
      if (existing) return existing;

      return await this.coordinator.execute(binding, {
        retain_after_application_rollback: true,
        authorize: async db => { await this.current(db, actor); },
        apply: async db => {
          const user = await this.current(db, actor);
          let workspace = await this.owned(db, actor.user_id);
          const replay = (await db.query<{ replay: string | null }>(
            "SELECT current_setting('elp210_candidate.replay_only',true) AS replay")).rows[0].replay === "on";
          if (!workspace && replay)
            throw new AuthError("WORKSPACE_PROVISIONING_CONFLICT", "The original workspace is no longer available.", 409);
          if (!workspace) {
            workspace = await new WorkspacesRepository(db).ensurePersonal(actor.user_id, user.username);
            if (await this.owned(db, actor.user_id, workspace) !== workspace)
              throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_RECEIPT_MISMATCH");
          }
          await this.current(db, actor); // Both paired writes roll back on expiry.
          return workspace;
        },
        terminal: workspace => ({ outcome: "APPLIED", receipt_ref: workspace, reason_code: null }),
      });
    } catch (error) {
      if (!(error instanceof CurrentHumanLeaseError)) throw error;
      if (error.code === "CURRENT_ACTOR_AUTHORITY_REQUIRED") this.invalidSession();
      const conflict = ["CURRENT_HUMAN_MUTATION_KEY_CONFLICT", "CURRENT_HUMAN_MUTATION_PREVIOUSLY_REFUSED"].includes(error.code);
      const refusal = new AuthError(conflict ? "WORKSPACE_PROVISIONING_CONFLICT" : "PORTAL_AUTHORITY_UNAVAILABLE",
        conflict ? "The workspace request conflicts with its existing receipt." : "Portal identity authority is temporarily unavailable.",
        conflict ? 409 : 503);
      Object.defineProperty(refusal, "cause", { value: error });
      throw refusal;
    }
  }
}
