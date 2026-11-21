/** Fixed SQL: source-bound companion only; no source I/O or analytics on GET. */
import type { PoolClient } from "pg";
import { verifiedEnriched } from "./enriched-analysis.contract";

/** Operator backfill uses the run's immutable producer receipt, not an expiring preflight. */
export const ENRICHED_RETAINED_SOURCE_SQL = `
  SELECT seal.artifact_revision, seal.retained_import_digest, seal.table_rows, seal.summary,
         producer.legacy_request #> '{research,requested_spec,windows}' AS requested_windows,
         producer.legacy_request #> '{research,requested_spec,walk_forward}' AS requested_walk_forward,
         producer.legacy_request #>> '{research,requested_spec,data,timeframe}' AS timeframe
    FROM research.current_source_seals_v1 seal
    JOIN research.run_producers producer ON producer.workspace_id=seal.workspace_id AND producer.run_id=seal.run_id
   WHERE seal.workspace_id=$1 AND seal.run_id=$2 ORDER BY seal.artifact_revision DESC LIMIT 1`;

export const ENRICHED_FIXED_SOURCE_SQL = `
  SELECT source.source_evidence_digest, source.source_payload, projection.projection_revision,
         producer.legacy_request #> '{research,requested_spec,windows}' AS requested_windows,
         producer.legacy_request #>> '{research,requested_spec,data,timeframe}' AS timeframe
    FROM research.run_producers producer
    JOIN research.run_evidence_sources_v1 source ON source.workspace_id=producer.workspace_id
      AND source.run_id=producer.run_id AND source.worker_attempt_id=producer.worker_attempt_id
    JOIN research.run_evidence_projections_v1 projection ON projection.workspace_id=source.workspace_id
      AND projection.run_id=source.run_id AND projection.worker_attempt_id=source.worker_attempt_id
      AND projection.source_evidence_digest=source.source_evidence_digest
   WHERE source.workspace_id=$1 AND source.run_id=$2 ORDER BY projection.received_at DESC,projection.projection_revision DESC LIMIT 1`;

export function enrichedJoin(workspace: string, run: string): string {
  // Arguments are static SQL identifiers from repository code, never request input.
  return `LEFT JOIN LATERAL (
    SELECT enrichment.enriched, enrichment.enriched_digest
      FROM (
        SELECT original.*, 0 AS derivation_priority FROM research.enriched_analysis_v1 original
         WHERE original.workspace_id=${workspace} AND original.run_id=${run}
        UNION ALL
        SELECT amendment.*, 1 AS derivation_priority FROM research.enriched_chart_amendments_v1 amendment
         WHERE amendment.workspace_id=${workspace} AND amendment.run_id=${run}
      ) enrichment
     WHERE enrichment.workspace_id=${workspace} AND enrichment.run_id=${run}
       AND ((enrichment.source_kind='WFO_RETAINED' AND EXISTS (
         SELECT 1 FROM research.current_source_seals_v1 seal
          WHERE seal.workspace_id=enrichment.workspace_id AND seal.run_id=enrichment.run_id
            AND seal.artifact_revision::text=enrichment.source_revision AND seal.retained_import_digest=enrichment.source_digest
            AND seal.artifact_revision=(SELECT max(s.artifact_revision) FROM research.current_source_seals_v1 s
              WHERE s.workspace_id=seal.workspace_id AND s.run_id=seal.run_id)))
        OR (enrichment.source_kind='P04_SOURCE' AND EXISTS (
         SELECT 1 FROM research.run_evidence_projections_v1 projection JOIN research.run_producers producer
          ON producer.workspace_id=projection.workspace_id AND producer.run_id=projection.run_id
           AND producer.worker_attempt_id=projection.worker_attempt_id
          WHERE projection.workspace_id=enrichment.workspace_id AND projection.run_id=enrichment.run_id
            AND projection.projection_revision=enrichment.source_revision
            AND projection.source_evidence_digest=enrichment.source_digest
            AND projection.projection_revision=(SELECT p.projection_revision
              FROM research.run_evidence_projections_v1 p
              WHERE p.workspace_id=projection.workspace_id AND p.run_id=projection.run_id
                AND p.worker_attempt_id=projection.worker_attempt_id
              ORDER BY p.received_at DESC,p.projection_revision DESC LIMIT 1))))
     ORDER BY enrichment.derivation_priority DESC, enrichment.created_at DESC, enrichment.source_revision DESC LIMIT 1
  ) enrichment ON true`;
}

export async function readEnriched(client: PoolClient, workspaceId: string, runId: string, unavailable: () => Error) {
  const result = await client.query(`SELECT enrichment.enriched,enrichment.enriched_digest
    FROM (SELECT $1::text AS workspace_id,$2::text AS run_id) wanted
    ${enrichedJoin("wanted.workspace_id", "wanted.run_id")}`, [workspaceId, runId]);
  const row = result.rows[0];
  try { return verifiedEnriched(row?.enriched, row?.enriched_digest, runId); }
  catch { throw unavailable(); }
}
