/** Disposable DB-only proof. Synthetic inputs are never engine/run qualification. */
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {readdirSync} from "node:fs";
import {join} from "node:path";
import {runner as migrate} from "../../apps/control-api/node_modules/node-pg-migrate";
import {Pool} from "../../apps/control-api/node_modules/pg";
import {ResearchMetadataRepository} from "../../apps/control-api/src/research/repository";
import {ResearchP04DeltaBindingService} from "../../apps/control-api/src/research/p04-delta-binding.service";
import {ResearchRunAdmissionService} from "../../apps/control-api/src/research/run-admission.service";
import {ResearchRunCreateService} from "../../apps/control-api/src/research/run-create.service";
import {executionRecipes,executionRecipeQualification} from "../../apps/control-api/src/research/execution-recipes";
import {p04Requested,manifestFor,w1Admin} from "../../apps/control-api/test/research-w1-wfo.fixture";

const sourceUrl=process.env.TEST_DATABASE_URL!;
const scope={workspaceId:"full01-old",actorUserId:w1Admin.userId};
const migrationPath=join(__dirname,"../../apps/control-api/migrations");

describe("FULL-01 append-only 094→095 compatibility and custody",()=>{
  let admin:Pool,old:Pool,repository:ResearchMetadataRepository,service:ResearchRunCreateService;
  let before:Record<string,unknown>,runId:string;
  beforeAll(async()=>{
    admin=new Pool({connectionString:sourceUrl});
    await admin.query("CREATE DATABASE full01_recipe_old_test");
    const url=new URL(sourceUrl);url.pathname="/full01_recipe_old_test";
    const count=readdirSync(migrationPath).filter(p=>p.endsWith(".sql")).length-1;
    await migrate({databaseUrl:url.href,dir:migrationPath,direction:"up",migrationsTable:"pgmigrations",count,noLock:true,log:()=>{}});
    old=new Pool({connectionString:url.href});repository=new ResearchMetadataRepository(old);
    expect((await old.query("SELECT to_regclass('research.execution_recipe_descriptors_v1') AS t")).rows[0].t).toBeNull();
    await old.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password) VALUES($1,'full01-old-admin','FULL01 DB test','ADMIN','ACTIVE',false)",[scope.actorUserId]);
    await old.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'FULL01 old DB',$2)",[scope.workspaceId,scope.actorUserId]);
    await old.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')",[scope.workspaceId,scope.actorUserId]);
    await new ResearchP04DeltaBindingService(repository).install(w1Admin,scope);
    const requested=p04Requested(),manifest={...manifestFor(requested),createdAt:new Date(),expiresAt:new Date(Date.now()+600_000)};
    const config={FEATURE_RESEARCH_RUN_PRODUCER:"true",RESEARCH_RUN_PRODUCER_LEASE_SECONDS:15} as never;
    await repository.storePreflightManifest(scope,manifest,2);
    service=new ResearchRunCreateService(repository,new ResearchRunAdmissionService(repository,config),{
      handleWrite:async(input:{body:string;idempotencyKey:string})=>({status:202,body:{run_id:JSON.parse(input.body).run_id},idempotencyKey:input.idempotencyKey,replayed:false}),
    } as never,config);
    const made=await service.create(w1Admin,scope,{schema_version:"research.run-create.v1",client_intent_id:"full01-old-intent-001",
      preflight_token:manifest.preflightToken,requested_spec:requested,intent_kind:"NEW"},"full01-old-db");
    runId=made.run_id;
    before=(await old.query("SELECT to_jsonb(p) AS p FROM research.run_producers p WHERE run_id=$1",[runId])).rows[0].p;
    await migrate({databaseUrl:url.href,dir:migrationPath,direction:"up",migrationsTable:"pgmigrations",count:Infinity,noLock:true,log:()=>{}});
  },90_000);
  afterAll(async()=>{
    await old?.end();
    if(admin){await admin.query("DROP DATABASE IF EXISTS full01_recipe_old_test WITH(FORCE)");await admin.end();}
  });

  it("mirrors exactly six qualified old recipe revisions without granting runtime mutation",async()=>{
    const rows=(await old.query("SELECT d.profile_id,d.profile_digest,d.recipe_digest,q.state,q.scope FROM research.execution_recipe_descriptors_v1 d JOIN research.execution_recipe_qualifications_v1 q USING(recipe_digest) ORDER BY profile_id")).rows;
    expect(rows).toHaveLength(6);
    rows.forEach(row=>{const expected=executionRecipes.find(r=>r.profile_id===row.profile_id)!;
      expect(row.profile_digest).toBe(expected.profile_digest);
      expect(row.recipe_digest).toBe(executionRecipeQualification(expected.profile_id).recipe_digest);
      expect(row).toMatchObject({state:"QUALIFIED",scope:"ORIGINAL_RECEIPT_SCOPE_ONLY"});});
    const grants=(await old.query("SELECT has_table_privilege('portal_research_runtime','research.execution_recipe_descriptors_v1','INSERT') AS i,has_table_privilege('portal_research_runtime','research.execution_recipe_qualifications_v1','UPDATE') AS u")).rows[0];
    expect(grants).toEqual({i:false,u:false});
    await expect(old.query("UPDATE research.execution_recipe_descriptors_v1 SET recipe_digest=recipe_digest")).rejects.toMatchObject({code:"55000"});
  });
  it("preserves every pre-095 producer byte and its historical null recipe revision",async()=>{
    const after=(await old.query("SELECT to_jsonb(p)-'execution_recipe_digest' AS p,execution_recipe_digest FROM research.run_producers p WHERE run_id=$1",[runId])).rows[0];
    expect(after.p).toEqual(before);expect(after.execution_recipe_digest).toBeNull();
  });
  it("does not reuse or expire a producer-bound historical preflight or consume abandonment quota",async()=>{
    const original=await repository.loadPreflightManifest(scope,String(before.preflight_token));
    const replacement=await repository.storePreflightManifest(scope,{...original,preflightToken:"rpft_full01_new_unbound"},1);
    expect(replacement.preflightToken).not.toBe(original.preflightToken);
    expect((await old.query("SELECT count(*)::int AS n FROM research.preflight_manifests WHERE preflight_token=$1",[original.preflightToken])).rows[0].n).toBe(1);
  });
  it("new 095 producers receive the exact policy binding and cannot smuggle a different revision",async()=>{
    // Give the second fixture intent queue space; this is a disposable DB-only test.
    await old.query("UPDATE research.jobs SET state='SUCCEEDED' WHERE workspace_id=$1",[scope.workspaceId]);
    const result=await service.create(w1Admin,scope,{schema_version:"research.run-create.v1",client_intent_id:"full01-new-intent-002",
      preflight_token:"rpft_full01_new_unbound",requested_spec:p04Requested(),intent_kind:"NEW"},"full01-new-db");
    const row=(await old.query("SELECT execution_recipe_digest FROM research.run_producers WHERE run_id=$1",[result.run_id])).rows[0];
    expect(row.execution_recipe_digest).toBe(executionRecipeQualification("p04.fixed-qualification.v1").recipe_digest);
    const source=(await old.query("SELECT * FROM research.run_producers WHERE run_id=$1",[result.run_id])).rows[0];
    source.execution_recipe_digest="0".repeat(64);
    // Existing identity would also be a duplicate, but BEFORE INSERT must reject revision first.
    await expect(old.query("INSERT INTO research.run_producers SELECT * FROM jsonb_populate_record(NULL::research.run_producers,$1::jsonb)",[JSON.stringify(source)])).rejects.toMatchObject({code:"23514"});
  });
});
