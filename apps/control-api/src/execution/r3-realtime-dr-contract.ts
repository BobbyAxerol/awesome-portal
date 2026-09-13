import { createHash } from "node:crypto";

/**
 * R3-2 makes the local observation lane explicit. It is intentionally not an
 * owner Event/replay contract: Manager-v2 currently publishes bounded current
 * pages, while Portal owns the durable local journal and SSE cursor.
 */
export const R3_REALTIME_DR_SCENARIOS = [
  "CURSOR_DATA_BEFORE_STATUS",
  "LAST_EVENT_ID_RESUME",
  "MEMBERSHIP_REVOCATION",
  "DOWNSTREAM_ABORT",
  "HIDDEN_TAB_COALESCING",
  "GAP_RESNAPSHOT",
  "SOURCE_429_502_503_BACKOFF",
  "EDGE_OR_JWT_REFUSAL",
  "WORKER_RESTART",
  "PROFILE_ISOLATION",
  "SOURCE_DARK_STALE_LAST_GOOD",
  "IMAGE_ONLY_ROLLBACK",
] as const;

export type R3RealtimeDrScenario = (typeof R3_REALTIME_DR_SCENARIOS)[number];
export type R3RealtimeEvidenceLane =
  | "CONTROL_API_POSTGRES_TWO_REPLICA"
  | "SAME_ORIGIN_EVENTSOURCE_DOM"
  | "R3_4_DEPLOYMENT_CANDIDATE";

export interface R3RealtimeDrScenarioRecord {
  readonly scenario: R3RealtimeDrScenario;
  readonly authority: "PORTAL_LOCAL_OBSERVATION" | "BROWSER_SAME_ORIGIN" | "DEPLOYMENT_RELEASE";
  readonly evidenceLane: R3RealtimeEvidenceLane;
  readonly expectedTruth: string;
  readonly sourceReadAmplificationAllowed: false;
  readonly sourceReplayClaimed: false;
}

export interface R3RealtimeDrContract {
  readonly schemaVersion: "portal.execution.r3.realtime-dr-contract.v1";
  readonly realtimeAuthority: {
    readonly source: "PORTAL_LOCAL_POSTGRES_PROJECTION_JOURNAL";
    readonly browserDirectEdgeOrSourceAccess: false;
    readonly ownerEventReplayOrGlobalOrderingClaimed: false;
    readonly cursor: "PORTAL_LOCAL_EPOCH_SEQUENCE";
  };
  readonly boundedOperation: {
    readonly localTailPollMs: 250;
    readonly healthPollMs: 1000;
    readonly maximumScopeGroups: 16;
    readonly maximumSubscribersPerScope: 256;
    readonly maximumPendingPerScope: 32;
  };
  readonly scenarios: readonly R3RealtimeDrScenarioRecord[];
  readonly deploymentCandidate: {
    readonly state: "READY_FOR_R3_4_TWO_PROCESS_DEV_EVIDENCE";
    readonly rollback: "IMAGE_ONLY_FORWARD_MIGRATIONS_NO_VOLUME_DELETE";
    readonly evidenceNotClaimedByThisContract: readonly ["TWO_OS_PROCESS", "BROWSER_DOM", "DEPLOYED_IMAGE_DIGEST"];
  };
}

const records: readonly R3RealtimeDrScenarioRecord[] = Object.freeze([
  {
    scenario: "CURSOR_DATA_BEFORE_STATUS", authority: "PORTAL_LOCAL_OBSERVATION",
    evidenceLane: "CONTROL_API_POSTGRES_TWO_REPLICA",
    expectedTruth: "delta precedes status-only update for a committed local revision",
    sourceReadAmplificationAllowed: false, sourceReplayClaimed: false,
  },
  {
    scenario: "LAST_EVENT_ID_RESUME", authority: "BROWSER_SAME_ORIGIN",
    evidenceLane: "SAME_ORIGIN_EVENTSOURCE_DOM",
    expectedTruth: "Last-Event-ID takes precedence over an original URL cursor",
    sourceReadAmplificationAllowed: false, sourceReplayClaimed: false,
  },
  {
    scenario: "MEMBERSHIP_REVOCATION", authority: "BROWSER_SAME_ORIGIN",
    evidenceLane: "SAME_ORIGIN_EVENTSOURCE_DOM",
    expectedTruth: "lease or membership loss emits terminal auth.expired and closes the local stream",
    sourceReadAmplificationAllowed: false, sourceReplayClaimed: false,
  },
  {
    scenario: "DOWNSTREAM_ABORT", authority: "BROWSER_SAME_ORIGIN",
    evidenceLane: "SAME_ORIGIN_EVENTSOURCE_DOM",
    expectedTruth: "closed or slow downstream detaches the subscriber and does not retain a tail",
    sourceReadAmplificationAllowed: false, sourceReplayClaimed: false,
  },
  {
    scenario: "HIDDEN_TAB_COALESCING", authority: "BROWSER_SAME_ORIGIN",
    evidenceLane: "SAME_ORIGIN_EVENTSOURCE_DOM",
    expectedTruth: "a hidden tab coalesces local revalidation and never opens a browser-to-Edge stream",
    sourceReadAmplificationAllowed: false, sourceReplayClaimed: false,
  },
  {
    scenario: "GAP_RESNAPSHOT", authority: "PORTAL_LOCAL_OBSERVATION",
    evidenceLane: "CONTROL_API_POSTGRES_TWO_REPLICA",
    expectedTruth: "expired or mismatched local cursor becomes terminal projection.gap and requires a snapshot",
    sourceReadAmplificationAllowed: false, sourceReplayClaimed: false,
  },
  {
    scenario: "SOURCE_429_502_503_BACKOFF", authority: "PORTAL_LOCAL_OBSERVATION",
    evidenceLane: "CONTROL_API_POSTGRES_TWO_REPLICA",
    expectedTruth: "durable retry_not_before preserves stale-last-good and suppresses a restart retry burst",
    sourceReadAmplificationAllowed: false, sourceReplayClaimed: false,
  },
  {
    scenario: "EDGE_OR_JWT_REFUSAL", authority: "PORTAL_LOCAL_OBSERVATION",
    evidenceLane: "R3_4_DEPLOYMENT_CANDIDATE",
    expectedTruth: "a typed source refusal does not expose a source credential or promote data freshness",
    sourceReadAmplificationAllowed: false, sourceReplayClaimed: false,
  },
  {
    scenario: "WORKER_RESTART", authority: "PORTAL_LOCAL_OBSERVATION",
    evidenceLane: "CONTROL_API_POSTGRES_TWO_REPLICA",
    expectedTruth: "new worker observes the persisted retry gate and local journal without a source burst",
    sourceReadAmplificationAllowed: false, sourceReplayClaimed: false,
  },
  {
    scenario: "PROFILE_ISOLATION", authority: "PORTAL_LOCAL_OBSERVATION",
    evidenceLane: "CONTROL_API_POSTGRES_TWO_REPLICA",
    expectedTruth: "slow or failed Paper tail does not serialize Live or cross profile boundaries",
    sourceReadAmplificationAllowed: false, sourceReplayClaimed: false,
  },
  {
    scenario: "SOURCE_DARK_STALE_LAST_GOOD", authority: "PORTAL_LOCAL_OBSERVATION",
    evidenceLane: "CONTROL_API_POSTGRES_TWO_REPLICA",
    expectedTruth: "last durable projection remains renderable as degraded/stale without synthetic replacement",
    sourceReadAmplificationAllowed: false, sourceReplayClaimed: false,
  },
  {
    scenario: "IMAGE_ONLY_ROLLBACK", authority: "DEPLOYMENT_RELEASE",
    evidenceLane: "R3_4_DEPLOYMENT_CANDIDATE",
    expectedTruth: "rollback switches image/config pointer only; forward additive schema and volumes remain intact",
    sourceReadAmplificationAllowed: false, sourceReplayClaimed: false,
  },
]);

export const R3_REALTIME_DR_CONTRACT: R3RealtimeDrContract = Object.freeze({
  schemaVersion: "portal.execution.r3.realtime-dr-contract.v1",
  realtimeAuthority: Object.freeze({
    source: "PORTAL_LOCAL_POSTGRES_PROJECTION_JOURNAL",
    browserDirectEdgeOrSourceAccess: false as const,
    ownerEventReplayOrGlobalOrderingClaimed: false as const,
    cursor: "PORTAL_LOCAL_EPOCH_SEQUENCE" as const,
  }),
  boundedOperation: Object.freeze({
    localTailPollMs: 250 as const,
    healthPollMs: 1000 as const,
    maximumScopeGroups: 16 as const,
    maximumSubscribersPerScope: 256 as const,
    maximumPendingPerScope: 32 as const,
  }),
  scenarios: records,
  deploymentCandidate: Object.freeze({
    state: "READY_FOR_R3_4_TWO_PROCESS_DEV_EVIDENCE" as const,
    rollback: "IMAGE_ONLY_FORWARD_MIGRATIONS_NO_VOLUME_DELETE" as const,
    evidenceNotClaimedByThisContract: Object.freeze([
      "TWO_OS_PROCESS",
      "BROWSER_DOM",
      "DEPLOYED_IMAGE_DIGEST",
    ] as const),
  }),
});

export function r3RealtimeDrEvidence() {
  const body = JSON.stringify(R3_REALTIME_DR_CONTRACT);
  return Object.freeze({
    schema_version: R3_REALTIME_DR_CONTRACT.schemaVersion,
    contract_sha256: `sha256:${createHash("sha256").update(body, "utf8").digest("hex")}`,
    scenario_count: R3_REALTIME_DR_CONTRACT.scenarios.length,
    realtime_authority: R3_REALTIME_DR_CONTRACT.realtimeAuthority,
    bounded_operation: R3_REALTIME_DR_CONTRACT.boundedOperation,
    deployment_candidate: R3_REALTIME_DR_CONTRACT.deploymentCandidate,
  });
}
