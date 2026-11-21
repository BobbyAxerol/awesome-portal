import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import {
  ResearchCurrentSourceEvidenceResponseSchema,
  ResearchCurrentSourceEvidenceSeriesResponseSchema,
  ResearchCurrentSourceFreezeResponseSchema,
  ResearchCurrentSourceReplayResponseSchema,
  ResearchCurrentSourceSearchResponseSchema,
  ResearchCurrentSourceSplitResponseSchema,
} from "../src/research/current-source.contract";
import {
  currentSourceBatchDigest,
  ResearchCurrentSourceRepository,
  type CurrentSourceRowInput,
  type CurrentSourceTableKind,
} from "../src/research/current-source.repository";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = `portal_rs03_${randomUUID().replaceAll("-", "")}`;
const runId = "run_rs03_acceptance";
const digest = (letter: string) => letter.repeat(64);

interface Actor {
  userId: string;
  username: string;
  cookie: string;
}

function databaseUrlFor(name: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

const databaseUrl = databaseUrlFor(databaseName);

function cookies(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  return (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.split(";")[0])
    .join("; ");
}

function csrfCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const value = (Array.isArray(raw) ? raw : [raw]).find(
    (item): item is string => typeof item === "string" && item.startsWith("__Host-portal_csrf="),
  );
  if (!value) throw new Error("csrf cookie missing");
  return value.split(";")[0].split("=")[1]!;
}

function summary() {
  return {
    schema_version: "research.current-source-summary.v1",
    metrics: {
      initial_equity: "100.000000000000000000",
      final_equity: "110.000000000000000000",
      net_return_fraction: "0.100000000000000000",
      max_drawdown_fraction: "-0.020000000000000000",
    },
    selection: {
      trial_id: "trial-rs03-1",
      objective: "0.100000000000000000",
      parameters: { window: "20", threshold: "0.500000000000000000" },
    },
    data_use: {
      warmup: { state: "NOT_PUBLISHED", reason_code: "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_WARMUP" },
      purge: { state: "NOT_PUBLISHED", reason_code: "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PURGE" },
      embargo: { state: "NOT_PUBLISHED", reason_code: "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_EMBARGO" },
      strict_outer_oos_selection: { state: "NOT_PUBLISHED", reason_code: "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_STRICT_OUTER_OOS_SELECTION" },
    },
    derived: {
      monthly_returns: {
        source_observation_count: 3,
        emitted_point_count: 1,
        total_period_count: 1,
        omitted_leading_period_count: 0,
        omitted_transport_period_count: 0,
        sampling: "FULL",
        values: [{ month_start_utc_ms: 1_704_067_200_000, return_fraction: "0.100000000000000000" }],
      },
      rolling_returns_20: {
        source_observation_count: 3,
        emitted_point_count: 0,
        window_observations: 20,
        sampling: "NOT_APPLICABLE",
        values: [],
      },
      return_distribution: {
        state: "AVAILABLE",
        reason_code: null,
        source_observation_count: 3,
        emitted_point_count: 2,
        sampling: "FULL_RETURN_HISTOGRAM_V2",
        values: [
          { lower_inclusive: "-0.020000000000000000", upper: "0", upper_inclusive: "false", count: "1" },
          { lower_inclusive: "0", upper: "0.050000000000000000", upper_inclusive: "true", count: "2" },
        ],
      },
    },
  };
}

const rows: Record<CurrentSourceTableKind, readonly CurrentSourceRowInput[]> = {
  OBSERVATION: [0, 1, 2].map((sourceOrdinal) => ({
    sourceOrdinal,
    sourceId: `2024-01-0${sourceOrdinal + 1}T00:00:00Z`,
    occurredAtUtcMs: 1_704_067_200_000 + sourceOrdinal * 86_400_000,
    payload: {
      source_index_utc: `2024-01-0${sourceOrdinal + 1}T00:00:00Z`,
      at_utc_ms: 1_704_067_200_000 + sourceOrdinal * 86_400_000,
      equity: `${100 + sourceOrdinal * 5}.000000000000000000`,
      return_fraction: sourceOrdinal === 0 ? "0" : "0.050000000000000000",
      accepted_position: "0.400000000000000000",
      drawdown_fraction: sourceOrdinal === 1 ? "-0.020000000000000000" : "0",
      signal_target: "0.500000000000000000",
    },
  })),
  FOLD: [0, 1].map((sourceOrdinal) => ({
    sourceOrdinal,
    sourceId: `fold-rs03-${sourceOrdinal}`,
    occurredAtUtcMs: null,
    payload: {
      fold_id: `fold-rs03-${sourceOrdinal}`,
      train_start_utc_ms: 1_704_067_200_000 + sourceOrdinal * 86_400_000,
      train_end_utc_ms: 1_704_153_600_000 + sourceOrdinal * 86_400_000,
      test_start_utc_ms: 1_704_240_000_000 + sourceOrdinal * 86_400_000,
      test_end_utc_ms: 1_704_326_400_000 + sourceOrdinal * 86_400_000,
    },
  })),
  TRIAL: [0, 1].map((sourceOrdinal) => ({
    sourceOrdinal,
    sourceId: `trial-rs03-${sourceOrdinal}`,
    occurredAtUtcMs: null,
    payload: {
      trial_id: `trial-rs03-${sourceOrdinal}`,
      state: "COMPLETE",
      objective: `0.${sourceOrdinal + 1}00000000000000000`,
      parameters: { window: String(10 + sourceOrdinal), threshold: "0.500000000000000000" },
    },
  })),
  CANDIDATE: [{
    sourceOrdinal: 0,
    sourceId: "candidate-rs03-0",
    occurredAtUtcMs: null,
    payload: {
      candidate_id: "candidate-rs03-0",
      objective: "0.200000000000000000",
      parameters: { window: "20", threshold: "0.500000000000000000" },
    },
  }],
  // This field is intentionally not a public DTO. It proves that named BFFs
  // do not serialize an arbitrary retained JSON row into the browser.
  SELECTION: [{
    sourceOrdinal: 0,
    sourceId: "selection-rs03-0",
    occurredAtUtcMs: null,
    payload: { selected_trial_id: "trial-rs03-1", private_raw_marker: "rs03-private-value" },
  }],
};

describe("RS-03 independent retained-current-source BFF acceptance", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let adminService: AdminService;
  let repository: ResearchCurrentSourceRepository;
  let owner: Actor;
  let foreign: Actor;
  let workspaceId: string;
  let foreignWorkspaceId: string;

  beforeAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); } finally { await admin.end(); }
    await migrateTestDatabase(databaseUrl);
    ctx = await setupApp({
      DATABASE_URL: databaseUrl,
      AUTH_MODE: "dev",
      FEATURE_RESEARCH_CURRENT_SOURCE: "true",
    });
    auth = new AuthService(ctx.pool, ctx.config, new Argon2CredentialService({
      memoryKib: ctx.config.ARGON2_MEMORY_KIB,
      iterations: ctx.config.ARGON2_ITERATIONS,
      parallelism: ctx.config.ARGON2_PARALLELISM,
    }));
    adminService = new AdminService(ctx.pool, ctx.config, auth);
    owner = await createActor("rs03-owner", "ADMIN");
    foreign = await createActor("rs03-foreign", "USER");
    workspaceId = (await inject(owner, "/api/workspaces")).json().workspaces[0]!.workspace_id;
    foreignWorkspaceId = (await inject(foreign, "/api/workspaces")).json().workspaces[0]!.workspace_id;
    repository = ctx.app.get(ResearchCurrentSourceRepository);
    await seedSealedCorpus();
  }, 60_000);

  afterAll(async () => {
    await teardownApp(ctx);
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); } finally { await admin.end(); }
  });

  async function rawInject(url: string, options: Record<string, unknown> = {}) {
    const headers = { ...((options.headers as Record<string, string>) ?? {}) };
    const method = String(options.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD" && !("origin" in headers)) headers.origin = ctx.config.PORTAL_PUBLIC_ORIGIN;
    return ctx.app.getHttpAdapter().getInstance().inject({ method: "GET", url, ...options, headers });
  }

  async function inject(actor: Actor, url: string, options: Record<string, unknown> = {}) {
    return rawInject(url, {
      ...options,
      headers: {
        cookie: actor.cookie,
        "x-dev-access-email": `${actor.username}@azdag.com`,
        ...((options.headers as Record<string, string>) ?? {}),
      },
    });
  }

  async function createActor(username: string, role: "ADMIN" | "USER"): Promise<Actor> {
    await adminService.createUser({ username, displayName: username, role });
    const portalUser = await auth.users.findByUsername(username);
    if (!portalUser) throw new Error("test user was not created");
    const { activationToken } = await adminService.resetCredential(portalUser.userId);
    const activated = await rawInject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: activationToken },
    });
    const password = `Cobalt-River-${username}-RS03!`;
    const changed = await rawInject("/api/auth/change-password", {
      method: "POST",
      headers: {
        cookie: cookies(activated),
        "x-portal-csrf": csrfCookie(activated),
        "x-dev-access-email": `${username}@azdag.com`,
      },
      payload: { current_password: activationToken, new_password: password },
    });
    expect(changed.statusCode).toBe(201);
    const loggedIn = await rawInject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: password },
    });
    return { userId: portalUser.userId, username, cookie: cookies(loggedIn) };
  }

  async function seedSealedCorpus(): Promise<void> {
    const scope = { workspaceId, actorUserId: owner.userId };
    for (const tableKind of ["OBSERVATION", "FOLD", "TRIAL", "CANDIDATE", "SELECTION"] as const) {
      const batch = rows[tableKind];
      await repository.append(scope, {
        runId,
        artifactRevision: 1,
        manifestDigest: digest("a"),
        sourceTransformDigest: digest("b"),
        tableKind,
        batchOrdinal: 0,
        batchDigest: currentSourceBatchDigest(batch),
        rows: batch,
      });
    }
    await repository.seal(scope, {
      runId,
      artifactRevision: 1,
      sourceAdapterId: "rs02.quantbt-advanced-wfo.v1",
      profileId: "rs02.delta-wfo-global.v1",
      manifestDigest: digest("a"),
      sourceTransformDigest: digest("b"),
      requestedSpecDigest: digest("c"),
      effectiveSpecDigest: digest("d"),
      datasetBindingDigest: digest("e"),
      tableRows: { OBSERVATION: 3, FOLD: 2, TRIAL: 2, CANDIDATE: 1, SELECTION: 1 },
      totalRows: 9,
      summary: summary(),
    });
  }

  function expectBoundedPublicDocument(body: unknown): void {
    const serialized = JSON.stringify(body);
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThan(1_048_576);
    expect(serialized).not.toContain("rs03-private-value");
    expect(serialized).not.toContain('"payload"');
    expect(serialized).not.toContain('"source_id"');
    expect(serialized).not.toMatch(/postgres:|redis:|\/internal\/|source_locator/i);
  }

  it("serves all six named current-source reads from one sealed local corpus through an authenticated BFF", async () => {
    const prefix = `/api/v1/quantbt/runs/${runId}/current-source`;
    const evidenceResponse = await inject(owner, `${prefix}/evidence`);
    const seriesResponse = await inject(owner, `${prefix}/evidence/series?kind=EQUITY`);
    const splitResponse = await inject(owner, `${prefix}/split`);
    const searchResponse = await inject(owner, `${prefix}/search?limit=1`);
    const freezeResponse = await inject(owner, `${prefix}/freeze`);
    const replayResponse = await inject(owner, `${prefix}/replay?limit=1`);

    for (const response of [evidenceResponse, seriesResponse, splitResponse, searchResponse, freezeResponse, replayResponse]) {
      expect(response.statusCode).toBe(200);
      expectBoundedPublicDocument(response.json());
    }
    expect(ResearchCurrentSourceEvidenceResponseSchema.safeParse(evidenceResponse.json()).success).toBe(true);
    expect(ResearchCurrentSourceEvidenceSeriesResponseSchema.safeParse(seriesResponse.json()).success).toBe(true);
    expect(ResearchCurrentSourceSplitResponseSchema.safeParse(splitResponse.json()).success).toBe(true);
    expect(ResearchCurrentSourceSearchResponseSchema.safeParse(searchResponse.json()).success).toBe(true);
    expect(ResearchCurrentSourceFreezeResponseSchema.safeParse(freezeResponse.json()).success).toBe(true);
    expect(ResearchCurrentSourceReplayResponseSchema.safeParse(replayResponse.json()).success).toBe(true);

    const evidence = evidenceResponse.json();
    const search = searchResponse.json();
    const freeze = freezeResponse.json();
    const replay = replayResponse.json();
    expect(evidence.read_authority).toBe("PORTAL_RETAINED_CURRENT_SOURCE");
    expect(evidence.passport.artifact_table_rows).toEqual({ observations: 3, folds: 2, trials: 2, candidates: 1, selection: 1 });
    expect(search.ledger.page.next_cursor).toMatch(/^kc1\./);
    expect(search.ledger.trials).toHaveLength(1);
    expect(freeze.integrity.state).toBe("MATCH");
    expect(replay.replay.rows).toHaveLength(1);
    expect(evidenceResponse.headers.etag).toBe(evidence.etag);
    expect(searchResponse.headers["cache-control"]).toBe("private, no-store");
    expect(replayResponse.headers["cache-control"]).toBe("private, no-store");
  });

  it("keeps ETag, cursors and workspace reachability relation-bound at the real HTTP boundary", async () => {
    const prefix = `/api/v1/quantbt/runs/${runId}/current-source`;
    const evidence = await inject(owner, `${prefix}/evidence`);
    const unchanged = await inject(owner, `${prefix}/evidence`, { headers: { "if-none-match": evidence.json().etag } });
    expect(unchanged.statusCode).toBe(304);

    const search = await inject(owner, `${prefix}/search?limit=1`);
    const foreignRelation = await inject(owner, `${prefix}/replay?limit=1&at=${encodeURIComponent(search.json().ledger.next_cursor)}`);
    expect(foreignRelation.statusCode).toBe(400);
    expect(foreignRelation.json().error.code).toBe("RESEARCH_CURRENT_SOURCE_INVALID");

    const replay = await inject(owner, `${prefix}/replay?limit=1`);
    const selected = await inject(owner, `${prefix}/replay?limit=1&at=${encodeURIComponent(replay.json().replay.rows[0].playback_cursor)}`);
    expect(selected.statusCode).toBe(200);
    expect(selected.json().replay.state_at_cursor).toMatchObject({
      state: "AVAILABLE_RETAINED_MODEL_SAMPLE",
      source_ordinal: 0,
      semantics: "RESEARCH_MODEL_SAMPLE_NOT_BROKER_EXECUTION_STATE",
    });

    const unauthenticated = await rawInject(`${prefix}/evidence`);
    expect(unauthenticated.statusCode).toBe(401);
    const hiddenForeignWorkspace = await inject(owner, `${prefix}/evidence?workspace_id=${foreignWorkspaceId}`);
    expect(hiddenForeignWorkspace.statusCode).toBe(404);
    expect(hiddenForeignWorkspace.json().error.code).toBe("RESEARCH_CURRENT_SOURCE_NOT_FOUND");
    const invalidBound = await inject(owner, `${prefix}/search?limit=201`);
    expect(invalidBound.statusCode).toBe(400);
    expect(invalidBound.json().error.code).toBe("RESEARCH_CURRENT_SOURCE_INVALID");
  });

  it("uses only the sealed local custody lane and leaves no mutable producer/run state behind", async () => {
    const counts = await ctx.pool.query<{
      rows: string;
      seals: string;
      runs: string;
      jobs: string;
      progress_events: string;
    }>(`
      SELECT
        (SELECT count(*) FROM research.current_source_rows_v1)::text AS rows,
        (SELECT count(*) FROM research.current_source_seals_v1)::text AS seals,
        (SELECT count(*) FROM research.runs)::text AS runs,
        (SELECT count(*) FROM research.jobs)::text AS jobs,
        (SELECT count(*) FROM research.run_progress_events)::text AS progress_events
    `);
    expect(counts.rows[0]).toEqual({ rows: "9", seals: "1", runs: "0", jobs: "0", progress_events: "0" });
  });
});
