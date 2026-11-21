/** Producer for the private `portal.execution.connected-read-ready.v1` document
 * (Edge R2 section 6.1, EPG10-08 / read09).
 *
 * Pure and offline: it builds and validates BYTES from references and public
 * seals the caller already holds. It opens no file, database, network or
 * session, mints no grant and signs nothing, so it cannot create authority:
 * every authority value (grant id and revision, native revision, acceptance id,
 * epoch) must come from a real installed state that exists before this runs.
 * The checks mirror what Edge's `connected_read.py` refuses, so a document that
 * passes here is not refused for shape; whether it is TRUE is the caller's duty.
 *
 * READ never implies STREAM: a document that does not authorize STREAM cannot
 * carry stream grant fields. */
import { createHash } from "node:crypto";
import { z } from "zod";

export const CONNECTED_READ_READY_SCHEMA = "portal.execution.connected-read-ready.v1";
/** Fixed origin of the runner; Edge R2 6.1. */
export const CONNECTED_READ_ORIGIN = "https://research-portal.primusspark.com";
/** Edge runner: global test deadline. Every source/native/ready timestamp must outlive it; none needs more. */
export const CONNECTED_READ_DEADLINE_MS = 30_000;
/** Edge runner: extra life the genuine PORTAL session must still have at admission (600 s). It is a Portal-session
 * reserve only: it never lengthens a native lease, a source JWT or a ready/trust/native timestamp. */
export const CONNECTED_READ_SESSION_RESERVE_MS = 600_000;
/** Portal session life required at runner start: deadline + reserve. Exactly this much is accepted. */
export const CONNECTED_READ_SESSION_MINIMUM_REMAINING_MS = CONNECTED_READ_DEADLINE_MS + CONNECTED_READ_SESSION_RESERVE_MS;
/** Upper bound for any numeric override, so a typo cannot turn a check into a no-op. */
const MAXIMUM_OVERRIDE_MS = 7 * 24 * 3_600_000;
export const ACCEPTANCE_TOKEN_SCHEMA_V1 = "portal.research-acceptance-session-token.v1";

const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const boundedText = z.string().min(1).max(256);
const utc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/)
  .refine(v => Number.isFinite(Date.parse(v)));

export const connectedReadReadyDocument = z.object({
  schema_version: z.literal(CONNECTED_READ_READY_SCHEMA),
  status: z.literal("INSTALLED"),
  native_selection_verified: z.literal(true),
  origin: z.literal(CONNECTED_READ_ORIGIN),
  environment: z.enum(["paper", "sandbox", "live"]),
  workspace_id: z.string().regex(/^ws_[A-Za-z0-9]{8,96}$/),
  profile_id: z.string().regex(/^[A-Z][A-Z0-9_]{2,95}$/),
  /** The genuine Core-issued Portal session this document is bound to (`ses_...`); the runner refuses a mismatch. */
  session_id: z.string().regex(/^ses_[A-Za-z0-9_-]{1,128}$/),
  projection_epoch: z.string().regex(/^[^\x00-\x20\x7f]{1,256}$/),
  acceptance_id: boundedText,
  core_commit: z.string().regex(/^[a-f0-9]{40}$/),
  core_image: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  core_config_sha256: hex64,
  field_policy_sha256: hex64,
  catalogue_sha256: hex64,
  relation_catalogue_sha256: hex64.optional(),
  api_leaf_sha256: hex64.optional(),
  /** The runner refuses a non-global address and never resolves DNS. */
  api_ip: z.string().min(7).max(45),
  subject: z.string().regex(/^usr_[A-Za-z0-9]{8,96}$/),
  native_revision: z.number().int().min(1).safe(),
  policy_revision: boundedText,
  manager_grant_id: boundedText,
  manager_grant_revision: boundedText,
  read_authorized: z.boolean(),
  native_revoked: z.boolean(),
  stream_authorized: z.boolean(),
  stream_grant_id: boundedText.optional(),
  stream_grant_revision: boundedText.optional(),
  source_set_ref: boundedText.optional(),
  session_sha256: hex64,
  expires_at: utc,
  trust_expires_at: utc,
  native_expires_at: utc,
}).strict();
export type ConnectedReadReadyDocument = z.infer<typeof connectedReadReadyDocument>;

export type ConnectedReadReadyCode =
  | "READY_SHAPE_INVALID" | "READY_API_IP_NOT_GLOBAL" | "READY_NOT_CURRENT" | "READY_STREAM_FIELDS_INCONSISTENT"
  | "READY_STREAM_GRANT_NOT_DISTINCT" | "READY_STREAM_SOURCE_SET_MISSING" | "READY_EXPIRY_TOO_SHORT"
  | "READY_SESSION_HASH_MISMATCH" | "READY_CLOCK_INVALID" | "READY_SESSION_INVALID" | "READY_SESSION_BINDING_MISMATCH"
  | "READY_SESSION_EXPIRY_TOO_SHORT" | "READY_OPTION_INVALID";
export class ConnectedReadReadyError extends Error {
  constructor(readonly code: ConnectedReadReadyCode) { super(code); }
}

/** Public IPv4/IPv6 address test, no DNS. Conservative: anything it cannot
 * positively classify as global is refused, because the runner refuses it too. */
export function isGlobalIp(value: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if ([1, 2, 3, 4].some(i => Number(v4[i]) > 255)) return false;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && Number(v4[3]) === 0) || (b === 0 && Number(v4[3]) === 2))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && Number(v4[3]) === 100))) return false;
    if (a === 203 && b === 0 && Number(v4[3]) === 113) return false;
    return true;
  }
  const lower = value.toLowerCase();
  if (!/^[0-9a-f:]+$/.test(lower) || !lower.includes(":")) return false;
  if (lower === "::" || lower === "::1" || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") ||
    lower.startsWith("feb") || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("ff") ||
    lower.startsWith("2001:db8")) return false;
  return /^[23]/.test(lower);
}

/** The fields of the genuine `portal.research-acceptance-session-token.v1` file this producer binds to.
 * The token value itself is never returned, copied or echoed. */
export interface PortalSessionBinding { sessionId: string; userId: string; absoluteExpiresAtMs: number; fileSha256: string }

const acceptanceTokenFile = z.object({
  schema_version: z.literal(ACCEPTANCE_TOKEN_SCHEMA_V1), session_id: z.string().regex(/^ses_[A-Za-z0-9_-]{1,128}$/),
  user_id: z.string().regex(/^usr_[A-Za-z0-9]{8,96}$/), cookie_name: z.literal("__Host-portal_session"),
  token: z.string().regex(/^[A-Za-z0-9_.~%-]{16,4096}$/), absolute_expires_at: utc,
}).strict();

/** Reads the exact bytes of the issued session file and returns only its binding facts and SHA256. */
export function portalSessionBinding(fileBytes: Buffer): PortalSessionBinding {
  let value: unknown;
  try { value = JSON.parse(fileBytes.toString("utf8")); } catch { throw new ConnectedReadReadyError("READY_SESSION_INVALID"); }
  const parsed = acceptanceTokenFile.safeParse(value);
  if (!parsed.success) throw new ConnectedReadReadyError("READY_SESSION_INVALID");
  return { sessionId: parsed.data.session_id, userId: parsed.data.user_id,
    absoluteExpiresAtMs: Date.parse(parsed.data.absolute_expires_at), fileSha256: createHash("sha256").update(fileBytes).digest("hex") };
}

export interface ConnectedReadReadyOptions {
  /** Epoch ms from the caller's clock. */
  nowMs: number;
  /** The exact bytes of the issued Portal session file this document is bound to. */
  sessionFileBytes: Buffer;
  /** Life every ready/trust/native timestamp must exceed. Defaults to the 30 s test deadline; no 600 s here. */
  minimumRemainingMs?: number;
  /** Extra life the Portal session must still have beyond the deadline. Defaults to 600 s; exactly deadline+reserve passes. */
  sessionReserveMs?: number;
  /** Baseline stage needs a current read authority; post-revoke validation passes false. */
  requireReadCurrent?: boolean;
}

function bounded(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAXIMUM_OVERRIDE_MS) throw new ConnectedReadReadyError("READY_OPTION_INVALID");
  return value;
}

/** Validates a candidate and returns the document, or throws with ONE stable code.
 * The error never echoes a value from the input. */
export function validateConnectedReadReady(input: unknown, options: ConnectedReadReadyOptions): ConnectedReadReadyDocument {
  if (!Number.isSafeInteger(options.nowMs) || options.nowMs < 1) throw new ConnectedReadReadyError("READY_CLOCK_INVALID");
  const need = bounded(options.minimumRemainingMs, CONNECTED_READ_DEADLINE_MS);
  const reserve = bounded(options.sessionReserveMs, CONNECTED_READ_SESSION_RESERVE_MS);
  const parsed = connectedReadReadyDocument.safeParse(input);
  if (!parsed.success) throw new ConnectedReadReadyError("READY_SHAPE_INVALID");
  const d = parsed.data;
  if (!isGlobalIp(d.api_ip)) throw new ConnectedReadReadyError("READY_API_IP_NOT_GLOBAL");
  if (options.requireReadCurrent !== false && (!d.read_authorized || d.native_revoked))
    throw new ConnectedReadReadyError("READY_NOT_CURRENT");
  const streamFields = d.stream_grant_id !== undefined || d.stream_grant_revision !== undefined;
  // READ does not grant STREAM: stream grant fields exist only with stream_authorized, and both or neither.
  if (streamFields && (!d.stream_authorized || d.stream_grant_id === undefined || d.stream_grant_revision === undefined))
    throw new ConnectedReadReadyError("READY_STREAM_FIELDS_INCONSISTENT");
  if (d.stream_authorized && !streamFields) throw new ConnectedReadReadyError("READY_STREAM_FIELDS_INCONSISTENT");
  if (d.stream_authorized && d.stream_grant_id === d.manager_grant_id)
    throw new ConnectedReadReadyError("READY_STREAM_GRANT_NOT_DISTINCT");
  if (d.stream_authorized && d.source_set_ref === undefined) throw new ConnectedReadReadyError("READY_STREAM_SOURCE_SET_MISSING");
  const session = portalSessionBinding(options.sessionFileBytes);
  if (d.session_sha256 !== session.fileSha256) throw new ConnectedReadReadyError("READY_SESSION_HASH_MISMATCH");
  // The runner requires producer.session_id == the issued session's id and producer.subject == its user.
  if (d.session_id !== session.sessionId || d.subject !== session.userId) throw new ConnectedReadReadyError("READY_SESSION_BINDING_MISMATCH");
  // Portal session only: >= deadline + reserve at start (exactly equal passes, like the runner).
  if (session.absoluteExpiresAtMs - options.nowMs < CONNECTED_READ_DEADLINE_MS + reserve)
    throw new ConnectedReadReadyError("READY_SESSION_EXPIRY_TOO_SHORT");
  // Source/native/ready timestamps only have to outlive the test itself (strictly), not the Portal-session reserve.
  for (const stamp of [d.expires_at, d.trust_expires_at, d.native_expires_at])
    if (Date.parse(stamp) - options.nowMs <= need) throw new ConnectedReadReadyError("READY_EXPIRY_TOO_SHORT");
  return d;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, sortKeys(v)]));
  return value;
}

/** Deterministic bytes (compact, keys sorted, no trailing newline) and their SHA256, the pair Edge references
 * as `{path,sha256}`. The caller writes the bytes to an owner-private 0600 file; this function never does. */
export function connectedReadReadyBytes(document: ConnectedReadReadyDocument): { bytes: Buffer; sha256: string } {
  const bytes = Buffer.from(JSON.stringify(sortKeys(document)), "utf8");
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}
