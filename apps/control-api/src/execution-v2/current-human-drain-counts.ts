import type {PoolClient} from "pg";

/** Must be called from the active drain transaction. Every retained C2 HTTP
 * delivery is unresolved: its three states do not prove recipient ACK or
 * physical quiescence. Treat the candidate schema as optional only while it
 * is genuinely absent; an installed but unreadable/malformed table is an
 * error, never an empty census. This does not establish a restore barrier. */
export async function currentHumanDrainCounts(db:PoolClient,requireC2Delivery=false):Promise<{pending:number;unknown:number}> {
  if(typeof requireC2Delivery!=="boolean")throw new Error("CURRENT_HUMAN_DRAIN_CENSUS_INVALID");
  const result=await db.query<{pending:number;unknown:number}>(`SELECT count(*)::int AS pending,
    count(*) FILTER (WHERE phase='UNKNOWN' OR expires_at_ms<=floor(extract(epoch FROM clock_timestamp())*1000))::int AS unknown
    FROM elp210_candidate.obligations WHERE unresolved`);
  const counts=result.rows[0];
  if(result.rows.length!==1||!counts||!Number.isSafeInteger(counts.pending)||!Number.isSafeInteger(counts.unknown)||
    counts.pending<0||counts.unknown<0||counts.unknown>counts.pending)throw new Error("CURRENT_HUMAN_DRAIN_CENSUS_INVALID");
  const underlying=await db.query<{safe:number}>(`SELECT count(*)::int AS safe FROM pg_catalog.pg_class
    WHERE oid IN (to_regclass('elp210_candidate.leases'),to_regclass('elp210_candidate.native_read_obligations'))
      AND relkind IN ('r','p') AND NOT relrowsecurity`);
  if(underlying.rows.length!==1||underlying.rows[0]?.safe!==2)throw new Error("CURRENT_HUMAN_DRAIN_CENSUS_INVALID");
  const installed=await db.query<{namespace_present:boolean;present:boolean}>(`SELECT
    to_regnamespace('elp210_c2_delivery_candidate') IS NOT NULL AS namespace_present,
    to_regclass('elp210_c2_delivery_candidate.obligations') IS NOT NULL AS present`);
  if(installed.rows.length!==1||typeof installed.rows[0]?.namespace_present!=="boolean"||
    typeof installed.rows[0]?.present!=="boolean"||installed.rows[0].namespace_present!==installed.rows[0].present)
    throw new Error("CURRENT_HUMAN_DRAIN_CENSUS_INVALID");
  if(!installed.rows[0].present) {
    if(requireC2Delivery)throw new Error("CURRENT_HUMAN_DRAIN_CENSUS_INVALID");
    return {pending:counts.pending,unknown:counts.unknown};
  }
  // SELECT retains AccessShare through the caller's transaction, preventing a
  // concurrent RLS/DDL change before this metadata check. An RLS-filtered
  // zero is not proof of an empty global custody census, even for an owner
  // that currently bypasses RLS. A view or foreign table is not this schema.
  const delivery=await db.query<{pending:number}>("SELECT count(*)::int AS pending FROM elp210_c2_delivery_candidate.obligations");
  const retained=delivery.rows[0]?.pending;
  if(delivery.rows.length!==1||typeof retained!=="number"||!Number.isSafeInteger(retained)||retained<0||
    !Number.isSafeInteger(counts.pending+retained)||!Number.isSafeInteger(counts.unknown+retained))
    throw new Error("CURRENT_HUMAN_DRAIN_CENSUS_INVALID");
  const table=await db.query<{kind:string;rls:boolean}>(`SELECT c.relkind::text AS kind,c.relrowsecurity AS rls
    FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('elp210_c2_delivery_candidate.obligations')`);
  if(table.rows.length!==1||!['r','p'].includes(table.rows[0]?.kind)||table.rows[0]?.rls!==false)
    throw new Error("CURRENT_HUMAN_DRAIN_CENSUS_INVALID");
  return {pending:counts.pending+retained,unknown:counts.unknown+retained};
}
