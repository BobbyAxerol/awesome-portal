import {createHash} from "node:crypto";
import {createReadStream, createWriteStream} from "node:fs";
import {readFile, writeFile, stat} from "node:fs/promises";
import {createInterface} from "node:readline";
import {once} from "node:events";
import {finished} from "node:stream/promises";
import {Pool, PoolClient} from "pg";

export const RETAINED_TABLES = ["execution_profile_projection_snapshots",
  "execution_manager_projection_snapshots", "execution_alpha_fleet_projection",
  "execution_binding_projection", "execution_portfolio_projection", "execution_timeseries_history"] as const;
export const CURRENT_ENTITY_TABLES = ["execution_durable_mirror_batches", "execution_durable_mirror_revisions",
  "execution_durable_mirror_observations", "execution_durable_mirror_current_entities"] as const;
type RetainedLane = "projection-history" | "current-entities";
const tablesFor = (lane: RetainedLane) => lane === "current-entities" ? CURRENT_ENTITY_TABLES : RETAINED_TABLES;
const MAX_BYTES = 128 * 1024 * 1024;
const MAX_ROWS = 100_000;
const hash = () => createHash("sha256");
type Table = typeof RETAINED_TABLES[number] | typeof CURRENT_ENTITY_TABLES[number];
const KEY_ORDER: Record<Table,string> = {
  execution_profile_projection_snapshots:"environment,profile_id",
  execution_manager_projection_snapshots:"environment,projection_kind",
  execution_alpha_fleet_projection:"scope_id,alpha_id",
  execution_binding_projection:"scope_id,binding_id",
  execution_portfolio_projection:"scope_id,portfolio_id",
  execution_timeseries_history:"environment,profile_id,relation_key,row_id",
  execution_durable_mirror_batches:"batch_id",
  execution_durable_mirror_revisions:"read_model_revision",
  execution_durable_mirror_observations:"batch_id,relation_key",
  execution_durable_mirror_current_entities:"environment,profile_id,relation_key,entity_key",
};
export interface RetainedManifest {
  schema_version: "portal.execution.retained-import.v1";
  import_run_id: string; workspace_id: string; source_stack: "portal-dev";
  captured_at: string; file_sha256: string; bytes: number;
  history_reader: "execution_timeseries_history";
  tables: Record<string,{rows:number;sha256:string;source_rows:number;truncated:boolean;oldest_ts:string|null;newest_ts:string|null}>;
  live_state_imported: false;
  row_order: "PRIMARY_KEY_V1";
  lane?: RetainedLane;
}
function selectedRows(table: Table): string {
  const entities="SELECT * FROM execution_durable_mirror_current_entities WHERE workspace_id=$1";
  const revisions=`SELECT * FROM execution_durable_mirror_revisions WHERE workspace_id=$1 AND
    (is_current OR read_model_revision IN (SELECT last_read_model_revision FROM (${entities}) e))`;
  const batches=`SELECT * FROM execution_durable_mirror_batches WHERE workspace_id=$1 AND batch_id IN (
    SELECT first_observed_batch_id FROM (${entities}) e UNION SELECT last_observed_batch_id FROM (${entities}) e
    UNION SELECT batch_id FROM (${revisions}) r)`;
  if(table==="execution_durable_mirror_batches")return batches;
  if(table==="execution_durable_mirror_revisions")return revisions;
  if(table==="execution_durable_mirror_observations")return `SELECT * FROM execution_durable_mirror_observations WHERE workspace_id=$1 AND batch_id IN (SELECT batch_id FROM (${batches}) b)`;
  if(table==="execution_timeseries_history")return `SELECT * FROM execution_timeseries_history t
    WHERE workspace_id=$1 AND (environment,profile_id,relation_key,row_id) IN (
      SELECT environment,profile_id,relation_key,row_id FROM (
        SELECT environment,profile_id,relation_key,row_id,row_number() OVER(PARTITION BY environment,profile_id,relation_key ORDER BY ts DESC,row_id DESC) AS n
        FROM execution_timeseries_history WHERE workspace_id=$1
      ) bounded WHERE n<=20000)`;
  return `SELECT * FROM ${table} WHERE workspace_id=$1`;
}
function identifier(value: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)) throw new Error("UDB_TRANSFER_IDENTIFIER_INVALID");
}
async function fileDigest(path: string) {
  const digest = hash(); for await (const data of createReadStream(path)) digest.update(data);
  return digest.digest("hex");
}
async function tableDigest(client: PoolClient, table: Table, workspace: string) {
  const digest = hash(); let count=0;
  // Stable indexed coordinates, not a huge sort of every serialized JSON row.
  await client.query(`DECLARE udb_verify NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS row FROM ${table} t WHERE workspace_id=$1 ORDER BY ${KEY_ORDER[table]}`,[workspace]);
  try {
    while (true) {
      const rows=(await client.query<{row:string}>("FETCH 250 FROM udb_verify")).rows;
      if (!rows.length) break;
      for (const row of rows) { if (++count > MAX_ROWS) throw new Error("UDB_TRANSFER_ROW_LIMIT"); digest.update(row.row+"\n"); }
    }
  } finally { await client.query("CLOSE udb_verify"); }
  return {rows:count,sha256:digest.digest("hex")};
}

/** Read-only local Portal snapshot, bounded server cursor, never a TS client. */
export async function exportRetainedStore(pool: Pool, workspace: string, runId: string, prefix: string, lane: RetainedLane = "projection-history"): Promise<RetainedManifest> {
  identifier(workspace); identifier(runId);
  const client=await pool.connect(), stream=createWriteStream(prefix+".ndjson",{flags:"wx",mode:0o600});
  const completed=finished(stream); void completed.catch(()=>undefined);
  const output=hash(); let bytes=0,total=0;
  const manifest: RetainedManifest={schema_version:"portal.execution.retained-import.v1",import_run_id:runId,
    workspace_id:workspace,source_stack:"portal-dev",captured_at:new Date().toISOString(),file_sha256:"",bytes:0,
    history_reader:"execution_timeseries_history",tables:{},live_state_imported:false,row_order:"PRIMARY_KEY_V1",
    ...(lane==="current-entities"?{lane}: {})};
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='60s'");
    for (const table of tablesFor(lane)) {
      const sourceRows=Number((await client.query(`SELECT count(*)::text AS n FROM ${table} WHERE workspace_id=$1`,[workspace])).rows[0].n);
      // Preserve current snapshots/resources fully. History: latest <=20k per
      // accepted relation, not a full-history or whole-account-population claim.
      const selection=selectedRows(table);
      await client.query(`DECLARE udb_export NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS row FROM (${selection}) t ORDER BY ${KEY_ORDER[table]}`,[workspace]);
      const digest=hash(); let count=0;
      while (true) {
        const rows=(await client.query<{row:string}>("FETCH 250 FROM udb_export")).rows;
        if (!rows.length) break;
        for (const {row} of rows) {
          const line=JSON.stringify({table,row})+"\n";
          bytes+=Buffer.byteLength(line); if (++total>MAX_ROWS || bytes>MAX_BYTES || Buffer.byteLength(row)>16*1024*1024) throw new Error("UDB_TRANSFER_LIMIT");
          digest.update(row+"\n"); output.update(line); count++;
          if(stream.destroyed) await completed;
          if (!stream.write(line)) await once(stream,"drain");
        }
      }
      await client.query("CLOSE udb_export");
      const bounds=table==="execution_timeseries_history" ? (await client.query(`SELECT min(ts)::text AS first,max(ts)::text AS last FROM (${selection}) t`,[workspace])).rows[0] : null;
      manifest.tables[table]={rows:count,sha256:digest.digest("hex"),source_rows:sourceRows,truncated:count<sourceRows,
        oldest_ts:bounds?.first??null,newest_ts:bounds?.last??null};
    }
    await client.query("COMMIT"); stream.end(); await completed;
    manifest.file_sha256=output.digest("hex");manifest.bytes=bytes;
    await writeFile(prefix+".manifest.json",JSON.stringify(manifest,null,2)+"\n",{flag:"wx",mode:0o600});
    return manifest;
  } catch(error) { stream.destroy(); await client.query("ROLLBACK").catch(()=>undefined); throw error; }
  finally {client.release();}
}

/** Import appends only into an empty authorized scope, in one transaction. */
export async function importRetainedStore(target: Pool, core: Pool, prefix: string): Promise<RetainedManifest> {
  const manifest=JSON.parse(await readFile(prefix+".manifest.json","utf8")) as RetainedManifest;
  identifier(manifest.workspace_id); identifier(manifest.import_run_id);
  const lane=manifest.lane??"projection-history";
  if (!["projection-history","current-entities"].includes(lane)) throw new Error("UDB_TRANSFER_MANIFEST_INVALID");
  const tables=tablesFor(lane);
  if (manifest.schema_version!=="portal.execution.retained-import.v1" || manifest.source_stack!=="portal-dev" ||
      manifest.live_state_imported!==false || manifest.row_order!=="PRIMARY_KEY_V1" || manifest.history_reader!=="execution_timeseries_history" ||
      Object.keys(manifest.tables).sort().join()!==[...tables].sort().join()) throw new Error("UDB_TRANSFER_MANIFEST_INVALID");
  if ((await stat(prefix+".ndjson")).size>MAX_BYTES || (await stat(prefix+".ndjson")).size!==manifest.bytes ||
      await fileDigest(prefix+".ndjson")!==manifest.file_sha256) throw new Error("UDB_TRANSFER_FILE_DIGEST_MISMATCH");
  const reference=await core.query("SELECT workspace_id FROM workspaces WHERE workspace_id=$1",[manifest.workspace_id]);
  if (!reference.rowCount) throw new Error("UDB_CORE_WORKSPACE_REFERENCE_MISSING");
  const client=await target.connect(), manifestDigest=hash().update(JSON.stringify(manifest)).digest("hex");
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout='15s';SET LOCAL lock_timeout='2s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",["retained-import:"+manifest.workspace_id]);
    const existing=await client.query("SELECT manifest_digest FROM execution_retained_imports WHERE import_run_id=$1",[manifest.import_run_id]);
    if (existing.rowCount && existing.rows[0].manifest_digest!==manifestDigest) throw new Error("UDB_TRANSFER_RUN_ID_CONFLICT");
    if (!existing.rowCount) {
      for (const table of tables) {
        if ((await client.query(`SELECT 1 FROM ${table} WHERE workspace_id=$1 LIMIT 1`,[manifest.workspace_id])).rowCount) throw new Error("UDB_TRANSFER_TARGET_SCOPE_NOT_EMPTY");
      }
      await client.query(`INSERT INTO execution_workspace_references(workspace_id,core_reference_receipt) VALUES($1,$2)
        ON CONFLICT(workspace_id) DO NOTHING`,[manifest.workspace_id,"udb02-core-validated:"+manifestDigest]);
      let table:Table|undefined,batch:string[]=[],total=0; const reread=hash();
      const flush=async()=>{ if(batch.length) {await client.query(`INSERT INTO ${table} SELECT r.* FROM jsonb_populate_recordset(NULL::${table},$1::jsonb) r`,["["+batch.join(",")+"]"]);batch=[];} };
      for await (const line of createInterface({input:createReadStream(prefix+".ndjson"),crlfDelay:Infinity})) {
        reread.update(line+"\n");
        if (Buffer.byteLength(line)>20*1024*1024 || ++total>MAX_ROWS) throw new Error("UDB_TRANSFER_ROW_LIMIT");
        const record=JSON.parse(line);
        if (!(tables as readonly string[]).includes(record.table) || typeof record.row!=="string" ||
            JSON.parse(record.row).workspace_id!==manifest.workspace_id) throw new Error("UDB_TRANSFER_SCOPE_MISMATCH");
        if (table!==record.table) {await flush();table=record.table;}
        batch.push(record.row); if(batch.length>=100) await flush();
      }
      await flush();
      if(reread.digest("hex")!==manifest.file_sha256) throw new Error("UDB_TRANSFER_FILE_CHANGED");
    }
    for (const table of tables) {
      const actual=await tableDigest(client,table,manifest.workspace_id);
      if (actual.rows!==manifest.tables[table].rows || actual.sha256!==manifest.tables[table].sha256) throw new Error("UDB_TRANSFER_CONTENT_PARITY_FAILED");
    }
    if(!existing.rowCount) await client.query("INSERT INTO execution_retained_imports(import_run_id,manifest_digest,workspace_id,manifest) VALUES($1,$2,$3,$4::jsonb)",
      [manifest.import_run_id,manifestDigest,manifest.workspace_id,JSON.stringify(manifest)]);
    await client.query("COMMIT"); return manifest;
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}
  finally{client.release();}
}
