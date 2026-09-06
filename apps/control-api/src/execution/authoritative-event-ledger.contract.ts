import { createHash } from "node:crypto";

/**
 * The Portal-side representation of the private R5 event ledger.  This is a
 * server-only contract: a browser never supplies a source sequence, epoch,
 * cursor, relation, or source record.  The only currently accepted source
 * profile is the source-owned Paper/BINANCE stream declared by R5 v1.
 */
export const AUTHORITATIVE_EVENT_LEDGER_CONTRACT_REVISION =
  "trading-system.portal-execution.event-ledger.v1" as const;
export const AUTHORITATIVE_EVENT_LEDGER_SNAPSHOT_SEMANTICS = "EVENT_LOG_ANCHOR" as const;
export const AUTHORITATIVE_EVENT_LEDGER_MAX_PAGE_ROWS = 1_000;
export const AUTHORITATIVE_EVENT_LEDGER_MAX_SAFE_RECORD_BYTES = 32 * 1024;

export type AuthoritativeLedgerEnvironment = "paper";
export type AuthoritativeLedgerOperation = "UPSERT" | "DELETE";
export type AuthoritativeLedgerState = "ACTIVE" | "RESNAPSHOT_REQUIRED";

export interface AuthoritativeLedgerScope {
  readonly workspaceId: string;
  readonly environment: AuthoritativeLedgerEnvironment;
  readonly profileId: "PAPER_BINANCE_USDM";
  readonly venue: "BINANCE";
}

export interface AuthoritativeLedgerAnchor {
  readonly contractRevision: typeof AUTHORITATIVE_EVENT_LEDGER_CONTRACT_REVISION;
  readonly sourceEpoch: string;
  readonly snapshotSemantics: typeof AUTHORITATIVE_EVENT_LEDGER_SNAPSHOT_SEMANTICS;
  readonly watermarkSequence: string;
  readonly retentionFloorSequence: string;
}

export type SafeLedgerValue =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: SafeLedgerValue }
  | readonly SafeLedgerValue[];

export interface AuthoritativeLedgerEntry {
  readonly sourceSequence: string;
  readonly eventId: string;
  readonly entity: "domain_event";
  readonly entityId: string;
  readonly operation: AuthoritativeLedgerOperation;
  readonly entityVersion: string;
  readonly supersedesEventId: string | null;
  readonly safeRecord: Readonly<Record<string, SafeLedgerValue>> | null;
}

export interface AuthoritativeLedgerPage {
  readonly contractRevision: typeof AUTHORITATIVE_EVENT_LEDGER_CONTRACT_REVISION;
  readonly sourceEpoch: string;
  readonly retentionFloorSequence: string;
  readonly entries: readonly AuthoritativeLedgerEntry[];
}

export interface AuthoritativeLedgerCheckpoint {
  readonly sourceEpoch: string;
  readonly anchorSequence: string;
  readonly acknowledgedSequence: string;
  readonly retentionFloorSequence: string;
  readonly state: AuthoritativeLedgerState;
  readonly resnapshotReason: string | null;
}

export class AuthoritativeLedgerContractError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
    this.name = "AuthoritativeLedgerContractError";
  }
}

const IDENTIFIER = /^[A-Za-z0-9._:-]+$/;
// Source-owned fixtures intentionally use nil-shaped deterministic UUIDs, so
// v1/v4 variant bits are not a valid Portal admission requirement here.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXACT_SEQUENCE = /^(0|[1-9][0-9]{0,19})$/;
const FORBIDDEN_SAFE_RECORD_KEYS = new Set([
  "payload",
  "raw",
  "raw_request",
  "raw_response",
  "credential",
  "secret",
  "password",
  "authorization",
  "access_token",
  "refresh_token",
  "api_key",
  "private_key",
  "dsn",
  "connection_string",
]);

export function exactLedgerSequence(value: string, label: string): bigint {
  if (!EXACT_SEQUENCE.test(value)) {
    throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_INVALID_SEQUENCE", `${label} must be an exact unsigned decimal`);
  }
  const parsed = BigInt(value);
  if (parsed > 18_446_744_073_709_551_615n) {
    throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_INVALID_SEQUENCE", `${label} exceeds u64`);
  }
  return parsed;
}

export function assertAuthoritativeLedgerScope(scope: AuthoritativeLedgerScope): void {
  assertIdentifier(scope.workspaceId, "workspaceId");
  if (scope.environment !== "paper" || scope.profileId !== "PAPER_BINANCE_USDM" || scope.venue !== "BINANCE") {
    throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_SCOPE_REJECTED");
  }
}

export function assertAuthoritativeLedgerAnchor(anchor: AuthoritativeLedgerAnchor): void {
  if (anchor.contractRevision !== AUTHORITATIVE_EVENT_LEDGER_CONTRACT_REVISION) {
    throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_CONTRACT_REVISION_REJECTED");
  }
  assertAuthoritativeLedgerEpoch(anchor.sourceEpoch);
  if (anchor.snapshotSemantics !== AUTHORITATIVE_EVENT_LEDGER_SNAPSHOT_SEMANTICS) {
    throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_SNAPSHOT_SEMANTICS_REJECTED");
  }
  const watermark = exactLedgerSequence(anchor.watermarkSequence, "watermarkSequence");
  const floor = exactLedgerSequence(anchor.retentionFloorSequence, "retentionFloorSequence");
  if (floor > watermark) {
    throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_RETENTION_FLOOR_INVALID");
  }
}

export function assertAuthoritativeLedgerPage(page: AuthoritativeLedgerPage): void {
  if (page.contractRevision !== AUTHORITATIVE_EVENT_LEDGER_CONTRACT_REVISION) {
    throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_CONTRACT_REVISION_REJECTED");
  }
  assertAuthoritativeLedgerEpoch(page.sourceEpoch);
  exactLedgerSequence(page.retentionFloorSequence, "retentionFloorSequence");
  if (page.entries.length > AUTHORITATIVE_EVENT_LEDGER_MAX_PAGE_ROWS) {
    throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_PAGE_BOUND_EXCEEDED");
  }
  let previous: bigint | null = null;
  const eventIds = new Set<string>();
  for (const [index, entry] of page.entries.entries()) {
    assertAuthoritativeLedgerEntry(entry, `entries[${index}]`);
    const sequence = exactLedgerSequence(entry.sourceSequence, `entries[${index}].sourceSequence`);
    if (previous !== null && sequence !== previous + 1n) {
      throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_PAGE_NONCONTIGUOUS");
    }
    previous = sequence;
    if (eventIds.has(entry.eventId)) {
      throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_DUPLICATE_EVENT_ID");
    }
    eventIds.add(entry.eventId);
  }
}

/** The same canonical UUID admission applies to anchors, pages and local reads. */
export function assertAuthoritativeLedgerEpoch(value: string): void {
  assertUuid(value, "sourceEpoch");
}

export function assertAuthoritativeLedgerEntry(entry: AuthoritativeLedgerEntry, label = "entry"): void {
  exactLedgerSequence(entry.sourceSequence, `${label}.sourceSequence`);
  assertUuid(entry.eventId, `${label}.eventId`);
  if (entry.entity !== "domain_event") {
    throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_ENTITY_REJECTED");
  }
  assertUuid(entry.entityId, `${label}.entityId`);
  if (entry.operation !== "UPSERT" && entry.operation !== "DELETE") {
    throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_OPERATION_REJECTED");
  }
  exactLedgerSequence(entry.entityVersion, `${label}.entityVersion`);
  if (entry.supersedesEventId !== null) {
    assertUuid(entry.supersedesEventId, `${label}.supersedesEventId`);
    if (entry.supersedesEventId === entry.eventId) {
      throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_CORRECTION_REFERENCE_REJECTED");
    }
  }
  if (entry.operation === "DELETE") {
    if (entry.safeRecord !== null) {
      throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_TOMBSTONE_SHAPE_REJECTED");
    }
    return;
  }
  if (entry.safeRecord === null) {
    throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_UPSERT_SHAPE_REJECTED");
  }
  assertSafeRecord(entry.safeRecord, `${label}.safeRecord`);
}

/** Stable digest makes a same-sequence retry provably idempotent. */
export function authoritativeLedgerEntryDigest(entry: AuthoritativeLedgerEntry): string {
  assertAuthoritativeLedgerEntry(entry);
  return `sha256:${createHash("sha256").update(canonicalJson(entry)).digest("hex")}`;
}

export function canonicalJson(value: SafeLedgerValue | AuthoritativeLedgerEntry): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_SAFE_RECORD_INVALID");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isRecord(value)) throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_SAFE_RECORD_INVALID");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(",")}}`;
}

function assertSafeRecord(value: Readonly<Record<string, SafeLedgerValue>>, label: string): void {
  if (!isRecord(value)) throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_SAFE_RECORD_INVALID", `${label} must be an object`);
  const serialized = canonicalJson(value);
  if (Buffer.byteLength(serialized, "utf8") > AUTHORITATIVE_EVENT_LEDGER_MAX_SAFE_RECORD_BYTES) {
    throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_SAFE_RECORD_BOUND_EXCEEDED");
  }
  walkSafeRecord(value, label);
}

function walkSafeRecord(value: SafeLedgerValue, label: string): void {
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_SAFE_RECORD_INVALID", label);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkSafeRecord(item, `${label}[${index}]`));
    return;
  }
  if (!isRecord(value)) throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_SAFE_RECORD_INVALID", label);
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_SAFE_RECORD_KEYS.has(key.toLowerCase())) {
      throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_REDACTION_INVALID", `${label}.${key}`);
    }
    walkSafeRecord(nested, `${label}.${key}`);
  }
}

function assertIdentifier(value: string, label: string): void {
  if (!IDENTIFIER.test(value)) {
    throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_IDENTIFIER_REJECTED", `${label} is invalid`);
  }
}

function assertUuid(value: string, label: string): void {
  if (!UUID.test(value)) {
    throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_IDENTIFIER_REJECTED", `${label} must be a UUID`);
  }
}

function isRecord(value: unknown): value is Record<string, SafeLedgerValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
