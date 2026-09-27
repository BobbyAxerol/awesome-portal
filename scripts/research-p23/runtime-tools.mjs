/** Ops-only fault/readback helper bound to the owned cell, not a product API. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { PROJECT } from './cell.mjs';

export function container(service) {
  assert(['control-api', 'portal-api', 'portal-postgres', 'quant-worker-py', 'portal-nats'].includes(service), 'OWNED_SERVICE_REQUIRED');
  const name = `${PROJECT}-${service}-1`;
  const actual = docker(['inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', name]).trim();
  assert.equal(actual, PROJECT); return name;
}
export function docker(args, input) {
  return execFileSync('sudo', ['-n', 'docker', ...args], {
    encoding: 'utf8', input, timeout: 60000, maxBuffer: 2 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
  });
}
const PROGRAM = String.raw`
const fs = require('node:fs');
const {Pool} = require('pg');
const pool = new Pool({connectionString:process.env.DATABASE_URL,max:1});
const input=JSON.parse(fs.readFileSync(0,'utf8'));
(async()=>{
  if(input.operation==='query') {
    const result=await pool.query(input.sql,input.params);
    process.stdout.write(JSON.stringify({rows:result.rows,rowCount:result.rowCount}));
  } else throw new Error('UNKNOWN_TEST_OPERATION');
})().catch(e=>{process.stderr.write('OWNED_DB_OPERATION_FAILED:'+String(e.code??e.name));process.exitCode=1;})
  .finally(()=>pool.end());`;
export function dbQuery(sql, params = []) {
  return JSON.parse(docker(['exec', '-i', container('control-api'), 'node', '-e', PROGRAM],
    JSON.stringify({ operation: 'query', sql, params })));
}
