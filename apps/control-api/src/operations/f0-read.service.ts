import { Inject, Injectable } from "@nestjs/common";
import type { AccessActor } from "../execution-v2/access.contract";
import { ExecutionAccessService } from "../execution-v2/access.service";
import { requireCurrentTsAuditRead } from "../execution-v2/current-audit-read";
import { CommandError } from "../execution-v2/command.contract";
import { CommandCollectionError } from "../execution-v2/command-collection.contract";
import { accessDigest, type AccessEvaluationContext } from "../execution-v2/access-policy";
import { KeysetCursorCodec, type CursorKeyring } from "../query/cursor";
import { QueryContractError } from "../query/contracts";
import { ExecutionOperationsRepository } from "./operations.repository";
import { f0ReadId, f0ReadRecord, f0ReadTarget, f0CollectionQuery, f0Collection,
  type F0BlockedOperation, type F0CollectionQuery, type F0Collection } from "./f0-read.contract";
import type { F0ReadCandidate } from "./operations.repository";

const collectionDomain = "execution.f0-blocked-intents.v1";

/** All bounded visible rows are validated before paging. Invalid off-page
 * rows are not silently omitted and hidden rows never enter this function. */
function collectionPage(actor: AccessActor, query: F0CollectionQuery, context: AccessEvaluationContext,
  decision: ReturnType<typeof requireCurrentTsAuditRead>, candidates: F0ReadCandidate[], cursor: KeysetCursorCodec): F0Collection {
  const resource = { kind: query.resource_kind, id: query.resource_id };
  if (candidates.length > 1024) throw new CommandCollectionError("COMMAND_COLLECTION_OVERFLOW", 503);
  const seen = new Set<string>();
  const rows = candidates.map(row => {
    const id = f0ReadId.safeParse(row.operation_id);
    if (!id.success) throw new CommandError("COMMAND_STATUS_UNVERIFIED", 503);
    const target = f0ReadTarget(row, actor, query.workspace_id, id.data);
    if (target.resource.kind !== resource.kind || target.resource.id !== resource.id ||
      target.environment !== query.environment) throw new CommandError("COMMAND_STATUS_UNVERIFIED", 503);
    const body = f0ReadRecord(row);
    if (seen.has(body.operation_id)) throw new CommandError("COMMAND_STATUS_UNVERIFIED", 503);
    seen.add(body.operation_id);
    return body;
  }).sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at) ||
    (left.operation_id < right.operation_id ? -1 : left.operation_id > right.operation_id ? 1 : 0));
  const binding = { workspace_id: query.workspace_id, resource, environment: query.environment, limit: query.limit };
  const fingerprint = accessDigest({ domain: "portal.execution.f0-command-collection.v1", actor, query: binding,
    core_authority: context.authority_fingerprint, policy_revision: decision.policy_revision,
    scope_revision: decision.scope_revision, field_policy_ref: decision.field_policy_ref,
    visible_intents: rows.map(row => accessDigest(row)) });
  let offset = 0;
  if (query.after) {
    let boundary: readonly (string | number | boolean)[];
    try { boundary = cursor.decode(query.after, { resourceId: collectionDomain,
      workspaceId: query.workspace_id, direction: "after", queryFingerprint: fingerprint, boundarySize: 2 }); }
    catch (error) {
      if (error instanceof QueryContractError) throw new CommandCollectionError(
        error.code === "CURSOR_CONTEXT_MISMATCH" ? "COMMAND_COLLECTION_CURSOR_CHANGED" : "COMMAND_COLLECTION_CURSOR_INVALID",
        error.code === "CURSOR_CONTEXT_MISMATCH" ? 409 : 400);
      throw error;
    }
    if (typeof boundary[0] !== "number" || !Number.isSafeInteger(boundary[0]) || boundary[0] < 0 ||
      !f0ReadId.safeParse(boundary[1]).success)
      throw new CommandCollectionError("COMMAND_COLLECTION_CURSOR_INVALID", 400);
    const index = rows.findIndex(row => Date.parse(row.created_at) === boundary[0] && row.operation_id === boundary[1]);
    if (index < 0) throw new CommandCollectionError("COMMAND_COLLECTION_CURSOR_CHANGED", 409);
    offset = index + 1;
  }
  const items = rows.slice(offset, offset + query.limit), more = offset + items.length < rows.length;
  const last = items[items.length - 1];
  const body = f0Collection.parse({ schema_version: "portal.execution.f0-command-collection.v1",
    family: "F0_BLOCKED_INTENTS_ONLY", coverage: "CURRENT_ACTOR_EXACT_RESOURCE_ONLY", resource,
    environment: query.environment, items,
    page: { limit: query.limit, returned_count: items.length, has_more: more, next_cursor: more
      ? cursor.encode({ resource_id: collectionDomain, workspace_id: query.workspace_id, direction: "after",
        query_fingerprint: fingerprint, boundary: [Date.parse(last.created_at), last.operation_id] }) : null } });
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 1024 * 1024)
    throw new CommandCollectionError("COMMAND_COLLECTION_RESPONSE_BOUND", 503);
  return body;
}

/** Finite retained blocked intent only. No relay, plan admission, reconcile,
 * source call or mixed operation-family fallback is available to this reader.
 */
@Injectable()
export class ExecutionF0ReadService {
  private readonly collectionCursor: KeysetCursorCodec | null;
  constructor(@Inject(ExecutionOperationsRepository) private readonly repository: ExecutionOperationsRepository,
    @Inject(ExecutionAccessService) private readonly access: ExecutionAccessService, cursor?: CursorKeyring) {
    this.collectionCursor = cursor ? new KeysetCursorCodec(cursor) : null;
  }

  async collection(actor: AccessActor, raw: F0CollectionQuery): Promise<F0Collection> {
    const query = f0CollectionQuery.parse(raw), resource = { kind: query.resource_kind, id: query.resource_id };
    const context = await this.access.readContext(actor, query.workspace_id);
    const decision = requireCurrentTsAuditRead(context, resource, query.environment); // BEFORE census.
    let body: F0Collection | undefined, refusal: Error | undefined;
    try {
      if (!this.collectionCursor) throw new CommandCollectionError("COMMAND_COLLECTION_NOT_CONFIGURED", 503);
      const candidates = await this.repository.listF0ReadCandidates(query.workspace_id, actor.user_id, resource, query.environment);
      body = collectionPage(actor, query, context, decision, candidates, this.collectionCursor);
    } catch (error) {
      refusal = error instanceof CommandError || error instanceof CommandCollectionError
        ? error : new Error("F0_COLLECTION_LOOKUP_UNAVAILABLE");
    }
    // LAST await for success AND body/cursor/config/driver/overflow refusal.
    const current = await this.access.confirmReadContext(actor, query.workspace_id, context);
    requireCurrentTsAuditRead(current, resource, query.environment);
    if (refusal) throw refusal;
    if (!body) throw new CommandError("COMMAND_STATUS_UNVERIFIED", 503);
    return body;
  }

  async read(actor: AccessActor, workspace: string, id: string): Promise<F0BlockedOperation> {
    const context = await this.access.readContext(actor, workspace);
    const candidate = await this.repository.findF0ReadCandidate(workspace, actor.user_id, id);
    if (!candidate) throw new CommandError("COMMAND_RESOURCE_NOT_FOUND", 404);
    const target = f0ReadTarget(candidate, actor, workspace, id);
    requireCurrentTsAuditRead(context, target.resource, target.environment);
    // A visible corrupt row is not an existence oracle after authority ends.
    // Hold only a safe finite body (or a fixed refusal) through the same final
    // fence; never emit validation/driver text or bypass revoke for a503.
    let body: F0BlockedOperation | undefined;
    try { body = f0ReadRecord(candidate); } catch { /* fixed refusal after fence */ }
    // LAST await. Re-evaluate receipt/grant/native-leg expiry with the returned
    // actual Core clock with a conservative host elapsed-time clamp (never a
    // replacement or extension of Core authority), not only a fingerprint. This is
    // a local sequential boundary, NOT a held cross-authority TS transaction.
    const current = await this.access.confirmReadContext(actor, workspace, context);
    requireCurrentTsAuditRead({ ...current, now_ms: Math.max(current.now_ms, Date.now()) },
      target.resource, target.environment);
    if (!body) throw new CommandError("COMMAND_STATUS_UNVERIFIED", 503);
    return body;
  }
}
