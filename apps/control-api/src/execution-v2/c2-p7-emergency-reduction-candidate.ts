import {z} from "zod";
import type {Pool} from "pg";
import type {AccessActor} from "./access.contract";
import {SessionsRepository} from "../repos/sessions";
import {UsersRepository} from "../repos/users";

/** SOURCE ONLY: no route, session authentication, CSRF enforcement, privilege
 * grants, source propagation or recovery fence. No step-up, policy parser,
 * signer, network or source verifier participates in this reduction path.
 * Never expose until these boundaries and the BLOCK_NEW trigger are reviewed. */
const id=z.string().min(1).max(128).refine(s=>s.trim()===s&&!/[\u0000-\u001f\u007f]/u.test(s));
const fail=():never=>{throw new Error("C2_P7_EMERGENCY_REDUCTION_DENIED");};
export class C2P7EmergencyReductionCandidate {
  constructor(private readonly pool:Pool,private readonly registrationKey:string) {
    const bounded=(n:unknown)=>typeof n==="number"&&Number.isSafeInteger(n)&&n>0&&n<=30000;
    if(!id.safeParse(registrationKey).success||!pool?.options||!bounded(pool.options.connectionTimeoutMillis)||
      !bounded(pool.options.query_timeout))fail();
  }
  /** Only the application that owns this exact Core pool may mount the route. */
  usesPool(pool:Pool):boolean { return this.pool===pool; }
  /** Actor MUST come from an authenticated session and CSRF-checked origin;
   * an input object or caller assertion is not authentication. Scope key is
   * server-pinned. This does not invalidate already issued tokens at TS. */
  async reduce(actor:AccessActor,workspace:string,intentId:string) {
    if(!id.safeParse(workspace).success||!z.string().uuid().safeParse(intentId).success||
      !id.safeParse(actor.user_id).success||!id.safeParse(actor.session_id).success||
      !Number.isSafeInteger(actor.session_generation)||actor.session_generation<0)return fail();
    const person={user_id:actor.user_id,session_id:actor.session_id,session_generation:actor.session_generation};
    const db=await this.pool.connect();let discard=false;
    try {
      await db.query("BEGIN");await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      const authority=await db.query("SELECT singleton FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      if(authority.rowCount!==1)return fail();
      const guard=await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",[`portal-access-v2:${workspace}`]);
      if(!guard.rows[0]?.acquired)return fail();
      const user=await new UsersRepository(db).lockById(person.user_id);
      if(!user||user.status!=="ACTIVE"||user.archivedAt||user.mustChangePassword||user.sessionVersion!==person.session_generation||
        !await new SessionsRepository(db).lockActiveLease(person.session_id,person.user_id,person.session_generation))return fail();
      const anchor=await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' FOR SHARE");
      if(anchor.rowCount!==1||anchor.rows[0].user_id!==person.user_id)return fail();
      const ws=await db.query("SELECT 1 FROM workspaces WHERE workspace_id=$1 FOR SHARE NOWAIT",[workspace]);
      if(ws.rowCount!==1)return fail();
      // Same authority→intent→registration ordering as the registration path.
      const intent=await db.query(`SELECT workspace_id,owner_user_id,registration_key,registration_sha256
        FROM elp210_c2_p7_candidate.lock_owner_intent_by_id($1)`,[intentId]);
      const row=intent.rows[0];
      if(intent.rowCount!==1||row.workspace_id!==workspace||row.owner_user_id!==person.user_id||row.registration_key!==this.registrationKey)return fail();
      await db.query("INSERT INTO elp210_c2_p7_candidate.owner_intent_revocations(intent_id,actor_user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[intentId,person.user_id]);
      // Authority-first SECURITY DEFINER routine is independently reviewed and
      // owns registry ACL; this module must never receive raw UPDATE privilege.
      // Function is candidate-only and must be installed with its exact ABI.
      const reduced=await db.query(`SELECT elp210_c2_fence_candidate.revoke_registered_scope_candidate($1,$2,$3,$4,$5,$6) AS disposition`,
        [this.registrationKey,row.registration_sha256,person.user_id,person.session_id,person.session_generation,workspace]);
      const disposition=reduced.rows[0]?.disposition;
      if(reduced.rowCount!==1||!["REGISTRATION_REVOKED_BLOCK_NEW","REGISTRATION_REVOKED_FENCE_UNPROVISIONED","REGISTRATION_ABSENT"].includes(disposition))return fail();
      // Recheck the held session against DB clock immediately before commit.
      const current=await db.query(`SELECT 1 FROM auth_sessions WHERE session_id=$1 AND user_id=$2 AND session_version=$3
        AND state='ACTIVE' AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp()`,
      [person.session_id,person.user_id,person.session_generation]);
      if(current.rowCount!==1)return fail();
      await db.query("COMMIT");
      return Object.freeze({state:"AUTHORITY_PROPAGATION_PENDING" as const,
        intent:"REVOKED" as const,registration:disposition==="REGISTRATION_ABSENT"?"ABSENT" as const:"REVOKED" as const,
        local_fence:disposition==="REGISTRATION_REVOKED_BLOCK_NEW"?"BLOCK_NEW" as const:"UNPROVISIONED" as const});
    } catch(e){try{await db.query("ROLLBACK");}catch{discard=true;}throw e;}finally{db.release(discard);}
  }
}
