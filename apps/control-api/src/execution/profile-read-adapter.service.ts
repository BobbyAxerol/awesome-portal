import { Inject, Injectable } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ExecutionProfileProjectionRepository,
  ProjectionEnvironment,
} from "./profile-projection.repository";
import { LocalRealtimeError } from "./profile-realtime.service";

const ADAPTERS = Object.freeze({
  "admin.inspect": Object.freeze({
    revision: "portal.execution.local-admin-inspect.v1",
    profiles: Object.freeze(["paper", "sandbox", "live"]),
    relations: Object.freeze([
      "manager.strategies:strategies", "manager.deployments:strategy_deployments",
      "manager.accounts:accounts", "manager.positions:positions_v2",
      "manager.reconciliation:reconciliation_findings",
    ]),
  }),
  "admin.performance": Object.freeze({
    revision: "portal.execution.local-performance-read.v1",
    profiles: Object.freeze(["paper"]),
    relations: Object.freeze([
      "manager.performance:performance_snapshots",
      "manager.performance:account_equity_snapshots",
      "manager.performance:portfolio_equity_snapshots",
    ]),
  }),
  "admin.broker-read": Object.freeze({
    revision: "portal.execution.local-broker-read.v1",
    profiles: Object.freeze(["sandbox", "live"]),
    relations: Object.freeze([
      "manager.accounts:accounts", "manager.accounts:account_balances",
      "manager.accounts:margin_balances", "manager.accounts:account_sync_effective",
      "manager.accounts:broker_account_sync_effective", "manager.venue-accounts:venue_accounts",
    ]),
  }),
  "event.order-lifecycle": Object.freeze({
    revision: "portal.execution.local-order-lifecycle.v1",
    profiles: Object.freeze(["paper", "live"]),
    relations: Object.freeze([
      "manager.orders:orders", "manager.fills:fills",
      "manager.sessions:execution_sessions", "manager.command-journal:command_journal",
      "manager.conditional-orders:conditional_order_groups",
      "manager.conditional-orders:conditional_order_group_legs",
    ]),
  }),
} as const);

type AdapterId = keyof typeof ADAPTERS;
const MAXIMUM_ROWS_PER_RELATION = 200;

/** Bounded existing-source alternatives backed only by committed SGP projection rows. */
@Injectable()
export class ExecutionProfileReadAdapterService {
  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionProfileProjectionRepository) private readonly repository: ExecutionProfileProjectionRepository,
  ) {}

  async read(workspaceId: string, environment: ProjectionEnvironment, capabilityId: string) {
    if (!(capabilityId in ADAPTERS)) {
      throw new ProjectionAdapterError("N32_ADAPTER_NOT_ACCEPTED", 404);
    }
    const adapter = ADAPTERS[capabilityId as AdapterId];
    if (!(adapter.profiles as readonly string[]).includes(environment)) {
      throw new ProjectionAdapterError("N32_ADAPTER_PROFILE_NOT_ACCEPTED", 404);
    }
    const profileId = profile(this.config, environment);
    const projectionWorkspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if (!projectionWorkspaceId) throw new ProjectionAdapterError("N32_PROJECTION_WORKSPACE_NOT_CONFIGURED", 503);
    const snapshot = await this.repository.snapshot(projectionWorkspaceId, environment, profileId);
    if (!snapshot) throw new ProjectionAdapterError("N32_PROJECTION_NOT_READY", 503);
    const ageMs = Date.now() - snapshot.lastSuccessfulRefreshAt.valueOf();
    if (ageMs > this.config.EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS) {
      throw new ProjectionAdapterError("N32_PROJECTION_STALE_CEILING_EXCEEDED", 503);
    }
    const relations = Object.fromEntries(adapter.relations.map((key) => {
      const relation = snapshot.document.relations[key];
      return [key, relation ? {
        state: relation.items.length > 0 ? "AVAILABLE" : "EMPTY",
        freshness: relation.freshness,
        completeness: relation.completeness,
        as_of: relation.as_of,
        items: relation.items.slice(0, MAXIMUM_ROWS_PER_RELATION).map((row) => row.fields),
        truncated: relation.items.length > MAXIMUM_ROWS_PER_RELATION,
      } : {
        state: "UNAVAILABLE", freshness: "UNKNOWN", completeness: "UNKNOWN",
        as_of: null, items: [], truncated: false, reason_code: "N32_RELATION_NOT_PROJECTED",
      }];
    }));
    const states = Object.values(relations).map((relation) => relation.state);
    return {
      schema_version: "portal.execution.profile-read-adapter.v1",
      capability_id: capabilityId,
      adapter_revision: adapter.revision,
      authority: "PORTAL_SGP_PROJECTION",
      workspace_id: projectionWorkspaceId,
      viewer_workspace_id: workspaceId,
      environment,
      profile_id: profileId,
      state: states.every((state) => state === "EMPTY") ? "EMPTY"
        : states.some((state) => state === "UNAVAILABLE") ? "PARTIAL" : "AVAILABLE",
      projection: {
        epoch: snapshot.projectionEpoch,
        sequence: snapshot.projectionSequence,
        payload_digest: snapshot.payloadDigest,
        source_contract_revision: snapshot.document.source_contract_revision,
        last_successful_refresh_at: snapshot.lastSuccessfulRefreshAt.toISOString(),
      },
      bounds: {
        maximum_rows_per_relation: MAXIMUM_ROWS_PER_RELATION,
        arbitrary_source_selection: false,
        browser_cross_cell_access: false,
      },
      relations,
    };
  }
}

export class ProjectionAdapterError extends LocalRealtimeError {}

export function acceptedProjectionAdapters(): readonly string[] {
  return Object.keys(ADAPTERS).sort();
}

function profile(config: ControlApiConfig, environment: ProjectionEnvironment): string {
  const profileId = environment === "paper" ? config.EXECUTION_EDGE_PAPER_PROFILE_ID
    : environment === "sandbox" ? config.EXECUTION_EDGE_SANDBOX_PROFILE_ID
      : config.EXECUTION_EDGE_LIVE_PROFILE_ID;
  if (!profileId) throw new ProjectionAdapterError("N32_PROFILE_NOT_CONFIGURED", 503);
  return profileId;
}
