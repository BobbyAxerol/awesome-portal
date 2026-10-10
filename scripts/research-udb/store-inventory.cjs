// Metadata-only retained store coverage; run in the approved preview API.
const {Pool}=require('pg');
const {loadConfig}=require('/opt/control-api/dist/config');
async function main(){
  const config=loadConfig(process.env);
  if(config.PORTAL_ENV!=='local'||config.AUTH_MODE!=='dev'||!config.EXECUTION_DATABASE_URL)throw Error('UDB_PREVIEW_REQUIRED');
  const pool=new Pool({connectionString:config.EXECUTION_DATABASE_URL,max:1});
  try{
    await pool.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const imports=(await pool.query('SELECT import_run_id,manifest_digest,manifest FROM execution_retained_imports ORDER BY import_run_id')).rows;
    const entities=(await pool.query(`SELECT environment,profile_id,relation_key,count(*)::int AS rows,
      min(first_observed_at)::text AS oldest_observation,max(last_observed_at)::text AS latest_observation
      FROM execution_durable_mirror_current_entities GROUP BY environment,profile_id,relation_key ORDER BY 1,2,3`)).rows;
    const history=(await pool.query(`SELECT environment,profile_id,relation_key,count(*)::int AS rows,
      min(ts)::text AS oldest_ts,max(ts)::text AS newest_ts FROM execution_timeseries_history GROUP BY 1,2,3 ORDER BY 1,2,3`)).rows;
    const projections=(await pool.query(`SELECT environment,profile_id,source_as_of::text,received_at::text,
      completeness,last_successful_refresh_at::text FROM execution_profile_projection_snapshots ORDER BY environment`)).rows;
    const tables=(await pool.query(`SELECT c.relname AS name,c.relpersistence,pg_total_relation_size(c.oid)::text AS bytes,
      c.reloptions,t.reloptions AS toast_options FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_class t ON t.oid=c.reltoastrelid WHERE c.relkind='r' AND n.nspname='public' ORDER BY c.relname`)).rows;
    const constraints=(await pool.query(`SELECT conrelid::regclass::text AS child,confrelid::regclass::text AS parent,
      pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' ORDER BY 1,2`)).rows;
    const settings=(await pool.query(`SELECT name,setting,unit FROM pg_settings WHERE name IN ('server_version','max_connections',
      'shared_buffers','work_mem','hash_mem_multiplier','maintenance_work_mem','autovacuum_work_mem','max_wal_size') ORDER BY name`)).rows;
    const emptyTables=['execution_durable_mirror_range_rows','execution_shared_read_cache','execution_shared_read_flights',
      'execution_shared_admission_leases','execution_profile_relation_cursors','execution_manager_operation_continuations',
      'execution_financial_query_cursors'];
    const empty={};for(const table of emptyTables)empty[table]=(await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
    const migration=(await pool.query('SELECT version,digest FROM execution_store_migrations')).rows;
    await pool.query('COMMIT');
    console.log(JSON.stringify({captured_at:new Date().toISOString(),imports,entities,history,projections,tables,constraints,settings,empty,migration},null,2));
  }finally{await pool.end();}
}
void main().catch(e=>{console.error(JSON.stringify({error:'UDB_STORE_INVENTORY_FAILED',code:e.code??null}));process.exitCode=1;});
