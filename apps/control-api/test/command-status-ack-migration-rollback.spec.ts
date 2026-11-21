/** Migration 156 is intentionally irreversible without an approved archive.
 * Exercise the actual migration runner on a separate DB inside the official
 * disposable test cell; never fall back to a host/default database. */
import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

// Match the production CLI and disposable harness: the package publishes its
// types via conditional exports that this project's legacy resolver cannot
// follow. This narrow local type does not change migration behavior.
type TestMigrationRunner = (options: { databaseUrl: string; dir: string; direction: "up" | "down";
  migrationsTable: string; count: number; noLock: boolean; log: (line: string) => void }) => Promise<unknown>;
const migrate = (require("node-pg-migrate") as { runner: TestMigrationRunner }).runner;

const testUrl = process.env.TEST_DATABASE_URL;
const migration = "1723680000156_execution-command-status-delivery-acks";

function disposableTarget(value: string): URL {
  let target: URL;
  try { target = new URL(value); } catch { throw new Error("COMMAND_STATUS_MIGRATION_DISPOSABLE_CELL_REQUIRED"); }
  if (!["postgres:", "postgresql:"].includes(target.protocol) || target.username !== "portal" ||
      !/^control-api-test-postgres-[a-zA-Z0-9_-]+$/u.test(target.hostname) ||
      (target.port !== "" && target.port !== "5432") || target.pathname !== "/portal_control_test" ||
      target.search || target.hash) throw new Error("COMMAND_STATUS_MIGRATION_DISPOSABLE_CELL_REQUIRED");
  return target;
}

describe("STATUS ACK migration disposable target guard", () => {
  it("rejects connection overrides before database creation", () => {
    expect(disposableTarget("postgres://portal:test@control-api-test-postgres-12345:5432/portal_control_test").hostname)
      .toBe("control-api-test-postgres-12345");
    for (const value of ["postgres://portal:test@control-api-test-postgres-12345:5432/portal_control_test?host=other",
      "postgres://portal:test@control-api-test-postgres-12345:5432/portal_control_test?hostaddr=127.0.0.1",
      "postgres://portal:test@control-api-test-postgres-12345:5433/portal_control_test",
      "postgres://other:test@control-api-test-postgres-12345:5432/portal_control_test", "not-a-url"])
      expect(() => disposableTarget(value)).toThrow("COMMAND_STATUS_MIGRATION_DISPOSABLE_CELL_REQUIRED");
  });
});

describe.skipIf(!testUrl)("command STATUS ACK migration rollback guard", () => {
  it("refuses down of pre-issuance correlation without a separately approved drain", async () => {
    const target=disposableTarget(testUrl!);
    const preparationMigration="1723680000158_execution-command-status-preparations";
    const name=`portal_prep158_${randomUUID().replaceAll("-","")}`;
    const dir=mkdtempSync(join(tmpdir(),"portal-prep158-migration-"));
    const admin=new Client({connectionString:testUrl});let created=false;
    try {
      cpSync(join(__dirname,"..","migrations",`${preparationMigration}.sql`),join(dir,`${preparationMigration}.sql`));
      await admin.connect();
      expect((await admin.query("SELECT current_database() AS name")).rows[0].name).toBe("portal_control_test");
      await admin.query(`CREATE DATABASE "${name}"`);created=true;target.pathname=`/${name}`;
      const db=new Client({connectionString:target.toString()});
      try {
        await db.connect();
        await db.query("CREATE TABLE execution_command_status_original_fingerprints(command_id text PRIMARY KEY)");
        await db.query("INSERT INTO execution_command_status_original_fingerprints VALUES ('TEST_ONLY:command')");
        const options={databaseUrl:target.toString(),dir,migrationsTable:"pgmigrations",noLock:true,log:()=>{}};
        await migrate({...options,direction:"up",count:Infinity});
        const digest=(letter:string)=>`sha256:${letter.repeat(64)}`;
        await db.query(`INSERT INTO execution_command_status_preparations
          (command_id,context_digest,context_nonce,subject_id,session_id,session_revision,workspace_id,workload_id,receiver_id,
           original_digest,call_digest,binding_digest,authority_fingerprint,pm_request_digest,status_request_digest,
           status_token_digest,status_issued_at_ms,context_expires_at_ms)
          VALUES ('TEST_ONLY:command',$1,$2,'TEST_ONLY:user','TEST_ONLY:session',1,'TEST_ONLY:workspace','TEST_ONLY:workload',
            'TEST_ONLY:receiver',$3,$4,$5,$6,$7,$8,$9,1,2)`,
        [digest("a"),"x".repeat(43),digest("b"),digest("c"),digest("d"),digest("e"),digest("f"),digest("1"),digest("2")]);
        const before=(await db.query("SELECT * FROM execution_command_status_preparations")).rows;
        await expect(migrate({...options,direction:"down",count:1})).rejects.toThrow("COMMAND_STATUS_PREPARATION_DOWN_REQUIRES_APPROVED_DRAIN");
        expect((await db.query("SELECT * FROM execution_command_status_preparations")).rows).toEqual(before);
        expect((await db.query("SELECT name FROM pgmigrations")).rows).toEqual([{name:preparationMigration}]);
      } finally {await db.end();}
    } finally {
      if(created)await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();rmSync(dir,{recursive:true,force:true});
    }
  },30_000);
  it("refuses down on empty and populated custody without losing the ledger, exact ACK or immutable trigger", async () => {
    const target = disposableTarget(testUrl!);
    const name = `portal_ack156_${randomUUID().replaceAll("-", "")}`;
    const dir = mkdtempSync(join(tmpdir(), "portal-ack156-migration-"));
    const admin = new Client({ connectionString: testUrl });
    let created = false;
    try {
      cpSync(join(__dirname, "..", "migrations", `${migration}.sql`), join(dir, `${migration}.sql`));
      await admin.connect();
      expect((await admin.query("SELECT current_database() AS name")).rows[0].name)
        .toBe("portal_control_test");
      await admin.query(`CREATE DATABASE "${name}"`);
      created = true;
      target.pathname = `/${name}`;
      const isolatedUrl = target.toString();
      const options = { databaseUrl: isolatedUrl, dir, migrationsTable: "pgmigrations", noLock: true, log: () => {} };
      await migrate({ ...options, direction: "up", count: Infinity });

      const db = new Client({ connectionString: isolatedUrl });
      try {
        await db.connect();
        const ledger = async () => (await db.query("SELECT name FROM pgmigrations ORDER BY id")).rows;
        expect(await ledger()).toEqual([{ name: migration }]);

        // An empty table is not an implicit approval to erase its schema or ledger.
        await expect(migrate({ ...options, direction: "down", count: 1 }))
          .rejects.toThrow("COMMAND_STATUS_CUSTODY_DOWN_REQUIRES_APPROVED_ARCHIVE");
        expect(await ledger()).toEqual([{ name: migration }]);

        const request = `sha256:${"a".repeat(64)}`;
        const response = `sha256:${"b".repeat(64)}`;
        const terminal = `sha256:${"c".repeat(64)}`;
        await db.query(`INSERT INTO execution_command_status_delivery_acks
          (lease_id,workspace_id,subject_id,session_id,session_revision,environment,workload_id,
           request_digest,response_digest,terminal_receipt_digest)
          VALUES ($1,$2,$3,$4,$5,'paper',$6,$7,$8,$9)`,
          ["TEST_ONLY:lease", "TEST_ONLY:workspace", "TEST_ONLY:actor", "TEST_ONLY:session",
            "9007199254740993", "TEST_ONLY:workload", request, response, terminal]);
        const readAck = async () => (await db.query(`SELECT lease_id,workspace_id,subject_id,session_id,
          session_revision::text,environment,workload_id,request_digest,response_digest,terminal_receipt_digest,
          recorded_at::text FROM execution_command_status_delivery_acks WHERE lease_id=$1`, ["TEST_ONLY:lease"])).rows;
        const original = await readAck();
        expect(original).toHaveLength(1);
        expect(original[0].session_revision).toBe("9007199254740993");
        await expect(migrate({ ...options, direction: "down", count: 1 }))
          .rejects.toThrow("COMMAND_STATUS_CUSTODY_DOWN_REQUIRES_APPROVED_ARCHIVE");
        expect(await ledger()).toEqual([{ name: migration }]);
        expect(await readAck()).toEqual(original);
        await expect(db.query("UPDATE execution_command_status_delivery_acks SET workload_id='changed'"))
          .rejects.toThrow("COMMAND_STATUS_DELIVERY_ACK_IMMUTABLE");
        await expect(db.query("DELETE FROM execution_command_status_delivery_acks"))
          .rejects.toThrow("COMMAND_STATUS_DELIVERY_ACK_IMMUTABLE");
        expect(await readAck()).toEqual(original);
      } finally {
        await db.end();
      }
    } finally {
      if (created) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("refuses context-link down and preserves the exact same-original correlation", async () => {
    const target = disposableTarget(testUrl!);
    const linkMigration = "1723680000157_execution-command-status-context-links";
    const name = `portal_link157_${randomUUID().replaceAll("-", "")}`;
    const dir = mkdtempSync(join(tmpdir(), "portal-link157-migration-"));
    const admin = new Client({ connectionString: testUrl });
    let created = false;
    try {
      cpSync(join(__dirname, "..", "migrations", `${linkMigration}.sql`), join(dir, `${linkMigration}.sql`));
      await admin.connect();
      expect((await admin.query("SELECT current_database() AS name")).rows[0].name).toBe("portal_control_test");
      await admin.query(`CREATE DATABASE "${name}"`);
      created = true;
      target.pathname = `/${name}`;
      const options = { databaseUrl: target.toString(), dir, migrationsTable: "pgmigrations", noLock: true, log: () => {} };
      await migrate({ ...options, direction: "up", count: Infinity });
      const db = new Client({ connectionString: target.toString() });
      try {
        await db.connect();
        const ledger = async () => (await db.query("SELECT name FROM pgmigrations ORDER BY id")).rows;
        expect(await ledger()).toEqual([{ name: linkMigration }]);
        await expect(migrate({ ...options, direction: "down", count: 1 }))
          .rejects.toThrow("COMMAND_STATUS_CONTEXT_DOWN_REQUIRES_APPROVED_ARCHIVE");
        const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
        await db.query(`INSERT INTO execution_command_status_context_links
          (context_digest,context_nonce,delivery_sequence,lease_id,previous_lease_id,original_digest,
           call_digest,binding_digest,authority_fingerprint,assertion_digest,status_token_digest,
           status_request_digest,status_issued_at_ms,request_digest,receiver_id,context_expires_at_ms)
          VALUES ($1,$2,0,$3,NULL,$4,$5,$6,$7,$8,$9,$10,1,$11,$12,2)`,
        [digest("a"), "x".repeat(43), "TEST_ONLY:lease", digest("b"), digest("c"), digest("d"),
          digest("e"), digest("f"), digest("1"), digest("2"), digest("3"), "TEST_ONLY:receiver"]);
        const original = (await db.query("SELECT * FROM execution_command_status_context_links")).rows;
        expect(original).toHaveLength(1);
        await expect(migrate({ ...options, direction: "down", count: 1 }))
          .rejects.toThrow("COMMAND_STATUS_CONTEXT_DOWN_REQUIRES_APPROVED_ARCHIVE");
        await expect(db.query("UPDATE execution_command_status_context_links SET lease_id='changed'"))
          .rejects.toThrow("COMMAND_STATUS_CONTEXT_LINK_IMMUTABLE");
        await expect(db.query("DELETE FROM execution_command_status_context_links"))
          .rejects.toThrow("COMMAND_STATUS_CONTEXT_LINK_IMMUTABLE");
        await expect(db.query("TRUNCATE execution_command_status_context_links"))
          .rejects.toThrow("COMMAND_STATUS_CONTEXT_LINK_IMMUTABLE");
        expect(await ledger()).toEqual([{ name: linkMigration }]);
        expect((await db.query("SELECT * FROM execution_command_status_context_links")).rows).toEqual(original);
      } finally {
        await db.end();
      }
    } finally {
      if (created) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
