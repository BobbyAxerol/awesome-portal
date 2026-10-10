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
