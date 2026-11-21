// Metadata-only UDB custody/FK/settings inventory. Credentials/rows never leave
// this process: per-table SHA-256 is all the receipt retains. Supply DB URL via
// the existing container environment, never an argv/logged URL.
const { Pool } = require('pg');
const { createHash } = require('node:crypto');
const sensitive = ['portal_users','password_credentials','activation_credentials',
  'auth_sessions','external_identity_bindings','portal_owner_anchor',
  'portal_capability_grants','portal_capability_grant_events','workspaces','workspace_members'];
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await pool.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables = (await pool.query(`SELECT n.nspname AS schema,c.relname AS name,c.relpersistence,
      pg_total_relation_size(c.oid)::text AS bytes,c.reloptions,t.reloptions AS toast_options
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_class t ON t.oid=c.reltoastrelid
      WHERE c.relkind='r' AND n.nspname IN ('public','research') ORDER BY n.nspname,c.relname`)).rows;
    const custody = {};
    const originalWorkspaceCustody = {};
    let reviewSessionCustody;
    for (const table of sensitive.filter(name => tables.some(t => t.schema === 'public' && t.name === name))) {
      const rows = (await pool.query(`SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY to_jsonb(t)::text`)).rows;
      custody[table] = { count: rows.length, sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
      if(table==='auth_sessions'&&process.env.UDB_REVIEW_SESSION_SINCE){
        const since=Date.parse(process.env.UDB_REVIEW_SESSION_SINCE);
        if(!Number.isFinite(since))throw Error('UDB_REVIEW_SESSION_BOUND_INVALID');
        const original=rows.filter(({row})=>Date.parse(row.created_at)<=since);
        const review=rows.filter(({row})=>Date.parse(row.created_at)>since);
        reviewSessionCustody={since:process.env.UDB_REVIEW_SESSION_SINCE,original_count:original.length,
          original_sha256:createHash('sha256').update(JSON.stringify(original)).digest('hex'),
          added:review.length,revoked:review.filter(({row})=>row.state==='REVOKED').length};
      }
      if (process.env.UDB_REVIEW_WORKSPACE_ID && ['workspaces','workspace_members'].includes(table)) {
        const originals=rows.filter(({row})=>row.workspace_id!==process.env.UDB_REVIEW_WORKSPACE_ID);
        originalWorkspaceCustody[table]={count:originals.length,
          sha256:createHash('sha256').update(JSON.stringify(originals)).digest('hex')};
      }
    }
    for (const table of ['runs','jobs','run_producers','current_source_seals_v1','release_candidate_packs_v1','release_candidate_publications_v1']) {
      if (!tables.some(t => t.schema === 'research' && t.name === table)) continue;
      const rows = (await pool.query(`SELECT to_jsonb(t) AS row FROM research.${table} t ORDER BY to_jsonb(t)::text`)).rows;
      custody[`research.${table}`] = { count: rows.length, sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
    }
    const foreignKeys = (await pool.query(`SELECT conrelid::regclass::text AS child,confrelid::regclass::text AS parent,
      conname AS constraint,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE contype='f' ORDER BY conrelid::regclass::text,conname`)).rows;
    const settings = (await pool.query(`SELECT name,setting,unit,source,pending_restart
      FROM pg_settings WHERE name IN ('server_version','config_file','max_connections','shared_buffers',
      'work_mem','hash_mem_multiplier','maintenance_work_mem','autovacuum_work_mem','autovacuum_max_workers',
      'autovacuum_naptime','max_wal_size','default_toast_compression','shared_preload_libraries',
      'idle_in_transaction_session_timeout','temp_file_limit') ORDER BY name`)).rows;
    const migrations = (await pool.query('SELECT name,run_on FROM pgmigrations ORDER BY run_on,id')).rows;
    const activity = (await pool.query(`SELECT state,count(*)::integer AS count FROM pg_stat_activity GROUP BY state`)).rows;
    const activeJobs = (await pool.query("SELECT count(*)::integer AS n FROM research.jobs WHERE state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED')")).rows[0].n;
    await pool.query('COMMIT');
    console.log(JSON.stringify({ captured_at: new Date().toISOString(), custody, originalWorkspaceCustody,reviewSessionCustody,
      tables, foreignKeys, settings, migrations, activity, activeJobs }, null, 2));
  } finally { await pool.end(); }
}
main().catch(error => { console.error(JSON.stringify({ error: 'UDB_INVENTORY_FAILED', code: error.code ?? 'UNKNOWN' })); process.exitCode = 1; });
