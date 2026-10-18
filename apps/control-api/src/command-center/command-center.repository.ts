import { Inject, Injectable, Optional } from "@nestjs/common";
import { ExecutionProfileProjectionRepository } from "../execution/profile-projection.repository";
import { retainedReview } from "../execution/retained-read-profile";
import { WorkspacesRepository } from "../repos/workspaces";
import { OwnerAccessService } from "../auth/owner-access.service";
import { commandCenterGovernanceActionableSql, commandCenterGovernanceGates } from "./governance-actionability";
import { ExecutionReadScopes, ExecutionReadScopeError, scopeAllowsField, type ReadScopePrincipal,
  type AuthorizedExecutionReadScope } from "../execution-v2/read-scope";
import { projectionRowVisible, redactProjectionFields } from "../execution-v2/read-projection";
import { Pool, PoolClient } from "pg";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { CONTROL_API_CONFIG, CONTROL_API_POOL, EXECUTION_DATA_POOL } from "../tokens";
import {
  CommandCenterInputs,
  ExactSourceSlice,
  FleetSnapshot,
  SourceStatus,
  TodayCandidate,
  TriageCandidate,
  unavailableSource,
} from "./contracts";

interface GovernanceTriageRow {
  approval_id: string;
  gate: "R1" | "R2" | "PAPER_EXIT" | "SANDBOX_EXIT" | "LIVE_GATE";
  subject_label: string;
  target_label: string;
  created_at: Date;
  updated_at: Date;
  sla_due_at: Date;
  sla_state: "OVERDUE" | "DUE_SOON" | "ON_TRACK";
  total_count: string;
}
interface TodayRow {
  item_id: string;
  kind: "REVIEW_DUE" | "CONDITION_EXPIRY";
  label: string;
  scheduled_at: Date;
  href: string;
  updated_at: Date;
  total_count: string;
}

interface IncidentTriageRow {
  incident_id: string;
  title: string;
  summary: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  workflow_state: "OPEN" | "MITIGATED";
  created_at: Date;
  updated_at: Date;
  total_count: string;
}

interface OperationTriageRow {
  operation_id: string;
  command_key: string;
  target_type: string;
  target_id: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  source_status: string;
  verification_result: string;
  created_at: Date;
  updated_at: Date;
  total_count: string;
}

interface ProjectionSnapshotRow {
  environment: "paper" | "sandbox" | "live";
  profile_id: string;
  source_cursor: string;
  source_as_of: Date | null;
  received_at: Date;
  last_successful_refresh_at: Date;
  completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN";
  projection_epoch: string;
  projection_sequence: string;
  payload: {
    relations?: Record<string, {
      availability?: string;
      items?: Array<{ fields?: Record<string, unknown> }>;
    }>;
  };
}

function reviewHref(gate: GovernanceTriageRow["gate"], id: string): string {
  if (gate === "R1") return `/governance/approvals/${id}/r1`;
  if (gate === "R2") return `/governance/approvals/${id}/r2`;
  if (gate === "LIVE_GATE") return `/governance/approvals/${id}/live`;
  return `/governance/exit-reviews/${id}`;
}

function portalSourceStatus(asOf: Date | null, readAt: Date): SourceStatus {
  return {
    source: "PORTAL_GOVERNANCE",
    authority: "PORTAL",
    availability: "AVAILABLE",
    reason: null,
    as_of: asOf?.toISOString() ?? readAt.toISOString(),
    source_cursor: null,
    source_sequence: null,
    projection_epoch: null,
    projection_sequence: null,
    source_completeness: "EVENT_SOURCED",
    poll_interval_ms: null,
    freshness_state: "OK",
    age_seconds: asOf === null ? 0 : Math.max(0, Math.floor((readAt.valueOf() - asOf.valueOf()) / 1_000)),
    lag_ms: 0,
    capability_snapshot_id: null,
    delivery_profile: "portal_sgp_projection",
  };
}

@Injectable()
export class CommandCenterRepository {
  // Pure timestamp parsing only. Keyed by the exact retained field object AND
  // current string: mutable test/active projections cannot reuse stale facts.
  // The read-time 24h predicate and per-request permissions are never cached.
  private readonly journalStamps = new WeakMap<object, {
    value: string | null; parsed: { iso: string; at: number } | null;
  }>();
  constructor(
    @Inject(CONTROL_API_POOL) private readonly pool: Pool,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(EXECUTION_DATA_POOL) private readonly executionPool: Pool = pool,
    @Optional() @Inject(ExecutionProfileProjectionRepository) private readonly projections?: ExecutionProfileProjectionRepository,
    @Optional() @Inject(WorkspacesRepository) private readonly workspaces?: WorkspacesRepository,
    @Optional() @Inject(OwnerAccessService) private readonly ownerAccess: OwnerAccessService = new OwnerAccessService(pool),
    @Optional() @Inject(ExecutionReadScopes) private readonly scopes?: ExecutionReadScopes,
  ) {}

  requiresTrustedPrincipal(): boolean { return this.scopes !== undefined; }

  /** Composition never promotes a workspace-wide cache to V2 authority. */
  async readAuthorized<T>(principal: ReadScopePrincipal, readAt: Date,
    complete: (input: CommandCenterInputs, scoped: boolean) => T | Promise<T>): Promise<T> {
    if (!this.scopes) return complete(await this.read(principal.workspaceId, principal.user, readAt), false);
    const core: ReadScopePrincipal = { user: { ...principal.user }, session: { ...principal.session },
      workspaceId: principal.workspaceId, viewerWorkspaceId: principal.workspaceId };
    const coreMode = await this.scopes.coreSelectionMode(core);
    const sourceWorkspace = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    const source: ReadScopePrincipal = { ...core, workspaceId: sourceWorkspace ?? "", viewerWorkspaceId: core.workspaceId };
    const selectSource = async () => {
      if (!sourceWorkspace) return "DENIED" as const;
      try { return await this.scopes!.selectionMode(source); }
      catch (error) {
        // A current Core member may still read Core cards after retained
        // source access is revoked. This is not a fallback to source bytes.
        if (error instanceof ExecutionReadScopeError && error.code === "EXECUTION_READ_NOT_AVAILABLE") return "DENIED" as const;
        throw error;
      }
    };
    const sourceMode = await selectSource();
    const fence = async () => {
      if (await this.scopes!.coreSelectionMode(core) !== coreMode || await selectSource() !== sourceMode)
        throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
    };
    if (sourceMode !== "SCOPED_V2") {
      const inputs = await this.read(core.workspaceId, core.user, readAt, {
        omitProjection: sourceMode === "DENIED", omitCore: coreMode === "SCOPED_V2",
      });
      await fence();
      const result = await complete(inputs, coreMode === "SCOPED_V2");
      await fence();
      return result;
    }
    // Scope datasets against source authority, never the caller's Core
    // workspace. The response/Portal workflow identity remains Core-owned.
    principal = source;
    if (!this.projections) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    const branches: Array<{ scope: AuthorizedExecutionReadScope; digest: string; epoch: string; catalogue: string | null }> = [];
    const missing = new Map<string, string>();
    for (const environment of ["paper", "sandbox", "live"] as const) {
      const profileId = environment === "paper" ? this.config.EXECUTION_EDGE_PAPER_PROFILE_ID :
        environment === "sandbox" ? this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : this.config.EXECUTION_EDGE_LIVE_PROFILE_ID;
      if (!profileId) { missing.set(environment, "PROFILE_NOT_CONFIGURED"); continue; }
      const metadata = await this.projections.snapshotMetadata(principal.workspaceId, environment, profileId);
      try {
        const scope = await this.scopes.authorize(principal, { environment, profileId }, { action: "alpha.read",
          dataset: { dataset_id: "command-center:projection", source_revision: metadata?.payloadDigest ?? "NOT_RECORDED",
            projection_generation: metadata?.projectionEpoch ?? "NOT_RECORDED", catalogue_revision: metadata?.sourceCatalogueSha256 ?? null, window: null } });
        if (scope.mode !== "SCOPED_V2") throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
        if (!metadata) { missing.set(environment, "PROFILE_NOT_RECORDED"); continue; }
        branches.push({ scope, digest: metadata.payloadDigest, epoch: metadata.projectionEpoch, catalogue: metadata.sourceCatalogueSha256 });
      } catch (error) {
        if (!(error instanceof ExecutionReadScopeError) || error.status === 409) throw error;
        missing.set(environment, error.code);
      }
    }
    if (!branches.length) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    const read = async () => {
      const rows: ProjectionSnapshotRow[] = [];
      const fieldMissing = new Set<string>();
      for (const branch of branches) {
        const { scope } = branch;
        const snapshot = await this.projections!.rawSnapshot(principal.workspaceId, scope.environment, scope.profileId);
        if (!snapshot || snapshot.payloadDigest !== branch.digest || snapshot.projectionEpoch !== branch.epoch ||
          snapshot.sourceCatalogueSha256 !== branch.catalogue || snapshot.document.workspace_id !== sourceWorkspace ||
          snapshot.document.environment !== scope.environment || snapshot.document.profile_id !== scope.profileId)
          throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
        const relation = snapshot.document.relations["manager.deployments:strategy_deployments"];
        const allowed = ["deployment_id", "state"].every(field => scopeAllowsField(scope, field));
        if (!allowed || relation?.availability !== "AVAILABLE") fieldMissing.add(scope.environment);
        const items = allowed && relation?.availability === "AVAILABLE" ? relation.items
          .filter(item => item.lineage.workspace_id === principal.workspaceId && item.lineage.profile_id === scope.profileId && projectionRowVisible(scope, item.fields))
          .map(item => ({ fields: redactProjectionFields(scope, item.fields) })) : [];
        rows.push({ environment: scope.environment, profile_id: scope.profileId, source_cursor: "",
          source_as_of: null, received_at: readAt, last_successful_refresh_at: readAt, completeness: "PARTIAL",
          projection_epoch: "", projection_sequence: "0",
          payload: { relations: { "manager.deployments:strategy_deployments": { availability: "AVAILABLE", items } } } });
      }
      const fleet = this.projectionFleet({ rows, reason: fieldMissing.size === branches.length
        ? "SCOPED_DEPLOYMENT_FIELDS_NOT_PUBLISHED" : null, ageMs: 0 }, readAt);
      // Only the authorized deployment population contributes to totals. A
      // missing profile/field is not an observed zero. Technical/reconciliation
      // relations need their own purpose contract before aggregate disclosure.
      for (const cell of fleet.items[0]?.cells ?? []) {
        const environment = cell.code === "PAPER" ? "paper" : cell.code === "SANDBOX" ? "sandbox" : "live";
        if (["BROKER_SYNC_ISSUES", "OPEN_FINDINGS"].includes(cell.code) || missing.has(environment) || fieldMissing.has(environment)) cell.value = null;
      }
      fleet.status = { ...fleet.status, reason: fleet.status.reason ?? "AUTHORIZED_DEPLOYMENT_SLICE_NOT_GLOBAL_TOTAL", as_of: null,
        source_cursor: null, projection_epoch: null, projection_sequence: null, freshness_state: "UNKNOWN", age_seconds: null, lag_ms: null };
      const unknown = "PORTAL_WORKFLOW_TARGET_LINEAGE_NOT_PUBLISHED";
      const inputs: CommandCenterInputs = { workspaceId: core.workspaceId, actor: core.user, readAt, fleet,
        triageSources: [unavailableSource("PORTAL_GOVERNANCE", "PORTAL", unknown),
          unavailableSource("EXECUTION_INCIDENTS", "PORTAL", unknown), unavailableSource("EXECUTION_OPERATIONS", "PORTAL", unknown),
          unavailableSource("EXECUTION_RECONCILIATION", "EXECUTION", "SCOPED_RECONCILIATION_FIELDS_NOT_PUBLISHED")],
        todaySources: [unavailableSource("PORTAL_GOVERNANCE", "PORTAL", unknown),
          unavailableSource("EXECUTION_JOURNAL", "EXECUTION", "SCOPED_COMMAND_JOURNAL_FIELDS_NOT_PUBLISHED")] };
      await fence();
      const result = await complete(inputs, true);
      for (const branch of branches) {
        const current = await this.projections!.snapshotMetadata(principal.workspaceId, branch.scope.environment, branch.scope.profileId);
        if (!current || current.payloadDigest !== branch.digest || current.projectionEpoch !== branch.epoch ||
          current.sourceCatalogueSha256 !== branch.catalogue) throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
      }
      return result;
    };
    const fenced = (index: number): Promise<T> => index === branches.length ? read() :
      this.scopes!.deliver(branches[index].scope, () => fenced(index + 1));
    const result = await fenced(0);
    await fence();
    return result;
  }

  async read(workspaceId: string, actor: PortalUser, readAt: Date,
    options: { omitProjection?: boolean; omitCore?: boolean } = {}): Promise<CommandCenterInputs> {
    // Domain reads and Core authorization must not run while holding a Core
    // transaction/connection. Twenty mounts can otherwise exhaust the pool
    // waiting for their own nested canReadExecution query (and starve Research).
    // The independent domain snapshot is deliberately not cross-DB atomic.
    const retainedAccess = !options.omitProjection && (!retainedReview(this.config) || (!!this.workspaces &&
      !!this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID &&
        await this.workspaces.canReadExecution(this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID,actor.userId)));
    let projection: ProjectionState = retainedAccess ? await this.projectionState(this.executionPool, readAt)
      : {rows:[],reason:"WORKSPACE_NOT_FOUND",ageMs:0};
    if(retainedAccess && retainedReview(this.config) && !await this.workspaces!.canReadExecution(
      this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID!,actor.userId))
      projection={rows:[],reason:"WORKSPACE_NOT_FOUND",ageMs:0};
    if (options.omitCore) {
      const unknown = "PORTAL_WORKFLOW_TARGET_LINEAGE_NOT_PUBLISHED";
      return { workspaceId, actor, readAt, fleet: this.projectionFleet(projection, readAt),
        triageSources: [unavailableSource("PORTAL_GOVERNANCE", "PORTAL", unknown),
          unavailableSource("EXECUTION_INCIDENTS", "PORTAL", unknown), unavailableSource("EXECUTION_OPERATIONS", "PORTAL", unknown),
          this.reconciliationTriage(projection, readAt)],
        todaySources: [unavailableSource("PORTAL_GOVERNANCE", "PORTAL", unknown), this.journalToday(projection, readAt)] };
    }
    const gates = commandCenterGovernanceGates(actor, await this.ownerAccess.effectiveAccess(actor.userId), workspaceId);
    const visibleGates = gates.readable;
    const client = await this.pool.connect();
    let inputs: CommandCenterInputs;
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '1000ms'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '2000ms'");
      const governance = await this.governanceTriage(client, workspaceId, actor, readAt, gates.actionable);
      const today = await this.governanceToday(client, workspaceId, readAt,visibleGates);
      const incidents = await this.incidentTriage(client, workspaceId, readAt);
      const operations = await this.operationTriage(client, workspaceId, readAt);
      const verifiedOperations = await this.verifiedOperationsToday(client, workspaceId, readAt);
      // One projection read feeds fleet health, reconciliation triage and the
      // journal window from one projection query; Core and domain are separate.
      // Domain data has its own pool/snapshot; never pretend cross-DB atomicity.
      const fleet = this.projectionFleet(projection, readAt);
      const reconciliation = this.reconciliationTriage(projection, readAt);
      const journal = this.journalToday(projection, readAt);
      await client.query("COMMIT");
      inputs = {
        workspaceId,
        actor,
        readAt,
        triageSources: [
          governance,
          incidents,
          operations,
          reconciliation,
        ],
        fleet,
        todaySources: [
          today,
          verifiedOperations,
          journal,
        ],
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    // Re-evaluate current delegated grants/owner anchor after all awaited reads.
    // Release the Core connection first: authority evaluation uses its own pool
    // and must not starve twenty concurrent mounts behind their held clients.
    const current = commandCenterGovernanceGates(actor, await this.ownerAccess.effectiveAccess(actor.userId), workspaceId);
    if (JSON.stringify(current) !== JSON.stringify(gates))
      throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
    return inputs;
  }

  private async incidentTriage(
    client: PoolClient,
    workspaceId: string,
    readAt: Date,
  ): Promise<ExactSourceSlice<TriageCandidate>> {
    const result = await client.query<IncidentTriageRow>(
      `SELECT incident_id, title, summary, severity, workflow_state, created_at, updated_at,
              count(*) OVER() AS total_count
         FROM execution_incidents
        WHERE workspace_id=$1 AND workflow_state IN ('OPEN','MITIGATED')
        ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'ERROR' THEN 2
                               WHEN 'WARNING' THEN 3 ELSE 4 END,
                 updated_at, incident_id
        LIMIT 10`,
      [workspaceId],
    );
    const total = result.rows[0] ? Number(result.rows[0].total_count)
      : Number((await client.query<{ count: string }>(
        `SELECT count(*) FROM execution_incidents
          WHERE workspace_id=$1 AND workflow_state IN ('OPEN','MITIGATED')`,
        [workspaceId],
      )).rows[0]?.count ?? 0);
    const asOf = latestDate(result.rows.map((row) => row.updated_at));
    return {
      status: localExecutionStatus("EXECUTION_INCIDENTS", asOf, readAt),
      exact_total_count: total,
      items: result.rows.map((row) => ({
        id: row.incident_id,
        kind: "INCIDENT",
        title: row.title,
        summary: row.summary,
        severity: commandCenterSeverity(row.severity),
        sla_state: "NONE",
        sla_due_at: null,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        authority: "EXECUTION",
        as_of: row.updated_at.toISOString(),
        href: `/execution/operations/incidents/${encodeURIComponent(row.incident_id)}`,
        action_label: row.workflow_state === "OPEN" ? "Triage" : "Review mitigation",
      })),
    };
  }

  private async operationTriage(
    client: PoolClient,
    workspaceId: string,
    readAt: Date,
  ): Promise<ExactSourceSlice<TriageCandidate>> {
    const result = await client.query<OperationTriageRow>(
      `SELECT operation_id, command_key, target_type, target_id, severity, source_status,
              verification_result, created_at, updated_at, count(*) OVER() AS total_count
         FROM execution_operation_queue_items
        WHERE workspace_id=$1 AND triage_state <> 'RESOLVED'
        ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'ERROR' THEN 2
                               WHEN 'WARNING' THEN 3 ELSE 4 END,
                 updated_at, operation_id
        LIMIT 10`,
      [workspaceId],
    );
    const total = result.rows[0] ? Number(result.rows[0].total_count)
      : Number((await client.query<{ count: string }>(
        `SELECT count(*) FROM execution_operation_queue_items
          WHERE workspace_id=$1 AND triage_state <> 'RESOLVED'`,
        [workspaceId],
      )).rows[0]?.count ?? 0);
    const asOf = latestDate(result.rows.map((row) => row.updated_at));
    return {
      status: localExecutionStatus("EXECUTION_OPERATIONS", asOf, readAt),
      exact_total_count: total,
      items: result.rows.map((row) => ({
        id: row.operation_id,
        kind: "OPERATION",
        title: row.command_key,
        summary: `${row.target_type}:${row.target_id} · ${row.source_status}/${row.verification_result}`,
        severity: commandCenterSeverity(row.severity),
        sla_state: "NONE",
        sla_due_at: null,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        authority: "EXECUTION",
        as_of: row.updated_at.toISOString(),
        href: `/execution/operations?operation_id=${encodeURIComponent(row.operation_id)}`,
        action_label: "Inspect",
      })),
    };
  }

  private async verifiedOperationsToday(
    client: PoolClient,
    workspaceId: string,
    readAt: Date,
  ): Promise<ExactSourceSlice<TodayCandidate>> {
    const result = await client.query<OperationTriageRow>(
      `SELECT operation_id, command_key, target_type, target_id, severity, source_status,
              verification_result, created_at, updated_at, count(*) OVER() AS total_count
         FROM execution_operation_queue_items
        WHERE workspace_id=$1
          AND source_status='SUCCEEDED' AND verification_result='SUCCEEDED'
          AND updated_at BETWEEN $2::timestamptz - interval '24 hours' AND $2::timestamptz
        ORDER BY updated_at DESC, operation_id DESC
        LIMIT 12`,
      [workspaceId, readAt],
    );
    const total = result.rows[0] ? Number(result.rows[0].total_count) : 0;
    const asOf = latestDate(result.rows.map((row) => row.updated_at));
    return {
      status: localExecutionStatus("EXECUTION_OPERATIONS", asOf, readAt),
      exact_total_count: total,
      items: result.rows.map((row) => ({
        id: `verified:${row.operation_id}`,
        kind: "VERIFIED_OPERATION",
        label: `${row.command_key} verified · ${row.target_type}:${row.target_id}`,
        scheduled_at: row.updated_at.toISOString(),
        authority: "EXECUTION",
        as_of: row.updated_at.toISOString(),
        href: `/execution/operations?operation_id=${encodeURIComponent(row.operation_id)}`,
      })),
    };
  }

  private async projectionState(client: Pick<Pool, "query"> | PoolClient, readAt: Date): Promise<ProjectionState> {
    const projectionWorkspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if (!projectionWorkspaceId || this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true") {
      return { rows: [], reason: "PHASE2_LOCAL_PROJECTION_DISABLED", ageMs: 0 };
    }
    if(retainedReview(this.config)&&this.projections){
      // The repository already supplies source metadata and the scoped,
      // single-flight retained document. Do not de-TOAST the same three raw
      // snapshots again for every viewer before immediately replacing them.
      const views=await Promise.all((["paper","sandbox","live"] as const).map(async environment=>{
        const profile=environment==="paper"?this.config.EXECUTION_EDGE_PAPER_PROFILE_ID
          :environment==="sandbox"?this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID:this.config.EXECUTION_EDGE_LIVE_PROFILE_ID;
        if(!profile)return null;
        const view=await this.projections!.snapshot(projectionWorkspaceId,environment,profile);
        return view?{environment,profile_id:profile,source_cursor:view.sourceCursor,source_as_of:view.sourceAsOf,
          received_at:view.receivedAt,last_successful_refresh_at:view.lastSuccessfulRefreshAt,
          completeness:"PARTIAL" as const,projection_epoch:view.projectionEpoch,
          projection_sequence:String(view.projectionSequence),payload:view.document}:null;
      }));
      const rows=views.filter((row):row is NonNullable<typeof row>=>row!==null);
      const newest=latestDate(rows.map(row=>row.last_successful_refresh_at));
      return {rows,reason:rows.length?null:"PHASE2_PROJECTION_NOT_READY",
        ageMs:newest?Math.max(0,readAt.valueOf()-newest.valueOf()):Number.MAX_SAFE_INTEGER};
    }
    const result = await client.query<ProjectionSnapshotRow>(
      `SELECT environment, profile_id, source_cursor, source_as_of, received_at,
              last_successful_refresh_at, completeness, projection_epoch::text,
              projection_sequence::text, payload
         FROM execution_profile_projection_snapshots
        WHERE workspace_id=$1 AND environment IN ('paper','sandbox','live')
        ORDER BY environment`,
      [projectionWorkspaceId],
    );
    if (result.rows.length === 0) {
      return { rows: [], reason: "PHASE2_PROJECTION_NOT_READY", ageMs: 0 };
    }
    const newestRefresh = latestDate(result.rows.map((row) => row.last_successful_refresh_at));
    const ageMs = newestRefresh ? Math.max(0, readAt.valueOf() - newestRefresh.valueOf()) : Number.MAX_SAFE_INTEGER;
    if (!retainedReview(this.config) && ageMs > this.config.EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS) {
      return { rows: result.rows, reason: "PHASE2_PROJECTION_STALE_CEILING_EXCEEDED", ageMs };
    }
    return { rows: result.rows, reason: null, ageMs };
  }

  private projectionFleet(projection: ProjectionState, readAt: Date): ExactSourceSlice<FleetSnapshot> {
    if (projection.reason !== null) {
      return unavailableSource("EXECUTION_FLEET", "EXECUTION", projection.reason);
    }
    const result = { rows: projection.rows };
    const ageMs = projection.ageMs;
    const deployments = new Map<string, { environment: string; state: string; label: string }>();
    let brokerSyncIssues = 0;
    let openFindings = 0;
    for (const snapshot of result.rows) {
      for (const row of projectionRows(snapshot, "manager.deployments:strategy_deployments")) {
        const id = String(row.deployment_id ?? "");
        if (!id) continue;
        deployments.set(`${snapshot.environment}:${id}`, {
          environment: snapshot.environment,
          state: String(row.state ?? "").toUpperCase(),
          label: String(row.strategy_id ?? id),
        });
      }
      brokerSyncIssues += projectionRows(snapshot, "manager.accounts:broker_account_sync_effective")
        .filter((row) => !["OK", "SYNCED", "CURRENT", "SUCCESS", "SUCCEEDED"].includes(String(row.status ?? "").toUpperCase())).length;
      openFindings += projectionRows(snapshot, "manager.reconciliation:reconciliation_findings")
        .filter((row) => !["CLOSED", "RESOLVED", "CLEARED"].includes(String(row.status ?? "").toUpperCase())).length;
    }
    const values = [...deployments.values()];
    const total = deployments.size;
    const status = projectionSourceStatus("EXECUTION_FLEET", result.rows, readAt, ageMs);
    return {
      status,
      exact_total_count: total,
      items: [{
        total_deployments: total,
        cells: [
          { code: "LIVE_FULL", label: "Live", value: values.filter((row) => row.environment === "live" && !row.state.includes("CANARY")).length, href: "/deployments/live" },
          { code: "LIVE_CANARY", label: "Canary", value: values.filter((row) => row.environment === "live" && row.state.includes("CANARY")).length, href: "/deployments/live?stage=canary" },
          { code: "SANDBOX", label: "Sandbox", value: values.filter((row) => row.environment === "sandbox").length, href: "/deployments/sandbox" },
          { code: "PAPER", label: "Paper", value: values.filter((row) => row.environment === "paper").length, href: "/deployments/paper" },
          { code: "BROKER_SYNC_ISSUES", label: "Broker sync", value: brokerSyncIssues, href: "/execution/operations?filter=broker_sync" },
          { code: "OPEN_FINDINGS", label: "Findings", value: openFindings, href: "/execution/operations?filter=findings" },
        ],
        deployment_labels: Object.fromEntries([...deployments.entries()].map(([key, row]) => [key.split(":", 2)[1], row.label])),
      }],
    };
  }

  /**
   * P4-H / F12: open reconciliation findings from the committed profile
   * projections are a needs-you source — published operational alerts, not a
   * derived guess. A truthful zero keeps the panel QUIET.
   */
  private reconciliationTriage(projection: ProjectionState, readAt: Date): ExactSourceSlice<TriageCandidate> {
    if (projection.reason !== null) {
      return unavailableSource("EXECUTION_RECONCILIATION", "EXECUTION", projection.reason);
    }
    const open = projection.rows.flatMap((snapshot) =>
      projectionRows(snapshot, "manager.reconciliation:reconciliation_findings")
        .filter((row) => !["CLOSED", "RESOLVED", "CLEARED"].includes(String(row.status ?? "").toUpperCase()))
        .map((row) => ({ snapshot, row })));
    const severityRank = (severity: string) =>
      ({ CRITICAL: 1, ERROR: 2, WARNING: 3 } as Record<string, number>)[severity] ?? 4;
    const items = [...open]
      .sort((left, right) =>
        severityRank(String(left.row.severity ?? "").toUpperCase()) - severityRank(String(right.row.severity ?? "").toUpperCase())
        || String(right.row.created_at ?? "").localeCompare(String(left.row.created_at ?? ""))
        || String(left.row.finding_id ?? "").localeCompare(String(right.row.finding_id ?? "")))
      .slice(0, 10)
      .map(({ snapshot, row }) => {
        const at = typeof row.created_at === "string" ? row.created_at : readAt.toISOString();
        return {
          id: `${snapshot.environment}:${String(row.finding_id ?? "finding")}`,
          kind: "RECONCILIATION" as const,
          title: `${String(row.finding_type ?? "RECONCILIATION")} · ${String(row.venue ?? snapshot.profile_id)}`,
          summary: `${String(row.status ?? "OPEN")} · ${snapshot.environment} profile`,
          severity: commandCenterSeverity(String(row.severity ?? "").toUpperCase() as IncidentTriageRow["severity"]),
          sla_state: "NONE" as const,
          sla_due_at: null,
          created_at: at,
          updated_at: at,
          authority: "EXECUTION" as const,
          as_of: at,
          href: "/execution/operations?filter=findings",
          action_label: "Reconcile",
        };
      });
    return {
      status: projectionSourceStatus("EXECUTION_RECONCILIATION", projection.rows, readAt, projection.ageMs),
      exact_total_count: open.length,
      items,
    };
  }

  /**
   * P4-H / F12: the Today rail carries the bounded command-journal window from
   * the same committed projections — the real record of what the system did in
   * the last 24 hours.
   */
  private journalToday(projection: ProjectionState, readAt: Date): ExactSourceSlice<TodayCandidate> {
    if (projection.reason !== null) {
      return unavailableSource("EXECUTION_JOURNAL", "EXECUTION", projection.reason);
    }
    const windowStart = readAt.valueOf() - 24 * 3_600_000;
    const stamp = (row: Record<string, unknown>) => {
      const value = typeof row.updated_at === "string" ? row.updated_at
        : typeof row.created_at === "string" ? row.created_at : null;
      const cached = this.journalStamps.get(row);
      if (cached && cached.value === value) return cached.parsed;
      const parsed = value ? Date.parse(value) : Number.NaN;
      const result = Number.isNaN(parsed) ? null : { iso: new Date(parsed).toISOString(), at: parsed };
      this.journalStamps.set(row, { value, parsed: result });
      return result;
    };
    const windowed = projection.rows.flatMap((snapshot) =>
      projectionRows(snapshot, "manager.command-journal:command_journal").flatMap((row) => {
        const when = stamp(row);
        return when && when.at >= windowStart && when.at <= readAt.valueOf()
          ? [{ snapshot, row, when }] : [];
      }));
    const items = [...windowed]
      .sort((left, right) => right.when.at - left.when.at
        || String(left.row.command_id ?? "").localeCompare(String(right.row.command_id ?? "")))
      .slice(0, 12)
      .map(({ snapshot, row, when }) => ({
        id: `journal:${snapshot.environment}:${String(row.command_id ?? when.iso)}`,
        kind: "JOURNAL_COMMAND" as const,
        label: [
          String(row.command_kind ?? "COMMAND"),
          String(row.aggregate_key ?? snapshot.profile_id),
          String(row.outcome_class ?? row.status ?? "RECORDED"),
        ].join(" · "),
        scheduled_at: when.iso,
        authority: "EXECUTION" as const,
        as_of: when.iso,
        href: "/deployments/blotter",
      }));
    return {
      status: projectionSourceStatus("EXECUTION_JOURNAL", projection.rows, readAt, projection.ageMs),
      exact_total_count: windowed.length,
      items,
    };
  }

  private async governanceTriage(
    client: PoolClient,
    workspaceId: string,
    actor: PortalUser,
    readAt: Date,
    actionableGates: string[],
  ): Promise<ExactSourceSlice<TriageCandidate>> {
    const result = await client.query<GovernanceTriageRow>(
      `WITH actionable AS (
         SELECT request.approval_id, request.gate, request.subject_label, request.target_label,
                request.created_at, request.updated_at, request.sla_due_at,
                CASE
                  WHEN request.sla_due_at <= $3 THEN 'OVERDUE'
                  WHEN request.sla_due_at <= $3 + interval '8 hours' THEN 'DUE_SOON'
                  ELSE 'ON_TRACK'
                END AS sla_state,
                CASE
                  WHEN request.sla_due_at <= $3 THEN 1
                  WHEN request.sla_due_at <= $3 + interval '8 hours' THEN 2
                  ELSE 3
                END AS severity_rank
           FROM governance_approval_decision_inbox request
          WHERE ${commandCenterGovernanceActionableSql}
       )
       SELECT approval_id, gate, subject_label, target_label, created_at,
              updated_at, sla_due_at, sla_state, count(*) OVER() AS total_count
         FROM actionable
        ORDER BY severity_rank, sla_due_at, created_at, approval_id
        LIMIT 10`,
      [workspaceId, actor.userId, readAt, actionableGates],
    );
    const total = result.rows[0] ? Number(result.rows[0].total_count) : await this.actionableCount(
      client,
      workspaceId,
      actor.userId,
      readAt,
      actionableGates,
    );
    const asOf = result.rows.reduce<Date | null>(
      (latest, row) => latest === null || row.updated_at > latest ? row.updated_at : latest,
      null,
    );
    return {
      status: portalSourceStatus(asOf, readAt),
      exact_total_count: total,
      items: result.rows.map((row) => ({
        id: row.approval_id,
        kind: "APPROVAL",
        title: row.subject_label,
        summary: `${row.gate} · ${row.target_label}`,
        severity: row.sla_state === "OVERDUE" ? "HIGH" : row.sla_state === "DUE_SOON" ? "MEDIUM" : "LOW",
        sla_state: row.sla_state,
        sla_due_at: row.sla_due_at.toISOString(),
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        authority: "PORTAL",
        as_of: row.updated_at.toISOString(),
        href: reviewHref(row.gate, row.approval_id),
        action_label: "Review",
      })),
    };
  }

  private async actionableCount(
    client: PoolClient,
    workspaceId: string,
    actorId: string,
    readAt: Date,
    actionableGates: string[],
  ): Promise<number> {
    const result = await client.query<{ total_count: string }>(
      `SELECT count(*) AS total_count
         FROM governance_approval_decision_inbox request
        WHERE ${commandCenterGovernanceActionableSql}`,
      [workspaceId, actorId, readAt, actionableGates],
    );
    return Number(result.rows[0]?.total_count ?? 0);
  }

  private async governanceToday(
    client: PoolClient,
    workspaceId: string,
    readAt: Date,
    visibleGates: string[],
  ): Promise<ExactSourceSlice<TodayCandidate>> {
    const result = await client.query<TodayRow>(
      `WITH upcoming AS (
         SELECT concat('review:', approval_id) AS item_id,
                'REVIEW_DUE'::text AS kind,
                concat(gate, ' review · ', subject_label) AS label,
                sla_due_at AS scheduled_at,
                CASE
                  WHEN gate = 'R1' THEN concat('/governance/approvals/', approval_id, '/r1')
                  WHEN gate = 'R2' THEN concat('/governance/approvals/', approval_id, '/r2')
                  WHEN gate = 'LIVE_GATE' THEN concat('/governance/approvals/', approval_id, '/live')
                  ELSE concat('/governance/exit-reviews/', approval_id)
                END AS href,
                updated_at
           FROM governance_approval_requests
          WHERE workspace_id = $1
            AND gate=ANY($3::text[])
            AND status = 'PENDING'
            AND expires_at > $2
            AND sla_due_at <= $2 + interval '48 hours'
         UNION ALL
         SELECT concat('condition:', condition_id), 'CONDITION_EXPIRY',
                concat('Condition ', lower(condition_state), ' · ', label), due_at,
                '/governance/waivers', updated_at
           FROM governance_conditions_register
          WHERE workspace_id = $1
            AND gate=ANY($3::text[])
            AND condition_state IN ('EXPIRING', 'LAPSED')
            AND due_at IS NOT NULL
            AND due_at BETWEEN $2 - interval '30 days' AND $2 + interval '48 hours'
       )
       SELECT *, count(*) OVER() AS total_count
         FROM upcoming
        ORDER BY scheduled_at, kind, item_id
        LIMIT 12`,
      [workspaceId, readAt,visibleGates],
    );
    const total = result.rows[0]
      ? Number(result.rows[0].total_count)
      : Number((await client.query<{ total_count: string }>(
        `SELECT (
           (SELECT count(*) FROM governance_approval_requests
             WHERE workspace_id = $1 AND status = 'PENDING'
               AND gate=ANY($3::text[])
               AND expires_at > $2 AND sla_due_at <= $2 + interval '48 hours')
           +
           (SELECT count(*) FROM governance_conditions_register
             WHERE workspace_id = $1
               AND gate=ANY($3::text[])
               AND condition_state IN ('EXPIRING', 'LAPSED')
               AND due_at IS NOT NULL
               AND due_at BETWEEN $2 - interval '30 days' AND $2 + interval '48 hours')
         ) AS total_count`,
        [workspaceId, readAt,visibleGates],
      )).rows[0]?.total_count ?? 0);
    const asOf = result.rows.reduce<Date | null>(
      (latest, row) => latest === null || row.updated_at > latest ? row.updated_at : latest,
      null,
    );
    return {
      status: portalSourceStatus(asOf, readAt),
      exact_total_count: total,
      items: result.rows.map((row) => ({
        id: row.item_id,
        kind: row.kind,
        label: row.label,
        scheduled_at: row.scheduled_at.toISOString(),
        authority: "PORTAL",
        as_of: row.updated_at.toISOString(),
        href: row.href,
      })),
    };
  }
}

function localExecutionStatus(
  source: "EXECUTION_INCIDENTS" | "EXECUTION_OPERATIONS",
  asOf: Date | null,
  readAt: Date,
): SourceStatus {
  return {
    source,
    authority: "EXECUTION",
    availability: "AVAILABLE",
    reason: null,
    as_of: asOf?.toISOString() ?? readAt.toISOString(),
    source_cursor: null,
    source_sequence: null,
    projection_epoch: null,
    projection_sequence: null,
    source_completeness: "EVENT_SOURCED",
    poll_interval_ms: null,
    freshness_state: "OK",
    age_seconds: asOf ? Math.max(0, Math.floor((readAt.valueOf() - asOf.valueOf()) / 1000)) : 0,
    lag_ms: 0,
    capability_snapshot_id: null,
    delivery_profile: "portal_sgp_projection",
  };
}

interface ProjectionState {
  rows: ProjectionSnapshotRow[];
  reason: string | null;
  ageMs: number;
}

function projectionSourceStatus(
  source: "EXECUTION_FLEET" | "EXECUTION_RECONCILIATION" | "EXECUTION_JOURNAL",
  rows: ProjectionSnapshotRow[],
  readAt: Date,
  ageMs: number,
): SourceStatus {
  const oldest = [...rows].sort((left, right) =>
    left.last_successful_refresh_at.valueOf() - right.last_successful_refresh_at.valueOf())[0];
  const newestSequence = Math.max(...rows.map((row) => Number(row.projection_sequence)));
  return {
    source,
    authority: "EXECUTION",
    availability: "AVAILABLE",
    reason: rows.some((row) => row.completeness !== "COMPLETE") ? "PHASE2_HOT_WINDOW_PARTIAL" : null,
    as_of: latestDate(rows.flatMap((row) => row.source_as_of ? [row.source_as_of] : []))?.toISOString() ?? null,
    source_cursor: oldest.source_cursor,
    source_sequence: null,
    projection_epoch: oldest.projection_epoch,
    projection_sequence: newestSequence,
    source_completeness: "POLL_BOUNDED",
    poll_interval_ms: null,
    freshness_state: ageMs > 120_000 ? "AGING" : "OK",
    age_seconds: Math.floor(ageMs / 1000),
    lag_ms: ageMs,
    capability_snapshot_id: null,
    delivery_profile: "portal_sgp_projection",
  };
}

function projectionRows(snapshot: ProjectionSnapshotRow, key: string): Array<Record<string, unknown>> {
  const relation = snapshot.payload.relations?.[key];
  if (!relation || relation.availability !== "AVAILABLE") return [];
  return (relation.items ?? []).flatMap((item) => item.fields ? [item.fields] : []);
}

function latestDate(values: Date[]): Date | null {
  return values.reduce<Date | null>((latest, value) => latest === null || value > latest ? value : latest, null);
}

function commandCenterSeverity(value: "INFO" | "WARNING" | "ERROR" | "CRITICAL"):
"INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (value === "CRITICAL") return "CRITICAL";
  if (value === "ERROR") return "HIGH";
  if (value === "WARNING") return "MEDIUM";
  return "INFO";
}
