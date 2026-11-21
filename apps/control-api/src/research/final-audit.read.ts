/** Bounded metadata-only proof read shared by Report, RC and Lineage. */
import type { PoolClient } from "pg";
import { VerifiedPinnedAuditSchema, type VerifiedPinnedAudit,
  PINNED_AUDIT_PROFILE_ID, PINNED_AUDIT_PROFILE_DIGEST } from "./final-audit.contract";

export async function readPinnedAuditProofs(client: PoolClient, workspaceId: string,
  runIds: readonly string[]): Promise<Map<string, VerifiedPinnedAudit>> {
  // Lineage: at most 128 visible attempts × 32 displayed children. Other screens use one ID.
  if (runIds.length > 4096) throw new Error("Audit read exceeds bounded screen population");
  const result = new Map<string, VerifiedPinnedAudit>();
  if (!runIds.length) return result;
  const rows = await client.query<{ wanted_run_id: string; child_run_id: string; child_attempt_id: string;
    artifact_id: string; artifact_revision: string | number; manifest_digest: string; result_digest: string;
    verified_at_utc_ms: string | number; result: unknown }>(`
    -- Keep the requested-run lookup separate from the authority joins. This
    -- bounds the planner's join search (not the authority or result checks),
    -- without a prepared/cached plan tied to another actor's RLS settings.
    WITH candidates AS MATERIALIZED (
      SELECT wanted.run_id AS wanted_run_id, target.workspace_id, target.run_id,
        target.parent_run_id, target.parent_artifact_id, target.parent_manifest_digest, target.target_pins,
        proof.artifact_id, proof.artifact_revision, proof.manifest_digest,
        proof.result_digest, proof.verified_at, proof.result
      FROM unnest($2::text[]) AS wanted(run_id)
      JOIN research.pinned_audit_targets_v1 target
        ON target.workspace_id=$1 AND (target.parent_run_id=wanted.run_id OR target.run_id=wanted.run_id)
      JOIN research.pinned_audit_receipts_v1 proof ON proof.workspace_id=target.workspace_id AND proof.run_id=target.run_id
      WHERE proof.target_digest=target.target_digest
        AND proof.result->>'parameters_digest'=target.target_pins->>'parameters_digest'
    )
    SELECT DISTINCT ON (proof.wanted_run_id) proof.wanted_run_id,
      proof.run_id AS child_run_id, child.attempt_id AS child_attempt_id, proof.artifact_id,
      proof.artifact_revision, proof.manifest_digest, proof.result_digest,
      floor(extract(epoch FROM proof.verified_at)*1000)::bigint AS verified_at_utc_ms, proof.result
    FROM candidates proof
    JOIN research.runs child ON child.workspace_id=proof.workspace_id AND child.run_id=proof.run_id
      AND child.state='READY' AND child.run_kind='AUDIT' AND child.relationship_kind='AUDIT_OF_SELECTION'
      AND child.parent_run_id=proof.parent_run_id
    JOIN research.run_producers producer ON producer.workspace_id=child.workspace_id AND producer.run_id=child.run_id
      AND producer.execution_profile_id=$3 AND producer.execution_profile_digest=$4
    JOIN research.artifacts own ON own.workspace_id=proof.workspace_id AND own.artifact_id=proof.artifact_id
      AND own.run_id=child.run_id AND own.state='SEALED' AND own.artifact_revision=proof.artifact_revision
      AND own.manifest_digest=proof.manifest_digest
    JOIN research.artifacts original ON original.workspace_id=proof.workspace_id AND original.artifact_id=proof.parent_artifact_id
      AND original.run_id=proof.parent_run_id AND original.state='SEALED' AND original.manifest_digest=proof.parent_manifest_digest
      AND original.artifact_revision=(proof.target_pins->>'parent_artifact_revision')::bigint
    WHERE original.artifact_revision=(SELECT max(a.artifact_revision) FROM research.artifacts a
        WHERE a.workspace_id=proof.workspace_id AND a.run_id=proof.parent_run_id AND a.state='SEALED')
    ORDER BY proof.wanted_run_id,proof.verified_at DESC,proof.run_id DESC LIMIT $5`,
    [workspaceId,[...new Set(runIds)],PINNED_AUDIT_PROFILE_ID,PINNED_AUDIT_PROFILE_DIGEST,runIds.length]);
  for (const row of rows.rows) {
    const { wanted_run_id, ...raw } = row;
    const proof = VerifiedPinnedAuditSchema.parse({ ...raw, artifact_revision:Number(raw.artifact_revision),
      verified_at_utc_ms:Number(raw.verified_at_utc_ms), result:typeof raw.result === "string" ? JSON.parse(raw.result) : raw.result });
    if (wanted_run_id !== proof.child_run_id && wanted_run_id !== proof.result.parent_run_id)
      throw new Error("Audit proof is not bound to the requested run");
    result.set(wanted_run_id,proof);
  }
  return result;
}
