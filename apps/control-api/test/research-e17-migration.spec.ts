import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
  IMPORTED_ALPHA_ADAPTER_ID,
  IMPORTED_ALPHA_PROFILE_DIGEST,
  IMPORTED_ALPHA_PROFILE_ID,
} from "../src/research/imported-alpha.profile";
import { migrateTestDatabase } from "./harness";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = "portal_e17_" + randomUUID().replaceAll("-", "");
const urlFor = (name: string) => {
  const url = new URL(baseUrl);
  url.pathname = "/" + name;
  return url.toString();
};

describe("E17 imported adapter migration on disposable PostgreSQL", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: urlFor("postgres") });
    try {
      await admin.query("CREATE DATABASE " + databaseName);
    } finally {
      await admin.end();
    }
    await migrateTestDatabase(urlFor(databaseName));
  }, 120_000);

  afterAll(async () => {
    const admin = new Pool({ connectionString: urlFor("postgres") });
    try {
      await admin.query("DROP DATABASE IF EXISTS " + databaseName + " WITH (FORCE)");
    } finally {
      await admin.end();
    }
  });

  it("admits only the exact imported adapter/profile pair and preserves P04", async () => {
    const database = new Pool({ connectionString: urlFor(databaseName) });
    const client = await database.connect();
    try {
      await client.query("SET session_replication_role = replica");
      await expect(client.query(
        `INSERT INTO research.execution_adapter_bindings
           (workspace_id, alpha_version_id, adapter_id, contract_digest, installed_by_user_id)
         VALUES ('ws_e17', 'av_e17', $1, $2, 'usr_e17')`,
        [IMPORTED_ALPHA_ADAPTER_ID, IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST],
      )).resolves.toMatchObject({ rowCount: 1 });
      await expect(client.query(
        `INSERT INTO research.execution_adapter_bindings
           (workspace_id, alpha_version_id, adapter_id, contract_digest, installed_by_user_id)
         VALUES ('ws_e17', 'av_bad', 'p17.generic-python.v1', $1, 'usr_e17')`,
        [IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST],
      )).rejects.toMatchObject({ code: "23514" });

      await expect(client.query(
        `INSERT INTO research.execution_adapter_bindings
           (workspace_id, alpha_version_id, adapter_id, contract_digest, installed_by_user_id)
         VALUES ('ws_e17', 'av_bad_digest', $1, $2, 'usr_e17')`,
        [IMPORTED_ALPHA_ADAPTER_ID, "0".repeat(64)],
      )).rejects.toMatchObject({ code: "23514" });

      const insertProducer = (runId: string, adapterId: string, profileId: string, profileDigest: string | null) =>
        client.query(
          `INSERT INTO research.run_producers
             (workspace_id, run_id, attempt_id, job_id, actor_user_id, client_intent_id,
              intent_kind, preflight_token, alpha_id, alpha_version_id,
              execution_adapter_id, adapter_contract_digest, requested_spec_digest,
              effective_spec_digest, dataset_binding_digest, manifest_digest, snapshot_id,
              snapshot_content_hash, work_digest, legacy_request, execution_profile_id,
              execution_profile_digest)
           VALUES ('ws_e17', $1, 'att_' || $1, 'job_' || $1, 'usr_e17',
              'intent-' || $1, 'NEW', 'rpft_' || $1, 'alpha_e17', 'av_e17',
              $2, $3, repeat('1',64), repeat('2',64), repeat('3',64), repeat('4',64),
              'dss_0123456789abcdef0123456789abcdef', repeat('5',64), repeat('6',64),
              '{}'::jsonb, $4, $5)`,
          [runId, adapterId, IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST, profileId, profileDigest],
        );

      await expect(insertProducer(
        "rrun_e17_ok",
        IMPORTED_ALPHA_ADAPTER_ID,
        IMPORTED_ALPHA_PROFILE_ID,
        IMPORTED_ALPHA_PROFILE_DIGEST,
      )).resolves.toMatchObject({ rowCount: 1 });
      await expect(insertProducer(
        "rrun_e17_bad_pair",
        IMPORTED_ALPHA_ADAPTER_ID,
        "p04.fixed-qualification.v1",
        null,
      )).rejects.toMatchObject({ code: "23514" });
      await expect(insertProducer(
        "rrun_e17_bad_digest",
        IMPORTED_ALPHA_ADAPTER_ID,
        IMPORTED_ALPHA_PROFILE_ID,
        "0".repeat(64),
      )).rejects.toMatchObject({ code: "23514" });
      // PostgreSQL CHECK treats SQL UNKNOWN as success. Every non-P04
      // profile must explicitly reject NULL, not just compare its digest.
      for (const [index, profileId] of [
        "p10.delta-signal-notional-wfo.v1", "p16.delta-whatif-grid.v1", IMPORTED_ALPHA_PROFILE_ID,
      ].entries()) {
        await expect(insertProducer(
          `rrun_e17_null_digest_${index}`,
          profileId === IMPORTED_ALPHA_PROFILE_ID ? IMPORTED_ALPHA_ADAPTER_ID : "p04.delta-rsi.v1",
          profileId,
          null,
        )).rejects.toMatchObject({ code: "23514" });
      }
      await client.query("SET session_replication_role = origin");
    } finally {
      await client.query("SET session_replication_role = origin").catch(() => undefined);
      client.release();
      await database.end();
    }
  });
});
