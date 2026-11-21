/** TEST-ONLY synthetic DB helper. It is not a commissioned owner workflow,
 * provenance, acceptance, delegation, grant, or runtime registry writer. */
import type {Pool,PoolClient} from "pg";
import type {AccessActor} from "../src/execution-v2/access.contract";
import {lockCurrentHumanSnapshot} from "../src/execution-v2/current-human-snapshot";
import {ACCESS_STEP_UP_PROOFS,AccountLifecycleRepository} from "../src/repos/account-lifecycle";

export async function withSyntheticRegistryOwner<T>(pool:Pool,actor:AccessActor,workspace:string,
  expectedRevision:number,fn:(db:PoolClient)=>Promise<T>):Promise<T> {
  if(process.env.C2_P7_TEST_DISPOSABLE!=="TEST_ONLY_C2_P7_DEDICATED_DATABASE" ||
    !actor.user_id.startsWith("TEST_ONLY-") || !actor.session_id.startsWith("TEST_ONLY-") ||
    !workspace.startsWith("TEST_ONLY-") || !Number.isSafeInteger(expectedRevision) || expectedRevision<0)
    throw new Error("C2_P7_TEST_ONLY_REQUIRED");
  const db=await pool.connect();
  try {
    const actual=await db.query("SELECT current_database() AS name");
    if(!/^portal_c2_p7_[a-f0-9]{8}$/.test(actual.rows[0]?.name))throw new Error("C2_P7_DB_NOT_DEDICATED");
    await db.query("BEGIN");
    const current=await lockCurrentHumanSnapshot(db,actor,workspace);
    if(current.anchor!==actor.user_id||current.policy?.state!=="REVIEWED"||
      current.policy.qualification!=="OWNER_VERIFIED"||current.policy.protected_owner_user_id!==actor.user_id)
      throw new Error("C2_P7_TEST_OWNER_REQUIRED");
    const step=await new AccountLifecycleRepository(db).lockActiveStepUpExpiry(actor.session_id,actor.user_id,ACCESS_STEP_UP_PROOFS);
    const authority=await db.query("SELECT revision::text,drain_id FROM elp210_candidate.authority WHERE singleton");
    const now=Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0]?.ms);
    if(!step||!Number.isSafeInteger(now)||now>=step.getTime()||now>=current.lease_until_ms||
      authority.rowCount!==1||authority.rows[0]?.drain_id!==null||String(authority.rows[0]?.revision)!==String(expectedRevision))
      throw new Error("C2_P7_TEST_AUTHORITY_REQUIRED");
    const result=await fn(db);
    await db.query("COMMIT");
    return result;
  } catch(error) {await db.query("ROLLBACK").catch(()=>{});throw error;}
  finally {db.release();}
}
