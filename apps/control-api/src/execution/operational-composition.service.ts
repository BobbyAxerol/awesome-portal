import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { CommandCenterError, CommandCenterService } from "../command-center/command-center.service";
import { ControlApiConfig } from "../config";
import { GovernanceService } from "../governance/governance.service";
import { governanceConditionsQuery } from "../governance/contracts";
import { PaperExitService } from "../governance/paper-exit.service";
import { IncidentService } from "../operations/incident.service";
import { ExecutionOperationsService } from "../operations/operations.service";
import { OperationsWorkflowService } from "../operations/workflow.service";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ExecutionProfileProjectionRepository,
  type ProjectionEnvironment,
  type ProjectionScalar,
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
  ) {}

  async approval(
    principal: PortalDerivationPrincipal,
    approvalId: string,
    view: "r1" | "r2" | "live",
  ): Promise<Record<string, unknown>> {
    const governance = view === "r1"
      ? await this.governance.detail(principal.user, principal.workspaceId, approvalId)
      : await this.governance.r2Detail(principal.user, principal.workspaceId, approvalId);
    let acceptedFacts: Record<string, unknown> | null = null;
    if (view === "live") {
      const deploymentId = deploymentIdFromGovernance(governance);
      if (!deploymentId) {
        acceptedFacts = unavailable("EDS05_LIVE_REVIEW_DEPLOYMENT_NOT_RESOLVED");
      } else {
        try {
          acceptedFacts = await this.derivations.deploymentQuality(principal, deploymentId, "live");
        } catch (error) {
          acceptedFacts = unavailable(error instanceof PortalDerivationError ? error.code : "EDS05_LIVE_REVIEW_FACTS_UNAVAILABLE");
        }
      }
    }
    return this.compose(principal, view === "r1" ? "approval_r1" : view === "r2" ? "approval_r2" : "live_review", {
      governance,
      accepted_manager_facts: acceptedFacts,
    });
  }

  async exitReview(principal: PortalDerivationPrincipal, reviewId: string): Promise<Record<string, unknown>> {
    return this.compose(principal, "paper_exit_review", {
      exit_review: await this.paperExit.detail(principal.user, principal.workspaceId, reviewId),
    });
  }

  async waiversRegister(principal: PortalDerivationPrincipal): Promise<Record<string, unknown>> {
    return this.compose(principal, "waivers_register", {
      waivers_register: await this.governance.conditions(
        principal.user,
        principal.workspaceId,
        governanceConditionsQuery({ limit: 50 }),
      ),
    });
  }

  async operationsQueue(principal: PortalDerivationPrincipal): Promise<Record<string, unknown>> {
    return this.compose(principal, "operations_queue", {
      operations_queue: await this.workflows.list(principal.user, principal.workspaceId, {
        limit: 50,
        sort: "created_at:desc",
      }),
    });
  }

  async incidentDetail(principal: PortalDerivationPrincipal, incidentId: string): Promise<Record<string, unknown>> {
    return this.compose(principal, "incident_detail", {
      incident: await this.incidents.detail(principal.user, principal.workspaceId, incidentId),
    });
  }

  async commandCenterSnapshot(principal: PortalDerivationPrincipal): Promise<Record<string, unknown>> {
    let commandCenter: Record<string, unknown>;
    try {
      commandCenter = await this.commandCenter.snapshot(principal.user, principal.workspaceId);
    } catch (error) {
      if (!(error instanceof CommandCenterError)) throw error;
      commandCenter = unavailable(error.code);
    }
    return this.compose(principal, "command_center", { command_center: commandCenter });
  }

  async adminActionDrawer(principal: PortalDerivationPrincipal): Promise<Record<string, unknown>> {
    // This publishes the existing catalogue only.  No operation plan/apply is
    // invoked and the command relay remains governed by its existing flag.
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
  ): Promise<Record<string, unknown>> {
    const readAt = new Date();
    const sourceHealth = await this.derivations.sourceHealth(principal);
    const journal = await this.redactedCommandJournal();
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

  private async redactedCommandJournal(): Promise<Record<string, unknown>> {
    const entries: Array<Record<string, unknown>> = [];
    const profileRevisions: Array<Record<string, unknown>> = [];
    for (const environment of ENVIRONMENTS) {
      const profileId = profileIdFor(environment, this.config);
      if (!profileId || !this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID) continue;
      const snapshot = await this.projections.snapshot(
        this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID,
        environment,
        profileId,
      );
      if (!snapshot) continue;
      profileRevisions.push({
        environment,
        profile_id: profileId,
        projection_epoch: snapshot.projectionEpoch,
        projection_sequence: snapshot.projectionSequence,
        payload_digest: snapshot.payloadDigest,
      });
      const relation = snapshot.document.relations[JOURNAL_RELATION];
      if (!relation || relation.availability !== "AVAILABLE") continue;
      for (const item of relation.items) {
        const fields = redactJournal(item.fields);
        entries.push({
          environment,
          relation_state: relation.completeness,
          as_of: relation.as_of,
          ...fields,
        });
      }
    }
    const rows = entries
      .sort((left, right) => String(right.updated_at ?? right.created_at ?? "").localeCompare(String(left.updated_at ?? left.created_at ?? ""))
        || String(left.command_id ?? "").localeCompare(String(right.command_id ?? "")))
      .slice(0, 100);
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

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "read_at" && key !== "read_at_ms")
    .map(([key, item]) => [key, stable(item)]));
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}
