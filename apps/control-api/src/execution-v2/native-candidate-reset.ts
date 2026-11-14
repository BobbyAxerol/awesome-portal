import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import {
  CURRENT_HUMAN_RESEARCH_SCHEMA_VERSION,
  assertRegisteredResearchCurrentHumanSchema,
  installResearchCurrentHumanSchema,
  nativeCoreSchemaTarget,
  type NativeCoreSchemaTarget,
} from "./current-human-schema";

/**
 * PROPOSAL (stage-2f recovery R2n, 14 Nov 2026), NOT wired into any CLI or image and never run on a host.
 *
 * Resets Core's own review bookkeeping (schema `elp210_candidate` and its immutable registry
 * `public.portal_native_review_schema`) ONLY when it is stuck: a global drain is open AND at least one unresolved
 * native obligation is UNKNOWN. A healthy schema is refused. An archive file (pg_dump of the schema) must exist and
 * match the caller-pinned SHA-256; the archive content is not read beyond hashing. The step removes the registry
 * deliberately (the installer refuses a half state) and then runs the REGISTERED installer from empty, so the new
 * schema is byte-for-byte the registered one. No foreign key or view crosses the schema border (checked read-only on
 * the preview database); grants, policies, receipts and sessions live in public tables and are untouched.
 */
export class NativeCandidateResetError extends Error {
  constructor(readonly code: string) { super(`NATIVE_CANDIDATE_RESET_${code}`); this.name = "NativeCandidateResetError"; }
}
const fail = (code: string): never => { throw new NativeCandidateResetError(code); };
const relations = ["authority", "events", "leases", "mutation_events", "mutations", "native_read_events", "native_read_obligations", "obligations"] as const;

export interface NativeCandidateResetInput {
  target: NativeCoreSchemaTarget;
  archive_path: string;
  archive_sha256: string;
  /** Must equal `RESET_` + the first 8 hex characters of the archive hash. */
  confirm: string;
  schema_sql_path?: string;
}
export interface NativeCandidateResetResult {
  before: Record<string, number>;
  drain_open: true;
  unknown_obligations: number;
  removed_public_guards: number;
  after: Record<string, number>;
  installed: boolean;
  schema_version: string;
}

async function counts(pool: Pool): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const name of relations) out[name] = Number((await pool.query(`SELECT count(*)::int AS n FROM elp210_candidate.${name}`)).rows[0].n);
  return out;
}

export async function resetResearchCurrentHumanSchema(pool: Pool, input: NativeCandidateResetInput): Promise<NativeCandidateResetResult> {
  const target = nativeCoreSchemaTarget.safeParse(input.target);
  if (!target.success) return fail("TARGET_INVALID");
  if (!/^[a-f0-9]{64}$/.test(input.archive_sha256) || input.confirm !== `RESET_${input.archive_sha256.slice(0, 8)}`) return fail("CONFIRMATION_INVALID");
  let archive: Buffer;
  try { archive = readFileSync(input.archive_path); } catch { return fail("ARCHIVE_MISSING"); }
  if (archive.length < 1024 || createHash("sha256").update(archive).digest("hex") !== input.archive_sha256) return fail("ARCHIVE_MISMATCH");
  // The schema must be the registered, undrifted one before anything is removed.
  await assertRegisteredResearchCurrentHumanSchema(pool, target.data, input.schema_sql_path);
  const before = await counts(pool);
  const db = await pool.connect();
  let removedGuards = 0, unknown = 0;
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL lock_timeout='3000ms'; SET LOCAL statement_timeout='30000ms'; SET LOCAL search_path=public,pg_catalog");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('research-current-human-schema',0))");
    const authority = (await db.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton FOR UPDATE")).rows[0];
    unknown = Number((await db.query("SELECT count(*)::int AS n FROM elp210_candidate.native_read_obligations WHERE phase='UNKNOWN' AND NOT source_reconciled")).rows[0].n);
    if (!authority?.drain_id || unknown < 1) return fail("NOT_STUCK");
    const guards = await db.query(`SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname IN('elp210_authority_guard','elp210_no_truncate')`);
    // The registry is immutable by trigger on UPDATE/DELETE/TRUNCATE, never on DROP.
    await db.query("DROP TABLE public.portal_native_review_schema");
    await db.query("DROP SCHEMA elp210_candidate CASCADE");
    removedGuards = Number(guards.rows[0].n);
    const left = await db.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgname IN('elp210_authority_guard','elp210_no_truncate')`);
    if (Number(left.rows[0].n) !== 0) return fail("GUARDS_REMAIN");
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { db.release(); }
  // Registered installer from empty; a crash between the two steps leaves "nothing installed" (the server refuses to start).
  const installed = await installResearchCurrentHumanSchema(pool, target.data, input.schema_sql_path);
  if (!installed.installed) return fail("REINSTALL_NOT_PERFORMED");
  return { before, drain_open: true, unknown_obligations: unknown, removed_public_guards: removedGuards, after: await counts(pool),
    installed: true, schema_version: CURRENT_HUMAN_RESEARCH_SCHEMA_VERSION };
}
