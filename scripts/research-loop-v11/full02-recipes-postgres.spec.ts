/** Synthetic migration/authority proof; never substitutes for actual child qualification. */
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {join} from "node:path";
import {runner as migrate} from "../../apps/control-api/node_modules/node-pg-migrate";
import {Pool} from "../../apps/control-api/node_modules/pg";
import {ResearchMetadataRepository} from "../../apps/control-api/src/research/repository";
import {ResearchP04DeltaBindingService} from "../../apps/control-api/src/research/p04-delta-binding.service";
import {ResearchRunAdmissionService} from "../../apps/control-api/src/research/run-admission.service";
import {ResearchRunCreateService} from "../../apps/control-api/src/research/run-create.service";
import {ResearchRequestedSpecSchema} from "../../apps/control-api/src/research/preflight.contract";
import {executionRecipe,executionRecipeQualification} from "../../apps/control-api/src/research/execution-recipes";
import {p04Requested,wfoRequested,manifestFor,w1Admin} from "../../apps/control-api/test/research-w1-wfo.fixture";

const sourceUrl=process.env.TEST_DATABASE_URL!;
const scope={workspaceId:"full02-db",actorUserId:w1Admin.userId};
const decay="p10.delta-signal-notional-per-fold-decay.v1", three="p10.delta-signal-notional-three-window-optimized.v1";
describe("FULL-02 exact recipe migration and producer custody",()=>{
  let admin:Pool,db:Pool,repository:ResearchMetadataRepository;
  beforeAll(async()=>{
    admin=new Pool({connectionString:sourceUrl});await admin.query("CREATE DATABASE full02_recipes_test");
    const url=new URL(sourceUrl);url.pathname="/full02_recipes_test";
    await migrate({databaseUrl:url.href,dir:join(__dirname,"../../apps/control-api/migrations"),direction:"up",migrationsTable:"pgmigrations",count:Infinity,noLock:true,log:()=>{}});
    db=new Pool({connectionString:url.href});repository=new ResearchMetadataRepository(db);
    await db.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password) VALUES($1,'full02-admin','FULL02 disposable','ADMIN','ACTIVE',false)",[scope.actorUserId]);
    await db.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'FULL02 disposable',$2)",[scope.workspaceId,scope.actorUserId]);
    await db.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')",[scope.workspaceId,scope.actorUserId]);
    await new ResearchP04DeltaBindingService(repository).install(w1Admin,scope);
  },90_000);
  afterAll(async()=>{await db?.end();if(admin){await admin.query("DROP DATABASE IF EXISTS full02_recipes_test WITH(FORCE)");await admin.end();}});
  it("keeps six old qualifications and appends exactly two candidates, not fictional receipts",async()=>{
    const rows=(await db.query("SELECT d.profile_id,d.profile_digest,d.recipe_digest,q.state,q.receipt_path,q.receipt_sha256 FROM research.execution_recipe_descriptors_v1 d JOIN research.execution_recipe_qualifications_v1 q USING(recipe_digest) ORDER BY d.created_at,d.profile_id")).rows;
    expect(rows).toHaveLength(8);expect(rows.filter(r=>r.state==="QUALIFIED")).toHaveLength(6);
    for(const id of [decay,three]){
      const row=rows.find(r=>r.profile_id===id)!;
      expect(row).toMatchObject({profile_digest:executionRecipe(id).profile_digest,recipe_digest:executionRecipeQualification(id).recipe_digest,state:"CANDIDATE",receipt_path:null,receipt_sha256:null});
    }
    const proofs=(await db.query("SELECT recipe_digest,receipt_path,receipt_sha256,scope FROM research.execution_recipe_product_receipts_v1")).rows;
    expect(proofs).toHaveLength(2);
    for(const id of [decay,three]){
      const ref=executionRecipeQualification(id);
      expect(proofs.find(r=>r.recipe_digest===ref.recipe_digest)).toMatchObject({receipt_path:ref.receipt_path,
        receipt_sha256:ref.receipt_sha256,scope:"EXACT_PROFILE_PRODUCT_RUN"});
    }
    expect((await db.query("SELECT has_table_privilege('portal_research_runtime','research.execution_recipe_product_receipts_v1','INSERT') AS i,has_table_privilege('portal_research_runtime','research.execution_recipe_descriptors_v1','UPDATE') AS u")).rows[0]).toEqual({i:false,u:false});
    await expect(db.query("UPDATE research.execution_recipe_descriptors_v1 SET recipe_digest=recipe_digest WHERE profile_id=$1",[decay])).rejects.toMatchObject({code:"55000"});
  });
  it.each([decay,three])("binds %s to its exact new work schema and rejects nullable/wrong pins",async id=>{
    await db.query("UPDATE research.jobs SET state='SUCCEEDED' WHERE workspace_id=$1",[scope.workspaceId]);
    const requested=ResearchRequestedSpecSchema.parse(id===decay?{...wfoRequested(),schema_version:"research.requested-spec.v2",optimization_schedule:"per_fold_decay",
      walk_forward:{...wfoRequested().walk_forward,label_horizon_bars:1,purge_bars:2,embargo_bars:3}}:p04Requested({optuna_trials:3,random_seed:42}));
    const manifest={...manifestFor(requested,{token:`rpft_full02_${id===decay?'decay':'three'}`}),createdAt:new Date(),expiresAt:new Date(Date.now()+600_000)};
    await repository.storePreflightManifest(scope,manifest,8);
    const config={FEATURE_RESEARCH_RUN_PRODUCER:"true",FEATURE_RESEARCH_WFO_PROFILE:"true",FEATURE_RESEARCH_FULL02_PROFILE:"true",PORTAL_ENV:"local",AUTH_MODE:"dev",RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:id,RESEARCH_RUN_PRODUCER_LEASE_SECONDS:15} as never;
    let wire:Record<string,unknown>={};
    const service=new ResearchRunCreateService(repository,new ResearchRunAdmissionService(repository,config),{
      handleWrite:async(input:{body:string;idempotencyKey:string})=>{wire=JSON.parse(input.body);return {status:202,body:{run_id:wire.run_id},idempotencyKey:input.idempotencyKey,replayed:false};},
    } as never,config);
    const made=await service.create(w1Admin,scope,{schema_version:"research.run-create.v1",client_intent_id:`full02-db-${id===decay?'decay':'three'}`,
      preflight_token:manifest.preflightToken,requested_spec:requested,intent_kind:"NEW"},"full02-disposable-proof");
    const row=(await db.query("SELECT * FROM research.run_producers WHERE run_id=$1",[made.run_id])).rows[0];
    expect(row.execution_profile_id).toBe(id);expect(row.execution_profile_digest).toBe(executionRecipe(id).profile_digest);
    expect(row.execution_recipe_digest).toBe(executionRecipeQualification(id).recipe_digest);
    const envelope=wire.research as Record<string,unknown>;
    expect(envelope.execution_profile_id).toBe(id);expect(envelope.p04_parameters).toBeUndefined();
    expect(envelope.requested_spec).toEqual(requested);
    expect((await db.query("SELECT research.run_library_display_label($1,$2) AS label",[scope.workspaceId,made.run_id])).rows[0].label)
      .toMatch(id===decay?/^R-WFO-\d+$/:/^R-OPT-\d+$/);
    for(const bad of [null,"0".repeat(64)]){
      const altered={...row,execution_profile_digest:bad};
      await expect(db.query("INSERT INTO research.run_producers SELECT * FROM jsonb_populate_record(NULL::research.run_producers,$1::jsonb)",[JSON.stringify(altered)])).rejects.toMatchObject({code:"23514"});
    }
  });
});
