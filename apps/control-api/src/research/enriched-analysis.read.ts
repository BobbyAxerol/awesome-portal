/** Fixed SQL: source-bound companion only; no source I/O or analytics on GET. */
import type { PoolClient } from "pg";
import { verifiedEnriched } from "./enriched-analysis.contract";

export function enrichedJoin(workspace: string, run: string): string {
  // Arguments are static SQL identifiers from repository code, never request input.
  return `LEFT JOIN LATERAL (
    SELECT enrichment.enriched, enrichment.enriched_digest
      FROM research.enriched_analysis_v1 enrichment
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
     ORDER BY enrichment.created_at DESC, enrichment.source_revision DESC LIMIT 1
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
