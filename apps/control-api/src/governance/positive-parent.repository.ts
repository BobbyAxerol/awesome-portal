import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import type { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import { IdentifierSchema } from "../operations/contracts";
import { computeEvidenceManifestHash } from "./evidence-manifest";
import type { EvidenceRecord } from "./governance.repository";
import { computePaperExitSourceSnapshotHash, type PaperExitSourceSnapshotInput } from "./paper-exit.service";

export type PositiveParentFamily = "R2" | "PAPER_EXIT";
/** Bounded identity, NOT an authorization token. Never take this from HTTP. */
export interface PositiveParentCandidate {
  readonly workspaceId: string;
  readonly family: PositiveParentFamily;
  readonly approvalId: string;
  readonly r1ApprovalId: string;
  readonly r2ApprovalId: string;
  readonly deploymentId: string;
  readonly portfolioId: string;
  readonly environment: "PAPER";
}
export interface PositiveParentOperationCandidate {
  readonly parent: PositiveParentCandidate;
  readonly operationId: string;
}
/** Routing metadata only, never a reusable authorization permit.
 * UNAVAILABLE includes absent, unsupported, invalid join and local collisions.
 * A NULL joined parent is deliberately NOT permission to try another reader. */
export type PositiveParentOperationIdentity =
  | Readonly<{ kind: "PARENT"; selected: PositiveParentOperationCandidate }>
  | Readonly<{ kind: "F0" | "UNAVAILABLE" }>;

/** Internal finite SQL records. Main owns validation/public purpose mapping.
 * UTC strings retain PG precision; do not put them through Date for revision.
 */
export interface RawApprovalMetadata {
  approval_id: string; status: string; policy_version: string;
  approval_version: number; quorum_required: number; quorum_met: number;
  evidence_complete: boolean; evidence_set_hash: string;
  sla_due_at: string; expires_at: string; created_at: string;
  updated_at: string; decided_at: string | null;
}
export interface RawEvidenceMetadata {
  evidence_id: string; ordinal: number; sha256: string; schema_version: string;
  source_authority: string; captured_at: string;
}
export interface RawDecisionOperationMetadata {
  operation_id: string; command_type: string; command_version: number;
  status: string; decision: string; expected_version: number;
  parent_approval_id: string | null; parent_approval_version: number | null;
  parent_evidence_set_hash: string | null;
  created_at: string; expires_at: string; applied_at: string | null;
}
export interface RawPaperReviewMetadata {
  review_id: string; review_state: string; review_version: number;
  promote_to: string; extension_days: number | null; extended_until: string | null;
  artifact_digest: string; observation_policy_id: string; observation_policy_version: string;
  observation_policy_digest: string; evidence_pack_id: string; evidence_pack_digest: string;
  evaluation_policy_version: string; evaluation_formula_version: string;
  source_snapshot_hash: string; created_at: string; updated_at: string;
}
export interface RawPaperLineageMetadata {
  lineage_id: string; ordinal: number; kind: string; digest: string | null;
  source_authority: string; required: boolean;
}
export interface RawPaperPanelMetadata {
  panel_id: string; ordinal: number; panel_kind: string; source_authority: string;
  panel_state: string; as_of: string | null; freshness_state: string;
  source_completeness: string; poll_interval_ms: number | null; formula_version: string | null;
}
export interface RawPaperFindingMetadata {
  finding_id: string; panel_id: string; ordinal: number; outcome: string;
  blocking: boolean; required: boolean; evidence_hash: string | null;
  formula_version: string | null; as_of: string | null;
}
export interface RawPositiveParent {
  identity: PositiveParentCandidate;
  recordBasis: "CURRENT_CORE_BASELINE";
  approval: RawApprovalMetadata;
  scope: { portfolio_id: string; currency: string | null };
  lineage: { r1_approval_id: string; r2_approval_id: string; historical_risk_grant_id: string | null };
  evidence: readonly RawEvidenceMetadata[];
  operations: readonly RawDecisionOperationMetadata[];
  paperExit: null | {
    review: RawPaperReviewMetadata; lineage: readonly RawPaperLineageMetadata[];
    panels: readonly RawPaperPanelMetadata[]; findings: readonly RawPaperFindingMetadata[];
  };
  /** No R1 content/manifest is returned. These are local consistency checks,
   * NOT accepted Research/native facts or a current approval-live requirement. */
  integrity: { ownManifest: "MATCH"; referencedManifests: "MATCH";
    paperSourceSnapshot: "MATCH" | "NOT_APPLICABLE" };
}
export interface PositiveParentSnapshot {
  readonly raw: RawPositiveParent;
  /** Private equality witness only; never an entitlement/cursor/public grant. */
  readonly revision: string;
}

export class PositiveParentRepositoryError extends Error {
  constructor(readonly code: "PARENT_IDENTITY_INVALID" | "PARENT_NOT_FOUND" | "PARENT_READ_BOUND" |
    "PARENT_RECORD_INVALID" | "PARENT_MANIFEST_INTEGRITY" | "PARENT_SOURCE_INTEGRITY" |
    "PARENT_LINEAGE_INTEGRITY" | "PARENT_OPERATION_INTEGRITY") { super(code); }
}
const fail = (code: PositiveParentRepositoryError["code"]): never => { throw new PositiveParentRepositoryError(code); };
type Row = Record<string, unknown>;
type RootRow = RawApprovalMetadata & {
  portfolio_id: string; currency: string | null; r1_manifest_hash: string; r2_manifest_hash: string;
  historical_risk_grant_id: string | null;
};
type PaperRootRow = RawPaperReviewMetadata & {
  venue: string; deployment_id: string; portfolio_id: string;
};
type PrivateLineage = RawPaperLineageMetadata & { label: string; value: string; href: string | null };
type PrivatePanel = RawPaperPanelMetadata & {
  title: string; source_reference: string | null; source_href: string | null; reason: string | null;
};
type PrivateFinding = RawPaperFindingMetadata & {
  metric_key: string; label: string; carries_to: string | null; exact_value: string | null;
  unit: string | null; currency: string | null; threshold_value: string | null;
  source_label: string | null; source_href: string | null;
};
type ManifestEntry = Pick<EvidenceRecord, "evidenceId" | "ordinal" | "sha256" |
  "schemaVersion" | "sourceAuthority" | "capturedAt">;
const manifestHash = (rows: readonly ManifestEntry[]) => computeEvidenceManifestHash(rows);
const ROW_BYTES = 32_768, SNAPSHOT_BYTES = 2_097_152, OUTPUT_BYTES = 1_048_576;
const R2_FROM = `FROM governance_approval_requests a
  JOIN governance_approval_analytics_scopes s ON s.approval_id=a.approval_id
    AND s.workspace_id=a.workspace_id AND s.gate='R2'
  JOIN governance_r2_lineage l ON l.r2_approval_id=a.approval_id
    AND l.workspace_id=a.workspace_id AND l.r2_gate='R2' AND l.r1_gate='R1'
  JOIN governance_approval_requests r1 ON r1.approval_id=l.r1_approval_id
    AND r1.workspace_id=a.workspace_id AND r1.gate='R1'`;
const PAPER_FROM = `FROM governance_approval_requests a
  JOIN governance_paper_exit_reviews v ON v.review_id=a.approval_id
    AND v.workspace_id=a.workspace_id AND v.gate='PAPER_EXIT'
  JOIN governance_approval_requests r2 ON r2.approval_id=v.r2_approval_id
    AND r2.workspace_id=v.workspace_id AND r2.gate='R2'
    AND r2.subject_type='DEPLOYMENT' AND r2.subject_id=v.deployment_id AND r2.environment='PAPER'
  JOIN governance_approval_analytics_scopes s ON s.approval_id=r2.approval_id
    AND s.workspace_id=v.workspace_id AND s.gate='R2' AND s.portfolio_id=v.portfolio_id
  JOIN governance_r2_lineage l ON l.r2_approval_id=r2.approval_id
    AND l.workspace_id=v.workspace_id AND l.r2_gate='R2' AND l.r1_gate='R1'
    AND l.r1_approval_id=v.r1_approval_id
  JOIN governance_approval_requests r1 ON r1.approval_id=v.r1_approval_id
    AND r1.workspace_id=v.workspace_id AND r1.gate='R1'`;
const from = (family: PositiveParentFamily) => family === "R2" ? R2_FROM : PAPER_FROM;
const r2Id = (family: PositiveParentFamily) => family === "R2" ? "a.approval_id" : "v.r2_approval_id";
const baseWhere = (family: PositiveParentFamily) => `a.workspace_id=$1 AND a.gate='${family}'
  AND a.subject_type='DEPLOYMENT' AND a.environment='PAPER'
  ${family === "PAPER_EXIT" ? "AND a.subject_id=v.deployment_id" : ""}`;
const identityColumns = (family: PositiveParentFamily) => `a.workspace_id AS "workspaceId",
  '${family}'::text AS family,a.approval_id AS "approvalId",l.r1_approval_id AS "r1ApprovalId",
  ${r2Id(family)} AS "r2ApprovalId",a.subject_id AS "deploymentId",
  s.portfolio_id AS "portfolioId",'PAPER'::text AS environment`;
const boundedIds = (family: PositiveParentFamily) =>
  ["a.workspace_id", "a.approval_id", "l.r1_approval_id", r2Id(family), "a.subject_id", "s.portfolio_id"]
    .map(column => `octet_length(${column}) BETWEEN 1 AND 191 AND ${column} ~ '^[A-Za-z0-9._:-]+$'`).join(" AND ");
const approvalColumns = `a.approval_id,a.status,a.policy_version,a.approval_version,
  a.quorum_required,a.quorum_met,a.evidence_complete,a.evidence_set_hash,
  a.sla_due_at,a.expires_at,a.created_at,a.updated_at,a.decided_at`;
const rootSelect = (family: PositiveParentFamily, includeCurrency: boolean) => `SELECT ${approvalColumns},s.portfolio_id,
  ${includeCurrency && family === "R2" ? "s.currency" : "NULL::text"} AS currency,
  ${includeCurrency && family === "R2" ? "l.grant_id" : "NULL::text"} AS historical_risk_grant_id,
  r1.evidence_set_hash AS r1_manifest_hash,
  ${family === "R2" ? "a" : "r2"}.evidence_set_hash AS r2_manifest_hash,
  a.workspace_id,a.subject_id AS deployment_id,l.r1_approval_id,${r2Id(family)} AS r2_approval_id
  ${from(family)} WHERE ${baseWhere(family)} AND a.approval_id=$2 AND a.subject_id=$3
    AND s.portfolio_id=$4 AND l.r1_approval_id=$5 AND ${r2Id(family)}=$6`;
const identityValues = (p: PositiveParentCandidate) =>
  [p.workspaceId,p.approvalId,p.deploymentId,p.portfolioId,p.r1ApprovalId,p.r2ApprovalId];
const ownFields = `approval_id,status,policy_version,approval_version,quorum_required,quorum_met,
  evidence_complete,evidence_set_hash,sla_due_at,expires_at,created_at,updated_at,decided_at`;
const paperFields = `v.review_id,v.review_state,v.review_version,v.promote_to,v.extension_days,
  v.extended_until,v.artifact_digest,v.observation_policy_id,v.observation_policy_version,
  v.observation_policy_digest,v.evidence_pack_id,v.evidence_pack_digest,
  v.evaluation_policy_version,v.evaluation_formula_version,v.source_snapshot_hash,v.created_at,v.updated_at`;

function candidate(value: unknown): PositiveParentCandidate {
  const p = value as PositiveParentCandidate | null;
  if (!p || !["R2","PAPER_EXIT"].includes(p.family) || p.environment !== "PAPER" ||
    ![p.workspaceId,p.approvalId,p.r1ApprovalId,p.r2ApprovalId,p.deploymentId,p.portfolioId]
      .every(id => IdentifierSchema.safeParse(id).success) ||
    p.family === "R2" && p.approvalId !== p.r2ApprovalId) return fail("PARENT_IDENTITY_INVALID");
  return Object.freeze({ workspaceId:p.workspaceId,family:p.family,approvalId:p.approvalId,
    r1ApprovalId:p.r1ApprovalId,r2ApprovalId:p.r2ApprovalId,deploymentId:p.deploymentId,
    portfolioId:p.portfolioId,environment:"PAPER" });
}
function date(value: unknown): Date {
  // PG ISO UTC JSON retains µs. Hash helper deliberately uses the SAME JS Date
  // ISO-ms preimage as existing writers; these Dates never become revision keys.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return fail("PARENT_RECORD_INVALID");
  const result = new Date(value);
  if (!Number.isFinite(result.valueOf()) || result.getUTCFullYear() < 1 || result.getUTCFullYear() > 9999)
    return fail("PARENT_RECORD_INVALID");
  return result;
}
const optionalDate = (value: string | null) => value === null ? null : date(value);
function validateTimes(row: Row, keys: readonly string[]): void {
  for (const key of keys) if (row[key] !== null) date(row[key]);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const row = value as Row;
    return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function by<T>(items: readonly T[], key: (item: T) => string): T[] {
  // Explicit finite-field ordering: never order the returned metadata by the
  // private hash-preimage label/value/reason. Outer CTE order is not a SQL API.
  return [...items].sort((a,b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
}
const ordinalKey = (ordinal: number, id: string) => `${String(ordinal).padStart(10,"0")}:${id}`;

@Injectable()
export class PositiveParentRepository {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  private async read<T>(run: (db: PoolClient, budget: { bytes: number }) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    let open = false;
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); open = true;
      await db.query("SET LOCAL statement_timeout='2000ms'");
      await db.query("SET LOCAL idle_in_transaction_session_timeout='5000ms'");
      await db.query("SET LOCAL TIME ZONE 'UTC'");
      const result = await run(db,{bytes:SNAPSHOT_BYTES});
      await db.query("COMMIT"); open = false; return result;
    } catch (error) {
      if (open) await db.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { db.release(); }
  }

  /** SQL is static server-owned text, NOT a caller/provider query. count/sum
   * operate ONLY on a fully exact-scoped, cap+1 bounded cohort. Oversize/overflow
   * yields NULL sentinels, never truncated apparently-complete child content.
   * No unbounded JSON or TOAST text crosses the PG/JS boundary on failure.
   */
  private async rows<T>(db: PoolClient, budget: { bytes: number }, sql: string,
    values: readonly unknown[], cap: number): Promise<T[]> {
    const limit = cap + 1;
    const result = await db.query<{ payload: string | null }>(`WITH selected AS MATERIALIZED (
      ${sql} LIMIT ${limit}
    ), encoded AS MATERIALIZED (
      SELECT row_to_json(__parent_selected_row)::text AS payload FROM selected AS __parent_selected_row
    ),
    admitted AS (SELECT count(*)<=${cap} AND COALESCE(sum(octet_length(payload)),0)<=${budget.bytes}
      AND COALESCE(max(octet_length(payload)),0)<=${ROW_BYTES} AS ok FROM encoded)
    SELECT CASE WHEN admitted.ok THEN encoded.payload ELSE NULL END AS payload
      FROM encoded CROSS JOIN admitted`, [...values]);
    if (result.rows.length > cap || result.rows.some(row => row.payload === null)) return fail("PARENT_READ_BOUND");
    const rows: T[] = [];
    for (const {payload} of result.rows) {
      if (typeof payload !== "string" || Buffer.byteLength(payload,"utf8") > ROW_BYTES) return fail("PARENT_READ_BOUND");
      budget.bytes -= Buffer.byteLength(payload,"utf8");
      if (budget.bytes < 0) return fail("PARENT_READ_BOUND");
      const parsed: unknown = JSON.parse(payload);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("PARENT_RECORD_INVALID");
      // Raw schema-derived records only, not a public decoder/authorization.
      rows.push(parsed as T);
    }
    return rows;
  }

  /** Phase 1: only identity/anchors. No manifest, prose, child count or review
   * state selected/decoded; caller holds even not-found through final Core.
   */
  async identityCandidate(workspace: string, family: PositiveParentFamily, id: string): Promise<PositiveParentCandidate | null> {
    if (!IdentifierSchema.safeParse(workspace).success || !IdentifierSchema.safeParse(id).success ||
      !["R2","PAPER_EXIT"].includes(family)) return fail("PARENT_IDENTITY_INVALID");
    return this.read(async (db,budget) => {
      const rows = await this.rows<PositiveParentCandidate>(db,budget,
        `SELECT ${identityColumns(family)} ${from(family)} WHERE ${baseWhere(family)}
         AND a.approval_id=$2 AND ${boundedIds(family)}`, [workspace,id],1);
      return rows[0] ? candidate(rows[0]) : null;
    });
  }

  /** Optional generic-operation identity reuse. No creator/decide/token check.
   * Existing ecm_ routing remains with Main. Same-workspace F0/other governance
   * family collision refuses; foreign-workspace collisions cannot affect it.
   */
  async operationIdentityCandidate(workspace: string, operationId: string): Promise<PositiveParentOperationIdentity> {
    if (!IdentifierSchema.safeParse(workspace).success || !IdentifierSchema.safeParse(operationId).success)
      return fail("PARENT_IDENTITY_INVALID");
    return this.read(async (db,budget) => {
      const alternatives = (["R2","PAPER_EXIT"] as const).map(family => {
        const table = family === "R2" ? "governance_decision_plans" : "governance_paper_exit_decision_plans";
        const parentColumn = family === "R2" ? "approval_id" : "review_id";
        const opposite = family === "R2" ? "governance_paper_exit_decision_plans" : "governance_decision_plans";
        const command = family === "R2" ? "GOVERNANCE_R2_DECISION" : "GOVERNANCE_PAPER_EXIT_DECISION";
        return `SELECT ${identityColumns(family)},p.operation_id AS "operationId" ${from(family)}
          JOIN ${table} p ON p.${parentColumn}=a.approval_id AND p.workspace_id=a.workspace_id
          WHERE ${baseWhere(family)} AND p.operation_id=$2 AND p.command_type='${command}'
            AND p.command_version=1 AND ${boundedIds(family)}
            AND NOT EXISTS (SELECT 1 FROM ${opposite} other
              WHERE other.workspace_id=a.workspace_id AND other.operation_id=p.operation_id)
            AND NOT EXISTS (SELECT 1 FROM execution_command_plans_f0 f
              WHERE f.workspace_id=a.workspace_id AND f.operation_id=p.operation_id)
            AND NOT EXISTS (SELECT 1 FROM execution_operation_queue_items q
              WHERE q.workspace_id=a.workspace_id AND q.operation_id=p.operation_id)`;
      });
      // Ownership and joined identity are from the SAME bounded RR snapshot.
      // Every local plan counts, including unsupported R1/Live command rows or
      // a malformed/missing parent join. Do not inspect private plan fields.
      const rows = await this.rows<{ kind: string; selected: (PositiveParentCandidate & {operationId:string}) | null }>(db,budget,
        `WITH owners AS MATERIALIZED (
          SELECT EXISTS (SELECT 1 FROM governance_decision_plans WHERE workspace_id=$1 AND operation_id=$2) AS governance,
            EXISTS (SELECT 1 FROM governance_paper_exit_decision_plans WHERE workspace_id=$1 AND operation_id=$2) AS paper,
            EXISTS (SELECT 1 FROM execution_command_plans_f0 WHERE workspace_id=$1 AND operation_id=$2) AS f0,
            EXISTS (SELECT 1 FROM execution_operation_queue_items WHERE workspace_id=$1 AND operation_id=$2) AS queue
        ), parent_candidate AS MATERIALIZED (${alternatives.join(" UNION ALL ")})
        SELECT CASE
          WHEN (owners.governance::int+owners.paper::int)=1 AND NOT owners.f0 AND NOT owners.queue
            AND parent_candidate."operationId" IS NOT NULL THEN 'PARENT'
          WHEN (owners.f0 OR owners.queue) AND NOT owners.governance AND NOT owners.paper THEN 'F0'
          ELSE 'UNAVAILABLE' END AS kind,
          CASE WHEN parent_candidate."operationId" IS NULL THEN NULL
            ELSE row_to_json(parent_candidate) END AS selected
        FROM owners LEFT JOIN parent_candidate ON true`,[workspace,operationId],1);
      const row = rows[0];
      if (!row) return fail("PARENT_RECORD_INVALID");
      if (row.kind === "PARENT") {
        if (!row.selected || row.selected.operationId !== operationId) return fail("PARENT_IDENTITY_INVALID");
        return Object.freeze({kind:"PARENT",selected:Object.freeze({parent:candidate(row.selected),operationId})});
      }
      if (row.kind === "F0" || row.kind === "UNAVAILABLE") return Object.freeze({kind:row.kind});
      return fail("PARENT_RECORD_INVALID");
    });
  }

  /** Phase 2: MUST be invoked only after SAME-flight current exact gate/audit/
   * field qualification. This repository never mints/rechecks that authority.
   * Every child query reuses the FULL immutable tuple in SQL BEFORE cap/decode.
   * The transaction contains local SQL/hash/projection only and is released
   * before ANY native/relation/Core await in the shared delivery coordinator.
   */
  async protectedDetails(selected: PositiveParentCandidate, operationId?: string,
    options: { includeCurrency: boolean } = { includeCurrency: false }): Promise<PositiveParentSnapshot> {
    if (operationId !== undefined && !IdentifierSchema.safeParse(operationId).success) return fail("PARENT_IDENTITY_INVALID");
    const p = candidate(selected), values = identityValues(p), exact = rootSelect(p.family, options.includeCurrency);
    return this.read(async (db,budget) => {
      const roots = await this.rows<RootRow>(db,budget,exact,values,1), root = roots[0];
      if (!root) return fail("PARENT_NOT_FOUND");
      const scoped = (projection: string, table: string, join: string, order: string) =>
        `WITH root AS MATERIALIZED (${exact}) SELECT ${projection} FROM ${table} c
         JOIN root r ON ${join} ORDER BY ${order}`;
      const child = <T>(projection: string, table: string, join: string, order: string, cap: number) =>
        this.rows<T>(db,budget,scoped(projection,table,join,order),values,cap);
      const approvalRows = await this.rows<RawApprovalMetadata>(db,budget,
        `WITH root AS MATERIALIZED (${exact}) SELECT ${ownFields} FROM root`,values,1);
      const approval = approvalRows[0];
      if (!approval) return fail("PARENT_NOT_FOUND");
      validateTimes(approval as unknown as Row,["sla_due_at","expires_at","created_at","updated_at","decided_at"]);

      // Only the six exact manifest-hash inputs are read; no
      // evidence label/display/note/URL/retention/private payload is selected.
      const manifests = new Map<string,RawEvidenceMetadata[]>();
      for (const id of [...new Set([p.approvalId,p.r1ApprovalId,p.r2ApprovalId])]) {
        // id is from the qualified tuple, never an unrelated browser selector.
        const role = id === p.approvalId ? "r.approval_id" : id === p.r1ApprovalId ? "r.r1_approval_id" : "r.r2_approval_id";
        const entries = await child<RawEvidenceMetadata>(`c.evidence_id,c.ordinal,c.sha256,c.schema_version,
          c.source_authority,c.captured_at`,"governance_approval_evidence",`c.approval_id=${role}`,
          "c.ordinal,c.evidence_id",256);
        const expected = id === p.approvalId ? root.evidence_set_hash : id === p.r1ApprovalId ? root.r1_manifest_hash : root.r2_manifest_hash;
        if (manifestHash(entries.map(item => ({evidenceId:item.evidence_id,ordinal:item.ordinal,sha256:item.sha256,
          schemaVersion:item.schema_version,sourceAuthority:item.source_authority,capturedAt:date(item.captured_at)}))) !== expected)
          return fail("PARENT_MANIFEST_INTEGRITY");
        manifests.set(id,entries);
      }
      // No R1 request content, current approval-live predicate or Research
      // environment conversion is used. R1 entries remain transaction-private.
      // Root GET does not enumerate approval findings/limitations/decisions or
      // Paper decisions/promotion. Those are separate, currently unqualified
      // purposes and must not impose unrelated history caps on a readable root.
      let paperExit: RawPositiveParent["paperExit"] = null;
      let sourceHash: string | undefined;
      if (p.family === "PAPER_EXIT") {
        const reviewRows = await this.rows<PaperRootRow>(db,budget,`WITH root AS MATERIALIZED (${exact})
          SELECT ${paperFields},v.venue,v.deployment_id,v.portfolio_id FROM governance_paper_exit_reviews v
          JOIN root r ON v.review_id=r.approval_id AND v.workspace_id=r.workspace_id
            AND v.deployment_id=r.deployment_id AND v.portfolio_id=r.portfolio_id
            AND v.r1_approval_id=r.r1_approval_id AND v.r2_approval_id=r.r2_approval_id`,values,1);
        const review = reviewRows[0];
        if (!review) return fail("PARENT_NOT_FOUND");
        const lineage = await child<PrivateLineage>(`c.lineage_id,c.ordinal,c.kind,c.label,c.value,c.href,
          c.digest,c.source_authority,c.required`,"governance_paper_exit_lineage",
          "c.review_id=r.approval_id","c.ordinal,c.lineage_id",5);
        const panels = await child<PrivatePanel>(`c.panel_id,c.ordinal,c.panel_kind,c.title,c.source_authority,
          c.source_reference,c.source_href,c.panel_state,c.reason,c.as_of,c.freshness_state,
          c.source_completeness,c.poll_interval_ms,c.formula_version`,"governance_paper_exit_panels",
          "c.review_id=r.approval_id","c.ordinal,c.panel_id",4);
        const paperFindings = await child<PrivateFinding>(`c.finding_id,c.panel_id,c.ordinal,c.metric_key,c.label,
          c.outcome,c.blocking,c.required,c.carries_to,c.exact_value,c.unit,c.currency,c.threshold_value,
          c.source_label,c.source_href,c.evidence_hash,c.formula_version,c.as_of`,"governance_paper_exit_findings",
          "c.review_id=r.approval_id","c.panel_id,c.ordinal,c.finding_id",256);
        // FK(panel_id) does NOT enforce that a finding's panel belongs to its
        // review. Reject any cross-review panel, never infer membership by ID.
        const panelIds = new Set(panels.map(item => item.panel_id));
        if (paperFindings.some(item => !panelIds.has(item.panel_id))) return fail("PARENT_LINEAGE_INTEGRITY");
        const pins = new Map(lineage.map(item => [item.kind,item]));
        const checkPin = (kind: string, id: string | null, hash: string) => {
          const pin = pins.get(kind);
          // Missing stored lineage remains partial, not a fabricated pin or
          // approval-live precondition. A present conflicting pin is corruption.
          if (pin && (id !== null && pin.value !== id || pin.digest !== hash)) return fail("PARENT_LINEAGE_INTEGRITY");
        };
        checkPin("R1_APPROVAL",p.r1ApprovalId,root.r1_manifest_hash);
        checkPin("R2_APPROVAL",p.r2ApprovalId,root.r2_manifest_hash);
        checkPin("OBSERVATION_POLICY",review.observation_policy_id,review.observation_policy_digest);
        checkPin("EVIDENCE_PACK",review.evidence_pack_id,review.evidence_pack_digest);
        checkPin("ARTIFACT",null,review.artifact_digest);
        // These bounded transient private facts are necessary for the EXACT
        // existing hash. Never log/cache/return their prose/URLs/value fields.
        const input: PaperExitSourceSnapshotInput = {
          review:{reviewId:review.review_id,deploymentId:review.deployment_id,portfolioId:review.portfolio_id,
            venue:review.venue,artifactDigest:review.artifact_digest,observationPolicyId:review.observation_policy_id,
            observationPolicyVersion:review.observation_policy_version,observationPolicyDigest:review.observation_policy_digest,
            evidencePackId:review.evidence_pack_id,evidencePackDigest:review.evidence_pack_digest,
            evaluationPolicyVersion:review.evaluation_policy_version,evaluationFormulaVersion:review.evaluation_formula_version},
          approval:{evidenceSetHash:approval.evidence_set_hash},
          lineage:lineage.map(item => ({ordinal:item.ordinal,kind:item.kind,label:item.label,value:item.value,
            href:item.href,digest:item.digest,sourceAuthority:item.source_authority,required:item.required})),
          panels:panels.map(item => ({panelId:item.panel_id,ordinal:item.ordinal,
            panelKind:item.panel_kind as PaperExitSourceSnapshotInput["panels"][number]["panelKind"],title:item.title,
            sourceAuthority:item.source_authority as PaperExitSourceSnapshotInput["panels"][number]["sourceAuthority"],
            sourceReference:item.source_reference,sourceHref:item.source_href,
            panelState:item.panel_state as PaperExitSourceSnapshotInput["panels"][number]["panelState"],reason:item.reason,
            asOf:optionalDate(item.as_of),freshnessState:item.freshness_state as PaperExitSourceSnapshotInput["panels"][number]["freshnessState"],
            sourceCompleteness:item.source_completeness as PaperExitSourceSnapshotInput["panels"][number]["sourceCompleteness"],
            pollIntervalMs:item.poll_interval_ms,formulaVersion:item.formula_version})),
          findings:paperFindings.map(item => ({findingId:item.finding_id,panelId:item.panel_id,ordinal:item.ordinal,
            metricKey:item.metric_key,label:item.label,outcome:item.outcome as PaperExitSourceSnapshotInput["findings"][number]["outcome"],
            blocking:item.blocking,required:item.required,carriesTo:item.carries_to,exactValue:item.exact_value,
            unit:item.unit,currency:item.currency,thresholdValue:item.threshold_value,sourceLabel:item.source_label,
            sourceHref:item.source_href,evidenceHash:item.evidence_hash,formulaVersion:item.formula_version,asOf:optionalDate(item.as_of)})),
        };
        sourceHash = computePaperExitSourceSnapshotHash(input);
        if (sourceHash !== review.source_snapshot_hash) return fail("PARENT_SOURCE_INTEGRITY");
        // Explicit allowlists, not spreads of protected preimage records.
        paperExit = {
          review:{review_id:review.review_id,review_state:review.review_state,review_version:review.review_version,
            promote_to:review.promote_to,extension_days:review.extension_days,extended_until:review.extended_until,
            artifact_digest:review.artifact_digest,observation_policy_id:review.observation_policy_id,
            observation_policy_version:review.observation_policy_version,observation_policy_digest:review.observation_policy_digest,
            evidence_pack_id:review.evidence_pack_id,evidence_pack_digest:review.evidence_pack_digest,
            evaluation_policy_version:review.evaluation_policy_version,evaluation_formula_version:review.evaluation_formula_version,
            source_snapshot_hash:review.source_snapshot_hash,created_at:review.created_at,updated_at:review.updated_at},
          lineage:by(lineage.map(item => ({lineage_id:item.lineage_id,ordinal:item.ordinal,kind:item.kind,
            digest:item.digest,source_authority:item.source_authority,required:item.required})),item => ordinalKey(item.ordinal,item.lineage_id)),
          panels:by(panels.map(item => ({panel_id:item.panel_id,ordinal:item.ordinal,panel_kind:item.panel_kind,
            source_authority:item.source_authority,panel_state:item.panel_state,as_of:item.as_of,
            freshness_state:item.freshness_state,source_completeness:item.source_completeness,
            poll_interval_ms:item.poll_interval_ms,formula_version:item.formula_version})),item => ordinalKey(item.ordinal,item.panel_id)),
          findings:by(paperFindings.map(item => ({finding_id:item.finding_id,panel_id:item.panel_id,ordinal:item.ordinal,
            outcome:item.outcome,blocking:item.blocking,required:item.required,evidence_hash:item.evidence_hash,
            formula_version:item.formula_version,as_of:item.as_of})),item => `${item.panel_id}:${ordinalKey(item.ordinal,item.finding_id)}`),
        };
        validateTimes(paperExit.review as unknown as Row,["created_at","updated_at","extended_until"]);
      }
      // Finite immutable intent metadata; no actor filter, original apply token,
      // expiry-as-read-authority, response_json, reason, conditions or private keys.
      const opTable = p.family === "R2" ? "governance_decision_plans" : "governance_paper_exit_decision_plans";
      const parentColumn = p.family === "R2" ? "approval_id" : "review_id";
      const expectedColumn = p.family === "R2" ? "expected_approval_version" : "expected_review_version";
      const command = p.family === "R2" ? "GOVERNANCE_R2_DECISION" : "GOVERNANCE_PAPER_EXIT_DECISION";
      const opposite = p.family === "R2" ? "governance_paper_exit_decision_plans" : "governance_decision_plans";
      // Root detail does not enumerate an unrelated history of operations.
      // A generic operation GET explicitly opts into its SINGLE selected ID.
      const operations = operationId === undefined ? [] : await this.rows<RawDecisionOperationMetadata & {
        evidence_set_hash:string; source_snapshot_hash:string | null }>(db,budget,scoped(
        `c.operation_id,c.command_type,c.command_version,c.status,c.decision,c.${expectedColumn} AS expected_version,
         ${p.family === "R2" ? "c.parent_approval_id,c.parent_approval_version,c.parent_evidence_set_hash" :
           "NULL::text AS parent_approval_id,NULL::integer AS parent_approval_version,NULL::text AS parent_evidence_set_hash"},
         c.evidence_set_hash,${p.family === "R2" ? "NULL::text" : "c.source_snapshot_hash"} AS source_snapshot_hash,
         c.created_at,c.expires_at,c.applied_at`,opTable,
        `c.${parentColumn}=r.approval_id AND c.workspace_id=r.workspace_id
          AND c.command_type='${command}' AND c.command_version=1 AND c.operation_id=$7
          AND NOT EXISTS (SELECT 1 FROM ${opposite} other
            WHERE other.workspace_id=r.workspace_id AND other.operation_id=c.operation_id)
          AND NOT EXISTS (SELECT 1 FROM execution_command_plans_f0 f
            WHERE f.workspace_id=r.workspace_id AND f.operation_id=c.operation_id)
          AND NOT EXISTS (SELECT 1 FROM execution_operation_queue_items q
            WHERE q.workspace_id=r.workspace_id AND q.operation_id=c.operation_id)`,"c.created_at,c.operation_id"),
        [...values,operationId],1);
      if (operationId !== undefined && operations.length !== 1) return fail("PARENT_NOT_FOUND");
      for (const op of operations) {
        if (op.evidence_set_hash !== root.evidence_set_hash ||
          p.family === "PAPER_EXIT" && op.source_snapshot_hash !== sourceHash ||
          p.family === "R2" && op.parent_approval_id !== null &&
            (op.parent_approval_id !== p.r1ApprovalId || op.parent_evidence_set_hash !== root.r1_manifest_hash))
          return fail("PARENT_OPERATION_INTEGRITY");
        validateTimes(op as unknown as Row,["created_at","expires_at","applied_at"]);
      }
      const raw: RawPositiveParent = {
        identity:p,recordBasis:"CURRENT_CORE_BASELINE",approval,
        scope:{portfolio_id:p.portfolioId,currency:root.currency},
        lineage:{r1_approval_id:p.r1ApprovalId,r2_approval_id:p.r2ApprovalId,historical_risk_grant_id:root.historical_risk_grant_id},
        evidence:by(manifests.get(p.approvalId)!,item => ordinalKey(item.ordinal,item.evidence_id)),
        operations:operations.map(op => ({operation_id:op.operation_id,command_type:op.command_type,
          command_version:op.command_version,status:op.status,decision:op.decision,expected_version:op.expected_version,
          parent_approval_id:op.parent_approval_id,parent_approval_version:op.parent_approval_version,
          parent_evidence_set_hash:op.parent_evidence_set_hash,created_at:op.created_at,expires_at:op.expires_at,applied_at:op.applied_at})),
        paperExit,integrity:{ownManifest:"MATCH",referencedManifests:"MATCH",
          paperSourceSnapshot:p.family === "PAPER_EXIT" ? "MATCH" : "NOT_APPLICABLE"},
      };
      if (Buffer.byteLength(JSON.stringify(raw),"utf8") > OUTPUT_BYTES) return fail("PARENT_READ_BOUND");
      return Object.freeze({raw,revision:`sha256:${createHash("sha256").update(canonical(raw),"utf8").digest("hex")}`});
    });
  }

  /** Coordinator hook, NOT a replacement for current source/Core authority.
   * Completes/releases local SQL before the coordinator refreshes source and
   * performs its LAST genuine Core confirmation. Errors remain held there.
   */
  async isUnchanged(parent: PositiveParentCandidate, revision: string, operationId?: string,
    options: { includeCurrency: boolean } = { includeCurrency: false }): Promise<boolean> {
    return (await this.protectedDetails(parent,operationId,options)).revision === revision;
  }
}
