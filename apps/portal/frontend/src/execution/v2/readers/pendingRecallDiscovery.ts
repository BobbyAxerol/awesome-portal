/**
 * V2 reader for `portal.execution.pending-recall-discovery.v1` (FE-062, Claude BE-P5 de4ebb4c / 8d725f1a):
 * `GET /api/v1/execution/pending-recalls?workspace_id&resource_kind&resource_id&environment`,
 * operationId `executionPendingRecallDiscoveryV1`.
 *
 * What the body IS: the still-open recalls THIS PORTAL controlled on ONE exact resource, from the Portal's own pending-control history,
 * newest first, at most 100. Per recall: the PM `original_recall_id`, the unit, the owning recipient account (DEPLOYMENT only), the
 * last KNOWN amounts and the five exact CAS counters (`WAITING_ENCUMBRANCE`), or a control that was sent and has no known receipt
 * (`UNKNOWN`: amounts and counters are `null`, never zero-filled).
 *
 * What it is NOT, and what this reader keeps as constants a screen cannot turn into a census:
 * - `coverage` is `PORTAL_CONTROLLED_RECALLS_ONLY`: a recall that was never controlled through the Portal has no Portal record and is
 *   absent. `untracked_recalls` says so as `NOT_PUBLISHED` / `RECALL_REMAINDER_SOURCE_READ_NOT_QUALIFIED`. An empty `items` is
 *   therefore "none the Portal controlled", never "no open recall exists";
 * - the counters are the last known receipt's. A later source change makes them stale; the next preview rechecks them against the
 *   source, so they are a starting point and never an authority;
 * - a terminal known outcome closes a recall, so it is not listed; this reader never invents a recall and never closes one;
 * - `truncated: true` means more matched than the page holds; the items are the newest 100.
 *
 * Rules the schema cannot say and the server enforces (checked here, a violation voids the read, nothing is repaired):
 * `original_recall_id` is unique within `items`; every amount partition holds (requested = applied + pending + cancelled + rejected)
 * and a WAITING recall has pending > 0, cancelled = 0, rejected = 0; a recall of a DEPLOYMENT carries its owning account and one of a
 * PORTFOLIO carries none (FE-063). Closed keys everywhere; another `schema_version` is `unsupported_shape`; never throws.
 */
import {
  COMMAND_ENVIRONMENTS, COMMAND_ID, PENDING_OPERATIONS, PENDING_RESOURCE_KINDS, PENDING_VERSION_KEYS,
  closed, counter, currencyText, instant, nullable, oneOf, partitionHolds, plain, pm, readAmounts, rec, recipientMatchesKind,
  statePartitionHolds,
  type CommandEnvironment, type PendingOperation, type PendingVersionKey, type StatusAmounts, type UnsupportedStatusShape,
} from "./commandCurrency";
import type { UtcEpochMs } from "../../screenDataContract";

export const PENDING_RECALL_DISCOVERY_SCHEMA = "portal.execution.pending-recall-discovery.v1";
export const PENDING_RECALL_DISCOVERY_PATH = "/api/v1/execution/pending-recalls";
export const MAX_DISCOVERED_RECALLS = 100;
export const DISCOVERY_COVERAGE = "PORTAL_CONTROLLED_RECALLS_ONLY";
export const UNTRACKED_RECALLS_REASON = "RECALL_REMAINDER_SOURCE_READ_NOT_QUALIFIED";
export const DISCOVERY_STATES = ["WAITING_ENCUMBRANCE", "UNKNOWN"] as const;
export type DiscoveryState = (typeof DISCOVERY_STATES)[number];

interface DiscoveredBase {
  /** The PM-side recall id; not a Portal command id. */
  originalRecallId: string;
  /** The unit of every amount of this recall. */
  currency: string;
  /** The owning recipient account: non-null exactly for a DEPLOYMENT resource. */
  recipientAccountId: string | null;
  /** The last control operation the Portal sent for this recall. */
  lastOperation: PendingOperation;
  updatedAt: UtcEpochMs;
}

/** The last known receipt shows an open remainder. Cumulative applied may already be above zero. */
export interface DiscoveredWaitingRecall extends DiscoveredBase {
  state: "WAITING_ENCUMBRANCE";
  amounts: StatusAmounts;
  /** Five int64 counters as exact strings (the last known receipt's). Compare with BigInt, never Number. */
  versions: Readonly<Record<PendingVersionKey, string>>;
  latestReceiptId: string;
  lastKnownCommandId: string;
  /** A newer control that has no known outcome yet. It never erases the accepted receipt above. */
  unresolvedCommandId: string | null;
}

/** A control was sent and no receipt is known: no amounts, no counters, no receipt. Not zero. */
export interface DiscoveredUnknownRecall extends DiscoveredBase {
  state: "UNKNOWN";
  amounts: null;
  versions: null;
  latestReceiptId: null;
  lastKnownCommandId: null;
  unresolvedCommandId: string;
}

export type DiscoveredRecall = DiscoveredWaitingRecall | DiscoveredUnknownRecall;

export interface PendingRecallDiscovery {
  resource: { kind: "PORTFOLIO" | "DEPLOYMENT"; id: string };
  environment: CommandEnvironment;
  coverage: typeof DISCOVERY_COVERAGE;
  untrackedRecalls: { availability: "NOT_PUBLISHED"; reasonCode: typeof UNTRACKED_RECALLS_REASON };
  items: readonly DiscoveredRecall[];
  /** `true`: more open recalls matched than the finite page holds, and `items` are the newest. */
  truncated: boolean;
  /** Portal evaluation time (UTC epoch ms), not a source observation time. */
  observedAt: UtcEpochMs;
}

export type PendingRecallDiscoveryRead = { kind: "pending_recall_discovery"; discovery: PendingRecallDiscovery } | UnsupportedStatusShape;

export interface PendingRecallDiscoveryQuery {
  workspaceId: string;
  resourceKind: "PORTFOLIO" | "DEPLOYMENT";
  resourceId: string;
  environment: CommandEnvironment;
}

/** The request URL, or `null` for a query the server would refuse (exactly four keys, all required). */
export function pendingRecallDiscoveryUrl(query: PendingRecallDiscoveryQuery): string | null {
  const text = (value: string) => plain(value) !== null && value.length <= 256;
  if (!text(query.workspaceId) || !text(query.resourceId) || oneOf(query.resourceKind, PENDING_RESOURCE_KINDS) === null || oneOf(query.environment, COMMAND_ENVIRONMENTS) === null) return null;
  return `${PENDING_RECALL_DISCOVERY_PATH}?workspace_id=${encodeURIComponent(query.workspaceId)}&resource_kind=${query.resourceKind}`
    + `&resource_id=${encodeURIComponent(query.resourceId)}&environment=${query.environment}`;
}

/** True when the body answers THIS query (same exact resource and environment). A body that reads is not yet an answer to the question asked. */
export function pendingRecallDiscoveryAnswers(discovery: PendingRecallDiscovery, query: PendingRecallDiscoveryQuery): boolean {
  return discovery.resource.kind === query.resourceKind && discovery.resource.id === query.resourceId && discovery.environment === query.environment;
}

const ITEM_KEYS = [
  "original_recall_id", "currency", "recipient_account_id", "state", "amounts", "versions", "latest_receipt_id", "last_known_command_id",
  "unresolved_command_id", "last_operation", "updated_at_ms",
] as const;
const BODY_KEYS = [
  "schema_version", "family", "coverage", "untracked_recalls", "resource", "environment", "items", "truncated", "observed_at_ms",
] as const;

function commandId(value: unknown): string | null {
  return typeof value === "string" && COMMAND_ID.test(value) ? value : null;
}

function readItem(raw: unknown, kind: "PORTFOLIO" | "DEPLOYMENT"): DiscoveredRecall | null {
  const r = closed(raw, ITEM_KEYS);
  if (r === null) return null;
  const originalRecallId = pm(r.original_recall_id);
  const currency = currencyText(r.currency);
  const recipientAccountId = nullable(r.recipient_account_id, pm);
  const state = oneOf(r.state, DISCOVERY_STATES);
  const lastOperation = oneOf(r.last_operation, PENDING_OPERATIONS);
  const updatedAt = instant(r.updated_at_ms);
  if (
    originalRecallId === null || currency === null || recipientAccountId === undefined || state === null || lastOperation === null || updatedAt === null
    || !recipientMatchesKind(kind, recipientAccountId)
  ) return null;
  const base = { originalRecallId, currency, recipientAccountId, lastOperation, updatedAt };

  if (state === "UNKNOWN") {
    const unresolved = commandId(r.unresolved_command_id);
    if (r.amounts !== null || r.versions !== null || r.latest_receipt_id !== null || r.last_known_command_id !== null || unresolved === null) return null;
    return { ...base, state, amounts: null, versions: null, latestReceiptId: null, lastKnownCommandId: null, unresolvedCommandId: unresolved };
  }

  const amounts = readAmounts(r.amounts, currency);
  const versionsRaw = closed(r.versions, PENDING_VERSION_KEYS);
  const latestReceiptId = pm(r.latest_receipt_id);
  const lastKnown = commandId(r.last_known_command_id);
  const unresolved = nullable(r.unresolved_command_id, commandId);
  if (amounts === null || versionsRaw === null || latestReceiptId === null || lastKnown === null || unresolved === undefined) return null;
  if (!partitionHolds(amounts) || !statePartitionHolds("WAITING_ENCUMBRANCE", amounts)) return null;
  const versions = {} as Record<PendingVersionKey, string>;
  for (const key of PENDING_VERSION_KEYS) {
    const value = counter(versionsRaw[key]);
    if (value === null) return null;
    versions[key] = value;
  }
  return { ...base, state, amounts, versions, latestReceiptId, lastKnownCommandId: lastKnown, unresolvedCommandId: unresolved };
}

/**
 * Discovery body -> typed read. `null` is "malformed" and must render as unavailable (never as "no open recall"); a body of another
 * `schema_version` is `unsupported_shape`.
 */
export function readPendingRecallDiscoveryV1(raw: unknown): PendingRecallDiscoveryRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const version = typeof root.schema_version === "string" ? root.schema_version : null;
  if (version !== PENDING_RECALL_DISCOVERY_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
  const body = closed(root, BODY_KEYS);
  const resource = closed(body?.resource, ["kind", "id"]);
  const untracked = closed(body?.untracked_recalls, ["availability", "reason_code"]);
  if (body === null || resource === null || untracked === null) return null;
  const kind = oneOf(resource.kind, PENDING_RESOURCE_KINDS);
  const resourceId = plain(resource.id);
  const environment = oneOf(body.environment, COMMAND_ENVIRONMENTS);
  const observedAt = instant(body.observed_at_ms);
  if (
    body.family !== "PENDING_RECALL_CONTROL" || body.coverage !== DISCOVERY_COVERAGE
    || untracked.availability !== "NOT_PUBLISHED" || untracked.reason_code !== UNTRACKED_RECALLS_REASON
    || kind === null || resourceId === null || environment === null || observedAt === null
    || typeof body.truncated !== "boolean" || !Array.isArray(body.items) || body.items.length > MAX_DISCOVERED_RECALLS
  ) return null;
  const items: DiscoveredRecall[] = [];
  const seen = new Set<string>();
  for (const entry of body.items) {
    const item = readItem(entry, kind);
    // One entry per original recall (runtime-enforced; JSON Schema uniqueItems cannot say "unique by key").
    if (item === null || seen.has(item.originalRecallId)) return null;
    seen.add(item.originalRecallId);
    items.push(item);
  }
  return {
    kind: "pending_recall_discovery",
    discovery: {
      resource: { kind, id: resourceId }, environment, coverage: DISCOVERY_COVERAGE,
      untrackedRecalls: { availability: "NOT_PUBLISHED", reasonCode: UNTRACKED_RECALLS_REASON },
      items, truncated: body.truncated, observedAt,
    },
  };
}
