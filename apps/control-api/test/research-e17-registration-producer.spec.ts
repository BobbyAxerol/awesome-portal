/** E17 database custody proof. The analyser and private dispatch are test doubles;
 * registration, DRAFT binding, admission, leases and producer writes are real.
 * This is not a QuantBT/product-preview receipt. */
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import type { ResearchAlphaAnalysis } from "../src/research/alpha-import.contract";
import { ResearchAlphaImportService } from "../src/research/alpha-import.service";
import { ResearchMetadataRepository } from "../src/research/repository";
import { ResearchRunAdmissionService } from "../src/research/run-admission.service";
import { ResearchRunCreateService } from "../src/research/run-create.service";
import { ResearchSplitRepository } from "../src/research/split.repository";
import { IMPORTED_ALPHA_ADAPTER_ID, IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
  IMPORTED_ALPHA_PROFILE_ID, IMPORTED_ALPHA_PROFILE_DIGEST } from "../src/research/imported-alpha.profile";
import { migrateTestDatabase } from "./harness";
import { manifestFor, p04Requested, w1Admin } from "./research-w1-wfo.fixture";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = "portal_e17_custody_" + randomUUID().replaceAll("-", "");
const databaseUrl = (name: string) => { const url = new URL(baseUrl); url.pathname = "/" + name; return url.toString(); };
const scope = { workspaceId: "ws_e17_custody", actorUserId: "usr_e17_custody" };
const owner = { ...w1Admin, userId: scope.actorUserId };
const config = {
  FEATURE_RESEARCH_RUN_PRODUCER: "true", FEATURE_RESEARCH_IMPORTED_EXECUTION: "true",
  FEATURE_RESEARCH_WFO_PROFILE: "false", RESEARCH_RUN_PRODUCER_LEASE_SECONDS: 15,
  RESEARCH_ALPHA_IMPORT_TTL_SECONDS: 600, RESEARCH_ALPHA_IMPORT_MAXIMUM_ACTIVE_SOURCES_PER_ACTOR: 3,
} as never;
const declaration = {
  schema_version: "research.alpha-source.v1", version: "0.3.0", entrypoint: "generate_signals",
  timeframes: ["1h"], required_columns: ["open", "high", "low", "close", "volume"], warmup_bars: 32,
  determinism: { seed_required: true },
  parameter_space: { window: { kind: "int_range", low: 8, high: 64, step: 1 } },
};
const sourceText = "ALPHA_CONTRACT = " + JSON.stringify(declaration).replace(":true", ":True")
  + "\ndef generate_signals(context):\n    return []\n";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const analysis: ResearchAlphaAnalysis = {
  schema_version: "research.alpha-analysis.v1", source_digest: hash(sourceText),
  analysis_digest: hash(JSON.stringify(declaration)), parse_ok: true,
  declared_contract: declaration,
  mirror: [{ field: "entrypoint", state: "parsed", check: "VERIFY", note: "Test analyser literal fact.", value: "generate_signals" }],
  gate_facts: {
    contract_complete: true, contract_message: "Contract present.",
    entrypoint_restricted_definition_load: true, entrypoint_message: "Definition present.",
    parameter_space_sane: true, parameter_message: "Declared domain.",
    determinism_declared: true, determinism_message: "Seed declared.",
    data_contract_known: true, data_contract_message: "OHLCV contract.",
    no_lookahead_static_scan: true, no_lookahead_message: "Static scan only, not runtime causality.",
  },
  gate_timings_us: { parse: 1, contract_complete: 1, entrypoint_restricted_definition_load: 1,
    parameter_space_sane: 1, determinism_declared: 1, data_contract_known: 1, no_lookahead_static_scan: 1 },
};

describe("E17 DRAFT registration to durable producer on real PostgreSQL", () => {
  let database: Pool;
  beforeAll(async () => {
    const admin = new Pool({ connectionString: databaseUrl("postgres") });
    try { await admin.query("CREATE DATABASE " + databaseName); } finally { await admin.end(); }
    await migrateTestDatabase(databaseUrl(databaseName));
    database = new Pool({ connectionString: databaseUrl(databaseName) });
    await database.query(`INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
      VALUES ($1, 'e17-custody-owner', 'E17 test owner', 'ADMIN', 'ACTIVE', false)`, [scope.actorUserId]);
    await database.query(`INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ($1, 'E17 custody', $2)`,
      [scope.workspaceId, scope.actorUserId]);
    await database.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [scope.workspaceId, scope.actorUserId]);
  }, 120_000);
  afterAll(async () => {
    await database?.end();
    const admin = new Pool({ connectionString: databaseUrl("postgres") });
    try { await admin.query("DROP DATABASE IF EXISTS " + databaseName + " WITH (FORCE)"); } finally { await admin.end(); }
  });

  it("registers and replays one exact DRAFT binding, then admits a producer without activation", async () => {
    const repository = new ResearchMetadataRepository(database);
    const service = new ResearchAlphaImportService(repository, { analyze: async () => analysis } as never, config);
    const parsed = await service.parse(owner, scope, { originalFilename: "alpha.py", sourceText }, "e17-custody");
    const gates = await service.gates(owner, scope, parsed.source_file_ref, "e17-custody");
    expect(gates.all_pass).toBe(true);
    const registration = { sourceFileRef: parsed.source_file_ref, alphaId: "e17-custody-alpha", gateReceiptId: gates.gate_receipt_id };
    const first = await service.register(owner, scope, registration, "e17-custody");
    const replay = await service.register(owner, scope, registration, "e17-custody");
    expect(first.lifecycle_state).toBe("DRAFT");
    expect(replay.replayed).toBe(true);
    const binding = await repository.loadRunAdapterEligibility(scope, first.alpha_id, first.alpha_version_id);
    expect(binding).toMatchObject({ lifecycleState: "DRAFT", sourceDigest: hash(sourceText), binding: {
      adapterId: IMPORTED_ALPHA_ADAPTER_ID, contractDigest: IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
    } });
    expect((await database.query(`SELECT count(*)::int AS n FROM research.execution_adapter_bindings
      WHERE workspace_id = $1 AND alpha_version_id = $2`, [scope.workspaceId, first.alpha_version_id])).rows[0].n).toBe(1);

    const spec = p04Requested({
      alpha_binding: { alpha_id: first.alpha_id, alpha_version_id: first.alpha_version_id },
      strategy_id: first.alpha_id, random_seed: 7,
      parameter_space_overrides: [{ name: "window", kind: "pin", value: 32 }],
    });
    const manifest = manifestFor(spec, { token: "rpft_e17_custody" });
    await repository.storePreflightManifest(scope, { ...manifest, expiresAt: new Date(Date.now() + 60_000) }, 4);
    const proxy = { handleWrite: async (input: { body: string; idempotencyKey: string }) => ({
      status: 202, body: { run_id: JSON.parse(input.body).run_id }, idempotencyKey: input.idempotencyKey, replayed: false,
    }) };
    const created = await new ResearchRunCreateService(repository, new ResearchRunAdmissionService(repository, config), proxy as never, config)
      .create(owner, scope, { schema_version: "research.run-create.v1", client_intent_id: "e17-custody-create",
        preflight_token: manifest.preflightToken, requested_spec: spec, intent_kind: "NEW" }, "e17-custody");
    const stored = (await database.query(`SELECT execution_adapter_id, adapter_contract_digest,
      execution_profile_id, execution_profile_digest, legacy_request FROM research.run_producers
      WHERE workspace_id = $1 AND run_id = $2`, [scope.workspaceId, created.run_id])).rows[0];
    expect(stored).toMatchObject({ execution_adapter_id: IMPORTED_ALPHA_ADAPTER_ID,
      adapter_contract_digest: IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
      execution_profile_id: IMPORTED_ALPHA_PROFILE_ID, execution_profile_digest: IMPORTED_ALPHA_PROFILE_DIGEST });
    expect(JSON.stringify(stored.legacy_request)).not.toContain(sourceText);
    expect(JSON.stringify(stored.legacy_request)).not.toContain(parsed.source_file_ref);
    const split = await new ResearchSplitRepository(database).hub(scope, created.run_id);
    expect(split?.importedAlphaVersion).toMatchObject({ alphaVersionId: first.alpha_version_id,
      sourceDigest: hash(sourceText), entrypoint: "generate_signals", declaredContract: declaration });
    expect((await repository.loadRunAdapterEligibility(scope, first.alpha_id, first.alpha_version_id))?.lifecycleState).toBe("DRAFT");
  });
});
