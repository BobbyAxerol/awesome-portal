/** Migration 156 is intentionally irreversible without an approved archive.
 * Exercise the actual migration runner on a separate DB inside the official
 * disposable test cell; never fall back to a host/default database. */
import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runner as migrate } from "node-pg-migrate";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const testUrl = process.env.TEST_DATABASE_URL;
const migration = "1723680000156_execution-command-status-delivery-acks";

describe.skipIf(!testUrl)("command STATUS ACK migration rollback guard", () => {
  it("refuses down on empty and populated custody without losing the ledger, exact ACK or immutable trigger", async () => {
    const target = new URL(testUrl!);
    if (!/^control-api-test-postgres-[a-zA-Z0-9_-]+$/u.test(target.hostname) ||
        target.pathname !== "/portal_control_test") {
      throw new Error("COMMAND_STATUS_MIGRATION_DISPOSABLE_CELL_REQUIRED");
    }
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
});
