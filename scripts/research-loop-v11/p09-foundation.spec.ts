import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../apps/control-api/src/config";
import type { PortalUser } from "../../apps/control-api/src/domain";
import { ResearchFoundationAtlasClient } from "../../apps/control-api/src/research/foundation.client";
import {
  ResearchEngineAtlasPrivateSchema,
  ResearchJourneyQuerySchema,
  type ResearchEngineAtlasPrivate,
} from "../../apps/control-api/src/research/foundation.contract";
import { ResearchFoundationError } from "../../apps/control-api/src/research/foundation.error";
import { ResearchFoundationService } from "../../apps/control-api/src/research/foundation.service";
import {
  RESEARCH_JOURNEY_DESCRIPTOR_SHA256,
} from "../../apps/control-api/src/research/journey.descriptor";
import { ResearchMetadataRepository } from "../../apps/control-api/src/research/repository";
import { migrateTestDatabase, truncateAll } from "../../apps/control-api/test/harness";
import { Pool } from "../../apps/control-api/node_modules/pg";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for P09.");

const scope = { workspaceId: "p09-workspace", actorUserId: "p09-user-a" };
const user: PortalUser = {
  userId: scope.actorUserId, username: "p09-user-a", displayName: "P09 User A", role: "ADMIN",
  status: "ACTIVE", mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  disabledAt: null, accountRevision: 1, archivedAt: null,
};

function atlasFixture(): ResearchEngineAtlasPrivate {
  const catalog = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "apps", "portal", "registry", "research-engine-catalog.v1.json"), "utf8")) as {
    manifest_revision: number;
    releases: Array<Record<string, unknown>>;
    routes: Array<Record<string, unknown>>;
    modes: Array<Record<string, unknown>>;
    claims: Array<Record<string, unknown>>;
    evidence_contract: Record<string, unknown>;
  };
  const current = catalog.releases.find((release) => release.role === "current")!;
  return {
    schema_version: "research-engine-atlas.v1",
    manifest_revision: catalog.manifest_revision,
    current_release: {
      release_id: current.release_id as string, package: current.package as string,
      expected_version: current.version as string, installed_version: current.version as string,
      native_package: (current.native_dependency as { package?: string } | undefined)?.package ?? null,
      native_expected_version: (current.native_dependency as { version?: string } | undefined)?.version ?? null,
      native_installed_version: (current.native_dependency as { version?: string } | undefined)?.version ?? null,
      verified: true, detail: null,
      trial_ceiling: current.trial_ceiling as number,
      optimizer_defaults: current.optimizer_defaults as ResearchEngineAtlasPrivate["current_release"]["optimizer_defaults"],
      submission_constraints: current.submission_constraints as ResearchEngineAtlasPrivate["current_release"]["submission_constraints"],
      walk_forward_options: current.walk_forward_options as ResearchEngineAtlasPrivate["current_release"]["walk_forward_options"],
    },
    historical_releases: catalog.releases.filter((release) => release.role === "historical_reader").map((release) => ({
      release_id: release.release_id as string, package: release.package as string,
      version: release.version as string, status: "HISTORICAL_IDENTITY_RETAINED" as const,
    })),
    routes: catalog.routes.map(({ factory: _factory, factory_kwargs: _factoryKwargs, ...route }) => route) as ResearchEngineAtlasPrivate["routes"],
    modes: catalog.modes as ResearchEngineAtlasPrivate["modes"],
    claims: catalog.claims,
    evidence_contract: catalog.evidence_contract,
  };
}

describe("Research Loop P09 · Journey/Atlas same-origin foundation", () => {
  let pool: Pool;
  let repository: ResearchMetadataRepository;
  const atlas = atlasFixture();
  const atlasClient = { read: vi.fn(async () => atlas) } as unknown as ResearchFoundationAtlasClient;
  let service: ResearchFoundationService;

  beforeAll(async () => {
    await migrateTestDatabase(databaseUrl);
    pool = new Pool({ connectionString: databaseUrl });
    repository = new ResearchMetadataRepository(pool);
    service = new ResearchFoundationService(repository, atlasClient);
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await pool.query(
      `INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
       VALUES ($1, 'p09-user-a', 'P09 User A', 'ADMIN', 'ACTIVE', false),
              ($2, 'p09-user-b', 'P09 User B', 'USER', 'ACTIVE', false)`,
      [scope.actorUserId, "p09-user-b"],
    );
    await pool.query(
      `INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ($1, 'P09 Workspace', $2)`,
      [scope.workspaceId, scope.actorUserId],
    );
    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER'), ($1, $3, 'MEMBER')`,
      [scope.workspaceId, scope.actorUserId, "p09-user-b"],
    );
    vi.clearAllMocks();
  });

  afterAll(async () => { await pool.end(); });

  it("P09-T01/T02/T10: pins immutable descriptor revision, ETag and canonical P02 inspection aliases", async () => {
    const response = await service.journey(scope, {
      run_id: "run-p09", study: "study-p09", trial: "trial-p09", pick: "pick-p09", seq: "42", event_seq: "42",
    });
    expect(response).toMatchObject({
      schema_version: "research.journey-response.v1",
      descriptor: { revision: 1, content_sha256: RESEARCH_JOURNEY_DESCRIPTOR_SHA256 },
      inspection: {
        canonical_query: "?run_id=run-p09&study=study-p09&trial=trial-p09&pick=pick-p09&seq=42",
        pick_effect: "INSPECTION_ONLY", ambiguity_state: "NOT_APPLICABLE",
      },
    });
    expect(response.inspection.cursor).not.toHaveProperty("event_seq");
    expect(response.inspection.codec).toBe("p02-cursor.v2");
    expect(response.etag).toMatch(/^W\/"research-journey-[0-9a-f]{24}"$/);

    // RF01-B4: the journey read accepts `stage` and hands it back first in the
    // canonical query, beside opaque (non-numeric) fold/trial identifiers.
    const staged = await service.journey(scope, { stage: "freeze", fold: "wf-3", study: "s-1", trial: "t-0042" });
    expect(staged.inspection).toMatchObject({
      cursor: { stage: "freeze", fold: "wf-3", study: "s-1", trial: "t-0042" },
      canonical_query: "?stage=freeze&fold=wf-3&study=s-1&trial=t-0042",
      codec: "p02-cursor.v2",
    });
    expect(staged.etag).not.toBe(response.etag);
    expect(ResearchJourneyQuerySchema.safeParse({ stage: "deploy" }).success).toBe(false);
    expect(ResearchJourneyQuerySchema.safeParse({ stage: "atlas", fold: "3" }).success).toBe(true);
    expect((await pool.query(`SELECT count(*)::integer AS count FROM research.audit_log`)).rows[0].count).toBe(0);
  });

  it("P09-T02/T09: rejects divergent aliases and a known ambiguous trial without guessing study", async () => {
    await pool.query(
      `INSERT INTO research.attempts
         (workspace_id, attempt_id, client_intent_id, request_payload_digest, intent_kind, state, created_by_user_id)
       VALUES ($1, 'p09-attempt', 'p09-intent', $2, 'NEW', 'DRAFT', $3)`,
      [scope.workspaceId, "a".repeat(64), scope.actorUserId],
    );
    await pool.query(
      `INSERT INTO research.runs
         (workspace_id, run_id, attempt_id, run_kind, relationship_kind, logical_run_key,
          request_spec_digest, effective_spec_digest, engine_release_id, dataset_binding_digest, state, submitted_by_user_id)
       VALUES ($1, 'run-ambiguous', 'p09-attempt', 'PRIMARY', 'PRIMARY', 'p09-primary',
               $2, $3, 'quantbt-1.1.1', $4, 'DRAFT', $5)`,
      [scope.workspaceId, "b".repeat(64), "c".repeat(64), "d".repeat(64), scope.actorUserId],
    );
    await pool.query(
      `INSERT INTO research.studies (workspace_id, study_id, run_id, engine_study_key, purpose, source_stage, source_schedule)
       VALUES ($1, 'study-a', 'run-ambiguous', 'engine-a', 'SEARCH', 'P09', 'global'),
              ($1, 'study-b', 'run-ambiguous', 'engine-b', 'SEARCH', 'P09', 'global')`,
      [scope.workspaceId],
    );
    await pool.query(
      `INSERT INTO research.trial_index
       (workspace_id, study_id, run_id, trial_id, trial_ordinal, execution_status, feasibility_state, params, objective_defined)
       VALUES ($1, 'study-a', 'run-ambiguous', 'trial-1', 1, 'COMPLETE', 'UNKNOWN', '{}'::jsonb, false),
              ($1, 'study-b', 'run-ambiguous', 'trial-1', 2, 'COMPLETE', 'UNKNOWN', '{}'::jsonb, false)`,
      [scope.workspaceId],
    );
    await expect(service.journey(scope, { run_id: "run-ambiguous", trial: "trial-1" })).rejects.toMatchObject({
      code: "RESEARCH_FOUNDATION_CURSOR_STUDY_REQUIRED",
    } satisfies Partial<ResearchFoundationError>);
    await expect(service.journey(scope, { seq: "1", event_seq: "2" })).rejects.toMatchObject({
      code: "RESEARCH_FOUNDATION_INVALID",
    } satisfies Partial<ResearchFoundationError>);
    const unresolved = await service.journey(scope, { trial: "trial-unknown-context" });
    expect(unresolved.inspection.ambiguity_state).toBe("UNRESOLVED_NO_RUN_CONTEXT");
  });

  it("P09-T03/T04: selects only a manifest current/historical release and exact route/mode", async () => {
    const historical = atlas.historical_releases[0]!;
    const response = await service.atlas(user, {
      release_id: historical.release_id, route: atlas.routes[0]!.route_id, mode: atlas.modes[0]!.mode_id,
    });
    expect(response).toMatchObject({ selected_release_id: historical.release_id, selected_release_kind: "HISTORICAL" });

    // RF02-B1: per mode × schedule facts cross the BFF intact, and the
    // private-document boundary accepts the null-bearing shape Python's
    // model_dump emits (unset optional fields arrive as null, not absent).
    const mode4 = response.atlas.modes.find((mode) => mode.mode_id === "mode_4_is_only_robust")!;
    expect(mode4.facts?.schedules.map((fact) => fact.schedule)).toEqual(["global", "per_fold_causal"]);
    expect(mode4.facts?.schedules[1]).toMatchObject({
      chronological_validation_claim: "strict_outer_oos_after_frozen_selection",
      oos_use: "NOT_USED",
      cert_cap: { state: "NOT_PUBLISHED" },
    });
    expect(mode4.facts?.avoid_when.state).toBe("NOT_PUBLISHED");
    // RF02-B2: the walk-forward values S02 may offer come through the same read.
    const options = response.atlas.current_release.walk_forward_options!;
    expect(options.window_mode.filter((item) => item.admission === "ADMITTED").map((item) => item.value)).toEqual(["expanding"]);
    expect(options.window_mode.find((item) => item.value === "rolling")?.admission).toBe("NOT_ADMITTED");
    expect(options.frequency_default).toBe("quarterly");
    const dumped = JSON.parse(JSON.stringify(atlasFixture())) as { modes: Array<{ facts: Record<string, any> }> };
    for (const mode of dumped.modes) {
      mode.facts.avoid_when.source = null;
      for (const fact of mode.facts.schedules) fact.oos_use_condition ??= null;
      mode.facts.objective.note ??= null;
    }
    expect(ResearchEngineAtlasPrivateSchema.safeParse(dumped).success).toBe(true);
    const invented = JSON.parse(JSON.stringify(atlasFixture())) as { modes: Array<{ facts: Record<string, any> }> };
    invented.modes[0]!.facts.avoid_when = { state: "PUBLISHED", text: "avoid on Mondays" };
    expect(ResearchEngineAtlasPrivateSchema.safeParse(invented).success).toBe(false);
    await expect(service.atlas(user, { release_id: "er_unknown" })).rejects.toMatchObject({ code: "RESEARCH_FOUNDATION_RELEASE_NOT_FOUND" });
    await expect(service.atlas(user, { route: "route_unknown" })).rejects.toMatchObject({ code: "RESEARCH_FOUNDATION_ROUTE_NOT_FOUND" });
    await expect(service.atlas(user, { mode: "mode_unknown" })).rejects.toMatchObject({ code: "RESEARCH_FOUNDATION_CAPABILITY_NOT_FOUND" });
    expect(atlasClient.read).toHaveBeenCalledTimes(4);
  });

  it("P10 amendment: carries release defaults and fixed-admission truth without inventing browser override authority", async () => {
    const response = await service.atlas(user, {});
    expect(response.atlas.current_release).toMatchObject({
      trial_ceiling: 4000,
      optimizer_defaults: {
        schema_version: "research.optimizer-defaults.v1",
        groups: [
          { group_id: "study" }, { group_id: "sampler" },
          { group_id: "objective" }, { group_id: "candidate_selection" },
        ],
      },
      submission_constraints: {
        profile_id: "p10.fixed-qualification.v1",
        optimization_overrides: "FORBIDDEN",
        accepted_trial_count: 1,
      },
    });
    expect(response.atlas.current_release.optimizer_defaults.groups.flatMap((group) => group.fields)
      .every((field) => field.value_source === "RELEASE_DEFAULT" && field.override_state === "LOCKED")).toBe(true);
  });

  it("P09-DR: registry is immutable and the runtime role cannot alter it", async () => {
    await expect(pool.query(`UPDATE research.journey_descriptor_registry SET revision = 2`)).rejects.toMatchObject({ code: "55000" });
    const runtime = await pool.connect();
    try {
      await runtime.query("BEGIN");
      await runtime.query("SET LOCAL ROLE portal_research_runtime");
      await expect(runtime.query(`UPDATE research.journey_descriptor_registry SET revision = 2`)).rejects.toMatchObject({ code: "42501" });
      await runtime.query("ROLLBACK");
    } finally { runtime.release(); }
  });

  it("P09-T05: private Atlas client signs one bounded GET and rejects an invalid private contract", async () => {
    const config = loadConfig({
      NODE_ENV: "test", PORTAL_ENV: "local", AUTH_MODE: "dev",
      DATABASE_URL: databaseUrl, INTERNAL_PRINCIPAL_SECRET: "p09-test-internal-principal-secret-at-least-32-bytes",
      PORTAL_API_BASE_URL: "https://portal.private.test",
    });
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://portal.private.test/internal/research/engine-atlas");
      expect(init?.method).toBe("GET");
      expect((init?.headers as Record<string, string>)["x-portal-principal"]).toMatch(/^[^.]+\.[^.]+$/);
      return new Response(JSON.stringify(atlas), { status: 200, headers: { "content-type": "application/json" } });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      await expect(new ResearchFoundationAtlasClient(config).read(user)).resolves.toMatchObject({ routes: expect.any(Array) });
      globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
      await expect(new ResearchFoundationAtlasClient(config).read(user)).rejects.toMatchObject({ code: "RESEARCH_FOUNDATION_REJECTED" });
    } finally { globalThis.fetch = originalFetch; }
  });
});
