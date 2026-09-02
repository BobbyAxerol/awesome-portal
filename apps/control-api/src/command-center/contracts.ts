import { PortalUser } from "../domain";

export const COMMAND_CENTER_SCHEMA_VERSION = "execution.command-center-snapshot.v1" as const;
export const COMMAND_CENTER_TRIAGE_FORMULA_VERSION = "command-center.triage-rank.v1" as const;
export const COMMAND_CENTER_TRIAGE_LIMIT = 10;
export const COMMAND_CENTER_TODAY_LIMIT = 12;

export type SourceAuthority = "PORTAL" | "EXECUTION" | "BROKER" | "DERIVED";
export type SourceCompleteness = "EVENT_SOURCED" | "POLL_BOUNDED" | "UNKNOWN";
export type FreshnessState = "OK" | "AGING" | "STALE" | "PAUSED" | "UNKNOWN";
export type SourceAvailability = "AVAILABLE" | "UNAVAILABLE" | "ERROR";
export type PanelState = "ready" | "empty" | "partial" | "stale" | "unavailable";
export type DeliveryProfile = "portal_sgp_projection" | "fixture" | "shadow" | "paper" | "sandbox" | "live_canary" | "live_full";

export type CommandCenterSourceName =
  | "PORTAL_GOVERNANCE"
  | "EXECUTION_INCIDENTS"
  | "EXECUTION_OPERATIONS"
  | "EXECUTION_FLEET"
  | "EXECUTION_RECONCILIATION"
  | "EXECUTION_JOURNAL";

export interface SourceStatus {
  source: CommandCenterSourceName;
  authority: SourceAuthority;
  availability: SourceAvailability;
  reason: string | null;
  as_of: string | null;
  source_cursor: string | null;
  source_sequence: number | null;
  projection_epoch: string | null;
  projection_sequence: number | null;
  source_completeness: SourceCompleteness;
  poll_interval_ms: number | null;
  freshness_state: FreshnessState;
  age_seconds: number | null;
  lag_ms: number | null;
  capability_snapshot_id: string | null;
  delivery_profile: DeliveryProfile;
}

export type TriageKind = "INCIDENT" | "APPROVAL" | "OPERATION" | "RECONCILIATION";
export type TriageSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface TriageCandidate {
  id: string;
  kind: TriageKind;
  title: string;
  summary: string;
  severity: TriageSeverity;
  sla_state: "OVERDUE" | "DUE_SOON" | "ON_TRACK" | "NONE";
  sla_due_at: string | null;
  created_at: string;
  updated_at: string;
  authority: SourceAuthority;
  as_of: string;
  href: string;
  action_label: string;
}

export interface RankedTriageItem extends TriageCandidate {
  rank: number;
  age_seconds: number;
}

export interface ExactSourceSlice<T> {
  status: SourceStatus;
  exact_total_count: number | null;
  items: T[];
}

export type FleetCellCode =
  | "LIVE_FULL"
  | "LIVE_CANARY"
  | "SANDBOX"
  | "PAPER"
  | "BROKER_SYNC_ISSUES"
  | "OPEN_FINDINGS";

export interface FleetCell {
  code: FleetCellCode;
  label: string;
  value: number | null;
  href: string;
}

export interface FleetSnapshot {
  total_deployments: number;
  cells: FleetCell[];
  deployment_labels: Record<string, string>;
}

export interface CommandCenterPin {
  slot: number;
  entity_type: "DEPLOYMENT";
  entity_id: string;
  label: string;
  href: string;
  pinned_at: string;
}

export interface TodayCandidate {
  id: string;
  kind: "REVIEW_DUE" | "CONDITION_EXPIRY" | "VERIFIED_OPERATION" | "JOURNAL_COMMAND";
  label: string;
  scheduled_at: string;
  authority: SourceAuthority;
  as_of: string;
  href: string;
}

export interface CommandCenterInputs {
  workspaceId: string;
  actor: PortalUser;
  readAt: Date;
  triageSources: ExactSourceSlice<TriageCandidate>[];
  fleet: ExactSourceSlice<FleetSnapshot>;
  pins: CommandCenterPin[];
  todaySources: ExactSourceSlice<TodayCandidate>[];
}

const fleetCellCodes: FleetCellCode[] = [
  "LIVE_FULL",
  "LIVE_CANARY",
  "SANDBOX",
  "PAPER",
  "BROKER_SYNC_ISSUES",
  "OPEN_FINDINGS",
];

const severityOrder: Record<TriageSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

const freshnessOrder: Record<FreshnessState, number> = {
  OK: 0,
  AGING: 1,
  PAUSED: 2,
  STALE: 3,
  UNKNOWN: 4,
};

function compareNullableTime(left: string | null, right: string | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return Date.parse(left) - Date.parse(right);
}

export function compareTriage(left: TriageCandidate, right: TriageCandidate): number {
  return severityOrder[left.severity] - severityOrder[right.severity]
    || compareNullableTime(left.sla_due_at, right.sla_due_at)
    || Date.parse(left.created_at) - Date.parse(right.created_at)
    || left.kind.localeCompare(right.kind)
    || left.id.localeCompare(right.id);
}

function worstFreshness(sources: SourceStatus[]): FreshnessState {
  return sources.reduce<FreshnessState>(
    (worst, source) => freshnessOrder[source.freshness_state] > freshnessOrder[worst]
      ? source.freshness_state
      : worst,
    "OK",
  );
}

function oldestAsOf(sources: SourceStatus[]): string | null {
  const values = sources
    .map((source) => source.as_of)
    .filter((value): value is string => value !== null)
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  return values[0] ?? null;
}

function panelState(
  sources: SourceStatus[],
  returnedCount: number,
): PanelState {
  const available = sources.filter((source) => source.availability === "AVAILABLE");
  if (available.length === 0) return "unavailable";
  if (available.length !== sources.length) return "partial";
  if (worstFreshness(sources) === "STALE" || worstFreshness(sources) === "UNKNOWN") {
    return "stale";
  }
  return returnedCount === 0 ? "empty" : "ready";
}

function exactCompositeTotal<T>(sources: ExactSourceSlice<T>[]): number | null {
  if (sources.some(
    (source) => source.status.availability !== "AVAILABLE" || source.exact_total_count === null,
  )) return null;
  return sources.reduce((total, source) => total + (source.exact_total_count ?? 0), 0);
}

function observedExactTotal<T>(sources: ExactSourceSlice<T>[]): number {
  return sources.reduce(
    (total, source) => total + (
      source.status.availability === "AVAILABLE" ? source.exact_total_count ?? 0 : 0
    ),
    0,
  );
}

function publicSources(sources: SourceStatus[]): SourceStatus[] {
  return sources.map((source) => ({ ...source }));
}

export function unavailableSource<T>(
  source: CommandCenterSourceName,
  authority: SourceAuthority,
  reason: string,
): ExactSourceSlice<T> {
  return {
    status: {
      source,
      authority,
      availability: "UNAVAILABLE",
      reason,
      as_of: null,
      source_cursor: null,
      source_sequence: null,
      projection_epoch: null,
      projection_sequence: null,
      source_completeness: "UNKNOWN",
      poll_interval_ms: null,
      freshness_state: "UNKNOWN",
      age_seconds: null,
      lag_ms: null,
      capability_snapshot_id: null,
      delivery_profile: "portal_sgp_projection",
    },
    exact_total_count: null,
    items: [],
  };
}

export function composeCommandCenterSnapshot(input: CommandCenterInputs) {
  const readAt = input.readAt.toISOString();
  const triageStatuses = input.triageSources.map((source) => source.status);
  const ranked = input.triageSources
    .flatMap((source) => source.items)
    .sort(compareTriage)
    .slice(0, COMMAND_CENTER_TRIAGE_LIMIT)
    .map<RankedTriageItem>((item, index) => ({
      ...item,
      rank: index + 1,
      age_seconds: Math.max(0, Math.floor((input.readAt.valueOf() - Date.parse(item.created_at)) / 1_000)),
    }));
  const triageTotal = exactCompositeTotal(input.triageSources);
  const triageState = panelState(triageStatuses, ranked.length);

  const suppliedFleetSnapshot = input.fleet.items[0] ?? null;
  const suppliedFleetCodes = suppliedFleetSnapshot?.cells.map((cell) => cell.code) ?? [];
  const fleetInvariantValid = input.fleet.status.availability !== "AVAILABLE" || (
    input.fleet.items.length === 1
    && suppliedFleetSnapshot !== null
    && input.fleet.exact_total_count !== null
    && Number.isSafeInteger(input.fleet.exact_total_count)
    && input.fleet.exact_total_count >= 0
    && Number.isSafeInteger(suppliedFleetSnapshot.total_deployments)
    && suppliedFleetSnapshot.total_deployments >= 0
    && input.fleet.exact_total_count === suppliedFleetSnapshot.total_deployments
    && suppliedFleetCodes.length === fleetCellCodes.length
    && fleetCellCodes.every((code) => suppliedFleetCodes.filter((candidate) => candidate === code).length === 1)
  );
  const fleetStatus: SourceStatus = fleetInvariantValid
    ? input.fleet.status
    : {
      ...input.fleet.status,
      availability: "ERROR",
      reason: "FLEET_SNAPSHOT_INVARIANT_FAILED",
      freshness_state: "UNKNOWN",
    };
  const fleetStatuses = [fleetStatus];
  const fleetSnapshot = fleetStatus.availability === "AVAILABLE" ? suppliedFleetSnapshot : null;
  const fleetState = panelState(fleetStatuses, fleetSnapshot?.total_deployments ?? 0);
  const fleetCells = fleetSnapshot?.cells ?? [
    ["LIVE_FULL", "Live", "/deployments/live"],
    ["LIVE_CANARY", "Canary", "/deployments/live?stage=canary"],
    ["SANDBOX", "Sandbox", "/deployments/sandbox"],
    ["PAPER", "Paper", "/deployments/paper"],
    ["BROKER_SYNC_ISSUES", "Broker sync", "/execution/operations?filter=broker_sync"],
    ["OPEN_FINDINGS", "Findings", "/execution/operations?filter=findings"],
  ].map(([code, label, href]) => ({ code, label, href, value: null })) as FleetCell[];

  const pins = [...input.pins]
    .sort((left, right) => left.slot - right.slot)
    .slice(0, 5)
    .map((pin) => ({
      ...pin,
      target_label: fleetSnapshot?.deployment_labels[pin.entity_id] ?? null,
      target_state: fleetSnapshot ? "available" as const : "unavailable" as const,
      target_authority: "EXECUTION" as const,
      target_as_of: fleetSnapshot ? fleetStatus.as_of : null,
      target_freshness_state: fleetSnapshot ? fleetStatus.freshness_state : "UNKNOWN" as const,
    }));
  const pinState: PanelState = pins.length === 0
    ? "empty"
    : fleetSnapshot === null
      ? "partial"
      : fleetState === "stale"
        ? "stale"
        : "ready";

  const todayStatuses = input.todaySources.map((source) => source.status);
  const todayItems = input.todaySources
    .flatMap((source) => source.items)
    .sort((left, right) => Date.parse(left.scheduled_at) - Date.parse(right.scheduled_at)
      || left.kind.localeCompare(right.kind)
      || left.id.localeCompare(right.id))
    .slice(0, COMMAND_CENTER_TODAY_LIMIT);
  const todayTotal = exactCompositeTotal(input.todaySources);
  const todayState = panelState(todayStatuses, todayItems.length);

  const allComplete = triageTotal !== null
    && fleetStatus.availability === "AVAILABLE"
    && todayTotal !== null;
  const mode = allComplete && triageTotal === 0 ? "QUIET" : allComplete ? "BUSY" : "DEGRADED";

  return {
    schema_version: COMMAND_CENTER_SCHEMA_VERSION,
    record_authority: "PORTAL" as const,
    delivery_profile: fleetStatus.delivery_profile,
    workspace_id: input.workspaceId,
    read_at: readAt,
    actor: {
      user_id: input.actor.userId,
      username: input.actor.username,
      roles: [input.actor.role],
    },
    mode,
    snapshot: {
      projection_epoch: fleetStatus.projection_epoch,
      projection_sequence: fleetStatus.projection_sequence,
      cursor: fleetStatus.source_cursor,
      stream_available: fleetStatus.availability === "AVAILABLE" && fleetStatus.projection_epoch !== null,
      resnapshot_not_before: null,
    },
    panels: {
      needs_you: {
        panel_state: triageState,
        authority: "DERIVED" as const,
        as_of: oldestAsOf(triageStatuses),
        freshness_state: worstFreshness(triageStatuses),
        formula_version: COMMAND_CENTER_TRIAGE_FORMULA_VERSION,
        exact_total: triageTotal !== null,
        total_count: triageTotal,
        observed_total_count: observedExactTotal(input.triageSources),
        returned_count: ranked.length,
        limit: COMMAND_CENTER_TRIAGE_LIMIT,
        truncated: triageTotal === null ? null : triageTotal > ranked.length,
        sources: publicSources(triageStatuses),
        items: ranked,
      },
      fleet_health: {
        panel_state: fleetState,
        authority: "EXECUTION" as const,
        as_of: fleetStatus.as_of,
        freshness_state: fleetStatus.freshness_state,
        exact_total: fleetSnapshot !== null && input.fleet.exact_total_count !== null,
        total_deployments: fleetSnapshot?.total_deployments ?? null,
        source: { ...fleetStatus },
        cells: fleetCells,
      },
      pinned_watchlist: {
        panel_state: pinState,
        authority: "PORTAL" as const,
        as_of: pins.length > 0 ? pins.map((pin) => pin.pinned_at).sort().at(-1) ?? null : null,
        freshness_state: pins.length > 0 && fleetSnapshot === null
          ? "UNKNOWN" as const
          : fleetStatus.freshness_state,
        exact_total: true,
        total_count: input.pins.length,
        limit: 5,
        items: pins,
      },
      today: {
        panel_state: todayState,
        authority: "DERIVED" as const,
        as_of: oldestAsOf(todayStatuses),
        freshness_state: worstFreshness(todayStatuses),
        exact_total: todayTotal !== null,
        total_count: todayTotal,
        observed_total_count: observedExactTotal(input.todaySources),
        returned_count: todayItems.length,
        limit: COMMAND_CENTER_TODAY_LIMIT,
        truncated: todayTotal === null ? null : todayTotal > todayItems.length,
        sources: publicSources(todayStatuses),
        items: todayItems,
      },
    },
    warnings: allComplete ? [] : [{
      code: "COMMAND_CENTER_SOURCE_GAP",
      message: "One or more Command Center sources are unavailable; missing totals are not reported as zero.",
    }],
  };
}
