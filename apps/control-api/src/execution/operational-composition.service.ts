import { createHash } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { WorkspacesRepository } from "../repos/workspaces";
import { CommandCenterError, CommandCenterService } from "../command-center/command-center.service";
import { ControlApiConfig } from "../config";
import { GovernanceError, GovernanceService } from "../governance/governance.service";
import { governanceConditionsQuery } from "../governance/contracts";
import { PaperExitService } from "../governance/paper-exit.service";
import { PositiveParentReads } from "../governance/positive-parent.service";
import { LiveParentReads } from "../governance/live-parent.service";
import { IncidentService } from "../operations/incident.service";
import { ExecutionOperationsService } from "../operations/operations.service";
import { OperationsWorkflowService } from "../operations/workflow.service";
import { OperationQueueQuerySchema } from "../operations/contracts";
import { OperationalReadService } from "../operations/operational-read.service";
import { OperationalReadError } from "../operations/current-operational-read";
import { CONTROL_API_CONFIG } from "../tokens";
import { retainedReview } from "./retained-read-profile";
import { ExecutionReadScopes, ExecutionReadScopeError, type AuthorizedExecutionReadScope } from "../execution-v2/read-scope";
import { scopedRetainedRows, fenceRetainedSnapshot } from "./retained-operation-page";
import {
  ExecutionProfileProjectionRepository,
  type ProjectionEnvironment,
  type ProjectionScalar,
  type ProfileProjectionSnapshot,
  projectionDigest,
} from "./profile-projection.repository";
import {
  PortalDerivationError,
  PortalDerivationsService,
  type PortalDerivationPrincipal,
} from "./portal-derivations.service";

export type OperationalSurface =
  | "approval_r1"
  | "approval_r2"
  | "live_review"
  | "paper_exit_review"
  | "waivers_register"
  | "operations_queue"
  | "incident_detail"
  | "command_center"
  | "admin_action_drawer";

const JOURNAL_RELATION = "manager.command-journal:command_journal";
const ENVIRONMENTS: readonly ProjectionEnvironment[] = ["paper", "sandbox", "live"];
const JOURNAL_FIELDS = new Set([
  "command_id", "command_key", "command_type", "environment", "venue", "state", "status",
  "outcome", "created_at", "updated_at", "accepted_at", "completed_at", "risk_tier", "target_type",
]);

/**
 * EDS-05's operational join point.  It deliberately composes Portal-owned
 * workflow state with already committed local Manager observations.  It never
 * calls the Edge, source proxy, trading database, broker, or command relay.
 */
@Injectable()
export class OperationalCompositionService {
  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(PortalDerivationsService) private readonly derivations: PortalDerivationsService,
    @Inject(ExecutionProfileProjectionRepository) private readonly projections: ExecutionProfileProjectionRepository,
    @Inject(GovernanceService) private readonly governance: GovernanceService,
    @Inject(PaperExitService) private readonly paperExit: PaperExitService,
    @Inject(OperationsWorkflowService) private readonly workflows: OperationsWorkflowService,
    @Inject(IncidentService) private readonly incidents: IncidentService,
    @Inject(CommandCenterService) private readonly commandCenter: CommandCenterService,
    @Inject(ExecutionOperationsService) private readonly operations: ExecutionOperationsService,
    @Optional() @Inject(WorkspacesRepository) private readonly workspaces?: WorkspacesRepository,
    @Optional() @Inject(ExecutionReadScopes) private readonly readScopes?: ExecutionReadScopes,
    @Optional() @Inject(OperationalReadService) private readonly currentReads?: OperationalReadService,
    @Optional() @Inject(PositiveParentReads) private readonly positiveParents?: PositiveParentReads,
    @Optional() @Inject(LiveParentReads) private readonly liveParents?: LiveParentReads,
  ) {}

  async approval(
    principal: PortalDerivationPrincipal,
    approvalId: string,
    view: "r1" | "r2" | "live",
  ): Promise<Record<string, unknown>> {
    if(view==="live"&&await this.readScopes?.coreSelectionMode(principal)==="SCOPED_V2"){
      if(!this.liveParents)throw new OperationalReadError("OPERATIONAL_READ_NOT_CONFIGURED");
      const prepared=await this.liveParents.prepare(principal,approvalId);
      // Pure composition INSIDE the SAME flight; no independent source calls
      // or rich legacy fallback, no falsely held cross-authority snapshot.
      return this.liveParents.finish(prepared,governance=>this.currentComposition(principal,"live_review",{
        governance,accepted_manager_facts:governance.accepted_manager_facts}));
    }
    if (view === "r2" && await this.readScopes?.coreSelectionMode(principal) === "SCOPED_V2") {
      if (!this.positiveParents) throw new OperationalReadError("OPERATIONAL_READ_NOT_CONFIGURED");
      const prepared = await this.positiveParents.prepare(principal,"R2",approvalId);
      // Pure composition stays INSIDE the same issuer-bound flight; there is
      // no awaited source/projection work after its genuine final Core fence.
      return this.positiveParents.finish(prepared, governance =>
        this.currentComposition(principal,"approval_r2",{governance,accepted_manager_facts:null}));
    }
    const governance = view === "r1"
      ? await this.governance.detail(principal.user, principal.workspaceId, approvalId, principal.session)
      : view === "r2"
        ? await this.governance.r2Detail(principal.user, principal.workspaceId, approvalId, principal.session)
        // Live has its own grant and stored approval gate. Preserve this
        // composition's backbone shape without authorizing Live through R2.
        : (await this.governance.liveDetail(
          principal.user, principal.session, principal.workspaceId, approvalId,
        )).governance_backbone;
    let acceptedFacts: Record<string, unknown> | null = null;
    if (view === "live") {
      const deploymentId = deploymentIdFromGovernance(governance);
      if (retainedReview(this.config) && this.workspaces && (!this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID ||
        !await this.workspaces.canReadExecution(this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID,principal.user.userId))) {
        acceptedFacts = unavailable("WORKSPACE_NOT_FOUND");
      } else if (!deploymentId) {
        acceptedFacts = unavailable("EDS05_LIVE_REVIEW_DEPLOYMENT_NOT_RESOLVED");
      } else {
        try {
          acceptedFacts = await this.derivations.deploymentQuality(this.sourcePrincipal(principal), deploymentId, "live");
        } catch (error) {
          acceptedFacts = unavailable(error instanceof PortalDerivationError ? error.code : "EDS05_LIVE_REVIEW_FACTS_UNAVAILABLE");
        }
      }
    }
    return this.compose(principal, view === "r1" ? "approval_r1" : view === "r2" ? "approval_r2" : "live_review", {
      governance,
      accepted_manager_facts: acceptedFacts,
    }, () => this.governance.assertReadAuthority(principal.user, principal.session, principal.workspaceId, view));
  }

  async exitReview(principal: PortalDerivationPrincipal, reviewId: string): Promise<Record<string, unknown>> {
    if (await this.readScopes?.coreSelectionMode(principal) === "SCOPED_V2") {
      if (!this.positiveParents) throw new OperationalReadError("OPERATIONAL_READ_NOT_CONFIGURED");
      const prepared = await this.positiveParents.prepare(principal,"PAPER_EXIT",reviewId);
      return this.positiveParents.finish(prepared, exit_review =>
        this.currentComposition(principal,"paper_exit_review",{exit_review}));
    }
    return this.compose(principal, "paper_exit_review", {
      exit_review: await this.paperExit.detail(principal.user, principal.workspaceId, reviewId, principal.session),
    }, () => this.paperExit.assertReadAuthority(principal.user, principal.workspaceId, principal.session));
  }

  /**
   * Goal 9: the composition has to be able to *replace* the standalone read,
   * not sit beside it, or a screen that pages or filters would have to fetch
   * both and the request count would grow. So it accepts the same query the
   * standalone route accepts and hands it to the same builder — the default
   * stays exactly what it was when a caller sends nothing.
   */
  async waiversRegister(
    principal: PortalDerivationPrincipal,
    query: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    return this.compose(principal, "waivers_register", {
      waivers_register: await this.governance.conditions(
        principal.user,
        principal.workspaceId,
        governanceConditionsQuery({ limit: 50, ...query }),
        principal.session,
      ),
    });
  }

  /** Same substitution rule as the waivers register above. */
  async operationsQueue(
    principal: PortalDerivationPrincipal,
    query: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    if (await this.readScopes?.coreSelectionMode(principal) === "SCOPED_V2") {
      if (!this.currentReads) throw new OperationalReadError("OPERATIONAL_READ_NOT_CONFIGURED");
      const prepared = await this.currentReads.prepareQueue(principal, query, 50);
      // LAST await, including held parser/cursor/body refusals. The wrapper
      // below is finite and pure: no source panel creates a discarded scope.
      return this.currentReads.finish(prepared,
        queue => this.currentComposition(principal, "operations_queue", { operations_queue: queue }));
    }
    const parsed = OperationQueueQuerySchema.safeParse(query);
    if (!parsed.success) throw new PortalDerivationError("EDS05_OPERATION_QUEUE_QUERY_INVALID", 400, "Invalid operation queue query.");
    const fence = async () => {
      if (await this.readScopes?.coreSelectionMode(principal) === "SCOPED_V2")
        throw new GovernanceError("OPERATIONS_SCOPED_PARENT_NOT_COMMISSIONED", "Scoped operation records are not commissioned.", 503);
    };
    await fence();
    const queue = await this.workflows.list(principal.user, principal.workspaceId, {
      limit: 50,
      ...parsed.data,
    });
    await fence();
    return this.compose(principal, "operations_queue", {
      operations_queue: queue,
    }, fence);
  }

  async incidentDetail(principal: PortalDerivationPrincipal, incidentId: string): Promise<Record<string, unknown>> {
    if (await this.readScopes?.coreSelectionMode(principal) === "SCOPED_V2") {
      if (!this.currentReads) throw new OperationalReadError("OPERATIONAL_READ_NOT_CONFIGURED");
      const prepared = await this.currentReads.prepareIncident(principal, incidentId);
      return this.currentReads.finish(prepared,
        incident => this.currentComposition(principal, "incident_detail", { incident }));
    }
    return this.compose(principal, "incident_detail", {
      incident: await this.incidents.detail(principal.user, principal.workspaceId, incidentId, principal),
    });
  }

  async commandCenterSnapshot(principal: PortalDerivationPrincipal): Promise<Record<string, unknown>> {
    let commandCenter: Record<string, unknown>;
    try {
      commandCenter = await this.commandCenter.snapshot(principal.user, principal.workspaceId, principal);
    } catch (error) {
      if (!(error instanceof CommandCenterError)) throw error;
      commandCenter = unavailable(error.code);
    }
    return this.compose(principal, "command_center", { command_center: commandCenter });
  }

  async adminActionDrawer(principal: PortalDerivationPrincipal): Promise<Record<string, unknown>> {
    // This publishes the existing catalogue only.  No operation plan/apply is
    // invoked and the command relay remains governed by its existing flag.
    // Static task metadata is NOT an effective V2 grant or a parent record;
    // actual execution still evaluates its own current capability and scope.
    return this.compose(principal, "admin_action_drawer", {
      task_catalogue: this.operations.taskCatalogue(principal.user, principal.workspaceId),
      command_authority: {
        state: "FAIL_CLOSED",
        relay_active: false,
        source_side_effect_requested: false,
      },
    });
  }

  private async compose(
    principal: PortalDerivationPrincipal,
    surface: OperationalSurface,
    body: Record<string, unknown>,
    validateBody?: () => Promise<void>,
  ): Promise<Record<string, unknown>> {
    const readAt = new Date();
    const scoped = await this.readScopes?.coreSelectionMode(principal) === "SCOPED_V2";
    if (scoped) {
      // A catalogue/business permission must not open an audit journal. These
      // existing parents keep their OWN authority gates; no source read below.
      await validateBody?.();
      return this.currentComposition(principal, surface, body);
    }
    const allowed = !retainedReview(this.config) || !this.workspaces || (!!this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID &&
      await this.workspaces.canReadExecution(this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID,principal.user.userId));
    const sourcePrincipal = this.sourcePrincipal(principal);
    const sourceHealth = allowed ? await this.derivations.sourceHealth(sourcePrincipal)
      : {input_digest:digest("WORKSPACE_NOT_FOUND"),...unavailable("WORKSPACE_NOT_FOUND")};
    const journal = allowed ? await this.redactedCommandJournal(sourcePrincipal)
      : {digest:digest("WORKSPACE_NOT_FOUND"),...unavailable("WORKSPACE_NOT_FOUND")};
    await validateBody?.();
    const lineage = {
      source_health_input_digest: sourceHealth.input_digest,
      command_journal_digest: journal.digest,
      workflow_digest: digest(stable(body)),
      formula_version: "execution.operational-composition.v1",
    };
    return {
      schema_version: "execution.operational-composition.v1",
      logical_operation_id: operationIdFor(surface),
      record_authority: "PORTAL_CONTROL",
      source_authority: "PORTAL_CONTROL_PLUS_ACCEPTED_TRADING_SYSTEM_OBSERVATIONS",
      workspace_id: principal.workspaceId,
      read_at_ms: readAt.valueOf(),
      read_at: readAt.toISOString(),
      composite_revision: digest({ surface, lineage }),
      source_health: sourceHealth,
      redacted_command_journal: journal,
      canary_twin_comparison: unavailable("E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED"),
      command_authority: {
        state: "UNCHANGED_FAIL_CLOSED",
        source_side_effect_requested: false,
      },
      lineage,
      data: body,
    };
  }

  private currentComposition(principal: PortalDerivationPrincipal, surface: OperationalSurface,
    body: Record<string, unknown>): Record<string, unknown> {
    const readAt = new Date();
    const sourceHealth = { input_digest: digest("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED"),
      ...unavailable("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED") };
    const journal = { digest: digest("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED"),
      ...unavailable("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED") };
    const lineage = { source_health_input_digest: sourceHealth.input_digest, command_journal_digest: journal.digest,
      workflow_digest: digest(stable(body, true)), formula_version: "execution.operational-composition.v1" };
    return { schema_version: "execution.operational-composition.v1", logical_operation_id: operationIdFor(surface),
      record_authority: "PORTAL_CONTROL", source_authority: "PORTAL_CONTROL_ONLY",
      workspace_id: principal.workspaceId, read_at_ms: readAt.valueOf(), read_at: readAt.toISOString(),
      composite_revision: digest({ surface, lineage }), source_health: sourceHealth, redacted_command_journal: journal,
      canary_twin_comparison: unavailable("E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED"),
      command_authority: { state: "UNCHANGED_FAIL_CLOSED", source_side_effect_requested: false }, lineage, data: body };
  }

  private sourcePrincipal(principal: PortalDerivationPrincipal): PortalDerivationPrincipal {
    return { ...principal, workspaceId: this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID ?? principal.workspaceId,
      viewerWorkspaceId: principal.viewerWorkspaceId ?? principal.workspaceId };
  }

  private async redactedCommandJournal(principal: PortalDerivationPrincipal): Promise<Record<string, unknown>> {
    const entries: Array<Record<string, unknown>> = [];
    const profileRevisions: Array<Record<string, unknown>> = [];
    const contexts: { scope: AuthorizedExecutionReadScope; snapshot: ProfileProjectionSnapshot;
      environment: ProjectionEnvironment; profileId: string }[] = [];
    for (const environment of ENVIRONMENTS) {
      const profileId = profileIdFor(environment, this.config);
      if (!profileId || !this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID) continue;
      const metadata = this.readScopes ? await this.projections.snapshotMetadata(principal.workspaceId, environment, profileId) : null;
      const scope = await this.readScopes?.authorize(principal, { environment, profileId }, { action: "alpha.read",
        ...(metadata ? { dataset: { dataset_id: `relation:${JOURNAL_RELATION}`, source_revision: metadata.payloadDigest,
          projection_generation: metadata.projectionEpoch, catalogue_revision: metadata.sourceCatalogueSha256, window: null } } : {}) });
      const snapshot = scope?.mode === "SCOPED_V2"
        ? await this.projections.rawSnapshot(principal.workspaceId, environment, profileId)
        : await this.projections.snapshot(principal.workspaceId, environment, profileId);
      if (!snapshot) continue;
      if (scope?.mode === "SCOPED_V2" && (!metadata || metadata.payloadDigest !== snapshot.payloadDigest ||
        metadata.projectionEpoch !== snapshot.projectionEpoch || metadata.sourceCatalogueSha256 !== snapshot.sourceCatalogueSha256))
        throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
      if (scope) contexts.push({ scope, snapshot, environment, profileId });
      const relation = snapshot.document.relations[JOURNAL_RELATION];
      const items = scopedRetainedRows(scope, relation?.items ?? []);
      const scopedRevision = scope?.mode === "SCOPED_V2"
        ? projectionDigest({ fields: items.map(item => redactJournal(item.fields)), scope: scope.fingerprint }) : null;
      profileRevisions.push({
        environment,
        profile_id: profileId,
        projection_epoch: scopedRevision ?? snapshot.projectionEpoch,
        projection_sequence: scopedRevision ? 0 : snapshot.projectionSequence,
        payload_digest: scopedRevision ?? snapshot.payloadDigest,
      });
      if (!relation || relation.availability !== "AVAILABLE") continue;
      for (const item of items) {
        const fields = redactJournal(item.fields);
        entries.push({
          environment,
          relation_state: scope?.mode === "SCOPED_V2" ? "PARTIAL" : relation.completeness,
          as_of: scope?.mode === "SCOPED_V2" ? null : relation.as_of,
          ...fields,
        });
      }
    }
    const rows = entries
      .sort((left, right) => String(right.updated_at ?? right.created_at ?? "").localeCompare(String(left.updated_at ?? left.created_at ?? ""))
        || String(left.command_id ?? "").localeCompare(String(right.command_id ?? "")))
      .slice(0, 100);
    for (const context of contexts) {
      await this.readScopes!.deliver(context.scope, async () => undefined);
      if (context.scope.mode === "SCOPED_V2") {
        await fenceRetainedSnapshot(this.projections, principal.workspaceId, context.environment, context.profileId, context.snapshot);
        await this.readScopes!.deliver(context.scope, async () => undefined);
      }
    }
    return {
      schema_version: "execution.redacted-command-journal.v1",
      state: profileRevisions.length === 0 ? "UNAVAILABLE" : entries.length === 0 ? "EMPTY" : "AVAILABLE",
      reason_code: profileRevisions.length === 0 ? "EDS05_COMMAND_JOURNAL_NOT_PROJECTED" : null,
      retention: { maximum_rows: 100, source_history_claimed: false },
      profile_revisions: profileRevisions,
      rows,
      digest: projectionDigest({ profileRevisions, rows }),
    };
  }
}

function profileIdFor(environment: ProjectionEnvironment, config: ControlApiConfig): string | undefined {
  return environment === "paper" ? config.EXECUTION_EDGE_PAPER_PROFILE_ID
    : environment === "sandbox" ? config.EXECUTION_EDGE_SANDBOX_PROFILE_ID
      : config.EXECUTION_EDGE_LIVE_PROFILE_ID;
}

function redactJournal(fields: Record<string, ProjectionScalar>): Record<string, ProjectionScalar> {
  return Object.fromEntries(Object.entries(fields)
    .filter(([key]) => JOURNAL_FIELDS.has(key))
    .sort(([left], [right]) => left.localeCompare(right)));
}

function deploymentIdFromGovernance(value: Record<string, unknown>): string | null {
  const data = value.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const approval = (data as Record<string, unknown>).approval;
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) return null;
  const subjectId = (approval as Record<string, unknown>).subject_id;
  return typeof subjectId === "string" && subjectId.length > 0 && subjectId.length <= 191 ? subjectId : null;
}

function unavailable(reasonCode: string): Record<string, unknown> {
  return { state: "UNAVAILABLE", reason_code: reasonCode, source_side_effect_requested: false };
}

function operationIdFor(surface: OperationalSurface): string {
  return `executionOperational${surface.split("_").map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`).join("")}V1`;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function stable(value: unknown, operational = false): unknown {
  if (Array.isArray(value)) return value.map(item => stable(item, operational));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "read_at" && key !== "read_at_ms" &&
      (!operational || !["observed_at_ms", "next_cursor", "prev_cursor"].includes(key)))
    .map(([key, item]) => [key, stable(item, operational)]));
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}
