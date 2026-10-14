/**
 * W5b · P17 replay on PostgreSQL: the real-HMD retained rows sealed through
 * the repository, read back through the authenticated BFF.
 *
 * Proves the SQL the in-memory spec stands in for: the transition keyset
 * over sparse original ordinals (P17-T10), migration 065's partial index,
 * the replay window with bar checkpoints, and the seal's refusal of an
 * ordinal gap {0, 1, 3} (P17-T04).
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import {
  ResearchCurrentSourceReplayResponseSchema,
  ResearchCurrentSourceReplayTransitionsResponseSchema,
  ResearchCurrentSourceReplayChildAuditResponseSchema,
} from "../src/research/current-source.contract";
import {
  currentSourceBatchDigest,
  ResearchCurrentSourceRepository,
  type CurrentSourceRowInput,
  type CurrentSourceTableKind,
} from "../src/research/current-source.repository";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

type Kind = CurrentSourceTableKind;
const real = JSON.parse(gunzipSync(readFileSync(join(__dirname, "research-w5b-real-replay.fixture.json.gz"))).toString("utf8")) as {
  run_id: string;
  table_rows: Record<Kind, number>;
  summary: Record<string, unknown>;
  rows: Record<Kind, CurrentSourceRowInput[]>;
};

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = `portal_w5b_${randomUUID().replaceAll("-", "")}`;
const runId = "run_w5b_replay";
const digest = (letter: string) => letter.repeat(64);

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

describe("W5b · P17 replay ledger on PostgreSQL", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let repository: ResearchCurrentSourceRepository;
  let owner: { userId: string; username: string; cookie: string };
  let workspaceId: string;

  async function rawInject(url: string, options: Record<string, unknown> = {}) {
    const headers = { ...((options.headers as Record<string, string>) ?? {}) };
    const method = String(options.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD" && !("origin" in headers)) headers.origin = ctx.config.PORTAL_PUBLIC_ORIGIN;
    return ctx.app.getHttpAdapter().getInstance().inject({ method: "GET", url, ...options, headers });
  }

  const get = (url: string) => rawInject(url, {
    headers: { cookie: owner.cookie, "x-dev-access-email": `${owner.username}@azdag.com` },
  });

  async function seal(run: string, tables: Record<Kind, CurrentSourceRowInput[]>, tableRows: Record<Kind, number>) {
    const scope = { workspaceId, actorUserId: owner.userId };
    for (const tableKind of ["OBSERVATION", "FOLD", "TRIAL", "CANDIDATE", "SELECTION"] as const) {
      const rows = tables[tableKind];
      for (let start = 0, batch = 0; start < rows.length; start += 200, batch += 1) {
        const slice = rows.slice(start, start + 200);
        await repository.append(scope, {
          runId: run, artifactRevision: 1, manifestDigest: digest("a"), sourceTransformDigest: digest("b"),
          tableKind, batchOrdinal: batch, batchDigest: currentSourceBatchDigest(slice), rows: slice,
        });
      }
    }
    return repository.seal(scope, {
      runId: run, artifactRevision: 1,
      sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1", profileId: "rs02.delta-signal-notional-wfo.v1",
      manifestDigest: digest("a"), sourceTransformDigest: digest("b"),
      requestedSpecDigest: digest("c"), effectiveSpecDigest: digest("d"), datasetBindingDigest: digest("e"),
      tableRows, totalRows: Object.values(tableRows).reduce((sum, count) => sum + count, 0),
      summary: real.summary,
    });
  }

  beforeAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); } finally { await admin.end(); }
    await migrateTestDatabase(databaseUrl);
    ctx = await setupApp({ DATABASE_URL: databaseUrl, AUTH_MODE: "dev", FEATURE_RESEARCH_CURRENT_SOURCE: "true" });
    const auth = new AuthService(ctx.pool, ctx.config, new Argon2CredentialService({
      memoryKib: ctx.config.ARGON2_MEMORY_KIB, iterations: ctx.config.ARGON2_ITERATIONS, parallelism: ctx.config.ARGON2_PARALLELISM,
    }));
    const adminService = new AdminService(ctx.pool, ctx.config, auth);
    const username = "w5b-owner";
    await adminService.createUser({ username, displayName: username, role: "ADMIN" });
    const portalUser = (await auth.users.findByUsername(username))!;
    const { activationToken } = await adminService.resetCredential(portalUser.userId);
    const activated = await rawInject("/api/auth/login", {
      method: "POST", headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: activationToken },
    });
    const password = `Cobalt-River-${username}-W5B!`;
    await rawInject("/api/auth/change-password", {
      method: "POST",
      headers: { cookie: cookies(activated), "x-portal-csrf": csrfCookie(activated), "x-dev-access-email": `${username}@azdag.com` },
      payload: { current_password: activationToken, new_password: password },
    });
    const loggedIn = await rawInject("/api/auth/login", {
      method: "POST", headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: password },
    });
    owner = { userId: portalUser.userId, username, cookie: cookies(loggedIn) };
    workspaceId = (await get("/api/workspaces")).json().workspaces[0]!.workspace_id;
    repository = ctx.app.get(ResearchCurrentSourceRepository);
    await seal(runId, real.rows, real.table_rows);
  }, 120_000);

  afterAll(async () => {
    await teardownApp(ctx);
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); } finally { await admin.end(); }
  });

  it("migration 065 installs the partial transition index", async () => {
    const index = await ctx.pool.query(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = 'research' AND indexname = 'current_source_rows_v1_transition_idx'",
    );
    expect(index.rows[0]?.indexdef).toContain("WHERE ((table_kind = 'OBSERVATION'::text) AND (((payload -> 'bar'::text) ->> 'transition'::text) = 'true'::text))");
  });

  it("pages the real transitions over their sparse original ordinals, both ways", async () => {
    const prefix = `/api/v1/quantbt/runs/${runId}/current-source/replay/transitions`;
    const first = await get(`${prefix}?limit=3`);
    expect(first.statusCode).toBe(200);
    expect(first.headers["cache-control"]).toBe("private, no-store");
    const one = first.json();
    expect(ResearchCurrentSourceReplayTransitionsResponseSchema.safeParse(one).success).toBe(true);
    expect(one.rows.map((row: { source_ordinal: number }) => row.source_ordinal)).toEqual([727, 736, 867]);
    const two = (await get(`${prefix}?limit=3&cursor=${encodeURIComponent(one.page.next_cursor)}`)).json();
    expect(two.rows.map((row: { source_ordinal: number }) => row.source_ordinal)).toEqual([880, 890, 946]);
    const three = (await get(`${prefix}?limit=3&cursor=${encodeURIComponent(two.page.next_cursor)}`)).json();
    expect(three.rows.map((row: { source_ordinal: number }) => row.source_ordinal)).toEqual([951, 1023]);
    expect(three.page).toMatchObject({ has_more: false, next_cursor: null, has_previous: true });
    const back = (await get(`${prefix}?limit=3&before=${encodeURIComponent(three.page.prev_cursor)}`)).json();
    expect(back.rows.map((row: { source_ordinal: number }) => row.source_ordinal)).toEqual([880, 890, 946]);
    // A cursor minted for the transition ledger is refused by the replay relation.
    const crossed = await get(`/api/v1/quantbt/runs/${runId}/current-source/replay?cursor=${encodeURIComponent(one.page.next_cursor)}`);
    expect(crossed.statusCode).toBe(400);
  });

  it("serves a replay window with bars and checkpoints, and seeks a transition's bar", async () => {
    const ledger = (await get(`/api/v1/quantbt/runs/${runId}/current-source/replay/transitions?limit=1`)).json();
    const seek = await get(`/api/v1/quantbt/runs/${runId}/current-source/replay?limit=3&at=${encodeURIComponent(ledger.rows[0].playback_cursor)}`);
    expect(seek.statusCode).toBe(200);
    const body = seek.json();
    expect(ResearchCurrentSourceReplayResponseSchema.safeParse(body).success).toBe(true);
    expect(body.replay.rows.map((row: { source_ordinal: number }) => row.source_ordinal)).toEqual([727, 728, 729]);
    expect(body.replay.state_at_cursor.bar).toMatchObject({ transition: true, fold_id: "0", checkpoint: { transition_count: 1 } });
    expect(body.execution.fold_capital.segments.map((segment: { fold_id: string }) => segment.fold_id)).toEqual(["0", "1"]);
    expect(Buffer.byteLength(JSON.stringify(body), "utf8")).toBeLessThan(1_048_576);
  });

  it("§58: authenticated 400-bar SQL pages continue across folds, backwards too, with exact source identities", async () => {
    const prefix = `/api/v1/quantbt/runs/${runId}/current-source/replay`;
    const firstResponse = await get(`${prefix}?limit=400`);
    expect(firstResponse.statusCode).toBe(200);
    expect(firstResponse.headers["cache-control"]).toBe("private, no-store");
    const first = firstResponse.json();
    expect(first.replay.page).toMatchObject({ max_bars: 400, byte_limited: false });
    expect(first.replay.rows).toHaveLength(400);
    const secondResponse = await get(`${prefix}?limit=400&cursor=${encodeURIComponent(first.replay.window_cursor.next_window_cursor)}`);
    expect(secondResponse.statusCode).toBe(200);
    const second = secondResponse.json();
    const thirdResponse = await get(`${prefix}?limit=400&cursor=${encodeURIComponent(second.replay.window_cursor.next_window_cursor)}`);
    expect(thirdResponse.statusCode).toBe(200);
    const third = thirdResponse.json();
    expect(ResearchCurrentSourceReplayResponseSchema.safeParse(third).success).toBe(true);
    expect(third.replay.window_cursor).toMatchObject({ crossed_fold_boundary: true, first_fold_id: "0", last_fold_id: "1", next_window_cursor: null });
    expect([first, second, third].flatMap(p => p.replay.rows.map((r: any) => r.source_ordinal)))
      .toEqual(real.rows.OBSERVATION.map(r => r.sourceOrdinal));
    const backResponse = await get(`${prefix}?limit=400&before=${encodeURIComponent(third.replay.window_cursor.previous_window_cursor)}`);
    expect(backResponse.statusCode).toBe(200);
    expect(backResponse.json().replay.rows.map((r: any) => r.source_ordinal))
      .toEqual(second.replay.rows.map((r: any) => r.source_ordinal));
    expect(third.execution.split_shape).toMatchObject({ window_kind: "FOLD_WINDOWS", oos_applicable: true, independent_holdout: false });
    const boundary = third.execution.fold_capital.boundaries[0];
    expect(boundary).toMatchObject({ previous_fold_id: "0", fold_id: "1", params_digest_changed: false,
      equity_start_policy: "CARRIED", position_start_policy: "CARRIED",
      previous_end_equity: third.execution.fold_capital.segments[0].end_equity,
      previous_selection: { selected_trial_id: (real.summary.selection as any).trial_id } });
    const invalid = await get(`${prefix}?limit=401`);
    expect(invalid.statusCode).toBe(400);
    const changedLimit = await get(`${prefix}?limit=200&cursor=${encodeURIComponent(first.replay.window_cursor.next_window_cursor)}`);
    expect(changedLimit.statusCode).toBe(400);
    const journal = await get(`/api/v1/quantbt/runs/${runId}/current-source/replay/transitions?limit=201`);
    expect(journal.statusCode).toBe(400);
    // No compute is performed: only sealed SQL rows plus one selected-trial
    // identity lookup. This test creates no engine jobs or source credentials.
  });

  it("P17-T14: serves one fold's child audit by its original fold id, with an ETag", async () => {
    const response = await get(`/api/v1/quantbt/runs/${runId}/current-source/replay/child-audit?fold=1`);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(ResearchCurrentSourceReplayChildAuditResponseSchema.safeParse(body).success).toBe(true);
    expect(response.headers.etag).toBe(body.etag);
    expect(body.records.length).toBeGreaterThan(0);
    expect(body.records.every((record: { fold_id: string }) => record.fold_id === "1")).toBe(true);
    const missing = await get(`/api/v1/quantbt/runs/${runId}/current-source/replay/child-audit?fold=99`);
    expect(missing.statusCode).toBe(404);
  });

  it("refuses to seal an ordinal gap {0, 1, 3}; ordinal 2 is never fabricated", async () => {
    const gapped = real.rows.OBSERVATION.slice(0, 4).filter((row) => row.sourceOrdinal !== 2);
    await expect(seal("run_w5b_gap", { ...real.rows, OBSERVATION: gapped }, { ...real.table_rows, OBSERVATION: 3 }))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_CONFLICT", status: 409 });
    const retained = await ctx.pool.query(
      "SELECT count(*)::int AS count FROM research.current_source_seals_v1 WHERE run_id = 'run_w5b_gap'",
    );
    expect(retained.rows[0].count).toBe(0);
  });
});
