/** Opt-in, READ ONLY: no migrations, fixture inserts, engine or runtime changes.
 * Explicit URL must point at the owner-approved Research preview, never prod.
 * Repository RLS and admission stay intact. Timings are SQL+service+JSON, not
 * browser/render or WAN latency. Raw output belongs outside Git.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { createHash, randomBytes } from "node:crypto";
import { Pool } from "../../apps/control-api/node_modules/pg";
import { expect, it } from "../../apps/control-api/node_modules/vitest/dist/index.js";
import { ResearchCurrentSourceRepository } from "../../apps/control-api/src/research/current-source.repository";
import { ResearchCurrentSourceService } from "../../apps/control-api/src/research/current-source.service";
import { REPLAY_MAX_BARS } from "../../apps/control-api/src/research/replay-continuity.contract";
import { ResearchWindowExecutionRepository } from "../../apps/control-api/src/research/window-execution.repository";
import { ResearchWindowExecutionService } from "../../apps/control-api/src/research/window-execution.service";

const url = process.env.REPLAY_BENCH_DATABASE_URL;
const output = process.env.REPLAY_BENCH_OUTPUT;
if (!url || !output || process.env.REPLAY_BENCH_APPROVED_PREVIEW !== "true")
  throw Error("EXPLICIT_APPROVED_PREVIEW_AND_PRIVATE_OUTPUT_REQUIRED");
if (existsSync(output)) throw Error("IMMUTABLE_BENCHMARK_OUTPUT_ALREADY_EXISTS");
const quantile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1]!;

it("§59 read-only retained replay benchmark", async () => {
  const pool = new Pool({ connectionString: url, max: 4,
    options: "-c default_transaction_read_only=on -c statement_timeout=5000",
    application_name: "portal-replay-window-benchmark-readonly" });
  const config = { FEATURE_RESEARCH_CURRENT_SOURCE: "true", FEATURE_RESEARCH_PREVIEW_LONG_WFO: "true",
    FEATURE_RESEARCH_REPLAY: "true",
    QUERY_CURSOR_ACTIVE_KEY_ID: "bench", QUERY_CURSOR_KEYS_JSON: JSON.stringify({ bench: randomBytes(32).toString("hex") }),
    QUERY_CURSOR_TTL_SECONDS: 900 } as never;
  const repository = new ResearchCurrentSourceRepository(pool, config);
  const windows = new ResearchWindowExecutionService(new ResearchWindowExecutionRepository(pool), config);
  const service = new ResearchCurrentSourceService(repository, config, undefined, undefined, windows);
  try {
    expect((await pool.query("SHOW transaction_read_only")).rows[0].transaction_read_only).toBe("on");
    const runs = (await pool.query(`SELECT s.workspace_id,s.run_id,s.artifact_revision,s.manifest_digest,
        s.retained_import_digest,s.table_rows,w.owner_user_id
      FROM research.current_source_seals_v1 s JOIN workspaces w USING(workspace_id)
      ORDER BY (s.table_rows->>'OBSERVATION')::bigint DESC LIMIT 2`)).rows;
    expect(runs.length).toBe(2);
    const results: unknown[] = [];
    for (const run of runs) {
      const scope = { workspaceId: run.workspace_id, actorUserId: run.owner_user_id };
      const source = await service.replay(scope, run.run_id, { limit: 1 });
      if (!("replay" in source)) throw Error("REPLAY_NOT_AVAILABLE");
      const folds = source.execution.fold_capital.segments;
      run.served_fold_bars = folds.map(f => f.bars);
      const limitsOverride = process.env.REPLAY_BENCH_LIMITS?.split(",").map(Number);
      if (limitsOverride) expect(limitsOverride.every(n => Number.isSafeInteger(n) && n >= 1 && n <= REPLAY_MAX_BARS)).toBe(true);
      const requestedLimits = [...new Set(limitsOverride ?? [100, 200, 400, 800, 1056, 1600, 3200, 6400, 8192,
        ...folds.map(f => f.bars).filter(n => n <= REPLAY_MAX_BARS)])]
        .filter(n => n <= REPLAY_MAX_BARS).sort((a, b) => a - b);
      for (const limit of requestedLimits) {
        const times: number[] = [], bytes: number[] = [], counts: number[] = [];
        let byteLimited = 0;
        const samples = Number(process.env.REPLAY_BENCH_SAMPLES ?? 24);
        expect(Number.isSafeInteger(samples) && samples >= 1 && samples <= 64).toBe(true);
        for (let i = -2; i < samples; i++) {
          const start = performance.now();
          const body = await service.replay(scope, run.run_id, { limit });
          if (!("replay" in body)) throw Error("REPLAY_NOT_AVAILABLE");
          const encoded = JSON.stringify(body), elapsed = performance.now() - start;
          expect(Buffer.byteLength(encoded)).toBeLessThanOrEqual(1_048_576);
          expect(body.replay.rows.length).toBeLessThanOrEqual(limit);
          if (i >= 0) {
            times.push(elapsed); bytes.push(Buffer.byteLength(encoded)); counts.push(body.replay.rows.length);
            byteLimited += Number(body.replay.page.byte_limited);
          }
        }
        results.push({ run_id: run.run_id, limit, samples: times.length,
          p50_ms: quantile(times, .5), p95_ms: quantile(times, .95), max_ms: Math.max(...times),
          payload_bytes_max: Math.max(...bytes), returned_bars_min: Math.min(...counts),
          byte_limited_rate: byteLimited / times.length });
      }
      // Whole fold, direct signed seek: exact window count without assuming a
      // weekly schedule. A larger fold may legally shorten at the byte cap.
      for (const fold of folds.filter(f => f.bars <= REPLAY_MAX_BARS).slice(0, 3)) {
        const body = await service.replay(scope, run.run_id, { limit: fold.bars, at: fold.start_cursor });
        if (!("replay" in body)) throw Error("REPLAY_NOT_AVAILABLE");
        const rows = body.replay.rows;
        expect(rows[0]?.source_ordinal).toBe(fold.first_ordinal);
        expect(rows.at(-1)!.source_ordinal).toBeLessThanOrEqual(fold.last_ordinal);
        if (!body.replay.page.byte_limited) expect(rows.length).toBe(fold.bars);
      }
      if (process.env.REPLAY_BENCH_FULL_CHAIN === "true") {
        let next: string | null = null, expected = 0, pages = 0, bytes = 0;
        const times: number[] = [], counts: number[] = [], digest = createHash("sha256");
        do {
          const start = performance.now();
          const body = await service.replay(scope, run.run_id, { limit: REPLAY_MAX_BARS, ...(next ? { cursor: next } : {}) });
          if (!("replay" in body)) throw Error("REPLAY_NOT_AVAILABLE");
          const encoded = JSON.stringify(body);
          times.push(performance.now() - start); bytes += Buffer.byteLength(encoded);
          expect(Buffer.byteLength(encoded)).toBeLessThanOrEqual(1_048_576);
          for (const { playback_cursor: _renewable, ...row } of body.replay.rows) {
            expect(row.source_ordinal).toBe(expected++); digest.update(JSON.stringify(row));
          }
          counts.push(body.replay.rows.length); pages++; next = body.replay.page.next_cursor;
          if (pages > 1000) throw Error("CURSOR_DID_NOT_TERMINATE");
        } while (next);
        expect(expected).toBe(Number(run.table_rows.OBSERVATION));
        results.push({ run_id: run.run_id, lane: "FULL_RUN_CONTIGUOUS_FORWARD", requested_limit: REPLAY_MAX_BARS,
          returned_bars: expected, pages, transferred_bytes: bytes, row_count_min: Math.min(...counts),
          p50_ms: quantile(times, .5), p95_ms: quantile(times, .95), data_sha256: digest.digest("hex") });
        const pairTimes: number[] = [];
        for (let pair = 0; pair < 12; pair++) await Promise.all([0, 1].map(async () => {
          const start = performance.now();
          const body = await service.replay(scope, run.run_id, { limit: REPLAY_MAX_BARS });
          expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThanOrEqual(1_048_576);
          pairTimes.push(performance.now() - start);
        }));
        results.push({ run_id: run.run_id, lane: "TWO_CONCURRENT_READERS", samples: pairTimes.length,
          p50_ms: quantile(pairTimes, .5), p95_ms: quantile(pairTimes, .95), max_ms: Math.max(...pairTimes) });
      }
    }
    const receipt = { at_utc: new Date().toISOString(), source: {
        git_head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        reader_sha256: createHash("sha256").update(readFileSync(new URL("../../apps/control-api/src/research/current-source.service.ts", import.meta.url))).digest("hex"),
        contract_sha256: createHash("sha256").update(readFileSync(new URL("../../apps/control-api/src/research/replay-continuity.contract.ts", import.meta.url))).digest("hex"),
      },
      scope: "APPROVED_PREVIEW_READ_ONLY_SQL_SERVICE_JSON_NOT_HTTP_OR_RENDER", max_bars: REPLAY_MAX_BARS,
      runs: runs.map(({ owner_user_id: _actor, ...run }) => run), results,
      memory: process.memoryUsage(), transaction_read_only: "on" };
    writeFileSync(output, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify(results));
  } finally { await pool.end(); }
}, 180_000);
