/** PRIVATE OWNER MAINTENANCE: ONE temporary Research acceptance session for the exact
 * protected Portal owner, issued by the ACTUAL AuthService and revoked by exact
 * session id. No route, no password change, no fake cookie/assertion, no copy of any
 * existing session, no Cloudflare claim. It is Research application-session evidence
 * of the same class as the approved PREVIEW session, and is never presented as more.
 *
 * Same trust model as the policy installer: a root-owned 0600 artifact whose
 * SHA-256 and physical target (database, system id, login, protected owner,
 * workspace) are pinned independently, valid only inside a finite operator window.
 * The token is written ONLY to a root-owned 0600 file named in the artifact; it is
 * never printed, logged, audited or returned in a receipt. */
import { z } from "zod";
import { constants } from "node:fs";
import { lstat, open, unlink } from "node:fs/promises";
import { createHash, timingSafeEqual } from "node:crypto";
import { dirname, normalize } from "node:path";
import type { Pool, PoolClient } from "pg";
import type { AuthService } from "../auth/auth.service";
import { AuthError, RESEARCH_ACCEPTANCE_ACCESS_SUBJECT, RESEARCH_ACCEPTANCE_MAX_TTL_SECONDS } from "../auth/auth.service";
import { SESSION_COOKIE } from "../auth/cookies";
import { AuditRepository } from "../repos/audit";
import { SessionsRepository } from "../repos/sessions";
import { accessDigest } from "./access-digest";
import type { CurrentHumanMutations } from "./current-human-mutations";
import { CurrentHumanLeaseError } from "./current-human-candidate";
import { OWNER_ARTIFACT_MAX_WINDOW_MS, parseCompactJson, readRootOwnedPinnedFile } from "./private-root-file";
import { ownerAnchorMatches, ownerIsWorkspaceMember, ownerTarget, physicalTargetMatches, type OwnerTarget } from "./owner-target";

export const ACCEPTANCE_ISSUE_SCHEMA = "portal.private-owner-acceptance-session-issue.v1";
export const ACCEPTANCE_REVOKE_SCHEMA = "portal.private-owner-acceptance-session-revoke.v1";
export const ACCEPTANCE_TOKEN_SCHEMA = "portal.research-acceptance-session-token.v1";
export const ACCEPTANCE_ISSUE_RECEIPT_SCHEMA = "portal.research-acceptance-session-receipt.v1";
export const ACCEPTANCE_REVOKE_RECEIPT_SCHEMA = "portal.research-acceptance-session-revoke-receipt.v1";
/** Written into every receipt so the evidence class can never be over-claimed. */
export const ACCEPTANCE_EVIDENCE_CLASS = "RESEARCH_APPLICATION_SESSION_NOT_CLOUDFLARE_NOT_PASSWORD_NOT_HUMAN_PRESENCE";
export const ACCEPTANCE_REVOKE_REASON = "research_acceptance_revoked";

export type AcceptanceSessionCode =
  | "ACCEPTANCE_ARTIFACT_REFUSED" | "ACCEPTANCE_TARGET_MISMATCH" | "ACCEPTANCE_ALREADY_ACTIVE" | "ACCEPTANCE_UNAVAILABLE"
  | "ACCEPTANCE_TOKEN_FILE_REFUSED" | "ACCEPTANCE_TOKEN_WRITE_FAILED_SESSION_REVOKED" | "ACCEPTANCE_TOKEN_WRITE_FAILED_REVOKE_UNCONFIRMED"
  | "ACCEPTANCE_SESSION_NOT_FOUND" | "ACCEPTANCE_SESSION_NOT_ACCEPTANCE" | "ACCEPTANCE_KEY_CONFLICT"
  | "ACCEPTANCE_DRAIN_PENDING" | "ACCEPTANCE_RETRY_REQUIRED";
export class AcceptanceSessionError extends Error {
  constructor(readonly code: AcceptanceSessionCode, readonly status: number = 409) { super("The requested access is not available."); }
}

const text = z.string().min(1).max(256).refine(v => !/[\u0000-\u001f\u007f]/u.test(v));
const tokenPath = z.string().min(2).max(1024).refine(v => v.startsWith("/") && normalize(v) === v && !v.endsWith("/") && !/[\u0000-\u001f\u007f]/u.test(v));
export const acceptanceIssueDocument = z.object({ schema_version: z.literal(ACCEPTANCE_ISSUE_SCHEMA), target: ownerTarget, user_id: text,
  ttl_seconds: z.number().int().min(60).max(RESEARCH_ACCEPTANCE_MAX_TTL_SECONDS), token_path: tokenPath,
  approval_ref: text, provenance_ref: text }).strict()
  .refine(v => v.user_id === v.target.protected_owner_user_id, "ACCEPTANCE_USER_NOT_PROTECTED_OWNER");
export const acceptanceRevokeDocument = z.object({ schema_version: z.literal(ACCEPTANCE_REVOKE_SCHEMA), target: ownerTarget, session_id: text,
  user_id: text, token_path: tokenPath, approval_ref: text, provenance_ref: text }).strict()
  .refine(v => v.user_id === v.target.protected_owner_user_id, "ACCEPTANCE_USER_NOT_PROTECTED_OWNER");
export type AcceptanceIssueDocument = z.infer<typeof acceptanceIssueDocument>;
export type AcceptanceRevokeDocument = z.infer<typeof acceptanceRevokeDocument>;

export interface AcceptanceArtifactPin {
  /** Root-owned 0600 regular file, no symlink, absolute private path only. */
  artifact_path: string; approved_sha256: string;
  /** From the hash-pinned runtime manifest intake, NOT read back from the artifact. */
  target: OwnerTarget;
  /** Finite operator window for using THIS artifact (<= 24 h). */
  not_before_ms: number; not_after_ms: number;
}
export interface VerifiedAcceptanceIssue { readonly kind: "VERIFIED_ACCEPTANCE_ISSUE" }
export interface VerifiedAcceptanceRevoke { readonly kind: "VERIFIED_ACCEPTANCE_REVOKE" }
const issues = new WeakMap<object, { document: AcceptanceIssueDocument; sha256: string }>();
const revokes = new WeakMap<object, { document: AcceptanceRevokeDocument; sha256: string }>();
const refusedArtifact = (): never => { throw new AcceptanceSessionError("ACCEPTANCE_ARTIFACT_REFUSED", 503); };

async function readPinned<T extends { target: OwnerTarget }>(pin: AcceptanceArtifactPin, nowMs: number, schema: z.ZodType<T>): Promise<T> {
  try {
    ownerTarget.parse(pin.target);
    if (!Number.isSafeInteger(nowMs) || !Number.isSafeInteger(pin.not_before_ms) || !Number.isSafeInteger(pin.not_after_ms) ||
      pin.not_before_ms >= pin.not_after_ms || pin.not_after_ms - pin.not_before_ms > OWNER_ARTIFACT_MAX_WINDOW_MS ||
      nowMs < pin.not_before_ms || nowMs >= pin.not_after_ms) return refusedArtifact();
    const value = schema.parse(parseCompactJson(await readRootOwnedPinnedFile(pin.artifact_path, pin.approved_sha256)));
    if (accessDigest(value.target) !== accessDigest(pin.target)) return refusedArtifact();
    return value;
  } catch (error) {
    if (error instanceof AcceptanceSessionError) throw error;
    return refusedArtifact();
  }
}
export async function readPinnedAcceptanceIssue(pin: AcceptanceArtifactPin, nowMs: number): Promise<VerifiedAcceptanceIssue> {
  const document = await readPinned(pin, nowMs, acceptanceIssueDocument);
  const token: VerifiedAcceptanceIssue = Object.freeze({ kind: "VERIFIED_ACCEPTANCE_ISSUE" as const });
  issues.set(token, { document: Object.freeze(structuredClone(document)) as AcceptanceIssueDocument, sha256: pin.approved_sha256 });
  return token;
}
export async function readPinnedAcceptanceRevoke(pin: AcceptanceArtifactPin, nowMs: number): Promise<VerifiedAcceptanceRevoke> {
  const document = await readPinned(pin, nowMs, acceptanceRevokeDocument);
  const token: VerifiedAcceptanceRevoke = Object.freeze({ kind: "VERIFIED_ACCEPTANCE_REVOKE" as const });
  revokes.set(token, { document: Object.freeze(structuredClone(document)) as AcceptanceRevokeDocument, sha256: pin.approved_sha256 });
  return token;
}

/** The exact session a token file belongs to. Cleanup of a token file is allowed ONLY when the
 * file on disk carries this session id AND a token whose SHA-256 is the stored session hash. */
export interface AcceptanceTokenBinding { session_id: string; user_id: string; token_sha256: string }
/** True only when `raw` is the token file of EXACTLY this session: the six-field document, same session
 * id and user, and a token that hashes to the stored session hash. Pure; the token is never returned or logged. */
export function acceptanceTokenFileMatches(raw: Uint8Array, binding: AcceptanceTokenBinding): boolean {
  try {
    const value = JSON.parse(Buffer.from(raw).toString("utf8")) as Record<string, unknown> | null;
    if (value === null || typeof value !== "object" || value.schema_version !== ACCEPTANCE_TOKEN_SCHEMA ||
      value.session_id !== binding.session_id || value.user_id !== binding.user_id || typeof value.token !== "string" ||
      !/^[0-9a-f]{64}$/.test(binding.token_sha256)) return false;
    const actual = createHash("sha256").update(value.token, "utf8").digest(), expected = Buffer.from(binding.token_sha256, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
/** The only sink for the secret. Injectable for fakes; the default is a root-owned 0600 file. */
export interface AcceptanceTokenFile {
  /** Writes ALL the bytes (bounded attempts, a zero-progress write fails), fsyncs, verifies length and content, closes.
   * Throws ACCEPTANCE_TOKEN_FILE_REFUSED on any failure. */
  write(bytes: Buffer): Promise<void>;
  /** Removes the exclusively-created (empty or partial) file. */
  abandon(): Promise<void>;
}
export type AcceptanceTokenRemoval = "REMOVED" | "ABSENT" | "RETAINED_NOT_BOUND_TO_SESSION";
export interface AcceptanceTokenFiles {
  /** Exclusive create (never overwrites). Refuses a non-root parent, a writable parent, a symlink, or a non-root-owned file. */
  create(path: string): Promise<AcceptanceTokenFile>;
  /** Wipe + unlink the file at `path` ONLY if it is the token file of exactly `binding`'s session. "ABSENT" when nothing
   * is there; "RETAINED_NOT_BOUND_TO_SESSION" (file untouched) when the file is anything else (another session's token,
   * replaced, unreadable as a token file, too large). Throws ACCEPTANCE_TOKEN_FILE_REFUSED for a non-root / non-regular file. */
  remove(path: string, binding: AcceptanceTokenBinding): Promise<AcceptanceTokenRemoval>;
}
const fileRefused = (): never => { throw new AcceptanceSessionError("ACCEPTANCE_TOKEN_FILE_REFUSED", 503); };
/** A token file is one small JSON document; anything bigger is not ours. */
export const ACCEPTANCE_TOKEN_FILE_MAX_BYTES = 4096;
export const ACCEPTANCE_TOKEN_WRITE_MAX_ATTEMPTS = 16;
type Handle = Awaited<ReturnType<typeof open>>;
const missing = (error: unknown): boolean => { const code = (error as { code?: unknown } | null)?.code; return code === "ENOENT" || code === "ENOTDIR"; };
const parentAcceptable = (parent: { isDirectory(): boolean; isSymbolicLink(): boolean; uid: number; mode: number }): boolean =>
  parent.isDirectory() && !parent.isSymbolicLink() && parent.uid === 0 && (parent.mode & 0o022) === 0;
/** Writes the WHOLE buffer at `position`, honouring FileHandle.write().bytesWritten. Bounded attempts; a write that
 * makes no progress (or reports nonsense) throws. */
async function writeFully(handle: Handle, bytes: Buffer, position: number): Promise<void> {
  let written = 0;
  for (let attempt = 0; written < bytes.length; attempt++) {
    if (attempt >= ACCEPTANCE_TOKEN_WRITE_MAX_ATTEMPTS) throw new Error("write attempts exhausted");
    const { bytesWritten } = await handle.write(bytes, written, bytes.length - written, position + written);
    if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > bytes.length - written) throw new Error("no write progress");
    written += bytesWritten;
  }
}
async function readFully(handle: Handle, length: number): Promise<Buffer> {
  const out = Buffer.alloc(length);
  let read = 0;
  for (let attempt = 0; read < length; attempt++) {
    if (attempt >= ACCEPTANCE_TOKEN_WRITE_MAX_ATTEMPTS) throw new Error("read attempts exhausted");
    const { bytesRead } = await handle.read(out, read, length - read, read);
    if (!Number.isSafeInteger(bytesRead) || bytesRead <= 0 || bytesRead > length - read) throw new Error("no read progress");
    read += bytesRead;
  }
  return out;
}
export const nodeAcceptanceTokenFiles: AcceptanceTokenFiles = {
  async create(path) {
    let handle: Handle | undefined, created = false;
    try {
      const parent = await lstat(dirname(path));
      if (!parentAcceptable(parent)) return fileRefused();
      handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      created = true;
      await handle.chmod(0o600);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o7777) !== 0o600 || stat.size !== 0) return fileRefused();
    } catch {
      if (handle) await handle.close().catch(() => undefined);
      if (created) await unlink(path).catch(() => undefined);
      return fileRefused();
    }
    const open$ = handle;
    let closed = false;
    const close = async () => { if (!closed) { closed = true; await open$.close().catch(() => undefined); } };
    return {
      write: async bytes => { try { await open$.write(bytes, 0, bytes.length, 0); await open$.sync(); await close(); }
        catch { await close(); return fileRefused(); } },
      abandon: async () => { await close(); await unlink(path).catch(() => undefined); },
    };
  },
  async remove(path, binding) {
    let before;
    try { before = await lstat(path); } catch (error) { if (missing(error)) return "ABSENT"; return fileRefused(); }
    if (!before.isFile() || before.isSymbolicLink() || before.uid !== 0) return fileRefused();
    let handle: Handle;
    try { handle = await open(path, constants.O_RDWR | constants.O_NOFOLLOW); } catch { return fileRefused(); }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.uid !== 0 || stat.ino !== before.ino || stat.dev !== before.dev) return fileRefused();
      // Not ours until proven: wrong size, unreadable, another session, another token all RETAIN the file untouched.
      if (stat.size < 1 || stat.size > ACCEPTANCE_TOKEN_FILE_MAX_BYTES) return "RETAINED_NOT_BOUND_TO_SESSION";
      let raw: Buffer;
      try { raw = await readFully(handle, stat.size); } catch { return "RETAINED_NOT_BOUND_TO_SESSION"; }
      const bound = acceptanceTokenFileMatches(raw, binding);
      raw.fill(0);
      if (!bound) return "RETAINED_NOT_BOUND_TO_SESSION";
      // Wipe through the verified descriptor (the inode we read), never through the path.
      await writeFully(handle, Buffer.alloc(stat.size), 0);
      await handle.sync();
      // Unlink only if the path still names the inode we verified and wiped.
      let now;
      try { now = await lstat(path); } catch (error) { if (missing(error)) return "REMOVED"; return fileRefused(); }
      if (now.ino !== stat.ino || now.dev !== stat.dev || !now.isFile() || now.isSymbolicLink()) return "RETAINED_NOT_BOUND_TO_SESSION";
    } finally { await handle.close().catch(() => undefined); }
    await unlink(path);
    return "REMOVED";
  },
};

export interface AcceptanceDependencies {
  auth: AuthService; pool: Pool; mutations: CurrentHumanMutations; files: AcceptanceTokenFiles;
}
export interface AcceptanceIssueReceipt {
  schema_version: typeof ACCEPTANCE_ISSUE_RECEIPT_SCHEMA; session_id: string; user_id: string; workspace_id: string;
  ttl_seconds: number; idle_expires_at: string; absolute_expires_at: string;
  /** Correlation only: a SHA-256 of the path text, never the path, never the token. */
  token_file: { path_sha256: string; owner_uid: 0; mode: "0600"; bytes: number };
  credential_class: "RESEARCH_APPLICATION_SESSION"; evidence_class: typeof ACCEPTANCE_EVIDENCE_CLASS;
}
export interface AcceptanceRevokeReceipt {
  schema_version: typeof ACCEPTANCE_REVOKE_RECEIPT_SCHEMA; session_id: string; user_id: string;
  outcome: "REVOKED" | "ALREADY_REVOKED_BY_THIS_OPERATION" | "ALREADY_TERMINAL";
  session_state_before: "ACTIVE" | "REVOKED" | "EXPIRED"; token_file: "REMOVED" | "ABSENT" | "REMOVE_FAILED" | "RETAINED_NOT_BOUND_TO_SESSION";
  other_sessions_touched: 0;
}

const sha = (value: string): string => createHash("sha256").update(value).digest("hex");
function mapFailure(error: unknown): unknown {
  if (error instanceof AcceptanceSessionError) return error;
  if (error instanceof AuthError) {
    if (error.code === "ACCEPTANCE_SESSION_ALREADY_ACTIVE") return new AcceptanceSessionError("ACCEPTANCE_ALREADY_ACTIVE", 409);
    if (error.code === "ACCEPTANCE_SESSION_TARGET_MISMATCH") return new AcceptanceSessionError("ACCEPTANCE_TARGET_MISMATCH", 409);
    if (/^ACCEPTANCE_SESSION_(SCOPE_REQUIRED|IDENTITY_UNAVAILABLE|TTL_INVALID)$/.test(error.code)) return new AcceptanceSessionError("ACCEPTANCE_UNAVAILABLE", 409);
    if (/^CURRENT_HUMAN_MUTATION_(KEY_CONFLICT|PREVIOUSLY_REFUSED|RECEIPT_MISMATCH)$/.test(error.code) || error.code === "CURRENT_HUMAN_DRAIN_CONFLICT")
      return new AcceptanceSessionError("ACCEPTANCE_KEY_CONFLICT", 409);
    if (/^CURRENT_HUMAN_/.test(error.code) || error.code === "AUTH_ISSUANCE_UNAVAILABLE") return new AcceptanceSessionError("ACCEPTANCE_DRAIN_PENDING", 503);
  }
  if (error instanceof CurrentHumanLeaseError) {
    return error.code === "CURRENT_HUMAN_MUTATION_KEY_CONFLICT" || error.code === "CURRENT_HUMAN_MUTATION_PREVIOUSLY_REFUSED"
      ? new AcceptanceSessionError("ACCEPTANCE_KEY_CONFLICT", 409) : new AcceptanceSessionError("ACCEPTANCE_DRAIN_PENDING", 503);
  }
  const pg = (error as { code?: unknown } | null)?.code;
  if (typeof pg === "string" && ["55P03", "57014", "40001", "40P01"].includes(pg)) return new AcceptanceSessionError("ACCEPTANCE_RETRY_REQUIRED", 503);
  return error;
}
/** Thrown as an AuthError so it survives AuthService's issuance error mapping. */
async function assertOwnerTarget(db: PoolClient, target: OwnerTarget, userId: string): Promise<void> {
  if (userId !== target.protected_owner_user_id || !await physicalTargetMatches(db, target) ||
    !await ownerAnchorMatches(db, target) || !await ownerIsWorkspaceMember(db, target))
    throw new AuthError("ACCEPTANCE_SESSION_TARGET_MISMATCH", "The acceptance session is not available here.", 409);
}

/** Issue ONE session for the exact protected owner. Order: validate the artifact,
 * exclusively create the empty token file (so a bad path can never leave a committed
 * session without a place for its secret), issue through AuthService, write the
 * token. If the write fails AFTER the session committed, that exact session is
 * revoked at once and the typed failure says whether the revoke is confirmed. */
export async function issueAcceptanceSession(deps: AcceptanceDependencies, verified: VerifiedAcceptanceIssue): Promise<AcceptanceIssueReceipt> {
  const entry = verified !== null && typeof verified === "object" ? issues.get(verified) : undefined;
  if (!entry) throw new AcceptanceSessionError("ACCEPTANCE_ARTIFACT_REFUSED", 503);
  const doc = entry.document;
  const file = await deps.files.create(doc.token_path);
  let session: Awaited<ReturnType<AuthService["issueResearchAcceptanceSession"]>>;
  try {
    session = await deps.auth.issueResearchAcceptanceSession({ userId: doc.user_id, ttlSeconds: doc.ttl_seconds,
      artifactSha256: entry.sha256, precondition: client => assertOwnerTarget(client, doc.target, doc.user_id) });
  } catch (error) { await file.abandon(); throw mapFailure(error); }
  const bytes = Buffer.from(JSON.stringify({ schema_version: ACCEPTANCE_TOKEN_SCHEMA, session_id: session.sessionId,
    user_id: doc.user_id, cookie_name: SESSION_COOKIE, token: session.token,
    absolute_expires_at: session.absoluteExpiresAt.toISOString() }), "utf8");
  try { await file.write(bytes); }
  catch {
    bytes.fill(0);
    await file.abandon();
    try {
      await revokeSession(deps, { session_id: session.sessionId, user_id: doc.user_id, target: doc.target,
        requestDigest: accessDigest({ compensation: "TOKEN_WRITE_FAILED", session_id: session.sessionId, user_id: doc.user_id }) });
    } catch { throw new AcceptanceSessionError("ACCEPTANCE_TOKEN_WRITE_FAILED_REVOKE_UNCONFIRMED", 503); }
    throw new AcceptanceSessionError("ACCEPTANCE_TOKEN_WRITE_FAILED_SESSION_REVOKED", 503);
  }
  const length = bytes.length;
  bytes.fill(0);
  return { schema_version: ACCEPTANCE_ISSUE_RECEIPT_SCHEMA, session_id: session.sessionId, user_id: doc.user_id,
    workspace_id: doc.target.workspace_id, ttl_seconds: doc.ttl_seconds, idle_expires_at: session.idleExpiresAt.toISOString(),
    absolute_expires_at: session.absoluteExpiresAt.toISOString(),
    token_file: { path_sha256: sha(doc.token_path), owner_uid: 0, mode: "0600", bytes: length },
    credential_class: "RESEARCH_APPLICATION_SESSION", evidence_class: ACCEPTANCE_EVIDENCE_CLASS };
}

/** Revoke EXACTLY the named session (and nothing else) through the SAME coordinator. The
 * session must be a Research acceptance session of the pinned owner; any other
 * session (including the owner's normal ones) is refused untouched. Idempotent. */
async function revokeSession(deps: Pick<AcceptanceDependencies, "pool" | "mutations">,
  input: { session_id: string; user_id: string; target: OwnerTarget; requestDigest: string }):
  Promise<Pick<AcceptanceRevokeReceipt, "outcome" | "session_state_before"> & { session_token_sha256: string }> {
  const lock = async (db: PoolClient) => {
    await db.query("SET LOCAL lock_timeout='1500ms'");
    await db.query("SET LOCAL statement_timeout='5000ms'");
    await assertOwnerTarget(db, input.target, input.user_id);
    const row = (await db.query("SELECT session_id,user_id,state,access_subject,revoke_reason,session_token_hash FROM auth_sessions WHERE session_id=$1 FOR UPDATE",
      [input.session_id])).rows[0] as { user_id: string; state: "ACTIVE" | "REVOKED" | "EXPIRED"; access_subject: string | null; revoke_reason: string | null; session_token_hash: string } | undefined;
    if (!row) throw new AcceptanceSessionError("ACCEPTANCE_SESSION_NOT_FOUND", 404);
    if (row.user_id !== input.user_id || row.access_subject !== RESEARCH_ACCEPTANCE_ACCESS_SUBJECT)
      throw new AcceptanceSessionError("ACCEPTANCE_SESSION_NOT_ACCEPTANCE", 409);
    return row;
  };
  const summarize = (row: { state: "ACTIVE" | "REVOKED" | "EXPIRED"; revoke_reason: string | null; session_token_hash: string }, applied: boolean) => ({
    session_state_before: row.state, session_token_sha256: row.session_token_hash,
    outcome: applied ? "REVOKED" as const : row.state === "REVOKED" && row.revoke_reason === ACCEPTANCE_REVOKE_REASON
      ? "ALREADY_REVOKED_BY_THIS_OPERATION" as const : "ALREADY_TERMINAL" as const });
  try {
    return await deps.mutations.executeVerified({ family: "REVIEWED_POLICY", operation: "REVOKE_ACCEPTANCE_SESSION",
      key_digest: accessDigest(["ACCEPTANCE_SESSION_REVOKE", input.session_id, input.requestDigest]),
      request_digest: input.requestDigest, target_id: input.session_id }, {
      retain_after_application_rollback: true,
      authorize: async db => { await lock(db); },
      apply: async db => {
        const row = await lock(db);
        if (row.state !== "ACTIVE") return summarize(row, false);
        const before = { state: row.state, revoke_reason: row.revoke_reason, session_token_hash: row.session_token_hash };
        await new SessionsRepository(db).revokeSession(input.session_id, ACCEPTANCE_REVOKE_REASON);
        await new AuditRepository(db).record({ eventType: "research_acceptance_session_revoked", actorUserId: input.user_id,
          targetUserId: input.user_id, accessSubject: RESEARCH_ACCEPTANCE_ACCESS_SUBJECT, result: "SUCCESS",
          reasonCode: "RESEARCH_ACCEPTANCE_SESSION_REVOKED",
          metadata: { schema_version: "portal.research-acceptance-session-audit.v1", session_id: input.session_id } });
        return summarize(before, true);
      },
      // Receipt identity is the session, not the first/second outcome: a replay normalizes equally.
      terminal: () => ({ outcome: "APPLIED", receipt_ref: input.session_id, reason_code: null }),
    });
  } catch (error) { throw mapFailure(error); }
}

export async function revokeAcceptanceSession(deps: AcceptanceDependencies, verified: VerifiedAcceptanceRevoke): Promise<AcceptanceRevokeReceipt> {
  const entry = verified !== null && typeof verified === "object" ? revokes.get(verified) : undefined;
  if (!entry) throw new AcceptanceSessionError("ACCEPTANCE_ARTIFACT_REFUSED", 503);
  const doc = entry.document;
  const result = await revokeSession(deps, { session_id: doc.session_id, user_id: doc.user_id, target: doc.target,
    requestDigest: accessDigest({ schema: ACCEPTANCE_REVOKE_SCHEMA, document: doc }) });
  // Only after the session is provably terminal does its (now dead) secret file go away, and ONLY if the file at the path
  // is the token file of EXACTLY this session (id + token hash). A replayed revoke of an old session can therefore never
  // remove the live token of a newer session that reused the path: that file is retained and the receipt says so.
  const { session_token_sha256, ...receiptFields } = result;
  let token_file: AcceptanceRevokeReceipt["token_file"];
  try { token_file = await deps.files.remove(doc.token_path, { session_id: doc.session_id, user_id: doc.user_id, token_sha256: session_token_sha256 }); }
  catch { token_file = "REMOVE_FAILED"; }
  return { schema_version: ACCEPTANCE_REVOKE_RECEIPT_SCHEMA, session_id: doc.session_id, user_id: doc.user_id,
    ...receiptFields, token_file, other_sessions_touched: 0 };
}

/** Offline seam used by the CLI. */
export function privateAcceptanceSession(deps: AcceptanceDependencies, pin: AcceptanceArtifactPin, clock: () => number = Date.now) {
  const detached = structuredClone(pin);
  return Object.freeze({
    verifyIssue: () => readPinnedAcceptanceIssue(detached, clock()),
    verifyRevoke: () => readPinnedAcceptanceRevoke(detached, clock()),
    issue: async () => issueAcceptanceSession(deps, await readPinnedAcceptanceIssue(detached, clock())),
    revoke: async () => revokeAcceptanceSession(deps, await readPinnedAcceptanceRevoke(detached, clock())),
  });
}
