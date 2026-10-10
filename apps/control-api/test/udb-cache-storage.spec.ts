import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runner as migrate } from 'node-pg-migrate';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { runControlApiMigrations } from '../src/cli/migrate';

const source = join(__dirname, '../migrations');
const staging = mkdtempSync(join(tmpdir(), 'udb-legacy-'));
const database = `udb_legacy_${randomUUID().replaceAll('-', '')}`;
const original = process.env.TEST_DATABASE_URL ?? 'postgres://portal:portal@127.0.0.1:5432/portal_control_test';
const urlFor = (name: string) => { const url = new URL(original); url.pathname = `/${name}`; return url.toString(); };
const repair = '1723680000130_udb-cache-storage-forward-repair';
const old = '1723680000129_execution-shared-read-cache-storage';

describe('UDB01-T01/T02 append-only cache storage repair', () => {
  afterAll(async () => {
    const admin = new Pool({ connectionString: urlFor('postgres') });
    try { await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`); }
    finally { await admin.end(); rmSync(staging, { recursive: true, force: true }); }
  });
  it('repairs a recorded-but-no-op 129 without changing historical ledger or identity bytes', async () => {
    const admin = new Pool({ connectionString: urlFor('postgres') });
    try { await admin.query(`CREATE DATABASE ${database}`); } finally { await admin.end(); }
    for (const filename of readdirSync(source).filter(name => name.endsWith('.sql') && name < `${repair}.sql`)) {
      cpSync(join(source, filename), join(staging, filename));
    }
    // Historical fixture reproduces the old shipped no-op, not a production
    // ledger repair. The actual runner records 129 normally in this test DB.
    writeFileSync(join(staging, `${old}.sql`), '-- Up Migration\nSELECT 1;\n-- Down Migration\nSELECT 1;\n');
    await migrate({ databaseUrl: urlFor(database), dir: staging, direction: 'up', migrationsTable: 'pgmigrations', count: Infinity, log: () => {} });
    const pool = new Pool({ connectionString: urlFor(database) });
    try {
      await pool.query(`INSERT INTO portal_users (user_id,username,display_name,role,status,must_change_password)
        VALUES ('usr_udb_bobby','udb-bobby','Owner','ADMIN','ACTIVE',false),
               ('usr_udb_stan','udb-stan','Reviewer','USER','DISABLED',false);
        INSERT INTO password_credentials (credential_id,user_id,password_hash,algorithm,parameters_json)
        VALUES ('cred_udb','usr_udb_bobby','test-only-byte-custody','argon2id','{}');
        INSERT INTO portal_owner_anchor (anchor_id,user_id) VALUES ('PORTAL_OWNER','usr_udb_bobby');
        INSERT INTO activation_credentials (activation_id,user_id,token_hash,expires_at,revoked_at)
        VALUES ('act_udb','usr_udb_stan','test-only-activation',now()+interval '1 day',now());
        INSERT INTO auth_sessions (session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at)
        VALUES ('sess_udb','test-only-session','usr_udb_bobby','REVOKED','test-only-csrf',0,now()+interval '1 hour',now()+interval '1 day');`);
      const custody = async () => {
        const results = {} as Record<string, unknown>;
        for (const table of ['portal_users','password_credentials','activation_credentials','auth_sessions','portal_owner_anchor']) {
          results[table] = (await pool.query(`SELECT * FROM ${table} ORDER BY row_to_json(${table})::text`)).rows;
        }
        return results;
      };
      const before = await custody();
      const ledger = (await pool.query('SELECT * FROM pgmigrations ORDER BY id')).rows;
      expect((await pool.query("SELECT relpersistence FROM pg_class WHERE oid='execution_shared_read_cache'::regclass")).rows[0].relpersistence).toBe('p');
      await runControlApiMigrations(urlFor(database), source, () => {});
      expect(await custody()).toEqual(before);
      // Later additive migrations (UDB03's132 and future phases) may append.
      // Every historical row, including id/name/run_on, must remain byte-exact.
      expect((await pool.query('SELECT * FROM pgmigrations WHERE id=ANY($1::integer[]) ORDER BY id',
        [ledger.map(row => row.id)])).rows).toEqual(ledger);
      const ddl = (await pool.query(`SELECT c.relpersistence,c.reloptions,t.reloptions AS toast_options
        FROM pg_class c JOIN pg_class t ON t.oid=c.reltoastrelid WHERE c.oid='execution_shared_read_cache'::regclass`)).rows[0];
      expect(ddl.relpersistence).toBe('u');
      expect(ddl.reloptions).toContain('autovacuum_vacuum_scale_factor=0');
      expect(ddl.toast_options).toContain('autovacuum_vacuum_threshold=5000');
      await runControlApiMigrations(urlFor(database), source, () => {});
      expect(await custody()).toEqual(before);
      expect((await pool.query('SELECT count(*)::integer AS n FROM pgmigrations WHERE name=$1', [repair])).rows[0].n).toBe(1);
    } finally { await pool.end(); }
  }, 90_000);
});
