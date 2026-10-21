import { Inject, Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import type { z } from "zod";
import { ControlApiConfig, querySigningKeys } from "../config";
import { ExecutionAccessService } from "../execution-v2/access.service";
import { ExecutionReadScopes, type ReadScopePrincipal } from "../execution-v2/read-scope";
import { ControlPlaneQueryService, KeysetCursorCodec, type PostgresListResource, type PostgresRowScope, type PostgresSnapshotReader, type QueryActorContext, type RawFilterInput } from "../query";
import { exactPageReadTruth } from "../query/read-truth";
import { CONTROL_API_CONFIG } from "../tokens";
import { f0ReadRecord } from "./f0-read.contract";
import { IdentifierSchema } from "./contracts";
import { CurrentOperationalReads, OperationalReadError, operationalHttpCall, type PreparedOperationalRead } from "./current-operational-read";
import { OPERATIONAL_INCIDENT_LINK_BOUND, operationalQueue, operationalQueueItem, operationalQueueQuery, operationalStatusCountDimensions,
  operationalWorkflow, operationalIncident, type OperationalIncidentLink, type OperationalIncidentLinks, type OperationalQueue,
  type OperationalQueueItem, type OperationalStatusCountDimension, type OperationalStatusCounts, type OperationalWorkflow,
  type OperationalIncident } from "./operational-read.contract";
import { OperationalReadRepository } from "./operational-read.repository";

const columns = ["operation_id", "operation_kind", "command_key", "target_type", "target_id", "environment",
  "risk_tier", "severity", "source_authority", "source_status", "verification_result", "triage_state", "workflow_version",
  "acknowledged_at", "resolved_at", "created_at", "updated_at"] as const;
const item = (row: QueryResultRow): OperationalQueueItem => {
  const { target_type, target_id, workspace_id: _workspace, ...fields } = row;
  const finite: Record<string, unknown> = {};
  for (const key of columns) if (key !== "target_type" && key !== "target_id") finite[key] = fields[key];
  return operationalQueueItem.parse({ ...finite, target: { type: target_type, id: target_id } });
};
export const operationalQueueFilters = ["triage_state", "environment", "source_status", "verification_result", "severity", "target_type", "target_id", "command_key"] as const;
const filters = operationalQueueFilters;
export const OPERATIONAL_QUEUE_TOTAL_DEADLINE_MS = 5000;
export const operationalQueueResource: PostgresListResource<QueryResultRow, OperationalQueueItem> = {
  resourceId: "execution.operational-queue.v2", table: "execution_operation_queue_v2",
  selectColumns: columns, workspaceColumn: "workspace_id", idSortField: "operation_id",
  filters: Object.fromEntries(filters.map(field => [field, { column: field, kind: "text", operators: ["eq"], maxLength: 191 }])),
  // UTC fixed six-digit precision in the SQL view preserves PostgreSQL µs in
  // the existing codec; Date normalization would lose rows at a ms boundary.
  sorts: { created_at: { column: "created_at", kind: "text" }, operation_id: { column: "operation_id", kind: "text" } },
  defaultSort: [{ field: "created_at", direction: "desc" }], allowedRoles: ["ADMIN", "USER"],
  // BE-P18 B1 m4. Per-statement 2000 ms AND a deadline for the WHOLE request: the queue transaction runs up to
  // ~9 statements (total, filtered, page, <=2 edge probes, 4 group counts, links), so the per-statement cap alone
  // would allow ~9 x 2 s. The gate (test/be-p18-b1-explain.pg.spec.ts) states and measures this number.
  statementTimeoutMs: 2000, totalDeadlineMs: OPERATIONAL_QUEUE_TOTAL_DEADLINE_MS,
  // Gate-measured on 1M operations: up to 200 tuples the scope index (migration 148) is 1.4x-40x faster than a scan; at the
  // 2000-tuple cap it is 2x-4x slower (planner under-estimates the composite match count). 500 sits between, and the gate
  // measures 400 (index path) and 800 (scan path) so the choice of threshold is itself checked.
  rowScopeIndexMaxTuples: 500, mapRow: item,
};
const resource = operationalQueueResource;
type LinkRow = QueryResultRow & { operation_id: string };
export type QueueSnapshot = { links: ReadonlyMap<string, OperationalIncidentLinks>; counts: OperationalStatusCounts };
const noLinks = (): OperationalIncidentLinks => ({ basis: "CURRENT_LINK_ROWS_AUTHORIZED_INCIDENTS_ONLY",
  bound: OPERATIONAL_INCIDENT_LINK_BOUND, authorized_link_count: 0, truncated: false, items: [] });
/** A link whose incident identity or time cannot be represented exactly is a typed NOT_ATTESTED item that
 * still occupies its slot and count; it is never dropped and never replaced by a guessed value. */
function linkItem(row: QueryResultRow): OperationalIncidentLink {
  const history = { availability: "NOT_PUBLISHED", reason_code: "ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED" } as const;
  if (!IdentifierSchema.safeParse(row.incident_id).success || typeof row.linked_at !== "string")
    return { state: "NOT_ATTESTED", reason_code: "INCIDENT_LINK_IDENTITY_NOT_REPRESENTABLE", link_history: history };
  return { state: "LINKED", incident_id: row.incident_id, relationship: row.relationship, linked_at: row.linked_at,
    incident: { target: { type: row.target_type, id: row.target_id }, environment: row.environment,
      severity: row.severity, workflow_state: row.workflow_state }, link_history: history };
}
function groupLinks(rows: readonly QueryResultRow[]): Map<string, OperationalIncidentLinks> {
  const grouped = new Map<string, QueryResultRow[]>();
  for (const row of rows as readonly LinkRow[]) grouped.set(row.operation_id, [...grouped.get(row.operation_id) ?? [], row]);
  return new Map([...grouped].map(([operation, list]) => {
    const authorized = Number(list[0].authorized_total);
    if (!Number.isSafeInteger(authorized) || authorized < list.length) throw new OperationalReadError("OPERATIONAL_READ_UNAVAILABLE");
    return [operation, { basis: "CURRENT_LINK_ROWS_AUTHORIZED_INCIDENTS_ONLY" as const, bound: OPERATIONAL_INCIDENT_LINK_BOUND,
      authorized_link_count: authorized, truncated: authorized > list.length, items: list.map(linkItem) }];
  }));
}
/** The extra reads of the queue page, run INSIDE the page's own snapshot: incident links and the four
 * group-counts. Exported so the large-scale EXPLAIN gate runs exactly this code, not a copy. */
export async function readQueueSnapshot(repository: Pick<OperationalReadRepository, "incidentLinks">, workspaceId: string,
  scope: PostgresRowScope, selected: readonly RawFilterInput[], lent: PostgresSnapshotReader<QueryResultRow>): Promise<QueueSnapshot> {
  const ids = lent.rows.map(row => row.operation_id).filter((id): id is string => typeof id === "string");
  const links = groupLinks(await repository.incidentLinks(lent, workspaceId, ids, scope));
  const dimensions: Record<string, unknown> = {};
  for (const field of Object.keys(operationalStatusCountDimensions) as OperationalStatusCountDimension[]) {
    const domain: readonly string[] = operationalStatusCountDimensions[field];
    const groups = await lent.groupedCounts({ column: field, excludeFilterFields: [field], maxGroups: domain.length });
    for (const value of groups.keys()) if (!domain.includes(value)) throw new OperationalReadError("OPERATIONAL_READ_UNAVAILABLE");
    const counts = Object.fromEntries(domain.map(value => [value, groups.get(value) ?? 0]));
    dimensions[field] = { own_filter_applied: selected.some(filter => filter.field === field),
      total: Object.values(counts).reduce((sum, value) => sum + value, 0), counts };
  }
  return { links, counts: { basis: "SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS_EXCLUDING_OWN_DIMENSION",
    succeeded_means: "PORTAL_QUEUE_RECORD_STATE_ONLY", dimensions } as OperationalStatusCounts };
}
/** The whole database part of the queue V2 request: ONE transaction, run by the real engine and the real
 * repository. Exported so the large-scale EXPLAIN gate runs exactly this path, not a copy of its SQL. */
export function queueSnapshotPage(engine: ControlPlaneQueryService, repository: Pick<OperationalReadRepository, "incidentLinks">,
  actor: QueryActorContext, scope: PostgresRowScope, query: z.infer<typeof operationalQueueQuery>, defaultLimit: number,
  resourceOverride: Partial<typeof operationalQueueResource> = {}) {
  const selected: RawFilterInput[] = operationalQueueFilters.filter(field => query[field] !== undefined)
    .map(field => ({ field, op: "eq", value: query[field] }));
  return engine.listWithSnapshot<QueryResultRow, OperationalQueueItem, QueueSnapshot>(
    { ...operationalQueueResource, ...resourceOverride, rowScope: scope }, actor,
    { after: query.after, before: query.before, limit: query.limit ?? defaultLimit, sort: query.sort, filters: selected },
    lent => readQueueSnapshot(repository, actor.workspaceId, scope, selected, lent));
}
function bounded<T>(body: T): T {
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 1_048_576) throw new OperationalReadError("OPERATIONAL_READ_RESPONSE_BOUND");
  return body;
}
const iso = (value: unknown): string | null => {
  if (value === null) return null;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()) || value.getTime() < 0)
    throw new OperationalReadError("OPERATIONAL_READ_UNAVAILABLE");
  return value.toISOString();
};

/** Existing operational APIs, finite current-audit V2 branch. Does not own any
 * mutation, relay, source projection or legacy rich reader. */
@Injectable()
export class OperationalReadService {
  private readonly flights: CurrentOperationalReads;
  constructor(@Inject(OperationalReadRepository) private readonly repository: OperationalReadRepository,
    @Inject(ExecutionAccessService) access: ExecutionAccessService,
    @Inject(ExecutionReadScopes) private readonly readScopes: ExecutionReadScopes,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) { this.flights = new CurrentOperationalReads(access); }

  mode(principal: ReadScopePrincipal) { return this.readScopes.coreSelectionMode(principal); }
  finish<T, R = T>(handle: PreparedOperationalRead<T>, project?: (body: T) => R): Promise<R> {
    return operationalHttpCall(() => this.flights.finish(handle, project));
  }

  prepareQueue(principal: ReadScopePrincipal, raw: Record<string, unknown>, defaultLimit = 100): Promise<PreparedOperationalRead<OperationalQueue>> {
    return operationalHttpCall(() => this.flights.prepare(principal, async cohort => {
      const parsed = operationalQueueQuery.safeParse(raw);
      if (!parsed.success || parsed.data.workspace_id !== undefined && parsed.data.workspace_id !== principal.workspaceId)
        throw new OperationalReadError("OPERATIONAL_READ_INPUT_INVALID", 400);
      const query = parsed.data;
      if (query.assigned_to !== undefined) throw new OperationalReadError("OPERATIONAL_READ_FILTER_NOT_SUPPORTED", 400);
      const keys = querySigningKeys(this.config);
      if (!keys[this.config.QUERY_CURSOR_ACTIVE_KEY_ID]) throw new OperationalReadError("OPERATIONAL_READ_NOT_CONFIGURED");
      const engine = new ControlPlaneQueryService(this.repository.pool, new KeysetCursorCodec({
        activeKeyId: this.config.QUERY_CURSOR_ACTIVE_KEY_ID, keys, ttlSeconds: this.config.QUERY_CURSOR_TTL_SECONDS }));
      // One repeatable-read snapshot: total, filtered, page rows, incident links and every status count
      // are read in the SAME transaction under the SAME minted scope, never page rows or extra calls.
      const { page, snapshot } = await queueSnapshotPage(engine, this.repository,
        { actorId: principal.user.userId, workspaceId: principal.workspaceId, role: principal.user.role },
        cohort.scope, query, defaultLimit);
      const rows = page.rows.map(row => ({ ...row, incident_links: snapshot.links.get(row.operation_id) ?? noLinks() }));
      const result = bounded(operationalQueue.parse({ schema_version: "portal.execution.operational-queue.v2",
        workspace_id: principal.workspaceId, record_authority: "PORTAL", record_basis: "PORTAL_CURRENT_OPERATIONAL_WORKFLOW",
        coverage: "AUTHORIZED_SUPPORTED_TARGETS_ONLY", supported_target_types: ["ACCOUNT", "PORTFOLIO", "DEPLOYMENT"],
        source_integration_state: "UNAVAILABLE", source_side_effect_requested: false, source_as_of_ms: null,
        observed_at_ms: Math.max(cohort.context.now_ms, Date.now()),
        read_truth: exactPageReadTruth(page, "NO_MATCHING_AUTHORIZED_PORTAL_OPERATIONS"),
        page: { ...page, rows, status_counts: snapshot.counts } }));
      return { result };
    }));
  }

  async queue(principal: ReadScopePrincipal, raw: Record<string, unknown>) { return this.finish(await this.prepareQueue(principal, raw)); }

  async workflow(principal: ReadScopePrincipal, id: string): Promise<OperationalWorkflow> {
    const prepared = await operationalHttpCall(() => this.flights.prepare(principal, async cohort => {
      if (!IdentifierSchema.safeParse(id).success) throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND", 404);
      const row = await this.repository.workflow(principal.workspaceId, id, cohort.scope);
      if (!row || row.ambiguous === true) throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND", 404);
      if (row.f0_exists !== true) throw new OperationalReadError("OPERATIONAL_READ_FAMILY_NOT_SUPPORTED", 503);
      if (row.f0_matches !== true) throw new OperationalReadError("OPERATIONAL_READ_PROVENANCE_INVALID", 503);
      const operation = item(row);
      const intent = f0ReadRecord({ operation_id: id, workspace_id: principal.workspaceId, actor_user_id: null,
        target_type: operation.target.type, target_id: operation.target.id, environment: operation.environment,
        command_key: row.f0_key, status: row.f0_status, blocker_codes: row.f0_blockers, warning_codes: row.f0_warnings,
        created_at: row.f0_created, updated_at: row.f0_updated });
      return { result: bounded(operationalWorkflow.parse({ schema_version: "portal.execution.operational-workflow.v2",
        family: "F0_BACKED_PORTAL_WORKFLOW", record_authority: "PORTAL", source_side_effect_requested: false,
        provenance_basis: row.provenance_basis,
        observed_at_ms: Math.max(cohort.context.now_ms, Date.now()), operation, intent })) };
    }));
    return this.finish(prepared);
  }

  prepareIncident(principal: ReadScopePrincipal, id: string): Promise<PreparedOperationalRead<OperationalIncident>> {
    return operationalHttpCall(() => this.flights.prepare(principal, async (cohort, beforeFinal) => {
      if (!IdentifierSchema.safeParse(id).success) throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND", 404);
      const row = await this.repository.incident(principal.workspaceId, id, cohort.scope);
      if (!row) throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND", 404);
      beforeFinal(async () => {
        if (!await this.repository.incidentUnchanged(principal.workspaceId, id, row)) throw new OperationalReadError("OPERATIONAL_READ_CHANGED", 409);
      });
      const result = bounded(operationalIncident.parse({ schema_version: "portal.execution.incident-current-root.v2",
        record_authority: "PORTAL", record_basis: "CURRENT_ROOT_NOT_HISTORICAL_LINEAGE", incident_id: row.incident_id,
        workspace_id: row.workspace_id, target: { type: row.target_type, id: row.target_id }, environment: row.environment,
        severity: row.severity, workflow_state: row.workflow_state, workflow_version: row.workflow_version,
        acknowledged_at: iso(row.acknowledged_at), mitigated_at: iso(row.mitigated_at), resolved_at: iso(row.resolved_at),
        created_at: iso(row.created_at), updated_at: iso(row.updated_at), observed_at_ms: Math.max(cohort.context.now_ms, Date.now()),
        source_integration_state: row.source_integration_state, source_side_effect_requested: row.source_side_effect_requested,
        deployment_resume_requested: row.deployment_resume_requested,
        historical_children: { availability: "NOT_PUBLISHED", reason_code: "ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED" } }));
      return { result };
    }));
  }
  async incident(principal: ReadScopePrincipal, id: string) { return this.finish(await this.prepareIncident(principal, id)); }
}
