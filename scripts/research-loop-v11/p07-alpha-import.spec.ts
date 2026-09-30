import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { Pool } from "../../apps/control-api/node_modules/pg";

import type { ControlApiConfig } from "../../apps/control-api/src/config";
import type { PortalUser } from "../../apps/control-api/src/domain";
import {
  type ResearchAlphaAnalysis,
} from "../../apps/control-api/src/research/alpha-import.contract";
import { ResearchAlphaImportController } from "../../apps/control-api/src/research/alpha-import.controller";
import { ResearchAlphaImportError } from "../../apps/control-api/src/research/alpha-import.error";
import { asResearchAlphaImportError, ResearchAlphaImportService } from "../../apps/control-api/src/research/alpha-import.service";
import type { ResearchAlphaAnalysisClient } from "../../apps/control-api/src/research/alpha-analysis.client";
import {
  type ResearchScope,
  ResearchMetadataError,
} from "../../apps/control-api/src/research/contracts";
import { ResearchMetadataRepository } from "../../apps/control-api/src/research/repository";
import { migrateTestDatabase, truncateAll } from "../../apps/control-api/test/harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const scopeA: ResearchScope = { workspaceId: "p07-workspace", actorUserId: "p07-user-a" };
const scopeB: ResearchScope = { workspaceId: "p07-workspace", actorUserId: "p07-user-b" };

const admin: PortalUser = {
  userId: scopeA.actorUserId,
  username: "p07-user-a",
  displayName: "P07 User A",
  role: "ADMIN",
  status: "ACTIVE",
  mustChangePassword: false,
  failedLoginCount: 0,
  lockedUntil: null,
  sessionVersion: 1,
  createdAt: new Date("2026-09-20T00:00:00.000Z"),
  updatedAt: new Date("2026-09-20T00:00:00.000Z"),
  disabledAt: null,
  accountRevision: 1,
  archivedAt: null,
};

const sha256 = (text: string) => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

function source(version = "0.3.0", marker = "baseline"): string {
  return `# ${marker}\nALPHA_CONTRACT = {"schema_version":"research.alpha-source.v1","version":"${version}","entrypoint":"generate_signals","timeframes":["1h"],"required_columns":["open","high","low","close","volume"],"warmup_bars":32,"determinism":{"seed_required":true},"parameter_space":{"window":{"kind":"int_range","low":8,"high":64,"step":1}}}\ndef generate_signals(context):\n    return context\n`;
}

function analysisFor(sourceText: string): ResearchAlphaAnalysis {
  const valid = !sourceText.includes("INVALID_CONTRACT");
  const version = sourceText.match(/"version":"([0-9]+[.][0-9]+[.][0-9]+)"/)?.[1] ?? "0.0.0";
  const declaredContract: Record<string, unknown> = valid
    ? {
        schema_version: "research.alpha-source.v1",
        version,
        entrypoint: "generate_signals",
        timeframes: ["1h"],
        required_columns: ["open", "high", "low", "close", "volume"],
        warmup_bars: 32,
        determinism: { seed_required: true },
        parameter_space: { window: { kind: "int_range", low: 8, high: 64, step: 1 } },
      }
    : {};
  const facts = {
    contract_complete: valid,
    contract_message: valid ? "Contract fields are complete." : "ALPHA_CONTRACT is missing required fields.",
    entrypoint_restricted_definition_load: valid,
    entrypoint_message: valid ? "Restricted-definition sandbox loaded the entrypoint without calling strategy code." : "SKIPPED because a prior gate failed.",
    parameter_space_sane: valid,
    parameter_message: valid ? "parameter_space is sane (1 declared parameters, maximum 12)." : "SKIPPED because a prior gate failed.",
    determinism_declared: valid,
    determinism_message: valid ? "determinism.seed_required is declared." : "SKIPPED because a prior gate failed.",
    data_contract_known: valid,
    data_contract_message: valid ? "Data contract is within the published P04 candle columns and interval syntax." : "SKIPPED because a prior gate failed.",
    no_lookahead_static_scan: valid,
    no_lookahead_message: valid
      ? "Static scan found no configured future-data heuristic. This is not a runtime causality certificate."
      : "SKIPPED because a prior gate failed; no causality claim is made.",
  };
  const mirror = [{ field: "entrypoint", state: valid ? "parsed" as const : "missing" as const, check: valid ? "VERIFY" as const : "GATED" as const, note: valid ? "Literal declaration parsed from the submitted source; validation is reported by the ordered gates." : "This field is not declared in the submitted source; no value has been inferred.", ...(valid ? { value: "generate_signals" } : {}) }];
  const sourceDigest = sha256(sourceText);
  return {
    schema_version: "research.alpha-analysis.v1",
    source_digest: sourceDigest,
    analysis_digest: sha256(JSON.stringify({ sourceDigest, declaredContract, facts })),
    parse_ok: valid,
    declared_contract: declaredContract,
    mirror,
    gate_facts: facts,
    // W4 CG-P07-04: measured, therefore outside analysis_digest.
    gate_timings_us: { parse: 40, contract_complete: 60, entrypoint_restricted_definition_load: 900, parameter_space_sane: 11, determinism_declared: 3, data_contract_known: 7, no_lookahead_static_scan: 1_500 },
  };
}

class DeterministicAnalysisClient {
  async analyze(_user: PortalUser, input: { sourceText: string }): Promise<ResearchAlphaAnalysis> {
    return analysisFor(input.sourceText);
  }
}

async function expectResearchError<T>(promise: Promise<T>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ResearchMetadataError);
    expect((error as ResearchMetadataError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ResearchMetadataError ${code}.`);
}

async function expectPostgresError<T>(promise: Promise<T>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

async function expectImportError<T>(promise: Promise<T>, code: ResearchAlphaImportError["code"]): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ResearchAlphaImportError);
    expect((error as ResearchAlphaImportError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ResearchAlphaImportError ${code}.`);
}

describe("Research Loop P07 · Alpha Registry, import and immutable binding", () => {
  let pool: Pool;
  let repository: ResearchMetadataRepository;
  let service: ResearchAlphaImportService;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    pool = new Pool({ connectionString: DATABASE_URL });
    repository = new ResearchMetadataRepository(pool);
    service = new ResearchAlphaImportService(
      repository,
      new DeterministicAnalysisClient() as unknown as ResearchAlphaAnalysisClient,
      {
        RESEARCH_ALPHA_IMPORT_TTL_SECONDS: 600,
        RESEARCH_ALPHA_IMPORT_MAXIMUM_ACTIVE_SOURCES_PER_ACTOR: 3,
      } as ControlApiConfig,
    );
  }, 60_000);

  afterEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function seedIdentity(): Promise<void> {
    await pool.query(
      `INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
       VALUES ($1, 'p07-user-a', 'P07 User A', 'ADMIN', 'ACTIVE', false),
              ($2, 'p07-user-b', 'P07 User B', 'USER', 'ACTIVE', false)`,
      [scopeA.actorUserId, scopeB.actorUserId],
    );
    await pool.query(
      `INSERT INTO workspaces (workspace_id, name, owner_user_id)
       VALUES ($1, 'P07 Workspace', $2)`,
      [scopeA.workspaceId, scopeA.actorUserId],
    );
    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'OWNER'), ($1, $3, 'MEMBER')`,
      [scopeA.workspaceId, scopeA.actorUserId, scopeB.actorUserId],
    );
  }

  async function parseAndGate(sourceText: string) {
    const parsed = await service.parse(admin, scopeA, { originalFilename: "alpha.py", sourceText }, "p07-request");
    const gates = await service.gates(admin, scopeA, parsed.source_file_ref, "p07-request");
    return { parsed, gates };
  }

  async function register(sourceText: string, alphaId = "p07-alpha") {
    const { parsed, gates } = await parseAndGate(sourceText);
    const result = await service.register(admin, scopeA, {
      sourceFileRef: parsed.source_file_ref,
      alphaId,
      gateReceiptId: gates.gate_receipt_id,
    }, "p07-request");
    return { parsed, gates, result };
  }

  it("P07-T01/T08/T12: binds one valid source, ordered gates and provenance to a DRAFT then ACTIVE version", async () => {
    await seedIdentity();
    const { parsed, gates, result } = await register(source());
    expect(parsed.schema_version).toBe("research.alpha-source.v1");
    expect(gates.schema_version).toBe("research.alpha-import-gates.v1");
    expect(parsed.expires_at_utc_ms).toBeGreaterThan(Date.now());
    expect(gates.expires_at_utc_ms).toBeGreaterThan(Date.now());
    expect(gates.expires_at_utc_ms).toBeLessThanOrEqual(parsed.expires_at_utc_ms);
    expect(parsed.mirror[0]).toMatchObject({ check: "VERIFY", state: "parsed" });
    expect(gates.all_pass).toBe(true);
    expect(gates.gates.map((gate) => gate.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(gates.gates.every((gate) => gate.state === "PASS")).toBe(true);
    // W4 CG-P07-04: parser gates carry the analyser's own time; gate 3 is timed here.
    expect(gates.gates.map((gate) => [gate.timing_source, gate.analyser_us])).toEqual([
      ["ANALYSER", 100], ["ANALYSER", 900], ["CONTROL_API", null], ["ANALYSER", 11],
      ["ANALYSER", 3], ["ANALYSER", 7], ["ANALYSER", 1500],
    ]);
    expect(gates.gates[6]!.ms).toBe(2);
    expect(gates.static_scan_disclosure).toBe("Static scan — runtime causality is proven per run at Stage 3/4.");
    expect(result).toMatchObject({ schema_version: "research.alpha-registration.v1", lifecycle_state: "DRAFT", replayed: false, alpha_id: "p07-alpha", may_activate: true, may_activate_reason: null });
    expect(result.supersedes).toBeNull();
    const runEnabled = new ResearchAlphaImportService(
      repository,
      new DeterministicAnalysisClient() as unknown as ResearchAlphaAnalysisClient,
      {
        FEATURE_RESEARCH_RUN_PRODUCER: "true",
        FEATURE_RESEARCH_IMPORTED_EXECUTION: "true",
      } as ControlApiConfig,
    );
    expect((await runEnabled.list(admin, scopeA))[0]?.run_admission).toEqual({
      may_create_run: true, code: null,
    });
    expect((await runEnabled.list({ ...admin, role: "USER" }, scopeA))[0]?.run_admission).toEqual({
      may_create_run: false, code: "RESEARCH_RUN_CREATE_FORBIDDEN",
    });

    const activated = await service.activate(admin, scopeA, {
      alphaVersionId: result.alpha_version_id,
      expectedAlphaRevision: result.alpha_revision,
    });
    expect(activated).toMatchObject({ schema_version: "research.alpha-activation.v1", lifecycle_state: "ACTIVE", replayed: false, alpha_revision: 2 });
    expect(await service.list(admin, scopeA)).toMatchObject([{
      alpha_id: "p07-alpha", alpha_version_id: result.alpha_version_id, lifecycle_state: "ACTIVE",
      display_name: "p07-alpha", strategy_id: "p07-alpha", source_digest: parsed.source_digest,
      source_digest_prefix: parsed.source_digest.slice(0, 12), may_activate: true, may_activate_reason: null,
      run_admission: { may_create_run: false, code: "RESEARCH_RUN_PRODUCER_UNAVAILABLE" },
      supersedes: null, supersedes_state: "RECORDED",
      declaration: {
        schema_version: "research.alpha-version-declaration.v1",
        entrypoint: "generate_signals", timeframes: ["1h"],
        required_columns: ["open", "high", "low", "close", "volume"], warmup_bars: 32,
        determinism: { seed_required: true },
        parameter_space: { window: { kind: "int_range", low: 8, high: 64, step: 1 } },
      },
    }]);
    const controller = new ResearchAlphaImportController(
      service,
      { isMember: async () => true } as never,
      {} as ControlApiConfig,
    );
    const listEnvelope = await controller.list({
      portalUser: admin,
      portalWorkspaceId: scopeA.workspaceId,
    } as never, {});
    expect(listEnvelope).toMatchObject({
      schema_version: "research.alpha-registry.v1",
      entries: [{
        alpha_version_id: result.alpha_version_id, lifecycle_state: "ACTIVE", may_activate: true,
        declaration: { schema_version: "research.alpha-version-declaration.v1" },
      }],
    });
    const provenance = await pool.query(
      `SELECT version.source_file_ref, version.code_digest, source.source_digest,
              version.declared_contract->>'entrypoint' AS entrypoint
         FROM research.alpha_versions version
         JOIN research.import_sources source
           ON source.workspace_id = version.workspace_id AND source.source_file_ref = version.source_file_ref
        WHERE version.workspace_id = $1 AND version.alpha_version_id = $2`,
      [scopeA.workspaceId, result.alpha_version_id],
    );
    expect(provenance.rows[0]).toMatchObject({ source_file_ref: parsed.source_file_ref, code_digest: parsed.source_digest, source_digest: parsed.source_digest, entrypoint: "generate_signals" });
  });

  it("P07 caller admission is server-derived and exactly mirrors activation enforcement", async () => {
    await seedIdentity();
    const member: PortalUser = { ...admin, userId: scopeB.actorUserId, username: "p07-user-b", role: "USER" };
    const parsed = await service.parse(member, scopeB, { originalFilename: "alpha.py", sourceText: source() }, "p07-request");
    const gates = await service.gates(member, scopeB, parsed.source_file_ref, "p07-request");
    const registered = await service.register(member, scopeB, {
      sourceFileRef: parsed.source_file_ref,
      alphaId: "p07-member-alpha",
      gateReceiptId: gates.gate_receipt_id,
    }, "p07-request");
    expect(registered.may_activate).toBe(false);
    expect(registered.may_activate_reason).toBe("ROLE_NOT_ADMIN");
    expect((await service.list(member, scopeB)).every((entry) =>
      entry.may_activate === false && entry.may_activate_reason === "ROLE_NOT_ADMIN")).toBe(true);
    await expectImportError(
      service.activate(member, scopeB, {
        alphaVersionId: registered.alpha_version_id,
        expectedAlphaRevision: registered.alpha_revision,
      }),
      "RESEARCH_ALPHA_IMPORT_ACTIVATION_FORBIDDEN",
    );
  });

  it("P07-T02/T03: a failed first gate skips later gates and never creates a provisional registration", async () => {
    await seedIdentity();
    const { parsed, gates } = await parseAndGate("INVALID_CONTRACT");
    expect(gates.gates[0]).toMatchObject({ state: "FAIL" });
    expect(gates.gates.slice(1).every((gate) => gate.state === "SKIPPED")).toBe(true);
    await expectImportError(
      service.register(admin, scopeA, { sourceFileRef: parsed.source_file_ref, alphaId: "p07-invalid", gateReceiptId: gates.gate_receipt_id }, "p07-request"),
      "RESEARCH_ALPHA_IMPORT_GATES_REQUIRED",
    );
    expect((await pool.query("SELECT count(*)::integer AS count FROM research.alpha_versions")).rows[0].count).toBe(0);
  });

  it("P07-T04/T05/T09/T10: exact source custody is immutable, actor-scoped and cannot accept a crafted stale contract", async () => {
    await seedIdentity();
    const { parsed, gates } = await parseAndGate(source());
    await expectPostgresError(
      pool.query(
        `UPDATE research.import_sources SET source_bytes = $3
          WHERE workspace_id = $1 AND source_file_ref = $2`,
        [scopeA.workspaceId, parsed.source_file_ref, Buffer.from(source("0.3.1"))],
      ),
      "55000",
    );
    await expectResearchError(repository.loadAlphaImportSource(scopeB, parsed.source_file_ref), "RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND");
    const changed = await service.parse(admin, scopeA, { originalFilename: "alpha.py", sourceText: source("0.3.1", "changed") }, "p07-request");
    await expectResearchError(
      repository.registerImportedAlphaVersion(scopeA, {
        alphaId: "p07-crafted", name: "p07-crafted", executionSubjectId: "research:p07-crafted",
        alphaVersionId: "av_p07_crafted_0_3_1", sourceFileRef: changed.source_file_ref,
        sourceDigest: changed.source_digest, analysisDigest: changed.analysis_digest,
        gateReceiptId: gates.gate_receipt_id, entrypoint: "crafted", dependencyRef: "forbidden",
        versionLabel: "av_0_3_1", declaredContract: { crafted: true },
      }),
      "RESEARCH_ALPHA_IMPORT_GATES_REQUIRED",
    );
  });

  it("P07-T06/T11: exact-digest idempotency and activation CAS preserve one correct active version", async () => {
    await seedIdentity();
    const first = await register(source());
    const replay = await service.register(admin, scopeA, {
      sourceFileRef: first.parsed.source_file_ref, alphaId: "p07-alpha", gateReceiptId: first.gates.gate_receipt_id,
    }, "p07-request");
    expect(replay.replayed).toBe(true);
    const duplicateGateRun = await service.gates(admin, scopeA, first.parsed.source_file_ref, "p07-request");
    expect(duplicateGateRun.gates[2]).toMatchObject({ n: 3, state: "FAIL" });
    expect(duplicateGateRun.gates[2]).toMatchObject({ quarantine_code: "QUARANTINED_DIGEST_ALREADY_REGISTERED" });
    expect(duplicateGateRun.gates.slice(3).every((gate) => gate.state === "SKIPPED")).toBe(true);

    const sameVersionDifferentBytes = await register(source("0.3.0", "different-bytes"), "p07-alpha").catch((error: unknown) => error);
    expect(sameVersionDifferentBytes).toMatchObject({ code: "RESEARCH_IMMUTABLE_ALPHA_VERSION_CONFLICT" });

    const attempts = await Promise.allSettled([
      service.activate(admin, scopeA, { alphaVersionId: first.result.alpha_version_id, expectedAlphaRevision: first.result.alpha_revision }),
      service.activate(admin, scopeA, { alphaVersionId: first.result.alpha_version_id, expectedAlphaRevision: first.result.alpha_revision }),
    ]);
    expect(attempts.some((attempt) => attempt.status === "fulfilled")).toBe(true);
    const active = await pool.query(
      `SELECT active_version_id, revision FROM research.alphas WHERE workspace_id = $1 AND alpha_id = 'p07-alpha'`,
      [scopeA.workspaceId],
    );
    expect(active.rows[0]).toMatchObject({ active_version_id: first.result.alpha_version_id, revision: "2" });
    const activeReplay = await service.register(admin, scopeA, {
      sourceFileRef: first.parsed.source_file_ref, alphaId: "p07-alpha", gateReceiptId: first.gates.gate_receipt_id,
    }, "p07-request");
    expect(activeReplay).toMatchObject({
      alpha_version_id: first.result.alpha_version_id, replayed: true,
      supersedes: null, alpha_revision: 2,
    });
    expect((await pool.query(
      `SELECT count(*)::integer AS count FROM research.alpha_versions WHERE workspace_id = $1 AND alpha_id = $2`,
      [scopeA.workspaceId, "p07-alpha"],
    )).rows[0]?.count).toBe(1);
  });

  it("V11-P07-DR: expiry cleanup is bounded, actor-owned and needs no UPDATE on immutable bytes", async () => {
    await seedIdentity();
    const expiredRef = "p07-expired-source";
    await pool.query(
      `INSERT INTO research.import_sources
         (workspace_id, source_file_ref, actor_user_id, original_filename, source_bytes,
          source_digest, source_schema_version, analysis_digest, declared_contract, parsed_mirror,
          created_at, expires_at)
       VALUES ($1, $2, $3, 'expired.py', $4, $5, 'research.alpha-source.v1', $6, '{}'::jsonb, '[]'::jsonb,
               now() - interval '2 seconds', now() - interval '1 second')`,
      [scopeA.workspaceId, expiredRef, scopeA.actorUserId, Buffer.from("expired", "utf8"), "e".repeat(64), "f".repeat(64)],
    );
    await pool.query(
      `INSERT INTO research.import_sessions
         (workspace_id, import_session_id, actor_user_id, source_file_ref, source_digest,
          source_analysis_digest, validation_version, gate_results, expires_at)
       VALUES ($1, 'p07-expired-receipt', $2, $3, $4, $5, 'research.alpha-import-gates.v1', '{"all_pass":false}'::jsonb, now() - interval '1 second')`,
      [scopeA.workspaceId, scopeA.actorUserId, expiredRef, "e".repeat(64), "f".repeat(64)],
    );
    const runtime = await pool.connect();
    try {
      await runtime.query("BEGIN");
      await runtime.query("SET LOCAL ROLE portal_research_runtime");
      await expectPostgresError(
        runtime.query("UPDATE research.import_sources SET original_filename = original_filename"),
        "42501",
      );
      await runtime.query("ROLLBACK");
    } finally {
      runtime.release();
    }
    expect(await repository.cleanupExpiredUnboundAlphaImportSources(scopeA, 1)).toEqual({ deletedSources: 1, deletedReceipts: 1 });
    expect((await pool.query("SELECT count(*)::integer AS count FROM research.import_sources")).rows[0].count).toBe(0);
    expect((await pool.query("SELECT count(*)::integer AS count FROM research.import_sessions")).rows[0].count).toBe(0);
  });

  it("P07 resource closeout: an actor cannot accumulate more temporary source bytes than the configured admission cap", async () => {
    await seedIdentity();
    for (const marker of ["admission-one", "admission-two", "admission-three"]) {
      await service.parse(admin, scopeA, {
        originalFilename: "alpha.py",
        sourceText: source("0.3.0", marker),
      }, "p07-request");
    }
    await expectResearchError(
      service.parse(admin, scopeA, {
        originalFilename: "alpha.py",
        sourceText: source("0.3.0", "admission-four"),
      }, "p07-request"),
      "RESEARCH_ADMISSION_SATURATED",
    );
    expect((await pool.query(
      `SELECT count(*)::integer AS count FROM research.import_sources
        WHERE workspace_id = $1 AND actor_user_id = $2`,
      [scopeA.workspaceId, scopeA.actorUserId],
    )).rows[0].count).toBe(3);
  });

  it("P07 public error vocabulary: repository admission and immutable-version conflicts are never leaked as generic metadata codes", () => {
    for (const [sourceCode, expectedCode, status] of [
      ["RESEARCH_ADMISSION_SATURATED", "RESEARCH_ALPHA_IMPORT_ADMISSION_SATURATED", 503],
      ["RESEARCH_IMMUTABLE_ALPHA_VERSION_CONFLICT", "RESEARCH_ALPHA_IMPORT_VERSION_CONFLICT", 409],
    ] as const) {
      try {
        asResearchAlphaImportError(new ResearchMetadataError(sourceCode, "bounded test error", status));
      } catch (error) {
        expect(error).toBeInstanceOf(ResearchAlphaImportError);
        expect(error).toMatchObject({ code: expectedCode, status });
        continue;
      }
      throw new Error(`Expected ${sourceCode} to map to the P07 public error vocabulary.`);
    }
  });

  it("P07-T07: activating a new version never changes a previously pinned run/attempt binding", async () => {
    await seedIdentity();
    const first = await register(source());
    const firstActive = await service.activate(admin, scopeA, {
      alphaVersionId: first.result.alpha_version_id, expectedAlphaRevision: first.result.alpha_revision,
    });
    await repository.createOrReplayAttempt(scopeA, {
      attemptId: "p07-attempt-old", runId: "p07-run-old", clientIntentId: "p07-old-intent",
      requestPayloadDigest: "a".repeat(64), intentKind: "NEW", alphaVersionId: first.result.alpha_version_id,
      requestSpecDigest: "b".repeat(64), effectiveSpecDigest: "c".repeat(64),
      engineReleaseId: "quantbt-1.1.1", datasetBindingDigest: "d".repeat(64),
    });
    const second = await register(source("0.3.1", "version-two"));
    expect(second.result.supersedes).toBe(first.result.alpha_version_id);
    await service.activate(admin, scopeA, {
      alphaVersionId: second.result.alpha_version_id, expectedAlphaRevision: second.result.alpha_revision,
    });
    const replay = await service.register(admin, scopeA, {
      sourceFileRef: first.parsed.source_file_ref, alphaId: "p07-alpha", gateReceiptId: first.gates.gate_receipt_id,
    }, "p07-request");
    expect(replay).toMatchObject({ replayed: true, supersedes: null });
    const registry = await service.list(admin, scopeA, "p07-alpha");
    expect(registry.find((entry) => entry.alpha_version_id === second.result.alpha_version_id)).toMatchObject({
      supersedes: first.result.alpha_version_id, supersedes_state: "RECORDED",
    });
    expect(registry.find((entry) => entry.alpha_version_id === first.result.alpha_version_id)).toMatchObject({
      supersedes: null, supersedes_state: "RECORDED",
    });
    expect(firstActive.alpha_revision).toBe(2);
    const oldAttempt = await pool.query(
      `SELECT alpha_version_id FROM research.attempts WHERE workspace_id = $1 AND attempt_id = 'p07-attempt-old'`,
      [scopeA.workspaceId],
    );
    expect(oldAttempt.rows[0]?.alpha_version_id).toBe(first.result.alpha_version_id);
  });
});
