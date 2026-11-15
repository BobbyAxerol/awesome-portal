/** R1c-ARCHIVE (owner decision 2026-11-15): mint ONE Core-signed ABORTED terminal for a frame lease whose Core row can no
 * longer be settled in the live schema because the candidate schema was reset (R2n) and archived. Pure function: no
 * database, no network, no clock side effect except the injected `now`. It is NOT a settlement path of the server.
 *
 * It signs nothing unless the exported archive row is EXACTLY the stuck frame row the live code could never settle:
 * frame lifecycle, phase UNKNOWN, unreconciled, fenced as never sent (no SENDING row ever existed: body_digest and
 * enter_response_digest are null, which the DB CHECK constraints guarantee for a never-SENDING row), no receipt, a source
 * digest recorded at ISSUE, and an original base that re-derives every pinned digest byte for byte.
 *
 * HONEST LIMIT (repeated in the request file note and the mailbox): the evidence kind says abort confirmed; Core's proof
 * is "never dispatched" from those database facts, NOT a socket-closure witness, because the process that held the
 * reservation is gone. The reason string names that. */
import { createHash, randomUUID } from "node:crypto";
import { SignJWT, type KeyLike } from "jose";
import { z } from "zod";
import { accessDigest } from "./access-policy";
import { nativeBusinessReadTransportRequest, prepareNativeBusinessReadRequest } from "./native-business-read-codec";

export class NativeArchiveTerminalError extends Error {
  constructor(readonly code: string) { super(code); }
}
const refuse = (code: string): never => { throw new NativeArchiveTerminalError(code); };

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const prefixed = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
/** The columns the archive row must carry (all others are ignored but the closed predicates below read them). */
const archivedRow = z.object({
  lease_id: uuid, attempt_id: uuid, workload_id: z.string().min(1), base_body: z.string().min(2),
  stable_core_digest: sha, binding_digest: sha, scope_digest: prefixed,
  frame_domain_scope_digest: prefixed, frame_notice_scope_digest: prefixed,
  sender_id: uuid, lifecycle_kind: z.literal("MANAGER_SSE_FRAME"), phase: z.literal("UNKNOWN"),
  source_reconciled: z.literal(false), no_send_fenced: z.literal(true), source_ack_action: z.null(),
  native_source_digest: sha, enter_response_digest: z.null(), body_digest: z.null(),
  receipt_id: z.null(), receipt_digest: z.null(), terminal_reason: z.null(),
}).passthrough();

export interface ArchiveTerminalConfig {
  readonly issuer: string; readonly audience: string; readonly key_id: string;
  readonly private_key: KeyLike; readonly ttl_seconds: number;
}
export interface ArchiveTerminalInput {
  /** The one stuck row exactly as exported from the verified schema archive. */
  readonly row: unknown;
  readonly terminal: ArchiveTerminalConfig;
  /** Unix seconds; injected so tests are deterministic. */
  readonly now_s: number;
  readonly mint: boolean;
  readonly limits: { request_bytes: number; response_bytes: number };
  /** Optional TS-side expectations; any mismatch refuses. */
  readonly expect?: { source_digest?: string; binding_digest?: string };
}
export interface ArchiveTerminalResult {
  readonly checked: { lease_id: string; attempt_id: string; binding_digest: string; stable_core_digest: string;
    source_digest: string; frame_ordinal: string; frame_sha256: string; deadline: string };
  readonly status_request?: { schema_version: "pm.native-lease-recovery-request.v1"; action: "status"; body: unknown };
  readonly resolve_request?: { schema_version: "pm.native-lease-recovery-request.v1"; action: "resolve"; body: unknown };
  readonly signed_terminal?: string; readonly receipt_id?: string; readonly receipt_digest?: string;
  readonly iat?: number; readonly exp?: number;
}
export const ARCHIVE_TERMINAL_REASON = "ARCHIVE_RECONSTRUCTED_NEVER_DISPATCHED_FRAME";

export async function mintArchivedUnsentFrameTerminal(input: ArchiveTerminalInput): Promise<ArchiveTerminalResult> {
  const parsed = archivedRow.safeParse(input.row);
  if (!parsed.success) return refuse("ARCHIVE_ROW_NOT_THE_STUCK_FRAME_ROW");
  const row = parsed.data;
  // Re-derive the original frame base through the same codec the live code used; every pinned digest must match.
  let prepared: ReturnType<typeof prepareNativeBusinessReadRequest>, wireBody: string, base: Record<string, any>;
  try {
    prepared = prepareNativeBusinessReadRequest("status", Buffer.from(row.base_body, "utf8"), input.limits);
    wireBody = nativeBusinessReadTransportRequest(prepared).body; base = JSON.parse(wireBody);
  } catch { return refuse("ARCHIVE_BASE_REJECTED_BY_CODEC"); }
  const b = base.binding, intent = base.manager_intent;
  if (wireBody !== row.base_body || prepared.binding_digest !== row.binding_digest ||
      prepared.stable_core_digest !== row.stable_core_digest) return refuse("ARCHIVE_BASE_DIGEST_MISMATCH");
  if (b.lease_id !== row.lease_id || b.attempt_id !== row.attempt_id || b.workload_id !== row.workload_id ||
      b.operation !== "READ") return refuse("ARCHIVE_BINDING_MISMATCH");
  if (intent.schema_version !== "pma.manager-read-intent.v2" || intent.action !== "scoped_notice" ||
      !/^[a-f0-9]{64}$/.test(intent.frame_sha256)) return refuse("ARCHIVE_NOT_A_FRAME_LEASE");
  if (row.scope_digest !== accessDigest({ schema: "portal.native-frame-scope.v1",
      domain_scope_digest: row.frame_domain_scope_digest, notice_scope_digest: row.frame_notice_scope_digest }))
    return refuse("ARCHIVE_SCOPE_DIGEST_MISMATCH");
  if (input.expect?.source_digest !== undefined && input.expect.source_digest !== row.native_source_digest)
    return refuse("ARCHIVE_SOURCE_DIGEST_EXPECTATION_MISMATCH");
  if (input.expect?.binding_digest !== undefined && input.expect.binding_digest !== row.binding_digest)
    return refuse("ARCHIVE_BINDING_DIGEST_EXPECTATION_MISMATCH");
  const checked = Object.freeze({ lease_id: row.lease_id, attempt_id: row.attempt_id, binding_digest: row.binding_digest,
    stable_core_digest: row.stable_core_digest, source_digest: row.native_source_digest,
    frame_ordinal: String(intent.frame_ordinal), frame_sha256: intent.frame_sha256, deadline: String(base.deadline) });
  const context = { binding: base.binding, domain: base.domain, manager_intent: base.manager_intent, deadline: base.deadline };
  const requestOf = <A extends "status" | "resolve">(action: A, body: unknown) =>
    ({ schema_version: "pm.native-lease-recovery-request.v1" as const, action, body });
  const statusBody = JSON.parse(nativeBusinessReadTransportRequest(prepareNativeBusinessReadRequest(
    "status", { schema_version: "pma.native-business-read.request.v1", ...context }, input.limits)).body);
  if (!input.mint) return Object.freeze({ checked, status_request: requestOf("status", statusBody) });
  if (!Number.isSafeInteger(input.now_s) || input.terminal.ttl_seconds < 1 || input.terminal.ttl_seconds > 60)
    return refuse("ARCHIVE_TERMINAL_TIME_INVALID");
  // The frame body digest is the one pinned in the original intent (the reservation bound the same value at ISSUE time).
  const bodyDigest = "sha256:" + intent.frame_sha256;
  const receiptId = randomUUID();
  const receiptDigest = accessDigest({ schema: "portal.native-read-terminal.v1", phase: "ABORTED", binding: base.binding,
    source_digest: row.native_source_digest, scope_digest: row.scope_digest, body_digest: bodyDigest,
    sender_id: row.sender_id, reason: ARCHIVE_TERMINAL_REASON, receipt_id: receiptId });
  const iat = input.now_s, exp = iat + input.terminal.ttl_seconds;
  const signed = await new SignJWT({ iss: input.terminal.issuer, aud: input.terminal.audience, iat, nbf: iat, exp,
    jti: randomUUID(), purpose: "pma.native-business-to-core-terminal.v1", workload_id: row.workload_id,
    lease_id: row.lease_id, attempt_id: row.attempt_id, binding_digest: row.binding_digest,
    source_digest: row.native_source_digest, operation: "READ", phase: "ABORTED",
    evidence_kind: "FINAL_SSE_FRAME_ABORT_CONFIRMED", receipt_id: receiptId, receipt_digest: receiptDigest.slice(7) })
    .setProtectedHeader({ alg: "EdDSA", kid: input.terminal.key_id, typ: "JWT" }).sign(input.terminal.private_key);
  const resolveBody = JSON.parse(nativeBusinessReadTransportRequest(prepareNativeBusinessReadRequest(
    "resolve", { schema_version: "pma.native-business-read.request.v1", ...context, signed_terminal: signed }, input.limits)).body);
  return Object.freeze({ checked, status_request: requestOf("status", statusBody),
    resolve_request: requestOf("resolve", resolveBody), signed_terminal: signed, receipt_id: receiptId,
    receipt_digest: receiptDigest, iat, exp });
}
export const sha256Hex = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
