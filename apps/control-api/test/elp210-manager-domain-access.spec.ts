/** SYNTHETIC owner/policy/grants only. Real disposable PostgreSQL exercises
 * Core lock/currentness semantics; this is NOT installed Manager/TS authority. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withTransaction } from "../src/db/pool";
import { AccessPolicyError, classifyStoredAccessGrant, managerDomainGrant, managerDomainReadInput,
  managerReadDomain, resourceSelector, reviewedAccessPolicy, type AccessActor, type ManagerDomainGrant,
  type ReviewedAccessPolicy, type ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest, evaluateAccess, grantCurrent, managerDomainReadValidUntil, selectManagerDomainGrant, unqualifiedAccessRelations,
  type AccessEvaluationContext } from "../src/execution-v2/access-policy";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { captureCurrentHumanSnapshot, evaluateManagerDomainRead } from "../src/execution-v2/current-human-snapshot";
import { migrateTestDatabase, truncateAll } from "./harness";

const DOMAIN={profile_id:"TEST_ONLY-profile",catalogue_sha256:"1".repeat(64),
  profile_sha256:"2".repeat(64),field_policy_sha256:"3".repeat(64)};
const NOW=1_800_000_000_000;
function fixture(now=NOW,owner="TEST_ONLY-owner",subject="TEST_ONLY-reader",workspace="TEST_ONLY-workspace") {
  const seal={environment:"paper" as const,domain:DOMAIN,field_policy_ref:"TEST_ONLY-fields",
    valid_from_ms:now-1000,valid_until_ms:now+60_000};
  const policy:ReviewedAccessPolicy={workspace_id:workspace,revision:"TEST_ONLY-policy",
    artifact_digest:accessDigest(["TEST_ONLY-policy"]),approval_ref:"TEST_ONLY-NOT-REAL-APPROVAL",
    state:"REVIEWED",qualification:"OWNER_VERIFIED",protected_owner_user_id:owner,
    researcher_fields:{state:"PENDING",policy_ref:null,fields:[]},manager_read_domains:[seal]};
  const grant:ManagerDomainGrant={schema_version:"portal.manager-domain-grant.v1",
    grant_id:"TEST_ONLY-domain-grant",workspace_id:workspace,subject_user_id:subject,issued_by:owner,
    parent_grant_id:null,revision:"TEST_ONLY-grant-r1",policy_revision:policy.revision,
    action:"business.read_all",effect:"ALLOW",environment:"paper",domain:DOMAIN,
    field_policy_ref:seal.field_policy_ref,valid_from_ms:now-500,valid_until_ms:now+30_000,revoked_at_ms:null};
  const context:AccessEvaluationContext={principal_id:subject,workspace_id:workspace,now_ms:now,
    actor_current:true,actor_role:"ADMIN",policy,grants:[],active_principals:new Set([subject,owner]),
    relationsFor:unqualifiedAccessRelations};
  return {seal,policy,grant,context};
}
const legacy=(f:ReturnType<typeof fixture>,effect:"ALLOW"|"DENY"="ALLOW"):ScopedAccessGrant=>({
  grant_id:"TEST_ONLY-legacy",subject_user_id:f.grant.subject_user_id,workspace_id:f.grant.workspace_id,
  action:"alpha.read",effect,selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"ALPHA",ids:["TEST_ONLY-alpha"]},
  environments:["paper"],valid_from_ms:f.grant.valid_from_ms,valid_until_ms:f.grant.valid_until_ms,
  delegable_actions:[],issued_by:f.grant.issued_by,parent_grant_id:null,revision:"TEST_ONLY-legacy-r1",
  policy_revision:f.policy.revision,revoked_at_ms:null,requires_ts_acceptance:false,ts_receipt:null,field_policy_ref:null});

describe("NC02 exact Manager app-domain authority, pure SYNTHETIC facts",()=>{
  it("uses one exact owner root+field seal without granting ordinary resources or relying on role",()=>{
    const f=fixture();
    expect(selectManagerDomainGrant(f.context,[f.grant],"paper",DOMAIN)).toEqual({grant:f.grant,seal:f.seal});
    expect(evaluateAccess(f.context,"alpha.read",{kind:"ALPHA",id:"TEST_ONLY-alpha"},"paper").allowed).toBe(false);
    expect(()=>selectManagerDomainGrant(f.context,[],"paper",DOMAIN)).toThrow(AccessPolicyError);
    expect(()=>resourceSelector.parse({kind:"MANAGER_DOMAIN",domain:DOMAIN})).toThrow();
  });
  it.each(["catalogue_sha256","profile_sha256","field_policy_sha256"] as const)("rejects mismatched %s and terminal LF",key=>{
    const f=fixture(),wrong={...DOMAIN,[key]:"4".repeat(64)};
    expect(()=>selectManagerDomainGrant(f.context,[f.grant],"paper",wrong)).toThrow(AccessPolicyError);
    expect(managerReadDomain.safeParse({...DOMAIN,[key]:DOMAIN[key]+"\n"}).success).toBe(false);
  });
  it.each(["revoked","expired","future","wrong-owner","wrong-subject","wrong-policy","wrong-workspace","field-ref"] as const)(
    "refuses %s",variant=>{
      const f=fixture(),g={...f.grant};
      if(variant==="revoked")g.revoked_at_ms=NOW;
      if(variant==="expired")g.valid_until_ms=NOW;
      if(variant==="future")g.valid_from_ms=NOW+1;
      if(variant==="wrong-owner")g.issued_by="TEST_ONLY-other-owner";
      if(variant==="wrong-subject")g.subject_user_id="TEST_ONLY-other";
      if(variant==="wrong-policy")g.policy_revision="TEST_ONLY-old-policy";
      if(variant==="wrong-workspace")g.workspace_id="TEST_ONLY-other-workspace";
      if(variant==="field-ref")g.field_policy_ref="TEST_ONLY-other-fields";
      expect(()=>selectManagerDomainGrant(f.context,[g],"paper",DOMAIN)).toThrow(AccessPolicyError);
    });
  it("intersects exact environment/seal interval; never unions partial roots",()=>{
    const f=fixture();
    expect(()=>selectManagerDomainGrant(f.context,[f.grant],"live",DOMAIN)).toThrow(AccessPolicyError);
    f.policy.manager_read_domains=[{...f.seal,valid_until_ms:NOW+100}];
    expect(()=>selectManagerDomainGrant(f.context,[f.grant],"paper",DOMAIN)).toThrow(AccessPolicyError);
  });
  it("DENY wins for exact domain and conservatively for live relevant resource DENY",()=>{
    const f=fixture(),deny={...f.grant,grant_id:"TEST_ONLY-deny",effect:"DENY" as const};
    expect(()=>selectManagerDomainGrant(f.context,[f.grant,deny],"paper",DOMAIN)).toThrow(AccessPolicyError);
    f.context.grants=[legacy(f,"DENY")];
    expect(()=>selectManagerDomainGrant(f.context,[f.grant],"paper",DOMAIN)).toThrow(AccessPolicyError);
  });
  it("TEST_ONLY policy is insufficient even if the ordinary reader allows test authority",()=>{
    const f=fixture();f.policy.qualification="TEST_ONLY";f.context.allow_test_only=true;
    expect(()=>selectManagerDomainGrant(f.context,[f.grant],"paper",DOMAIN)).toThrow(AccessPolicyError);
  });
  it("present unknown grant schema/null/invalid policy seals never fall back to legacy",()=>{
    const f=fixture();
    expect(classifyStoredAccessGrant(legacy(f)).kind).toBe("LEGACY");
    expect(classifyStoredAccessGrant(f.grant).kind).toBe("MANAGER_DOMAIN");
    for(const bad of ["portal.manager-domain-grant.v2",null,undefined])
      expect(()=>classifyStoredAccessGrant({...legacy(f),schema_version:bad})).toThrow(AccessPolicyError);
    expect(()=>reviewedAccessPolicy.parse({...f.policy,manager_read_domains:null})).toThrow();
    expect(()=>reviewedAccessPolicy.parse({...f.policy,manager_read_domains:[f.seal,f.seal]})).toThrow();
    expect(()=>managerDomainGrant.parse({...f.grant,parent_grant_id:"TEST_ONLY-delegation"})).toThrow();
    expect(managerDomainReadInput.safeParse({actor:{user_id:"a",session_id:"s",session_generation:1},
      workspace_id:"w",environment:"paper",domain:DOMAIN,expected_scope_digest:accessDigest([])+"\n"}).success).toBe(false);
  });
  it("keeps the combined 10000-row cap before filtering private domain rows from legacy readers",async()=>{
    const f=fixture();
    // Repository-only synthetic SQL result, never an authority/scope mock.
    const db={query:async()=>({rows:Array.from({length:10001},()=>({grant_fact:f.grant}))})};
    const repo=new AccessRepository(db as unknown as Pool);
    await expect(repo.grants(f.grant.workspace_id)).rejects.toMatchObject({code:"ACCESS_SCOPE_LIMIT_EXCEEDED"});
  });
  it("refuses root/actor/domain getters and Proxies before traps or any database access",async()=>{
    let traps=0,queries=0;
    const db={query:async()=>{queries++;throw new Error("UNEXPECTED_DB_ACCESS");}};
    const input={actor:{user_id:"TEST_ONLY-user",session_id:"TEST_ONLY-session",session_generation:7},
      workspace_id:"TEST_ONLY-workspace",environment:"paper" as const,domain:DOMAIN};
    const proxy=()=>new Proxy({}, {get(){traps++;throw new Error("TRAP");},ownKeys(){traps++;return[];},
      getPrototypeOf(){traps++;return Object.prototype;},getOwnPropertyDescriptor(){traps++;return undefined;}});
    const rootGetter=Object.defineProperty({...input},"domain",{enumerable:true,get(){traps++;return DOMAIN;}});
    const actorGetter=Object.defineProperty({...input.actor},"session_id",{enumerable:true,get(){traps++;return "s";}});
    const domainGetter=Object.defineProperty({...DOMAIN},"profile_id",{enumerable:true,get(){traps++;return "p";}});
    const invalid=[proxy(),rootGetter,{...input,actor:proxy()},{...input,domain:proxy()},
      {...input,actor:actorGetter},{...input,domain:domainGetter},{...input,workspace_id:proxy()},
      {...input,domain:{...DOMAIN,catalogue_sha256:proxy()}}];
    for(const value of invalid)await expect(evaluateManagerDomainRead(db as unknown as import("pg").PoolClient,
      value as unknown as import("../src/execution-v2/access.contract").ManagerDomainReadInput))
      .rejects.toMatchObject({code:"RECEIPT_BINDING_MISMATCH"});
    expect(traps).toBe(0);expect(queries).toBe(0);
  });
});

type TransitionKind="future-domain-DENY"|"future-legacy-DENY"|"ancestor-expiry"|
  "receipt-effective"|"receipt-expiry"|"future-seal";
const TRANSITIONS:readonly TransitionKind[]=["future-domain-DENY","future-legacy-DENY","ancestor-expiry",
  "receipt-effective","receipt-expiry","future-seal"];
/** Exact TEST_ONLY ancestry. Separate issuer and subject; no self-grant or
 * protected-owner target. Users.read is deliberately app-only, not a fake TS
 * business proof. Both child and parent obey the same interval ceiling. */
function transitionAncestry(f:ReturnType<typeof fixture>,boundary:number,delegator:string):ScopedAccessGrant[] {
  const parent:ScopedAccessGrant={...legacy(f),grant_id:"TEST_ONLY-transition-parent",action:"access.grant",
    subject_user_id:delegator,selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"USER",ids:[f.grant.subject_user_id]},
    delegable_actions:["users.read"],valid_until_ms:boundary};
  const child:ScopedAccessGrant={...legacy(f),grant_id:"TEST_ONLY-transition-child",action:"users.read",
    issued_by:delegator,parent_grant_id:parent.grant_id,valid_until_ms:boundary,
    selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"USER",ids:[f.grant.subject_user_id]}};
  return [parent,child];
}
function transitionFacts(kind:TransitionKind,f:ReturnType<typeof fixture>,boundary:number) {
  const domains:ManagerDomainGrant[]=[f.grant],grants:ScopedAccessGrant[]=[];
  const later=boundary+5000;
  if(kind==="future-domain-DENY")domains.push({...f.grant,grant_id:"TEST_ONLY-future-domain-DENY",effect:"DENY",
    valid_from_ms:boundary,valid_until_ms:later});
  if(kind==="future-legacy-DENY")grants.push({...legacy(f,"DENY"),grant_id:"TEST_ONLY-future-legacy-DENY",action:"account.read",
    valid_from_ms:boundary,valid_until_ms:later});
  if(kind==="ancestor-expiry")grants.push(...transitionAncestry(f,boundary,"TEST_ONLY-transition-delegator"));
  if(kind==="receipt-effective"||kind==="receipt-expiry")grants.push({...legacy(f),ts_receipt:{
    receipt_id:"TEST_ONLY-retained-receipt-not-native-acceptance",mapping_revision:"TEST_ONLY-map",membership_revision:"TEST_ONLY-membership",
    effective_at_ms:kind==="receipt-effective"?boundary:f.context.now_ms-100,
    expires_at_ms:kind==="receipt-expiry"?boundary:later}});
  // Conservative captured-workspace fence: a different profile/environment
  // transition still requires re-evaluation; it is not a current DENY.
  if(kind==="future-seal")f.policy.manager_read_domains!.push({...f.seal,environment:"live",
    domain:{...DOMAIN,profile_id:"TEST_ONLY-later-profile"},field_policy_ref:"TEST_ONLY-later-fields",
    valid_from_ms:boundary,valid_until_ms:later});
  f.context.grants=grants;
  if(kind==="ancestor-expiry")f.context.active_principals=new Set([...f.context.active_principals,"TEST_ONLY-transition-delegator"]);
  return {domains,grants};
}
describe("NC02 fixed temporal authority ceilings, pure SYNTHETIC facts (not PG/source evidence)",()=>{
  it.each(TRANSITIONS)("preserves the exact fixed %s cutoff as now advances",kind=>{
    const f=fixture(),boundary=NOW+5000,{domains}=transitionFacts(kind,f,boundary);
    const selected=selectManagerDomainGrant(f.context,domains,"paper",DOMAIN);
    const first=managerDomainReadValidUntil(f.context,domains,selected,NOW+45000);
    expect(first).toBe(boundary);
    const later={...f.context,now_ms:NOW+17};
    const same=managerDomainReadValidUntil(later,domains,selectManagerDomainGrant(later,domains,"paper",DOMAIN),NOW+45000);
    expect(same).toBe(first);expect(same).not.toBe(later.now_ms+5000);
    // Reading the finite boundary does not mutate the immutable authority facts.
    expect(selected.grant).toBe(f.grant);expect(f.grant.valid_until_ms).toBe(NOW+30000);
  });
  it.each(["future-domain-DENY","future-legacy-DENY"] as const)("refuses %s exactly when it becomes current",kind=>{
    const f=fixture(),boundary=NOW+5000,{domains}=transitionFacts(kind,f,boundary);
    expect(managerDomainReadValidUntil(f.context,domains,selectManagerDomainGrant(f.context,domains,"paper",DOMAIN),NOW+45000)).toBe(boundary);
    expect(()=>selectManagerDomainGrant({...f.context,now_ms:boundary},domains,"paper",DOMAIN))
      .toThrowError(expect.objectContaining({code:"ACCESS_DENIED"}));
  });
  it("uses a genuine app-only ancestor chain without claiming independent native authority",()=>{
    const f=fixture(),boundary=NOW+5000,{grants}=transitionFacts("ancestor-expiry",f,boundary),child=grants[1]!;
    expect(grantCurrent(child,f.context)).toBe(true);
    expect(evaluateAccess(f.context,"users.read",{kind:"USER",id:f.grant.subject_user_id},"paper").allowed).toBe(true);
    expect(grantCurrent(child,{...f.context,now_ms:boundary})).toBe(false);
  });
  it("skips null/past timestamps but never slides a fixed session/grant ceiling",()=>{
    const f=fixture(),g={...legacy(f),valid_until_ms:null,ts_receipt:{receipt_id:"TEST_ONLY-old",mapping_revision:"TEST_ONLY-map",
      membership_revision:"TEST_ONLY-membership",effective_at_ms:NOW-1000,expires_at_ms:null}};
    f.context.grants=[g];const selected=selectManagerDomainGrant(f.context,[f.grant],"paper",DOMAIN);
    expect(managerDomainReadValidUntil(f.context,[f.grant],selected,NOW+4000)).toBe(NOW+4000);
    expect(managerDomainReadValidUntil({...f.context,now_ms:NOW+17},[f.grant],selected,NOW+4000)).toBe(NOW+4000);
  });
  it("retains the finite selected ceiling without future transitions, independent of order or duplicates",()=>{
    const f=fixture(),selected=selectManagerDomainGrant(f.context,[f.grant],"paper",DOMAIN);
    expect(managerDomainReadValidUntil(f.context,[f.grant],selected,NOW+45000)).toBe(f.grant.valid_until_ms);
    const a={...legacy(f),valid_from_ms:NOW+5000,valid_until_ms:NOW+7000};
    const b={...a,grant_id:"TEST_ONLY-second",valid_from_ms:NOW+4000};
    expect(managerDomainReadValidUntil({...f.context,grants:[a,b,a]},[f.grant],selected,NOW+45000)).toBe(NOW+4000);
    expect(managerDomainReadValidUntil({...f.context,grants:[b,a]},[f.grant],selected,NOW+45000)).toBe(NOW+4000);
  });
  it("ignores foreign-workspace timestamps but conservatively caps same-workspace unrelated actions",()=>{
    const f=fixture(),selected=selectManagerDomainGrant(f.context,[f.grant],"paper",DOMAIN);
    const foreign={...legacy(f),workspace_id:"TEST_ONLY-foreign-workspace",valid_from_ms:NOW+1};
    const own={...legacy(f),action:"users.read" as const,environments:["live" as const],valid_from_ms:NOW+5000};
    expect(managerDomainReadValidUntil({...f.context,grants:[foreign]},[f.grant],selected,NOW+45000)).toBe(f.grant.valid_until_ms);
    expect(managerDomainReadValidUntil({...f.context,grants:[foreign,own]},[f.grant],selected,NOW+45000)).toBe(NOW+5000);
    expect(()=>selectManagerDomainGrant({...f.context,grants:[own]},[f.grant],"paper",DOMAIN)).not.toThrow();
  });
  it("refuses an already reached or unsafe baseline rather than reviving it with a future transition",()=>{
    const f=fixture(),selected=selectManagerDomainGrant(f.context,[f.grant],"paper",DOMAIN);
    for(const value of [NOW,NOW-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])
      expect(()=>managerDomainReadValidUntil(f.context,[f.grant],selected,value)).toThrowError(AccessPolicyError);
  });
});

const DATABASE=process.env.TEST_DATABASE_URL;
describe.skipIf(!DATABASE)("NC02 real disposable Core transaction locks, SYNTHETIC authority",()=>{
  let pool:Pool,actor:AccessActor,workspace:string,owner:string,f:ReturnType<typeof fixture>;
  let installed=false;
  const input=()=>({actor,workspace_id:workspace,environment:"paper" as const,domain:DOMAIN});
  beforeAll(async()=>{
    await migrateTestDatabase(DATABASE!);
    pool=new Pool({connectionString:DATABASE,max:3,connectionTimeoutMillis:2000,query_timeout:6000});
    await truncateAll(pool);
  });
  beforeEach(async()=>{
    const suffix=randomUUID();owner="TEST_ONLY-owner-"+suffix;workspace="TEST_ONLY-workspace-"+suffix;
    actor={user_id:"TEST_ONLY-reader-"+suffix,session_id:"TEST_ONLY-session-"+suffix,session_generation:7};
    for(const [id,role] of [[owner,"ADMIN"],[actor.user_id,"USER"]])
      await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
        VALUES($1,$1,'TEST_ONLY',$2,'ACTIVE',false,7)`,[id,role]);
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER',$1)",[owner]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)",[workspace,owner]);
    for(const id of [owner,actor.user_id])await pool.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')",[workspace,id]);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,
      session_version,idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,
      clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`,[actor.session_id,actor.user_id]);
    f=fixture(Date.now(),owner,actor.user_id,workspace);
    const repo=new AccessRepository(pool);await repo.putPolicy(f.policy);await repo.saveManagerDomainGrant(f.grant,true);
    await pool.query(await readFile(join(__dirname,"../src/execution-v2/current-human-candidate.sql"),"utf8"));
    installed=true;
  });
  afterEach(async()=>{
    if(installed){await pool.query("DROP SCHEMA elp210_candidate CASCADE");installed=false;}
    await truncateAll(pool);
  });
  afterAll(async()=>{await pool?.end();});
  it("returns exact scope/field/lease proof from actual current tables, repeat expected digest stable",async()=>{
    const first=await withTransaction(pool,db=>evaluateManagerDomainRead(db,input()));
    const second=await withTransaction(pool,db=>evaluateManagerDomainRead(db,{...input(),expected_scope_digest:first.scope_digest}));
    expect(second).toMatchObject({scope_digest:first.scope_digest,authority_fingerprint:first.authority_fingerprint,
      field_policy_sha256:DOMAIN.field_policy_sha256,field_policy_ref:f.seal.field_policy_ref,actor});
    expect(first.valid_until_ms).toBe(f.grant.valid_until_ms);
    expect(pool.totalCount-pool.idleCount).toBe(0);
  });
  it("strictly separates mixed stored grants and preserves exact historical zero-domain fingerprint",async()=>{
    const repo=new AccessRepository(pool);await repo.saveGrant(legacy(f),true);
    expect((await repo.storedGrants(workspace)).map(r=>r.kind).sort()).toEqual(["LEGACY","MANAGER_DOMAIN"]);
    expect(await repo.grants(workspace)).toEqual([legacy(f)]);
    const before=await withTransaction(pool,db=>captureCurrentHumanSnapshot(db,actor,workspace));
    await pool.query("DELETE FROM portal_access_grants_v2 WHERE grant_id=$1",[f.grant.grant_id]);
    const {manager_read_domains:_omitted,...legacyPolicy}=f.policy;
    await repo.putPolicy(legacyPolicy);
    const after=await withTransaction(pool,db=>captureCurrentHumanSnapshot(db,actor,workspace));
    const expected={policy:after.policy,grants:after.grants,ids:after.ids,active:after.active,anchor:after.anchor,
      actor_role:after.actor_role,actor_member:after.actor_member};
    expect(after.authority_fingerprint).toBe(accessDigest(expected));
    expect(before.authority_fingerprint).not.toBe(after.authority_fingerprint);
    expect(after.manager_domain_grants).toEqual([]);
  });
  it("refuses autocommit and wrong isolation instead of returning a fictitious lock proof",async()=>{
    const db=await pool.connect();
    try{
      await expect(evaluateManagerDomainRead(db,input())).rejects.toMatchObject({code:"ACCESS_RETRY_REQUIRED"});
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      try{await expect(evaluateManagerDomainRead(db,input())).rejects.toMatchObject({code:"ACCESS_RETRY_REQUIRED"});}
      finally{await db.query("ROLLBACK");}
    }finally{db.release();}
  });
  it("keeps actual singleton authority locked until caller rollback; contender has bounded lock timeout",async()=>{
    const held=await pool.connect(),contender=await pool.connect();
    try{
      await held.query("BEGIN");await evaluateManagerDomainRead(held,input());
      await contender.query("BEGIN");await contender.query("SET LOCAL lock_timeout='100ms'; SET LOCAL statement_timeout='1000ms'");
      await expect(contender.query("SELECT singleton FROM elp210_candidate.authority WHERE singleton FOR UPDATE"))
        .rejects.toMatchObject({code:"55P03"});
      await contender.query("ROLLBACK");await held.query("ROLLBACK");
      await contender.query("BEGIN");
      expect((await contender.query("SELECT singleton FROM elp210_candidate.authority WHERE singleton FOR UPDATE NOWAIT")).rowCount).toBe(1);
      await contender.query("ROLLBACK");
    }finally{await held.query("ROLLBACK");await contender.query("ROLLBACK");held.release();contender.release();}
  });
  it("current revoke and session generation cannot reuse an earlier scope digest",async()=>{
    const first=await withTransaction(pool,db=>evaluateManagerDomainRead(db,input()));
    await new AccessRepository(pool).saveManagerDomainGrant({...f.grant,revoked_at_ms:Date.now(),revision:"TEST_ONLY-r2"});
    await expect(withTransaction(pool,db=>evaluateManagerDomainRead(db,{...input(),expected_scope_digest:first.scope_digest})))
      .rejects.toMatchObject({code:"ACCESS_DENIED"});
    await expect(withTransaction(pool,db=>evaluateManagerDomainRead(db,{...input(),actor:{...actor,session_generation:6}})))
      .rejects.toMatchObject({code:"CURRENT_ACTOR_AUTHORITY_REQUIRED"});
  });
  it("uses the actual final PG clock when a query-boundary delay crosses grant expiry",async()=>{
    const validUntil=Date.now()+500;
    await new AccessRepository(pool).saveManagerDomainGrant({...f.grant,valid_until_ms:validUntil});
    let finalBoundaryReached=false,beforeDelayClock:number|undefined,afterDelayClock:number|undefined;
    await withTransaction(pool,async db=>{
      const actualQuery=db.query.bind(db);let xidQueries=0;
      // TEST_ONLY transport shim: every result/lock/clock is actual PostgreSQL
      // on the SAME client/transaction; no rows, context or scope are mocked.
      const delayed={query:async(sql:string,values?:unknown[])=>{
        if(sql.startsWith("SELECT txid_current()::text AS xid")&&++xidQueries===2){
          finalBoundaryReached=true;
          // A slow setup must fail the fixture precondition, not accidentally
          // turn this into an ordinary already-expired-grant negative.
          expect(beforeDelayClock).toBeLessThan(validUntil);
          expect(Date.now()).toBeLessThan(validUntil);
          await new Promise<void>(resolve=>setTimeout(resolve,Math.max(1,validUntil-Date.now()+20)));
        }
        const result=await actualQuery(sql,values);
        if(sql.startsWith("SELECT floor(extract(epoch FROM clock_timestamp())"))beforeDelayClock=Number(result.rows[0]?.ms);
        if(sql.startsWith("SELECT txid_current()::text AS xid")&&xidQueries===2)afterDelayClock=Number(result.rows[0]?.ms);
        return result;
      }};
      await expect(evaluateManagerDomainRead(delayed as unknown as import("pg").PoolClient,input()))
        .rejects.toMatchObject({code:"ACCESS_DENIED"});
      expect(xidQueries).toBe(2);
      expect(afterDelayClock).toBeGreaterThanOrEqual(validUntil);
      expect((await actualQuery("SELECT txid_current()::text AS xid")).rowCount).toBe(1);
    });
    expect(finalBoundaryReached).toBe(true);expect(pool.totalCount-pool.idleCount).toBe(0);
  });
  it.each(TRANSITIONS)("clamps actual PG scope to the fixed %s transition without a moving TTL",async kind=>{
    const at=f.context.now_ms,boundary=at+15000,repo=new AccessRepository(pool);
    const {domains,grants}=transitionFacts(kind,f,boundary);
    if(kind==="ancestor-expiry"){
      const delegator="TEST_ONLY-transition-delegator";
      await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
        VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)`,[delegator]);
      await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')",[workspace,delegator]);
    }
    // Use existing repositories and SAME real DB fixture; do not mutate the
    // SQL clock, fabricate a scope, or inject a fake currentness response.
    for(const value of domains.slice(1))await repo.saveManagerDomainGrant(value,true);
    for(const value of grants)await repo.saveGrant(value,true);
    if(kind==="future-seal")await repo.putPolicy(f.policy);
    if(kind==="ancestor-expiry"){
      const snapshot=await withTransaction(pool,db=>captureCurrentHumanSnapshot(db,actor,workspace));
      expect(grantCurrent(grants[1]!,{...f.context,now_ms:snapshot.now,grants:snapshot.grants,
        active_principals:new Set(snapshot.active)})).toBe(true);
    }
    const first=await withTransaction(pool,db=>evaluateManagerDomainRead(db,input()));
    expect(first.now_ms).toBeLessThan(boundary);expect(boundary).toBeLessThan(f.grant.valid_until_ms);
    expect(first.valid_until_ms).toBe(boundary);
    let same=first;
    // At most three normal authority transactions. All clocks/locks/rows are
    // actual PG. No sleep/pg_sleep or synthetic now is used to cross a boundary.
    for(let i=0;i<3&&same.now_ms<=first.now_ms;i++){
      same=await withTransaction(pool,db=>evaluateManagerDomainRead(db,{...input(),expected_scope_digest:first.scope_digest}));
      expect(same.scope_digest).toBe(first.scope_digest);expect(same.authority_fingerprint).toBe(first.authority_fingerprint);
      expect(same.valid_until_ms).toBe(boundary);
    }
    expect(same.now_ms).toBeGreaterThan(first.now_ms);expect(same.now_ms).toBeLessThan(boundary);
    expect(same.valid_until_ms).not.toBe(same.now_ms+(boundary-first.now_ms));
    expect(same.actor).toEqual(actor);expect(same).not.toHaveProperty("assertCurrent");expect(same).not.toHaveProperty("release");
    expect(pool.totalCount-pool.idleCount).toBe(0);
  });
  it("rejects an old expected scope after an actual benign temporal transition without a write",async()=>{
    const boundary=Date.now()+500;
    f.policy.manager_read_domains!.push({...f.seal,environment:"live",domain:{...DOMAIN,profile_id:"TEST_ONLY-next-profile"},
      field_policy_ref:"TEST_ONLY-next-fields",valid_from_ms:boundary,valid_until_ms:f.seal.valid_until_ms});
    await new AccessRepository(pool).putPolicy(f.policy);
    const first=await withTransaction(pool,db=>evaluateManagerDomainRead(db,input()));
    expect(first.now_ms).toBeLessThan(boundary);expect(first.valid_until_ms).toBe(boundary);
    // Actual elapsed time only; no DB writes, altered SQL clock or synthetic
    // snapshot between reads. This is a bounded half-second transition test.
    await new Promise<void>(resolve=>setTimeout(resolve,Math.max(1,boundary-Date.now()+10)));
    await expect(withTransaction(pool,db=>evaluateManagerDomainRead(db,{...input(),expected_scope_digest:first.scope_digest})))
      .rejects.toMatchObject({code:"ACCESS_RETRY_REQUIRED"});
    const fresh=await withTransaction(pool,db=>evaluateManagerDomainRead(db,input()));
    expect(fresh.now_ms).toBeGreaterThanOrEqual(boundary);expect(fresh.valid_until_ms).toBe(f.grant.valid_until_ms);
    expect(fresh.scope_digest).not.toBe(first.scope_digest);expect(fresh.authority_fingerprint).toBe(first.authority_fingerprint);
  });
  it("never infers owner/ADMIN or reader access without their separate explicit domain facts",async()=>{
    const repo=new AccessRepository(pool),ownerActor={user_id:owner,session_id:"TEST_ONLY-owner-session-"+randomUUID(),session_generation:7};
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,
      session_version,idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,
      clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`,[ownerActor.session_id,owner]);
    const ownerGrant={...f.grant,grant_id:"TEST_ONLY-explicit-owner-domain",subject_user_id:owner};
    await repo.saveManagerDomainGrant(ownerGrant,true);
    for(const [current,grantId] of [[ownerActor,ownerGrant.grant_id],[actor,f.grant.grant_id]] as const){
      const request={...input(),actor:current};
      expect((await withTransaction(pool,db=>evaluateManagerDomainRead(db,request))).actor).toEqual(current);
      await pool.query("DELETE FROM portal_access_grants_v2 WHERE grant_id=$1",[grantId]);
      await expect(withTransaction(pool,db=>evaluateManagerDomainRead(db,request))).rejects.toMatchObject({code:"ACCESS_DENIED"});
    }
  });
  it("malformed present domain poisons capture and ordinary grant read rather than being silently dropped",async()=>{
    await pool.query("UPDATE portal_access_grants_v2 SET grant_fact=grant_fact || $2::jsonb WHERE grant_id=$1",
      [f.grant.grant_id,JSON.stringify({schema_version:"UNKNOWN"})]);
    await expect(new AccessRepository(pool).grants(workspace)).rejects.toMatchObject({code:"RECEIPT_BINDING_MISMATCH"});
    await expect(withTransaction(pool,db=>captureCurrentHumanSnapshot(db,actor,workspace)))
      .rejects.toMatchObject({code:"RECEIPT_BINDING_MISMATCH"});
  });
});
