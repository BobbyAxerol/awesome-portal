import type { Pool } from "pg";
import { createHash } from "node:crypto";
import type { ProfileProjectionSnapshot, ProjectionEnvironment, ProjectionRow } from "./profile-projection.repository";
import { profileProjectionCatalog } from "./profile-projection.catalog";

/** Scalar validator of the SAME scoped inputs as retainedSnapshot. Never loads
 * the multi-MiB payload just to confirm an unchanged retained observation.
 * Digests are writer-owned immutable content facts, not access/freshness facts. */
export async function retainedRevision(pool: Pool, workspace: string,
  environment: ProjectionEnvironment, profile: string): Promise<string | null> {
  const result=await pool.query<{retained_revision:string}>(`WITH entities AS (
    SELECT e.relation_key,e.entity_key,e.source_row_digest,b.source_contract_revision,b.source_catalogue_sha256
    FROM execution_durable_mirror_current_entities e
    JOIN execution_durable_mirror_batches b ON b.batch_id=e.last_observed_batch_id
    WHERE e.workspace_id=$1 AND e.environment=$2 AND e.profile_id=$3
      AND b.workspace_id=e.workspace_id AND b.environment=e.environment AND b.profile_id=e.profile_id
    ORDER BY e.relation_key,e.entity_key LIMIT 10001
  ) SELECT encode(sha256(convert_to(jsonb_build_array(s.payload_digest,s.source_epoch,s.source_cursor,
    s.source_as_of,s.received_at,s.last_successful_refresh_at,s.completeness,s.projection_epoch,
    s.projection_sequence,s.source_catalogue_sha256,
    (SELECT jsonb_agg(to_jsonb(e) ORDER BY relation_key,entity_key) FROM entities e))::text,'UTF8')),'hex') AS retained_revision
    FROM execution_profile_projection_snapshots s
    WHERE s.workspace_id=$1 AND s.environment=$2 AND s.profile_id=$3`,[workspace,environment,profile]);
  return result.rows[0]?.retained_revision ?? null;
}

/** Immutable read view; never writes a source snapshot, clock or acceptance. */
export async function retainedSnapshot(pool: Pool, snapshot: ProfileProjectionSnapshot,
  workspace: string, environment: ProjectionEnvironment, profile: string): Promise<ProfileProjectionSnapshot> {
  const result = await pool.query<{ relation_key: string; fields: ProjectionRow["fields"];
    source_contract_revision: string; source_catalogue_sha256: string; source_row_digest: string }>(
    `SELECT e.relation_key,e.fields,b.source_contract_revision,b.source_catalogue_sha256,e.source_row_digest
       FROM execution_durable_mirror_current_entities e
       JOIN execution_durable_mirror_batches b ON b.batch_id=e.last_observed_batch_id
      WHERE e.workspace_id=$1 AND e.environment=$2 AND e.profile_id=$3
        AND b.workspace_id=e.workspace_id AND b.environment=e.environment AND b.profile_id=e.profile_id
      ORDER BY e.relation_key,e.entity_key LIMIT 10001`, [workspace, environment, profile]);
  if (result.rows.length > 10000) throw new Error("UDB_RETAINED_VIEW_ROW_BOUND");
  const groups = new Map<string, ProjectionRow[]>();
  const fields = new Map<string, Set<string>>();
  for (const binding of (["paper", "sandbox", "live"] as const).flatMap(env => profileProjectionCatalog(env))) {
    const key = `${binding.sourceId}:${binding.relation}`, accepted = fields.get(key) ?? new Set<string>();
    binding.fields.forEach(field => accepted.add(field)); fields.set(key, accepted);
  }
  for (const row of result.rows) {
    const accepted = fields.get(row.relation_key);
    if (!accepted) continue;
    const items = groups.get(row.relation_key) ?? [];
    items.push({ lineage: { workspace_id: workspace, profile_id: profile,
      source_contract_revision: row.source_contract_revision, source_catalogue_sha256: row.source_catalogue_sha256 },
      fields: Object.fromEntries(Object.entries(row.fields).filter(([key]) => accepted.has(key))) });
    groups.set(row.relation_key, items);
  }
  const relations = { ...snapshot.document.relations };
  for (const [key, items] of groups) {
    const existing = relations[key];
    // Latest accepted facts always win. A refused/missing relation may expose
    // separately-labelled earlier retained observations, not source acceptance.
    if (existing?.availability === "AVAILABLE" && existing.items.length > 0) continue;
    const separator = key.indexOf(":");
    if (separator < 1) throw new Error("UDB_RETAINED_RELATION_INVALID");
    relations[key] = { source_id: key.slice(0, separator), relation: key.slice(separator + 1),
      availability: "AVAILABLE", reason_code: "UDB_RETAINED_OBSERVATION_NOT_CURRENT_SOURCE",
      as_of: existing?.as_of ?? null, freshness: "STALE", completeness: "PARTIAL",
      source_catalogue_sha256: items[0]?.lineage.source_catalogue_sha256, items };
  }
  // Preserve source clocks/digest separately in the context API. This digest
  // identifies only this deterministic view and invalidates local page cursors.
  const digest = "sha256:" + createHash("sha256").update(snapshot.payloadDigest)
    .update(JSON.stringify(result.rows.map(row => [row.relation_key, row.source_row_digest]))).digest("hex");
  return { ...snapshot, completeness: "PARTIAL", payloadDigest: digest,
    document: { ...snapshot.document, relations: Object.fromEntries(Object.entries(relations)
      .map(([key, relation]) => [key, { ...relation, freshness: "STALE" as const, completeness: "PARTIAL" as const }])) } };
}
