import { createHmac } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { querySigningKeys, type ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import { WorkspacesRepository } from "../repos/workspaces";
import { accessDigest } from "../execution-v2/access-policy";
import { ExecutionReadScopes, ExecutionReadScopeError, scopeRealtimeIdentity, scopeAllowsField,
  type AuthorizedExecutionReadScope, type ReadScopePrincipal, type ReadScopeBinding } from "../execution-v2/read-scope";
import { serviceHeartbeatsPageSchema, serviceHeartbeatsQuerySchema,
  type ServiceHeartbeatsPage } from "../execution-v2/service-heartbeats.contract";
import { KeysetCursorCodec } from "../query/cursor";
import { QueryContractError } from "../query/contracts";
import { ExecutionProfileProjectionRepository } from "./profile-projection.repository";
import { localProfileReadable } from "./retained-read-profile";
import { projectRetainedServiceHeartbeats, RetainedHeartbeatProjectionError,
  type RetainedHeartbeatProjection } from "./retained-service-heartbeat-projector";

const OPERATION = "executionRetainedServiceHeartbeatsPageV1";
const DATASET = "relation:manager.current.service-heartbeats:service_heartbeats";
type Mode = AuthorizedExecutionReadScope["mode"];
type Selection = { sourceWorkspaceId: string; binding: ReadScopeBinding; enabled: boolean; localEnabled: boolean };
type Metadata = Awaited<ReturnType<ExecutionProfileProjectionRepository["snapshotMetadata"]>>;
type CaptureIdentity = Pick<NonNullable<Metadata>, "payloadDigest" | "projectionEpoch" | "sourceCatalogueSha256"> | null;
const fail = (code: ConstructorParameters<typeof ExecutionReadScopeError>[0], status = 503): never => {
  throw new ExecutionReadScopeError(code, status);
};
const changed = (): never => fail("EXECUTION_READ_ACCESS_CHANGED", 409);
const identifier = (value: unknown): value is string => typeof value === "string" && value.length > 0 &&
  [...value].length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value);
const identity = (metadata: CaptureIdentity) => metadata === null ? null : {
  payloadDigest: metadata.payloadDigest, projectionEpoch: metadata.projectionEpoch,
  sourceCatalogueSha256: metadata.sourceCatalogueSha256,
};
const same = (left: CaptureIdentity, right: CaptureIdentity) => accessDigest(identity(left)) === accessDigest(identity(right));
class CaptureMoved extends Error {}

/** One bounded retained technical read. No source send, collector, refresh,
 * write, recovery, timer, cache, economic tuple bypass or stream is created.
 * Core authority and source-storage eligibility remain separate. */
@Injectable()
export class ExecutionServiceHeartbeatsService {
  private readonly cursors: KeysetCursorCodec;
  private readonly keyId: string;
  private readonly referenceKey: string;
  constructor(@Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionReadScopes) private readonly scopes: ExecutionReadScopes,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(ExecutionProfileProjectionRepository) private readonly projection: ExecutionProfileProjectionRepository) {
    const keys = querySigningKeys(config); this.keyId = config.QUERY_CURSOR_ACTIVE_KEY_ID;
    this.referenceKey = keys[this.keyId];
    this.cursors = new KeysetCursorCodec({ activeKeyId: this.keyId, keys, ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS });
  }
  private ref(context: unknown, label: string, value: unknown): string {
    return "por1_" + createHmac("sha256", this.referenceKey)
      .update("portal-retained-service-heartbeats-v1\0" + label + "\0" + accessDigest({ context, value })).digest("hex");
  }
  private selection(environment: ReadScopeBinding["environment"]): Selection {
    if (!["paper", "sandbox", "live"].includes(environment)) fail("EXECUTION_READ_NOT_AVAILABLE", 404);
    const profileId = environment === "paper" ? this.config.EXECUTION_EDGE_PAPER_PROFILE_ID :
      environment === "sandbox" ? this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : this.config.EXECUTION_EDGE_LIVE_PROFILE_ID;
    const sourceWorkspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if (!identifier(sourceWorkspaceId)) return fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
    if (!identifier(profileId)) return fail("EXECUTION_READ_NOT_AVAILABLE", 404);
    return { sourceWorkspaceId, binding: { environment, profileId }, enabled: localProfileReadable(this.config, environment),
      localEnabled: this.config.FEATURE_EXECUTION_LOCAL_PROJECTION === "true" };
  }
  private async sourceFence(source: ReadScopePrincipal, selected: Selection, mode: Mode): Promise<void> {
    if (accessDigest(this.selection(selected.binding.environment)) !== accessDigest(selected)) changed();
    if (!selected.enabled || !selected.localEnabled) fail("EXECUTION_READ_NOT_AVAILABLE", 404);
    if (await this.scopes.selectionMode(source) !== mode) changed();
    if (!await this.workspaces.canReadExecution(selected.sourceWorkspaceId, source.user.userId, selected.binding.environment))
      fail("EXECUTION_READ_NOT_AVAILABLE", 404);
  }
  private nested<T>(scopes: readonly AuthorizedExecutionReadScope[], read: () => Promise<T>, index = 0): Promise<T> {
    return index === scopes.length ? read() : this.scopes.deliver(scopes[index], () => this.nested(scopes, read, index + 1));
  }
  async read(principal: ReadScopePrincipal, raw: unknown): Promise<ServiceHeartbeatsPage> {
    const parsed = serviceHeartbeatsQuerySchema.safeParse(raw);
    if (!parsed.success) return fail("EXECUTION_READ_NOT_AVAILABLE", 400);
    try {
      const q = structuredClone(parsed.data), core = structuredClone(principal);
      if (q.workspace_id !== undefined && q.workspace_id !== core.workspaceId) fail("EXECUTION_READ_NOT_AVAILABLE", 404);
      const selected = this.selection(q.environment);
      if (await this.scopes.coreSelectionMode(core) !== "SCOPED_V2") fail("EXECUTION_READ_SCOPE_REQUIRED", 403);
      const source = { ...structuredClone(core), workspaceId: selected.sourceWorkspaceId };
      const sourceMode = await this.scopes.selectionMode(source);
      await this.sourceFence(source, selected, sourceMode);
      // Base ROOT scopes keep genuine current grants/session independent of
      // document revisions. No raw snapshot is read before this authorization.
      const base = [await this.scopes.authorizeTechnicalProfile(core, selected.binding)];
      if (sourceMode === "SCOPED_V2") base.push(await this.scopes.authorizeTechnicalProfile(source, selected.binding));
      const fixedContext = { operation: OPERATION, key: this.keyId, workspace: core.workspaceId,
        viewer: core.viewerWorkspaceId ?? core.workspaceId, sourceWorkspace: selected.sourceWorkspaceId, binding: selected.binding,
        authority: base.map(scopeRealtimeIdentity) };
      const page = (view: RetainedHeartbeatProjection["view"], authority: string[], readAtMs: number): ServiceHeartbeatsPage => {
      const revision = this.ref(fixedContext, "revision", { projection: view.continuity_digest, authority: authority });
      const fingerprint = accessDigest({ operation: OPERATION, context: fixedContext, revision, limit: q.limit });
      const context = { resourceId: OPERATION, workspaceId: core.workspaceId, direction: "after" as const,
        queryFingerprint: fingerprint, boundarySize: 1 };
      let offset = 0;
      if (q.after) {
        const [boundary] = this.cursors.decode(q.after, context);
        const index = view.observations.findIndex(record => record.record_id === boundary);
        if (index < 0) changed(); offset = index + 1;
      }
      const records = view.observations.slice(offset, offset + q.limit);
      if (q.after && !records.length) changed();
      const next = offset + records.length < view.observations.length ? this.cursors.encode({
        resource_id: OPERATION, workspace_id: core.workspaceId, direction: "after", query_fingerprint: fingerprint,
        boundary: [records[records.length - 1].record_id],
      }) : null;
      // Do not spread the internal view: private clock fence, raw source
      // identifiers, digest preimages and the whole captured row set stay out.
      const result = serviceHeartbeatsPageSchema.parse({ schema_version: "portal.execution.retained-service-heartbeats.v1",
        workspace_id: core.workspaceId, read_scope: "TECHNICAL_AUTHORIZED", read_at_ms: readAtMs,
        environment: view.environment, profile_id: view.profile_id, record_basis: view.record_basis,
        capture_state: view.capture_state, availability: view.availability,
        captured_source_freshness: view.captured_source_freshness, captured_source_completeness: view.captured_source_completeness,
        source_as_of_ms: view.source_as_of_ms, source_as_of_reason_code: view.source_as_of_reason_code,
        snapshot_received_at_ms: view.snapshot_received_at_ms, revision,
        bounds: { maximum_captured_rows: 2000, maximum_response_bytes: 1048576 },
        page: { limit: q.limit, maximum_page_rows: 200, returned_count: records.length, next_cursor: next }, records });
      if (Buffer.byteLength(JSON.stringify(result)) > 1048576) fail("EXECUTION_READ_SCOPE_LIMIT");
      return result;
      };
      const capture = async (metadata: Metadata): Promise<ServiceHeartbeatsPage> => {
        const dataset = metadata === null ? undefined : { dataset_id: DATASET, source_revision: metadata.payloadDigest,
          projection_generation: metadata.projectionEpoch, catalogue_revision: metadata.sourceCatalogueSha256, window: null };
        const exact: AuthorizedExecutionReadScope[] = [];
        if (dataset) {
          exact.push(await this.scopes.authorizeTechnicalProfile(core, selected.binding, "maintenance.read", dataset));
          if (sourceMode === "SCOPED_V2") exact.push(await this.scopes.authorizeTechnicalProfile(source, selected.binding, "maintenance.read", dataset));
          for (const scope of exact) for (const field of ["environment", "profile_id", "component", "observed_at", "availability", "reason_code"])
            if (!scopeAllowsField(scope, field)) fail("EXECUTION_READ_NOT_AVAILABLE", 404);
        }
        return this.nested(exact, async () => {
          const snapshot = metadata === null ? null : await this.projection.rawSnapshot(selected.sourceWorkspaceId,
            selected.binding.environment, selected.binding.profileId);
          if (!same(metadata, snapshot)) throw new CaptureMoved();
          const readAtMs = Date.now();
          const projected = projectRetainedServiceHeartbeats({ snapshot, binding: { workspaceId: selected.sourceWorkspaceId,
            environment: selected.binding.environment, profileId: selected.binding.profileId, snapshot: identity(metadata) },
            readAtMs, recordIdFor: name => this.ref(fixedContext, "record", name) });
          const finalMetadata = await this.projection.snapshotMetadata(selected.sourceWorkspaceId, selected.binding.environment, selected.binding.profileId);
          if (!same(metadata, finalMetadata)) throw new CaptureMoved();
          const result = page(projected.view, exact.map(scopeRealtimeIdentity), readAtMs);
          // Keep every source/config await within the exact dataset scope.
          // Its final publication/current-authority check follows assembly.
          await this.sourceFence(source, selected, sourceMode);
          return result;
        });
      };
      const response = await this.nested(base, async () => {
        await this.sourceFence(source, selected, sourceMode);
        let metadata = await this.projection.snapshotMetadata(selected.sourceWorkspaceId, selected.binding.environment, selected.binding.profileId);
        try { return await capture(metadata); }
        catch (error) {
          // One current capture retry only. A pure grant/session error never
          // retries. New authority is minted for the new exact dataset; no old
          // scope is mutated and no unqualified fallback is allowed.
          if (!(error instanceof CaptureMoved) && !(error instanceof ExecutionReadScopeError && [409, 503].includes(error.status))) throw error;
          const current = await this.projection.snapshotMetadata(selected.sourceWorkspaceId, selected.binding.environment, selected.binding.profileId);
          if (same(metadata, current)) throw error;
          metadata = current; return await capture(metadata);
        }
      });
      // No source/config async I/O follows final current Core authorization.
      // This is sequential local fencing, not native multi-authority COMMIT.
      if (accessDigest(this.selection(q.environment)) !== accessDigest(selected)) changed();
      return response;
    } catch (error) {
      if (error instanceof ExecutionReadScopeError) throw error;
      if (error instanceof QueryContractError || error instanceof CaptureMoved) changed();
      if (error instanceof RetainedHeartbeatProjectionError) fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED");
      throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    }
  }
}
