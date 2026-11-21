/** PRIVATE operator-only join of ONE native cache observation with ONE existing
 * durable custody row (BE-P22). No HTTP listener, no route, no permission, no
 * browser field, no list / search / enumerate form, no write of any kind.
 *
 *   node dist/cli/execution-native-cache-observation.js --dir <abs 0700 observation dir>
 *     --lease <uuid> --attempt <uuid>
 *
 * The (lease, attempt) pair must come from the genuine custody row of the
 * request being checked; a lease alone finds nothing. The observation log is
 * read through the descriptor-bounded private sink (0700 dir / 0600 file, one
 * link, current owner, <= 1 MiB). The MAC key is NEVER loaded: this tool can
 * only compare, never recompute or reveal an identity. The database side is ONE
 * read-only statement over the 7 obligation columns named in
 * NATIVE_CACHE_OBLIGATION_SQL (never base_body, cookies, tokens or JWTs), run
 * under the same hash-pinned native runtime pool profile and registered-schema
 * check as the other offline native tools.
 *
 * Output: one JSON receipt. CORRELATED / MISMATCH compare the observation with
 * the durable row; NO_OBSERVATION / NO_CUSTODY_ROW are reported as such and
 * prove nothing about the cache. `egress_semantics` is LOCAL_CORE_HTTP_EGRESS_ONLY,
 * never a browser ACK, and no timestamp is claimed.
 * Exit: 0 receipt printed, 2 usage, 1 any typed refusal. Codes only: no path,
 * SQL, key, digest input or exception text is echoed. */
import "reflect-metadata";
import { loadConfig } from "../config";
import { buildPool } from "../db/pool";
import { nativeCoreRuntimeReference, prepareNativeCoreRuntime } from "../execution-v2/native-core-runtime";
import { nativeResearchReview } from "../execution/native-review-profile";
import { assertRegisteredResearchCurrentHumanSchema } from "../execution-v2/current-human-schema";
import {
  FileNativeCacheObservationSink, NATIVE_CACHE_OBLIGATION_SQL, NativeCacheObservationError,
  joinNativeCacheObservation,
} from "../execution-v2/native-cache-observation";

export interface NativeCacheObservationCliArguments { dir: string; lease: string; attempt: string }

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/** Pure argv parser: exactly --dir / --lease / --attempt once each; anything else
 * (unknown flag, repeat, missing value, relative path, non-canonical UUID) is a
 * usage error and nothing is opened. */
export function parseNativeCacheObservationArgs(argv: readonly string[]): NativeCacheObservationCliArguments {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]!, value = argv[i + 1];
    if (!["--dir", "--lease", "--attempt"].includes(flag) || values.has(flag) || value === undefined)
      throw new Error("NATIVE_CACHE_OBSERVATION_USAGE");
    values.set(flag, value);
  }
  const dir = values.get("--dir"), lease = values.get("--lease"), attempt = values.get("--attempt");
  if (values.size !== 3 || !dir?.startsWith("/") || dir.includes("\0") || !lease || !attempt ||
    !UUID.test(lease) || !UUID.test(attempt)) throw new Error("NATIVE_CACHE_OBSERVATION_USAGE");
  return { dir, lease, attempt };
}

async function main() {
  const args = parseNativeCacheObservationArgs(process.argv.slice(2)), config = loadConfig();
  if (!nativeResearchReview(config) || config.PORTAL_ENV !== "local" || config.AUTH_MODE !== "dev")
    throw new Error("NATIVE_CACHE_OBSERVATION_SCOPE_REQUIRED");
  const reference = nativeCoreRuntimeReference();
  if (!reference) throw new Error("NATIVE_CACHE_OBSERVATION_SCOPE_REQUIRED");
  // Local file first (read mode never creates the directory): a missing or
  // loose directory is refused before any database connection exists.
  const sink = new FileNativeCacheObservationSink(args.dir, { create: false });
  const native = await prepareNativeCoreRuntime(reference);
  const target = native.researchReviewTarget(config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID!);
  const pool = buildPool(config.DATABASE_URL, native.poolProfile);
  try {
    await assertRegisteredResearchCurrentHumanSchema(pool, target);
    const receipt = await joinNativeCacheObservation(sink, async (lease, attempt) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN READ ONLY");
        try {
          return (await client.query(NATIVE_CACHE_OBLIGATION_SQL, [lease, attempt])).rows as unknown[];
        } finally { await client.query("ROLLBACK").catch(() => undefined); }
      } finally { client.release(); }
    }, args.lease, args.attempt);
    process.stdout.write(JSON.stringify(receipt) + "\n");
  } finally { await pool.end(); }
}

if (require.main === module) {
  void main().catch(error => {
    const typed = error instanceof NativeCacheObservationError ? error.code
      : error instanceof Error && /^(NATIVE_CACHE_OBSERVATION_(USAGE|SCOPE_REQUIRED)|CURRENT_HUMAN_SCHEMA_[A-Z_]+)$/.test(error.message)
        ? error.message : "NATIVE_CACHE_OBSERVATION_FAILED";
    process.stderr.write(JSON.stringify({ code: typed }) + "\n");
    process.exitCode = typed === "NATIVE_CACHE_OBSERVATION_USAGE" ? 2 : 1;
  });
}
