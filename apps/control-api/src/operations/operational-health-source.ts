import { createHash } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { PostgresSnapshotReader } from "../query";
import { OperationalReadError, type OperationalAuditCohort } from "./current-operational-read";
import type { QueueHealthPlan } from "./operational-read.service";

export const OPERATIONAL_QUEUE_HEALTH_SOURCE = Symbol("OPERATIONAL_QUEUE_HEALTH_SOURCE");
/** A qualified projection VIEW, not a browser-supplied table or a source
 * status heuristic. Its base queue population/identity/filter columns MUST be
 * byte/row-equivalent to execution_operation_queue_v2; owning source axes are
 * joined one-to-one, and missing axes are literal NOT_REPORTED. */
export interface OperationalQueueHealthBinding {
  readonly authority: "PORTAL";
  readonly source_ref: string;
  readonly schema_sha256: string;
  /** Versioned fingerprint of the installed view definition and its ordered
   * output columns. Supplied by the commissioning owner, not the request. */
  readonly view_definition_sha256_v1: string;
  readonly table: "execution_operation_queue_health_v2";
  readonly delivery_axis: "delivery_state" | null;
  readonly display_axis: "display_state" | null;
  /** Separate owning exceptions, already scoped with the SAME cohort AND
   * filters by this source. Runs inside the lent RR transaction only. */
  readonly exceptions?: (snapshot: PostgresSnapshotReader<QueryResultRow>, cohort: OperationalAuditCohort,
    filters: Readonly<Record<string, unknown>>) => Promise<{ count: number | null }>;
}

/** Deterministic, versioned fingerprint of the PostgreSQL view descriptor.
 * This is NOT the migration/schema hash or proof of source qualification. */
export async function operationalHealthViewDigest(snapshot: PostgresSnapshotReader<QueryResultRow>): Promise<string> {
  const rows = await snapshot.query<{ definition: unknown; position: unknown; name: unknown; type: unknown }>(`
    SELECT pg_get_viewdef(c.oid, false) AS definition, a.attnum::int AS position,
      a.attname::text AS name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS type
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'v'
    ORDER BY a.attnum`, ["public", "execution_operation_queue_health_v2"]);
  if (rows.length === 0 || rows.length > 128 || typeof rows[0].definition !== "string" ||
      Buffer.byteLength(rows[0].definition, "utf8") > 262_144 || rows.some((r, i) =>
        r.definition !== rows[0].definition || !Number.isSafeInteger(r.position) ||
        (r.position as number) <= (i ? (rows[i - 1].position as number) : 0) ||
        typeof r.name !== "string" || typeof r.type !== "string"))
    throw new OperationalReadError("OPERATIONAL_HEALTH_SOURCE_INVALID");
  const descriptor = { version: "portal.operational-health-view.v1", definition: rows[0].definition,
    columns: rows.map(r => ({ position: r.position, name: r.name, type: r.type })) };
  return `sha256:${createHash("sha256").update(JSON.stringify(descriptor), "utf8").digest("hex")}`;
}
export interface OperationalQueueHealthSource {
  select(cohort: OperationalAuditCohort, filters: Readonly<Record<string, unknown>>): {
    table: "execution_operation_queue_health_v2";
    resourceId: "execution.operational-queue.health.v2";
    plan: QueueHealthPlan;
  } | undefined;
}

/** Binds a commissioned exact-axis view to the real service. This factory
 * does NOT commission a producer, install a view, read an upstream, or grant
 * scope. The query engine still applies the current cohort's tuple predicate,
 * workspace and ALL selected filters BEFORE grouping/counting. */
export function createOperationalQueueHealthSource(binding: OperationalQueueHealthBinding): OperationalQueueHealthSource {
  if (binding.authority !== "PORTAL" || binding.table !== "execution_operation_queue_health_v2" ||
      typeof binding.source_ref !== "string" || !binding.source_ref.trim() || binding.source_ref.length > 512 ||
      !/^sha256:[0-9a-f]{64}$/.test(binding.schema_sha256) ||
      !/^sha256:[0-9a-f]{64}$/.test(binding.view_definition_sha256_v1) ||
      binding.delivery_axis !== null && binding.delivery_axis !== "delivery_state" ||
      binding.display_axis !== null && binding.display_axis !== "display_state" ||
      binding.delivery_axis === null && binding.display_axis === null && !binding.exceptions)
    throw new OperationalReadError("OPERATIONAL_HEALTH_SOURCE_INVALID");
  const captured = Object.freeze({ ...binding });
  return Object.freeze({ select(cohort: OperationalAuditCohort, filters: Readonly<Record<string, unknown>>) {
    if (!cohort.fingerprint || cohort.scope.fingerprint !== cohort.fingerprint)
      throw new OperationalReadError("OPERATIONAL_HEALTH_SOURCE_INVALID");
    const selected = Object.freeze({ ...filters });
    return { table: captured.table, resourceId: "execution.operational-queue.health.v2" as const,
      plan: { delivery: captured.delivery_axis !== null, display: captured.display_axis !== null,
        verify: async (snapshot: PostgresSnapshotReader<QueryResultRow>) => {
          if (await operationalHealthViewDigest(snapshot) !== captured.view_definition_sha256_v1)
            throw new OperationalReadError("OPERATIONAL_HEALTH_SOURCE_INVALID");
        },
        ...(captured.exceptions ? { exceptions: async (snapshot: PostgresSnapshotReader<QueryResultRow>) => {
          const result = await captured.exceptions!(snapshot, cohort, selected);
          if (!result || result.count !== null && (!Number.isSafeInteger(result.count) || result.count < 0))
            throw new OperationalReadError("OPERATIONAL_HEALTH_SOURCE_INVALID");
          return { count: result.count };
        } } : {}) } };
  } });
}
