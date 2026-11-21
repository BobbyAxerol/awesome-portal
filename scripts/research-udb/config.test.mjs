import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
const read = name => fs.readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');

test('all PG Compose images pin the existing 16.15 digest, no major upgrade', () => {
  for (const file of ['compose.yaml', 'deploy/compose.production.yaml']) {
    assert.match(read(file), /image: postgres:16\.15-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685/);
  }
});
test('preview and strict P23 choose distinct bounded PG envelopes', () => {
  assert.match(read('deploy/research-preview/compose.research-preview.yaml'), /config_file=\/etc\/postgresql\/preview.conf/);
  assert.match(read('deploy/research-preview/compose.research-preview.yaml'), /mem_limit: 1536m/);
  const p23 = read('deploy/research-preview/compose.research-p23-5gb.yaml');
  assert.match(p23, /config_file=\/etc\/postgresql\/p23.conf/);
  assert.match(p23, /mem_limit: 900000000/);
  assert.match(read('deploy/postgres/preview.conf'), /shared_buffers = 256MB/);
  assert.match(read('deploy/postgres/p23.conf'), /shared_buffers = 128MB/);
  for (const name of ['preview', 'p23']) {
    const config = read(`deploy/postgres/${name}.conf`);
    assert.match(config, /include = '\/etc\/postgresql\/portal.conf'/);
    assert.match(config, /autovacuum_work_mem = (16|32)MB/);
    assert.match(config, /max_parallel_workers_per_gather = 0/);
  }
});
test('forward repair touches cache only, never auth, history or the applied ledger', () => {
  const migration = read('apps/control-api/migrations/1723680000130_udb-cache-storage-forward-repair.sql');
  assert.match(migration, /^-- Up Migration/);
  assert.match(migration, /SET LOCAL lock_timeout = '2s'/);
  assert.match(migration, /ALTER TABLE public.execution_shared_read_cache SET UNLOGGED/);
  assert.doesNotMatch(migration, /(?:UPDATE|DELETE FROM|INSERT INTO|TRUNCATE)\s+(?:public\.)?(?:portal_|pgmigrations|research\.)/i);
});
test('bounded qualification does not disguise a short lane as an extended soak', () => {
  const script=read('scripts/research-udb/soak.cjs');
  assert.match(script,/PASS_BOUNDED_QUALIFICATION_NOT_24H/);
  assert.doesNotMatch(script,/PASS_EXTENDED_24H/);
  assert.match(script,/summary\.vacuum_cycles>=3/);
  assert.match(script,/summary\.elapsed_seconds>=600/);
  assert.match(script,/pending\.size>=4/);
  assert.match(script,/randomBytes\(1535\*1024\)/);
  assert.match(read('scripts/research-udb/soak.sh'),/portal-udb01-soak_pg-data/);
});

test('Execution store is private and only mounts runtime credentials into the API', () => {
  const overlay=read('deploy/research-preview/compose.execution-store.yaml');
  assert.doesNotMatch(overlay,/^\s*ports:/m);
  assert.match(overlay,/execution-data:\s*\n\s+internal: true/);
  const runtime=overlay.split('  control-api:')[1].split('  execution-store-admin:')[0];
  assert.match(runtime,/EXECUTION_DATABASE_URL_FILE: \/run\/secrets\/execution\/runtime-url/);
  assert.doesNotMatch(runtime,/owner-url|owner-password|DATABASE_URL:/);
  assert.match(overlay,/execution-postgres-data:\/var\/lib\/postgresql\/data/);
  assert.match(read('deploy/postgres/execution-init.sh'),/NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION/);
});
test('domain PG and future combined P23 envelope remain bounded, never activate old gates', () => {
  const config=read('deploy/postgres/execution.conf');
  assert.match(config,/shared_buffers = 64MB/);assert.match(config,/max_connections = 24/);
  assert.match(config,/autovacuum_work_mem = 16MB/);assert.match(config,/max_parallel_workers_per_gather = 0/);
  const candidate=read('deploy/research-preview/compose.execution-store-p23.yaml');
  const caps=[...candidate.matchAll(/mem_limit: (\d+)/g)].map(x=>Number(x[1]));
  assert.deepEqual(caps,[900000000,536870912,500000000]);
  const otherRequiredServices=2600000000;
  assert.equal(caps.reduce((a,b)=>a+b)+otherRequiredServices,4536870912);
  assert(caps.reduce((a,b)=>a+b)+otherRequiredServices+350000000<=5000000000);
  assert(caps.reduce((a,b)=>a+b)+otherRequiredServices+300000000+350000000>5000000000);
  assert.doesNotMatch(read('scripts/research-preview/preview.sh'),/compose.execution-store-p23.yaml/);
});
test('domain schema and hydration do not copy Core authority or live cursors', () => {
  const schema=read('apps/control-api/src/execution/store-schema.ts');
  assert.match(schema,/EXECUTION_SCHEMA_CORE_TARGET_REFUSED/);
  assert.match(schema,/REFERENCES execution_workspace_references\(workspace_id\)/);
  assert.doesNotMatch(schema,/CREATE TABLE (portal_users|workspaces|auth_sessions|research\.)/);
  const transfer=read('apps/control-api/src/execution/retained-store-transfer.ts');
  assert.match(transfer,/READ ONLY/);assert.match(transfer,/live_state_imported:false/);
  assert.match(transfer,/n<=20000/);assert.match(transfer,/UDB_TRANSFER_CONTENT_PARITY_FAILED/);
  assert.match(transfer,/environment,profile_id,relation_key,row_id/);
});

test('acceptance retakes preserve terminal evidence and stay in owned directories', () => {
  const harness=read('scripts/research-udb/acceptance-cell.mjs');
  assert.match(harness,/UDB04_RECEIPT_DIRECTORY_OUTSIDE_OWNED_ALLOWLIST/);
  assert.match(harness,/TERMINAL_CELL_REQUIRES_A_NEW_APPROVED_RECEIPT_DIRECTORY/);
  assert.match(harness,/INIT_ONCE_NEVER_OVERWRITE/);
  assert.match(harness,/source_candidate:buildInputs\.source_commit/);
  assert.match(harness,/control_build_inputs:buildInputs/);
  const allowed=/^\/home\/bobby\/\.local\/state\/portal-udb04\/acceptance(?:-final)?-\d{8}$/;
  assert(allowed.test('/home/bobby/.local/state/portal-udb04/acceptance-final-20261011'));
  for(const path of ['/tmp/acceptance-final-20261011','/home/bobby',
    '/home/bobby/.local/state/portal-udb04/acceptance-final-20261011/../other'])assert(!allowed.test(path));
});
