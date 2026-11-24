/** UNMOUNTED bounded ordinary/C2 restore observation. This never installs,
 * re-pins, repairs or authorizes restored data. A matching checkpoint is NOT
 * a cutover fence: existing C2 old-holder, quarantine, source reconciliation
 * and independently controlled fresh-floor barriers remain mandatory. */
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { RESTORE_C2_INVENTORY_TABLES } from "./restore-c2-inventory";
import { OrdinaryProfileAuthorityRepository } from "./ordinary-profile-authority";
import { physicalTargetMatches } from "./owner-target";
import { restoreCheckpointEventHash, type RestoreCheckpointPin, type RestoreCheckpointCaptureKind }
  from "./restore-checkpoint-authority";

export const ORDINARY_RESTORE_PROFILE = "portal.ordinary-profile-restore.candidate.v1" as const;
export const ORDINARY_RESTORE_TABLES = Object.freeze([...RESTORE_C2_INVENTORY_TABLES,
  "public.portal_ordinary_profile_authority", "public.portal_ordinary_profile_grants",
  "public.portal_ordinary_profile_events"] as const);
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.string().uuid();
const decimal = z.string().regex(/^(?:0|[1-9][0-9]{0,18})$/).refine(v => BigInt(v) <= 9_223_372_036_854_775_807n);
const system = z.string().regex(/^(?:0|[1-9][0-9]{0,19})$/);
const drain = z.string().regex(/^restore_v2:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const label = z.string().min(1).max(256).refine(v => !/[\u0000-\u001f\u007f]/u.test(v));
const target = z.object({ database_name: label, database_system_identifier: system, role_name: label }).strict();
const pinSchema = z.object({ checkpoint: z.object({ checkpoint_id: uuid, source_system_identifier: system,
  authority_system_identifier: system }).strict(), restored: target, authority: target }).strict();
export type OrdinaryRestoreVerifierPin = z.infer<typeof pinSchema>;
type Code = "INVALID" | "LIMIT" | "SCHEMA" | "SECURITY" | "CUSTODY_BUSY" | "TARGET" | "JOURNAL" | "MISMATCH" | "UNAVAILABLE";
const fail = (code: Code): never => { throw new Error(`ORDINARY_RESTORE_${code}`); };
const safe = (e: unknown): never => {
  if (e instanceof Error && /^ORDINARY_RESTORE_[A-Z_]+$/.test(e.message)) throw e;
  return fail("UNAVAILABLE");
};
function bounds(value: number): void { if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) fail("LIMIT"); }

/** Only a source capture calls this: a restore inventory intentionally hashes
 * original target bytes without rewriting them to fit the clone's location. */
export async function assertOrdinaryRestoreSourceBinding(db: PoolClient): Promise<void> {
  try {
    const rows = await db.query<{ head_fact: { target?: unknown } }>(
      "SELECT head_fact FROM public.portal_ordinary_profile_authority ORDER BY workspace_id LIMIT 129");
    if (!rows.rows.length || rows.rows.length > 128) return fail("LIMIT");
    for (const row of rows.rows) {
      const parsed = target.safeParse(row.head_fact?.target && Object.fromEntries(
        Object.entries(row.head_fact.target).filter(([key]) => ["database_name", "database_system_identifier", "role_name"].includes(key))));
      if (!parsed.success || !await physicalTargetMatches(db, parsed.data)) return fail("TARGET");
    }
  } catch (error) { return safe(error); }
}

/** Caller owns a READ COMMITTED read-write transaction and must retain locks
 * during its independent append. A disconnect/idle timeout can release them
 * before an independently committed receipt; that ambiguous observation must
 * be re-captured with the same operation, never used as cutover permission.
 * Closed identifiers and per-table bounds only;
 * credential/session rows are hashed inside PostgreSQL, never returned. The
 * profile commits observed security, not the safety of privileged operators. */
export async function captureLockedOrdinaryInventory(db: PoolClient, maximumRows: number): Promise<string> {
  bounds(maximumRows);
  const started = Date.now(), names = [...ORDINARY_RESTORE_TABLES].sort();
  const deadline = () => { if (Date.now() - started > 15_000) fail("LIMIT"); };
  try {
    if (new Set(names).size !== names.length) return fail("SCHEMA");
    await db.query(`LOCK TABLE ${names.join(",")} IN SHARE MODE`);
    // Fence function replacement too, rather than claiming a table lock
    // freezes trigger bodies. This is a bounded, privileged offline observer.
    await db.query("LOCK TABLE pg_catalog.pg_proc IN SHARE MODE");
    await db.query("SET LOCAL row_security=off");
    const found = await db.query<{ name: string; kind: string; rls: boolean }>(`SELECT name,c.relkind AS kind,
      row_security_active(c.oid) AS rls FROM unnest($1::text[]) name
      JOIN pg_catalog.pg_class c ON c.oid=to_regclass(name)`, [names]);
    if (found.rows.length !== names.length || new Set(found.rows.map(r => r.name)).size !== names.length ||
      found.rows.some(r => !names.includes(r.name as typeof names[number]) || r.kind !== "r" || r.rls !== false)) return fail("SCHEMA");
    const unknown = await db.query<{ unsupported: boolean }>(`SELECT EXISTS(SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE
      (n.nspname='elp210_candidate' OR left(n.nspname,10)='elp210_c2_' OR n.nspname='portal_local_write_fence'
        OR n.nspname='public' AND left(c.relname,24)='portal_ordinary_profile_')
      -- Candidate accounting views are not new stores. Ordinary-prefix views
      -- ARE unsupported authority surfaces, even when all tables are present.
      AND (c.relkind IN ('r','p','f','m') OR n.nspname='public' AND c.relkind='v')
      AND NOT (n.nspname||'.'||c.relname=ANY($1::text[])))
      OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND left(p.proname,24)='portal_ordinary_profile_'
        AND (p.proname NOT IN ('portal_ordinary_profile_authority_change','portal_ordinary_profile_no_truncate')
          OR p.pronargs<>0 OR p.prokind<>'f'))
      OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN ('portal_restore_authority','portal_restore_original_custody'))
      AS unsupported`, [names]);
    if (unknown.rows.length !== 1 || unknown.rows[0]?.unsupported !== false) return fail("SCHEMA");
    const guards = await db.query<{ n: string }>(`WITH expected(tab,name,fn,kind) AS (VALUES
      ('portal_ordinary_profile_authority','ordinary_profile_head_preserve','public.portal_access_immutable_event()',11),
      ('portal_ordinary_profile_grants','ordinary_profile_grants_immutable','public.portal_access_immutable_event()',27),
      ('portal_ordinary_profile_events','ordinary_profile_events_immutable','public.portal_access_immutable_event()',27))
      SELECT count(*)::text AS n FROM expected e JOIN pg_trigger t ON t.tgrelid=to_regclass('public.'||e.tab)
      AND t.tgname=e.name AND t.tgfoid=to_regprocedure(e.fn) AND t.tgtype=e.kind
      WHERE t.tgenabled='O' AND NOT t.tgisinternal AND t.tgqual IS NULL`);
    const fences = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM pg_trigger t
      WHERE t.tgrelid=ANY($1::regclass[]) AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgqual IS NULL AND
      ((t.tgname='ordinary_profile_no_truncate' AND t.tgtype=34 AND t.tgfoid=to_regprocedure('public.portal_ordinary_profile_no_truncate()')) OR
       (t.tgname='ordinary_profile_authority_guard' AND t.tgtype=31 AND t.tgfoid=to_regprocedure('public.portal_ordinary_profile_authority_change()')) OR
       (t.tgname='native_current_authority_guard' AND t.tgtype=31 AND t.tgfoid=to_regprocedure('public.portal_guard_native_current_authority()')))`,
      [ORDINARY_RESTORE_TABLES.slice(-3)]);
    if (guards.rows[0]?.n !== "3" || fences.rows[0]?.n !== "9") return fail("SECURITY");
    const busy = await db.query<{ busy: boolean }>(`SELECT
      EXISTS(SELECT 1 FROM elp210_candidate.leases WHERE phase IN ('ISSUED','ENTERED','UNKNOWN')) OR
      EXISTS(SELECT 1 FROM elp210_candidate.native_read_obligations WHERE NOT source_reconciled) OR
      EXISTS(SELECT 1 FROM elp210_candidate.mutations WHERE state='PENDING') OR
      EXISTS(SELECT 1 FROM public.portal_native_root_obligations WHERE NOT source_settled) OR
      EXISTS(SELECT 1 FROM public.portal_native_current_read_obligations WHERE NOT source_settled) OR
      EXISTS(SELECT 1 FROM elp210_c2_delivery_candidate.obligations) OR
      EXISTS(SELECT 1 FROM elp210_c2_preparation.b2_attempts WHERE state IN ('RESERVED','UNKNOWN')) AS busy`);
    if (busy.rows.length !== 1 || busy.rows[0]?.busy !== false) return fail("CUSTODY_BUSY");
    const workspaces = await db.query<{ workspace_id: string }>(
      "SELECT workspace_id FROM public.portal_ordinary_profile_authority ORDER BY workspace_id LIMIT 129");
    if (!workspaces.rows.length || workspaces.rows.length > 128) return fail("LIMIT");
    for (const row of workspaces.rows) {
      deadline(); if (!await new OrdinaryProfileAuthorityRepository(db).load(row.workspace_id)) return fail("SCHEMA");
    }
    const facts: [string, number, string][] = [];
    for (const name of names) {
      deadline();
      const result = await db.query<{ count: number; digest: string }>(`WITH bounded AS (
        SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h FROM ${name} t LIMIT $1)
        SELECT count(*)::int AS count,encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') AS digest
        FROM bounded`, [maximumRows + 1]);
      const row = result.rows[0];
      if (result.rows.length !== 1 || !row || !Number.isSafeInteger(row.count) || row.count < 0 || row.count > maximumRows ||
          !hash.safeParse(row.digest).success) return fail("LIMIT");
      facts.push([name, row.count, row.digest]);
    }
    const security = await db.query<{ fact: string }>(`SELECT jsonb_build_object(
      'schema',n.nspname,'table',c.relname,'owner',pg_get_userbyid(c.relowner),
      'acl',coalesce(c.relacl,acldefault('r',c.relowner))::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
      'columns',coalesce((SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),
        a.attnotnull,a.attidentity,a.attgenerated,coalesce(a.attacl::text,'{}'),pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
      -- PostgreSQL's precedence-preserving pretty deparser canonicalizes the
      -- nested AND introduced by BETWEEN after dump/reparse. Preserve every
      -- constraint name and full predicate; never strip SQL/casts by regex.
      'constraints',coalesce((SELECT jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid,true)) ORDER BY k.conname)
        FROM pg_constraint k WHERE k.conrelid=c.oid),'[]'::jsonb),
      'triggers',coalesce((SELECT jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,pg_get_triggerdef(t.oid),pg_get_functiondef(t.tgfoid))
        ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]'::jsonb),
      'policies',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p
        WHERE p.schemaname=n.nspname AND p.tablename=c.relname),'[]'::jsonb))::text AS fact
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=ANY($1::regclass[])
      ORDER BY n.nspname,c.relname`, [names]);
    const routines = await db.query<{ fact: string; kind: string }>(`SELECT p.prokind AS kind,jsonb_build_object(
      'schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'kind',p.prokind,
      'owner',pg_get_userbyid(p.proowner),'acl',coalesce(p.proacl,acldefault('f',p.proowner))::text,
      'security_definer',p.prosecdef,'leakproof',p.proleakproof,'config',p.proconfig,
      'definition',CASE WHEN p.prokind IN ('f','p') THEN pg_get_functiondef(p.oid) ELSE NULL END)::text AS fact
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='elp210_candidate'
      OR left(n.nspname,10)='elp210_c2_' OR n.nspname='portal_local_write_fence'
      OR n.nspname='public' AND (left(p.proname,24)='portal_ordinary_profile_' OR p.oid IN
        (SELECT tgfoid FROM pg_trigger WHERE tgrelid=ANY($1::regclass[]) AND NOT tgisinternal))
      ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) LIMIT 10001`, [names]);
    if (security.rows.length !== names.length || routines.rows.length > 10_000 ||
      security.rows.some(r => typeof r.fact !== "string") || routines.rows.some(r => typeof r.fact !== "string" || !["f", "p"].includes(r.kind)))
      return fail("SECURITY");
    deadline(); return sha(JSON.stringify([ORDINARY_RESTORE_PROFILE, facts, security.rows.map(r => r.fact), routines.rows.map(r => r.fact)]));
  } catch (error) { return safe(error); }
}

export function ordinaryRestoreCheckpointDigest(pin: RestoreCheckpointPin, drainId: string, revision: string, inventory: string): string {
  if (!pin || !uuid.safeParse(pin.checkpoint_id).success || !system.safeParse(pin.source_system_identifier).success ||
    !system.safeParse(pin.authority_system_identifier).success || pin.source_system_identifier === pin.authority_system_identifier ||
    !drain.safeParse(drainId).success || !decimal.safeParse(revision).success || !hash.safeParse(inventory).success) return fail("INVALID");
  return sha(JSON.stringify([ORDINARY_RESTORE_PROFILE, pin.checkpoint_id, pin.source_system_identifier,
    pin.authority_system_identifier, drainId, revision, inventory]));
}

type Event = { operation_id: string; expected_generation: string; generation: string; source_revision: string;
  inventory_digest: string; capture_kind: RestoreCheckpointCaptureKind; predecessor_hash: string; event_hash: string };
const kinds = new Set(["CALLER_CLAIM", "DRAIN_BOUND_CLAIM", "LOCKED_SOURCE_CAPTURE", "FROZEN_SOURCE_CAPTURE",
  "FROZEN_NOLOGIN_SOURCE_OBSERVATION", "FROZEN_CLOSED_DB_OBSERVATION", "LOCKED_ORDINARY_SOURCE_CAPTURE"]);
function validClosedObservation(raw: string, pin: RestoreCheckpointPin, event: Event): boolean {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 8192 || sha(raw) !== event.inventory_digest) return false;
  let value: unknown; try { value = JSON.parse(raw); } catch { return false; }
  if (!Array.isArray(value) || value.length !== 11 || JSON.stringify(value) !== raw ||
    value[0] !== "portal.restore-frozen-closed-db-observation.v1" || value[1] !== pin.checkpoint_id ||
    value[2] !== pin.source_system_identifier || !drain.safeParse(value[3]).success || value[4] !== event.source_revision ||
    !uuid.safeParse(value[5]).success || !decimal.safeParse(value[6]).success || !decimal.safeParse(value[7]).success ||
    BigInt(value[7]) < 1n || BigInt(value[7]) > 4294967295n || !decimal.safeParse(value[8]).success ||
    BigInt(value[8]) !== BigInt(value[6]) + 1n || !hash.safeParse(value[10]).success) return false;
  const closed = z.object({ target_oid: decimal.refine(v => BigInt(v) > 0n && BigInt(v) <= 4294967295n),
    operator_role: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/), observer_pid: z.number().int().positive().safe(),
    observer_start: z.string().min(10).max(80), application_name: z.string().regex(/^portal\.restore\.observer\.[a-f0-9]{32}$/) }).strict();
  return closed.safeParse(value[9]).success;
}

export type OrdinaryRestoreObservation = Readonly<{ state: "MATCH_NOT_CUTOVER"; profile: typeof ORDINARY_RESTORE_PROFILE;
  storage: "DISTINCT_PG_CLUSTERS_ONLY"; mounting: "UNMOUNTED"; generation: string; event_hash: string;
  source_revision: string; operation_id: string; existing_c2_barriers: "REQUIRED_NOT_PROVEN" }>;

/** Reads the actual latest independent head, not a caller-provided digest,
 * receipt or JSON inventory. The authority journal remains locked through the
 * clone comparison. This cannot establish an external nonrollbackable floor. */
export class OrdinaryProfileRestoreVerifier {
  readonly #restored: Pool; readonly #authority: Pool; readonly #pin: OrdinaryRestoreVerifierPin;
  readonly #maximumRows: number; readonly #maximumEvents: number;
  constructor(restored: Pool, authority: Pool, pin: OrdinaryRestoreVerifierPin, maximumRows: number, maximumEvents: number) {
    bounds(maximumRows); bounds(maximumEvents);
    const parsed = pinSchema.safeParse(pin);
    if (!parsed.success || !restored || !authority || restored === authority ||
      parsed.data.authority.database_system_identifier !== parsed.data.checkpoint.authority_system_identifier ||
      parsed.data.restored.database_system_identifier === parsed.data.authority.database_system_identifier ||
      [restored, authority].some(pool => !pool.options || [pool.options.connectionTimeoutMillis, pool.options.query_timeout]
        .some(n => !Number.isSafeInteger(n) || Number(n) < 1 || Number(n) > 10_000))) throw new Error("ORDINARY_RESTORE_INVALID");
    this.#restored = restored; this.#authority = authority; this.#pin = structuredClone(parsed.data);
    this.#maximumRows = maximumRows; this.#maximumEvents = maximumEvents;
  }
  async verifyLatest(): Promise<OrdinaryRestoreObservation> {
    const observed = await this.#authority.connect().catch(safe); let copy: PoolClient | undefined, discardAuthority = false, discardCopy = false;
    try {
      await observed.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await observed.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'; SET LOCAL idle_in_transaction_session_timeout='30000ms'; SET LOCAL row_security=off");
      if (!await physicalTargetMatches(observed, this.#pin.authority)) return fail("TARGET");
      await observed.query("SELECT portal_restore_authority.lock_journal_for_read()");
      const locks = await observed.query<{ n: string }>(`SELECT count(DISTINCT relation)::text AS n FROM pg_locks
        WHERE pid=pg_backend_pid() AND granted AND mode='ShareLock' AND relation IN
        (to_regclass('portal_restore_authority.checkpoints'),to_regclass('portal_restore_authority.events'),
         to_regclass('portal_restore_authority.closed_observations'),to_regclass('pg_catalog.pg_proc'))`);
      const guards = await observed.query<{ n: string }>(`SELECT count(*)::text AS n FROM pg_trigger t WHERE
        ((t.tgrelid=to_regclass('portal_restore_authority.events') AND t.tgname='events_immutable') OR
         (t.tgrelid=to_regclass('portal_restore_authority.closed_observations') AND t.tgname='closed_observations_immutable'))
        AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgtype=58 AND t.tgqual IS NULL
        AND t.tgfoid=to_regprocedure('portal_restore_authority.immutable_event()') AND EXISTS
        (SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=t.tgfoid AND l.lanname='plpgsql'
         AND p.prokind='f' AND p.pronargs=0 AND p.prorettype='pg_catalog.trigger'::regtype AND NOT p.prosecdef
         AND NOT p.proleakproof AND p.provolatile='v' AND p.proconfig IS NULL AND btrim(p.prosrc,$2)=$1)`,
        ["BEGIN RAISE EXCEPTION 'V2_CHECKPOINT_EVENT_IMMUTABLE'; END", " \t\n\r"]);
      if (locks.rows[0]?.n !== "4" || guards.rows[0]?.n !== "2") return fail("JOURNAL");
      const heads = await observed.query<{ generation: string; source_revision: string; event_hash: string; event_count: string;
        source_system_identifier: string; authority_system_identifier: string }>(`SELECT generation::text,source_revision::text,
        event_hash,event_count::text,source_system_identifier,authority_system_identifier
        FROM portal_restore_authority.checkpoints WHERE checkpoint_id=$1`, [this.#pin.checkpoint.checkpoint_id]);
      const h = heads.rows[0];
      if (heads.rows.length !== 1 || !h || !decimal.safeParse(h.generation).success || h.generation === "0" ||
        !decimal.safeParse(h.source_revision).success || h.event_count !== h.generation || !hash.safeParse(h.event_hash).success ||
        BigInt(h.generation) > BigInt(this.#maximumEvents) || h.source_system_identifier !== this.#pin.checkpoint.source_system_identifier ||
        h.authority_system_identifier !== this.#pin.checkpoint.authority_system_identifier) return fail("JOURNAL");
      const events = await observed.query<Event>(`SELECT operation_id::text,expected_generation::text,generation::text,
        source_revision::text,inventory_digest,capture_kind,predecessor_hash,event_hash FROM portal_restore_authority.events
        WHERE checkpoint_id=$1 ORDER BY generation LIMIT $2`, [this.#pin.checkpoint.checkpoint_id, this.#maximumEvents + 1]);
      if (BigInt(events.rows.length) !== BigInt(h.generation)) return fail("JOURNAL");
      let prior = "0".repeat(64), revision = 0n; const operations = new Set<string>();
      for (let i = 0; i < events.rows.length; i++) {
        const e = events.rows[i]!;
        if (!uuid.safeParse(e.operation_id).success || operations.has(e.operation_id) || e.expected_generation !== String(i) ||
          e.generation !== String(i + 1) || !decimal.safeParse(e.source_revision).success || BigInt(e.source_revision) < revision ||
          !hash.safeParse(e.inventory_digest).success || !kinds.has(e.capture_kind) || e.predecessor_hash !== prior ||
          restoreCheckpointEventHash(this.#pin.checkpoint.checkpoint_id, e, e.generation, e.predecessor_hash, e.capture_kind) !== e.event_hash)
          return fail("JOURNAL");
        operations.add(e.operation_id); prior = e.event_hash; revision = BigInt(e.source_revision);
      }
      const last = events.rows.at(-1)!;
      if (last.capture_kind !== "LOCKED_ORDINARY_SOURCE_CAPTURE" || prior !== h.event_hash || revision !== BigInt(h.source_revision)) return fail("JOURNAL");
      const evidence = await observed.query<{ operation_id: string; observation: string }>(`SELECT operation_id::text,observation
        FROM portal_restore_authority.closed_observations WHERE checkpoint_id=$1 ORDER BY operation_id LIMIT $2`,
        [this.#pin.checkpoint.checkpoint_id, this.#maximumEvents + 1]);
      const closed = new Map(events.rows.filter(e => e.capture_kind === "FROZEN_CLOSED_DB_OBSERVATION").map(e => [e.operation_id, e]));
      if (evidence.rows.length !== closed.size || new Set(evidence.rows.map(r => r.operation_id)).size !== closed.size ||
        evidence.rows.some(r => !closed.has(r.operation_id) || !validClosedObservation(r.observation, this.#pin.checkpoint, closed.get(r.operation_id)!)))
        return fail("JOURNAL");
      copy = await this.#restored.connect();
      await copy.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await copy.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'; SET LOCAL idle_in_transaction_session_timeout='5000ms'");
      if (!await physicalTargetMatches(copy, this.#pin.restored)) return fail("TARGET");
      const inventory = await captureLockedOrdinaryInventory(copy, this.#maximumRows);
      const row = (await copy.query<{ revision: string; drain_id: string }>(
        "SELECT revision::text,drain_id FROM elp210_candidate.authority WHERE singleton FOR SHARE")).rows[0];
      if (!row || row.revision !== last.source_revision || ordinaryRestoreCheckpointDigest(this.#pin.checkpoint,
        row.drain_id, row.revision, inventory) !== last.inventory_digest) return fail("MISMATCH");
      await copy.query("COMMIT"); await observed.query("COMMIT");
      return Object.freeze({ state: "MATCH_NOT_CUTOVER", profile: ORDINARY_RESTORE_PROFILE, storage: "DISTINCT_PG_CLUSTERS_ONLY",
        mounting: "UNMOUNTED", generation: last.generation, event_hash: last.event_hash, source_revision: last.source_revision,
        operation_id: last.operation_id, existing_c2_barriers: "REQUIRED_NOT_PROVEN" });
    } catch (error) {
      if (copy) try { await copy.query("ROLLBACK"); } catch { discardCopy = true; }
      try { await observed.query("ROLLBACK"); } catch { discardAuthority = true; }
      return safe(error);
    } finally { copy?.release(discardCopy); observed.release(discardAuthority); }
  }
}
