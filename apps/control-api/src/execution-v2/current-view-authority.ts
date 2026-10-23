import { randomBytes } from "node:crypto";
import { types } from "node:util";
import type { AuthService } from "../auth/auth.service";
import type { AuthSession, PortalUser } from "../domain";
import { accessResource, type AccessResource } from "./access.contract";
import { accessDigest } from "./access-policy";
import { BUSINESS_READ_FIELDS, RECORD_DETAIL_READ_FIELDS } from "./read-fields";
import { readDatasetBinding, type ReadDatasetBinding } from "./read-publication";
import { assertExecutionReadScope, ExecutionReadScopeError, ExecutionReadScopes, scopeAllowsDetailField, scopeAllowsField,
  scopeReadPopulation, scopeResources, type AuthorizedExecutionReadScope,
  type ReadScopeBinding, type ReadScopePrincipal, type ReadScopeRequirement } from "./read-scope";

export type CurrentViewOperation = "CURRENT" | "HISTORY" | "EXPORT" | "STREAM" | "REPLAY";
type BusinessReadAction = "business.read_all" | "alpha.read" | "portfolio.read" |
  "portfolio.read_restricted" | "portfolio.discover_linked" | "account.read" | "binding.read";

/** Server-owned catalogue selection. This is NEVER an HTTP request schema.
 * Source coverage/retention still comes from the selected qualified producer;
 * naming a dataset here does not qualify its source or enable an operation. */
export interface CurrentViewSelection {
  readonly resource_ref: string;
  readonly binding: ReadScopeBinding;
  readonly read_requirement: ReadScopeRequirement & {
    readonly action: BusinessReadAction;
    readonly resource: AccessResource;
    readonly dataset: ReadDatasetBinding;
  };
  /** No CURRENT fallback. The exact independent purpose must be commissioned
   * by the server. Current AccessAction has no history.read/replay.read, so
   * absent reviewed purpose mapping these operations remain unavailable. */
  readonly operation_requirements?: Partial<Record<"HISTORY" | "REPLAY", ReadScopeRequirement>>;
  /** Exact fields required by the selected server dataset. Omitting a field
   * never grants it; an unauthorized requested field refuses the operation. */
  readonly fields: readonly string[];
}

export interface CurrentViewRequest {
  readonly original_context: string;
  readonly workload_id: string;
  readonly operation: CurrentViewOperation;
  readonly resource_ref: string;
}
export interface CurrentViewRecheckRequest extends CurrentViewRequest {
  readonly decision_digest: string;
}
export type CurrentViewResolveInput = CurrentViewRequest;
export type CurrentViewRecheckInput = CurrentViewRecheckRequest;
export interface CurrentViewRegistration {
  readonly original_context: string;
  readonly context_digest: string;
  readonly expires_at_ms: number;
}
export interface CurrentViewDecision {
  readonly schema_version: "portal.execution.current-view-decision.v1";
  readonly context_digest: string;
  readonly decision_digest: string;
  readonly workload_digest: string;
  readonly principal_digest: string;
  readonly session_digest: string;
  readonly operation: CurrentViewOperation;
  readonly workspace_id: string;
  readonly environment: ReadScopeBinding["environment"];
  readonly profile_id: string;
  readonly resource_ref: string;
  readonly resource: AccessResource;
  readonly policy_revision: string;
  readonly field_policy_ref: string | null;
  readonly whole_population: boolean;
  readonly dataset_binding: ReadDatasetBinding;
  readonly allowed_tuples: ReturnType<typeof scopeReadPopulation>["allowedTuples"];
  readonly resources: readonly AccessResource[];
  readonly fields: readonly string[];
  readonly detail_fields: readonly string[];
  readonly expires_at_ms: number;
}
export type CurrentViewErrorCode = "CURRENT_VIEW_CONTEXT_REQUIRED" | "CURRENT_VIEW_CONTEXT_EXPIRED" |
  "CURRENT_VIEW_BINDING_MISMATCH" | "CURRENT_VIEW_AUTHORITY_CHANGED" | "CURRENT_VIEW_IDENTITY_REQUIRED" |
  "CURRENT_VIEW_AUTHORITY_UNAVAILABLE" | "CURRENT_VIEW_OPERATION_NOT_COMMISSIONED" | "CURRENT_VIEW_CAPACITY";
export class CurrentViewAuthorityError extends Error {
  constructor(readonly code: CurrentViewErrorCode, readonly status: number) {
    // Never disclose actor/session/token/SQL or native-provider error prose.
    super("The current Execution view authority is unavailable.");
  }
}
type Context = {
  principal: ReadScopePrincipal;
  workload: string;
  operation: CurrentViewOperation;
  selection: CurrentViewSelection;
  contextDigest: string;
  until: number;
  scopes: readonly AuthorizedExecutionReadScope[];
  decisionDigest: string;
  released: boolean;
};
type IdentityRow = {
  user_id: string; username: string; display_name: string; role: PortalUser["role"];
  status: PortalUser["status"]; must_change_password: boolean; failed_login_count: number;
  locked_until: Date | null; session_version: number; created_at: Date; updated_at: Date;
  disabled_at: Date | null; account_revision: number; archived_at: Date | null;
  exact_session_id: string; exact_session_state: AuthSession["state"]; exact_session_version: number;
  authentication_time: Date; idle_expires_at: Date; absolute_expires_at: Date;
};
const operations = new Set<CurrentViewOperation>(["CURRENT", "HISTORY", "EXPORT", "STREAM", "REPLAY"]);
const businessActions = new Set<string>(["business.read_all", "alpha.read", "portfolio.read", "portfolio.read_restricted",
  "portfolio.discover_linked", "account.read", "binding.read"]);
const same = (a: unknown, b: unknown) => accessDigest(a) === accessDigest(b);
const finiteTime = (value: unknown): value is Date => value instanceof Date && Number.isSafeInteger(value.valueOf()) && value.valueOf() >= 0;
function fail(code: CurrentViewErrorCode, status = 403): never { throw new CurrentViewAuthorityError(code, status); }
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && [...value].length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value);
}

/** Reuses actual Core session/user rows and ExecutionReadScopes. This service
 * neither mints native membership nor caches an ALLOW. Its bounded context is
 * only original-flight custody; process loss expires it rather than replacing
 * the original actor/session or reconstructing a credential from JSON.
 *
 * register is called ONLY by an authenticated Core server composition. It is
 * intentionally not a wire operation: an Edge/body actor ID is not a user.
 */
export class CurrentViewAuthority {
  private readonly contexts = new Map<string, Context>();
  private readonly ttl: number;
  private readonly capacity: number;
  private readonly now: () => number;

  constructor(private readonly auth: Pick<AuthService, "pool">, private readonly scopes: ExecutionReadScopes,
    options: { ttl_ms?: number; maximum_contexts?: number; now?: () => number } = {}) {
    this.ttl = options.ttl_ms ?? 60_000;
    this.capacity = options.maximum_contexts ?? 256;
    this.now = options.now ?? Date.now;
    if (!Number.isSafeInteger(this.ttl) || this.ttl < 1 || this.ttl > 300_000 ||
        !Number.isSafeInteger(this.capacity) || this.capacity < 1 || this.capacity > 2_000)
      throw new Error("CURRENT_VIEW_BOUNDS_INVALID");
  }

  async register(principal: ReadScopePrincipal, workloadId: string, selection: CurrentViewSelection,
    operation: CurrentViewOperation): Promise<CurrentViewRegistration> {
    if (!text(workloadId) || !operations.has(operation)) fail("CURRENT_VIEW_BINDING_MISMATCH", 400);
    // Snapshot every caller-owned input BEFORE the first await. No later
    // caller mutation can retarget an authorized flight or its original user.
    const original = structuredClone(principal), selected = structuredClone(selection);
    this.validateSelection(selected, operation);
    this.sweep();
    if (this.contexts.size >= this.capacity) fail("CURRENT_VIEW_CAPACITY", 503);
    const current = await this.currentPrincipal(original);
    const scopes = await this.authorize(current, selected, operation);
    const until = Math.min(this.clock() + this.ttl, current.session.idleExpiresAt.valueOf(), current.session.absoluteExpiresAt.valueOf());
    if (until <= this.clock()) fail("CURRENT_VIEW_CONTEXT_EXPIRED", 409);
    const token = randomBytes(32).toString("base64url");
    const context: Context = { principal: current, workload: workloadId, operation, selection: selected, until, scopes,
      contextDigest: accessDigest({ schema: "portal.current-view-original-context.v1", nonce: token,
        actor: [current.user.userId, current.session.sessionId, current.session.sessionVersion],
        workspace: current.workspaceId, viewer: current.viewerWorkspaceId, workload: workloadId,
        operation, selection: selected, expires_at_ms: until }), decisionDigest: "", released: false };
    context.decisionDigest = this.decision(context, scopes).decision_digest;
    // Same short actual DB authority fence used by normal readers. No
    // source/identity await may follow this fence before custody is installed.
    try {
      await this.scopes.deliverScopedTogether(scopes, async () => undefined, () => {
        this.assertAlive(context);
        this.sweep();
        if (this.contexts.size >= this.capacity) fail("CURRENT_VIEW_CAPACITY", 503);
        this.contexts.set(token, context);
      });
      return { original_context: token, context_digest: context.contextDigest, expires_at_ms: until };
    } catch (error) {
      context.released = true;
      this.contexts.delete(token);
      throw error;
    }
  }

  /** Authenticated Core→Edge composition helper. Error/abort/rejection reuses
   * and then releases the SAME original context; it never retries under a new
   * actor/token, mutates a grant or settles a source receipt. Upstream drivers
   * must propagate cancellation as rejection so their normal finally runs. */
  async withOriginalContext<T>(principal: ReadScopePrincipal, workloadId: string, selection: CurrentViewSelection,
    operation: CurrentViewOperation, use: (context: CurrentViewRegistration) => Promise<T>): Promise<T> {
    const registered = await this.register(principal, workloadId, selection, operation);
    try { return await use(registered); }
    finally { this.release(registered.original_context); }
  }

  async resolve(request: CurrentViewRequest): Promise<CurrentViewDecision> {
    const input = structuredClone(request), context = this.context(input);
    return this.withCurrent(context, async scopes => this.decision(context, scopes));
  }

  async recheck(request: CurrentViewRecheckRequest): Promise<CurrentViewDecision> {
    const input = structuredClone(request), context = this.context(input);
    const decision = await this.withCurrent(context, async scopes => this.decision(context, scopes));
    // Decode/binding failure follows the fresh original actor check. Keep it
    // outside the scope callback: that callback deliberately sanitizes foreign
    // errors, whereas this service owns its explicit typed wire refusal.
    if (input.decision_digest !== context.decisionDigest) fail("CURRENT_VIEW_AUTHORITY_CHANGED", 409);
    return decision;
  }

  /** Common cache HIT/miss/I/O boundary. No consumer can reconstruct the
   * branded scope from the returned decision DTO. */
  async deliver<T>(request: CurrentViewRecheckRequest,
    read: (scope: AuthorizedExecutionReadScope) => Promise<T>): Promise<T> {
    const input = structuredClone(request), context = this.context(input);
    if (input.decision_digest !== context.decisionDigest) {
      await this.withCurrent(context, async () => undefined);
      fail("CURRENT_VIEW_AUTHORITY_CHANGED", 409);
    }
    return this.withCurrent(context, async scopes => {
      return read(scopes[0]);
    });
  }

  /** Per-frame current app/native boundary, distinct from READ. The trusted
   * synchronous writer is invoked only by existing realtimeDeliveryBoundary;
   * this is not a send permit, source lease, replay cursor or source ACK. */
  async deliverFrame<T>(request: CurrentViewRecheckRequest, write: () => T): Promise<T> {
    const input = structuredClone(request), context = this.context(input);
    // Existing final physical-write boundary atomically rechecks READ+STREAM,
    // not an additional historical-purpose grant. Until that same boundary
    // can retain ALL original purpose obligations, do not send REPLAY frames.
    if (context.operation !== "STREAM")
      fail("CURRENT_VIEW_OPERATION_NOT_COMMISSIONED", 503);
    if (types.isAsyncFunction(write)) fail("CURRENT_VIEW_AUTHORITY_UNAVAILABLE", 503);
    const fresh = await this.refresh(context);
    if (input.decision_digest !== context.decisionDigest) fail("CURRENT_VIEW_AUTHORITY_CHANGED", 409);
    return this.scopes.deliverRealtime(fresh[0], context.selection.read_requirement.resource, () => {
      this.assertAlive(context);
      const result = write();
      if (result && typeof result === "object" && typeof (result as { then?: unknown }).then === "function")
        fail("CURRENT_VIEW_AUTHORITY_UNAVAILABLE", 503);
      return result;
    });
  }

  /** Exact Core-owned cleanup; it does not delete grant/audit/source custody. */
  release(originalContext: string): void {
    const context = this.contexts.get(originalContext);
    if (context) context.released = true;
    this.contexts.delete(originalContext);
  }

  private clock(): number {
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0) fail("CURRENT_VIEW_AUTHORITY_UNAVAILABLE", 503);
    return now;
  }
  private sweep(): void {
    const now = this.clock();
    for (const [key, context] of this.contexts) if (context.until <= now) {
      context.released = true;
      this.contexts.delete(key);
    }
  }
  private assertAlive(context: Context): void {
    if (context.released) fail("CURRENT_VIEW_CONTEXT_REQUIRED");
    if (context.until <= this.clock()) fail("CURRENT_VIEW_CONTEXT_EXPIRED", 409);
  }
  private context(request: CurrentViewRequest): Context {
    if (typeof request.original_context !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(request.original_context))
      fail("CURRENT_VIEW_CONTEXT_REQUIRED");
    const context = this.contexts.get(request.original_context);
    if (!context) fail("CURRENT_VIEW_CONTEXT_REQUIRED");
    if (context.until <= this.clock()) {
      this.contexts.delete(request.original_context);
      fail("CURRENT_VIEW_CONTEXT_EXPIRED", 409);
    }
    if (request.workload_id !== context.workload || request.operation !== context.operation ||
      request.resource_ref !== context.selection.resource_ref) fail("CURRENT_VIEW_BINDING_MISMATCH", 409);
    return context;
  }
  private validateSelection(selection: CurrentViewSelection, operation: CurrentViewOperation): void {
    const requirement = selection.read_requirement;
    if (!text(selection.resource_ref) || !text(selection.binding?.profileId) ||
      !["paper", "sandbox", "live"].includes(selection.binding?.environment) || !requirement ||
      !businessActions.has(requirement.action) || !accessResource.safeParse(requirement.resource).success ||
      !readDatasetBinding.safeParse(requirement.dataset).success || !Array.isArray(selection.fields) ||
      selection.fields.length === 0 || selection.fields.length > 64 || new Set(selection.fields).size !== selection.fields.length ||
      selection.fields.some(field => typeof field !== "string" || !BUSINESS_READ_FIELDS.includes(field as typeof BUSINESS_READ_FIELDS[number])))
      fail("CURRENT_VIEW_BINDING_MISMATCH", 400);
    if (operation === "HISTORY" || operation === "REPLAY") {
      const purpose = selection.operation_requirements?.[operation];
      // No invented history privilege or implicit CURRENT fallback. Only an
      // explicit independent existing action can be selected by the server.
      // This does not declare that audit.read (or any other action) MEANS
      // financial history: the reviewed native catalogue must own the exact
      // per-operation mapping. No such mapping is invented by this service.
      if (!purpose || businessActions.has(purpose.action) ||
        !["audit.read", "report.export", "stream.subscribe"].includes(purpose.action) ||
        purpose.resource === undefined || purpose.dataset === undefined || !same(purpose.resource, requirement.resource) ||
        !same(purpose.dataset, requirement.dataset) || requirement.dataset.window === null ||
        !requirement.dataset.projection_generation)
        fail("CURRENT_VIEW_OPERATION_NOT_COMMISSIONED", 503);
    }
  }
  private async currentPrincipal(original: ReadScopePrincipal): Promise<ReadScopePrincipal> {
    if (!text(original.user?.userId) || !text(original.session?.sessionId) || !text(original.workspaceId) ||
      original.session.userId !== original.user.userId || !Number.isSafeInteger(original.session.sessionVersion) ||
      original.session.sessionVersion < 0 || original.session.sessionVersion !== original.user.sessionVersion)
      fail("CURRENT_VIEW_IDENTITY_REQUIRED", 401);
    let rows: IdentityRow[];
    try {
      // Same Core database, exact actor/session and current generation. The
      // subsequent minted scopes recheck policy/native relations and the last
      // shared Core confirmation; these rows alone grant no business access.
      const result = await this.auth.pool.query<IdentityRow>(`SELECT u.*,
        s.session_id AS exact_session_id,s.state AS exact_session_state,s.session_version AS exact_session_version,
        s.created_at AS authentication_time,s.idle_expires_at,s.absolute_expires_at
        FROM portal_users u JOIN auth_sessions s ON s.user_id=u.user_id
        WHERE u.user_id=$1 AND s.session_id=$2 AND u.session_version=$3 AND s.session_version=$3
          AND u.status='ACTIVE' AND NOT u.must_change_password AND u.archived_at IS NULL
          AND s.state='ACTIVE' AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
          AND EXISTS(SELECT 1 FROM workspaces w WHERE w.workspace_id=$4)
          AND (EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=$4 AND m.user_id=u.user_id)
            OR EXISTS(SELECT 1 FROM portal_owner_anchor a WHERE a.anchor_id='PORTAL_OWNER' AND a.user_id=u.user_id))`,
      [original.user.userId, original.session.sessionId, original.session.sessionVersion, original.workspaceId]);
      rows = result.rows;
    } catch { fail("CURRENT_VIEW_AUTHORITY_UNAVAILABLE", 503); }
    const row = rows[0];
    if (rows.length !== 1 || !row || row.user_id !== original.user.userId || row.exact_session_id !== original.session.sessionId ||
      row.session_version !== original.session.sessionVersion || row.exact_session_version !== original.session.sessionVersion ||
      row.status !== "ACTIVE" || row.must_change_password || row.archived_at !== null || row.exact_session_state !== "ACTIVE" ||
      !["ADMIN", "USER"].includes(row.role) || !finiteTime(row.authentication_time) ||
      !finiteTime(row.idle_expires_at) || !finiteTime(row.absolute_expires_at) ||
      Math.min(row.idle_expires_at.valueOf(), row.absolute_expires_at.valueOf()) <= this.clock())
      fail("CURRENT_VIEW_IDENTITY_REQUIRED", 401);
    const user: PortalUser = { userId: row.user_id, username: row.username, displayName: row.display_name,
      role: row.role, status: row.status, mustChangePassword: row.must_change_password,
      failedLoginCount: row.failed_login_count, lockedUntil: row.locked_until, sessionVersion: row.session_version,
      createdAt: row.created_at, updatedAt: row.updated_at, disabledAt: row.disabled_at,
      accountRevision: row.account_revision, archivedAt: row.archived_at };
    const session: AuthSession = { sessionId: row.exact_session_id, userId: row.user_id, state: row.exact_session_state,
      sessionVersion: row.exact_session_version, authenticationTime: row.authentication_time,
      idleExpiresAt: row.idle_expires_at, absoluteExpiresAt: row.absolute_expires_at };
    return { user, session, workspaceId: original.workspaceId,
      viewerWorkspaceId: original.viewerWorkspaceId ?? original.workspaceId };
  }
  private async authorize(principal: ReadScopePrincipal, selection: CurrentViewSelection,
    operation: CurrentViewOperation): Promise<readonly AuthorizedExecutionReadScope[]> {
    const requirements: ReadScopeRequirement[] = [selection.read_requirement];
    if (operation === "HISTORY" || operation === "REPLAY") requirements.push(selection.operation_requirements![operation]!);
    if (operation === "EXPORT") requirements.push({ action: "report.export", resource: selection.read_requirement.resource });
    if (operation === "STREAM" || operation === "REPLAY")
      requirements.push({ action: "stream.subscribe", resource: selection.read_requirement.resource });
    const issued: AuthorizedExecutionReadScope[] = [];
    for (const requirement of requirements) {
      const scope = await this.scopes.authorize(principal, selection.binding, requirement);
      assertExecutionReadScope(scope);
      if (scope.mode !== "SCOPED_V2" || scope.policyRevision === null) fail("CURRENT_VIEW_OPERATION_NOT_COMMISSIONED", 503);
      issued.push(scope);
    }
    return issued;
  }
  private async refresh(context: Context): Promise<readonly AuthorizedExecutionReadScope[]> {
    this.assertAlive(context);
    const current = await this.currentPrincipal(context.principal);
    if (current.user.role !== context.principal.user.role ||
      current.session.authenticationTime.valueOf() !== context.principal.session.authenticationTime.valueOf())
      fail("CURRENT_VIEW_AUTHORITY_CHANGED", 409);
    const scopes = await this.authorize(current, context.selection, context.operation);
    if (scopes.length !== context.scopes.length || scopes.some((scope, index) => scope.fingerprint !== context.scopes[index].fingerprint))
      fail("CURRENT_VIEW_AUTHORITY_CHANGED", 409);
    this.assertAlive(context);
    return scopes;
  }
  private async withCurrent<T>(context: Context, read: (scopes: readonly AuthorizedExecutionReadScope[]) => Promise<T>): Promise<T> {
    const scopes = await this.refresh(context);
    let terminalRefusal: CurrentViewAuthorityError | undefined;
    try {
      return await this.scopes.deliverScopedTogether(scopes, () => read(scopes), () => {
        try { this.assertAlive(context); }
        catch (error) {
          if (error instanceof CurrentViewAuthorityError) terminalRefusal = error;
          throw error;
        }
      });
    } catch (error) {
      // Restore only this service's known PURE terminal refusal, never an
      // arbitrary adapter/driver error or a stronger current-authority denial.
      if (terminalRefusal && error instanceof ExecutionReadScopeError && error.code === "EXECUTION_READ_AUTHORITY_UNAVAILABLE")
        throw terminalRefusal;
      throw error;
    }
  }
  private decision(context: Context, scopes: readonly AuthorizedExecutionReadScope[]): CurrentViewDecision {
    const scope = scopes[0], population = scopeReadPopulation(scope);
    if (context.selection.fields.some(field => !scopeAllowsField(scope, field)))
      fail("CURRENT_VIEW_AUTHORITY_CHANGED", 409);
    const value = { schema_version: "portal.execution.current-view-decision.v1" as const, context_digest: context.contextDigest,
      workload_digest: accessDigest({ workload_id: context.workload }),
      principal_digest: accessDigest({ user_id: context.principal.user.userId, workspace_id: context.principal.workspaceId }),
      session_digest: accessDigest({ session_id: context.principal.session.sessionId, session_generation: context.principal.session.sessionVersion }),
      operation: context.operation, workspace_id: scope.workspaceId, environment: scope.environment, profile_id: scope.profileId,
      resource_ref: context.selection.resource_ref, resource: structuredClone(context.selection.read_requirement.resource),
      policy_revision: scope.policyRevision!, field_policy_ref: scope.fieldPolicyRef, whole_population: scope.wholePopulation,
      dataset_binding: structuredClone(context.selection.read_requirement.dataset),
      allowed_tuples: population.allowedTuples, resources: scopeResources(scope),
      fields: [...context.selection.fields],
      detail_fields: RECORD_DETAIL_READ_FIELDS.filter(field => scopeAllowsDetailField(scope, field)),
      expires_at_ms: context.until };
    const decision = { ...value, decision_digest: accessDigest({ schema: "portal.current-view-decision.v1", ...value,
      scope_fingerprints: scopes.map(item => item.fingerprint) }) };
    // Transport cap, not a silent whole-history/population cap. The selected
    // source may need a reviewed narrower binding; never truncate authority.
    if (Buffer.byteLength(JSON.stringify(decision), "utf8") > 64 * 1024)
      fail("CURRENT_VIEW_CAPACITY", 503);
    return decision;
  }
}
