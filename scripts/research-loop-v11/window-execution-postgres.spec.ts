import {beforeAll,afterAll,it,expect} from "vitest";
import {Pool} from "../../apps/control-api/node_modules/pg";
import {migrateTestDatabase,truncateAll} from "../../apps/control-api/test/harness";
import {ResearchMetadataRepository} from "../../apps/control-api/src/research/repository";
const url=process.env.TEST_DATABASE_URL;
if(!url)throw new Error("EXPLICIT_DISPOSABLE_DATABASE_REQUIRED");
const pool=new Pool({connectionString:url}),scope={workspaceId:"wex-db-workspace",actorUserId:"wex-db-user"};
beforeAll(async()=>{await migrateTestDatabase(url);await truncateAll(pool);},90000);
afterAll(async()=>{await pool.end();});
it("WEX additive migration, contiguous finalization, immutable custody and tenant isolation",async()=>{
  await migrateTestDatabase(url);
  await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password)
    VALUES($1,$1,'WEX disposable','ADMIN','ACTIVE',false)`,[scope.actorUserId]);
  await pool.query(`INSERT INTO workspaces(workspace_id,name,owner_user_id)VALUES($1,'WEX',$2)`,[scope.workspaceId,scope.actorUserId]);
  await pool.query(`INSERT INTO workspace_members(workspace_id,user_id,role)VALUES($1,$2,'OWNER')`,[scope.workspaceId,scope.actorUserId]);
  const repo=new ResearchMetadataRepository(pool),run="wex-db-run",artifact="wex-db-artifact",worker="wex-db-worker",sha="a".repeat(64);
  await repo.createOrReplayAttempt(scope,{attemptId:"wex-db-attempt",runId:run,clientIntentId:"wex-db-intent",requestPayloadDigest:sha,intentKind:"NEW",
    requestSpecDigest:sha,effectiveSpecDigest:sha,engineReleaseId:"quantbt-1.1.1",datasetBindingDigest:sha});
  await repo.createJob(scope,{jobId:"wex-db-job",runId:run,commandId:"wex-db-command",jobKind:"PRIMARY",queueClass:"BACKGROUND",resourceClass:"research-small",costEstimate:{cpu_seconds:1,memory_mib:64}});
  await repo.recordWorkerAttempt(scope,{workerAttemptId:worker,jobId:"wex-db-job",ordinal:1,workerId:"wex-db-disposable",leaseEpoch:1});
  const reservation=await repo.reserveArtifact(scope,{artifactId:artifact,runId:run,workerAttemptId:worker,leaseEpoch:1,storageLocator:`artifacts/${artifact}`,retentionClass:"RESEARCH_EVIDENCE",notBeforeGcAt:null});
  await repo.sealArtifact(scope,{artifactId:artifact,workerAttemptId:worker,leaseEpoch:1,manifestDigest:sha,manifestSchemaVersion:"research.artifact-manifest.v1",totalRows:1,totalBytes:20,
    parts:[{tableKind:"window_execution",schemaVersion:"research.window-execution-table.v1",partOrdinal:1,relativePath:"tables/window_execution/part-1.parquet",partDigest:sha,rowCount:1,byteCount:20,sequenceMin:"0",sequenceMax:"0"}]});
  const revision=reservation.artifactRevision;
  const manifest={workspace_id:scope.workspaceId,run_id:run,artifact_id:artifact,artifact_revision:revision,manifest_digest:sha,source:{row_count:1}};
  const insertSeal=()=>pool.query(`INSERT INTO research.window_execution_seals_v1(workspace_id,run_id,artifact_revision,artifact_id,companion_digest,manifest)VALUES($1,$2,$3,$4,$5,$6)`,[scope.workspaceId,run,revision,artifact,sha,manifest]);
  await expect(insertSeal()).rejects.toMatchObject({code:"23514"});
  await pool.query(`INSERT INTO research.window_execution_batches_v1(workspace_id,run_id,artifact_revision,artifact_id,companion_digest,batch_ordinal,start_ordinal,row_count,batch_digest)VALUES($1,$2,$3,$4,$5,0,0,1,$5)`,[scope.workspaceId,run,revision,artifact,sha]);
  const row={source_ordinal:0,kind:"OBSERVATION",window:"HOLDOUT",fold_id:null,at_utc_ms:1700000000000,payload:{equity:"20000"}};
  await pool.query(`INSERT INTO research.window_execution_rows_v1(workspace_id,run_id,artifact_revision,companion_digest,batch_ordinal,source_ordinal,kind,window_kind,fold_id,at_utc_ms,payload)VALUES($1,$2,$3,$4,0,0,'OBSERVATION','HOLDOUT',NULL,1700000000000,$5)`,[scope.workspaceId,run,revision,sha,row]);
  await insertSeal();
  await expect(pool.query(`UPDATE research.window_execution_rows_v1 SET payload='{}' WHERE run_id=$1`,[run])).rejects.toBeTruthy();
  await expect(pool.query(`DELETE FROM research.window_execution_seals_v1 WHERE run_id=$1`,[run])).rejects.toBeTruthy();
  await expect(pool.query(`INSERT INTO research.window_execution_batches_v1(workspace_id,run_id,artifact_revision,artifact_id,companion_digest,batch_ordinal,start_ordinal,row_count,batch_digest)VALUES($1,$2,$3,$4,$5,1,1,1,$5)`,[scope.workspaceId,run,revision,artifact,sha])).rejects.toMatchObject({code:"23505"});
  const client=await pool.connect();try{
    await client.query("BEGIN");await client.query("SET LOCAL ROLE portal_research_runtime");
    await client.query(`SELECT set_config('research.workspace_id',$1,true),set_config('research.actor_user_id',$2,true)`,[scope.workspaceId,scope.actorUserId]);
    expect((await client.query("SELECT * FROM research.window_execution_seals_v1")).rowCount).toBe(1);
    await client.query(`SELECT set_config('research.workspace_id','foreign',true)`);
    expect((await client.query("SELECT * FROM research.window_execution_seals_v1")).rowCount).toBe(0);
    expect((await client.query("SELECT * FROM research.window_execution_rows_v1")).rowCount).toBe(0);
    await client.query("ROLLBACK");
  }finally{client.release();}
  expect((await pool.query("SELECT count(*) FROM portal_users WHERE user_id=$1",[scope.actorUserId])).rows[0].count).toBe("1");
});
