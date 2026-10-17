import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import { WorkspacesRepository } from "../repos/workspaces";
import { ExecutionReadScopeError, ExecutionReadScopes, type AuthorizedExecutionReadScope,
  type ReadEnvironment, type ReadScopeBinding, type ReadScopePrincipal } from "../execution-v2/read-scope";
import { executionScopedRuntimeManifestSchema } from "../execution-v2/technical-read.contract";
import { ExecutionProfileProjectionRepository } from "./profile-projection.repository";
import { ExecutionDurableMirrorRepository } from "./durable-mirror.repository";
import { localProfileReadable } from "./retained-read-profile";

type Manifest = z.infer<typeof executionScopedRuntimeManifestSchema>;
type Mode = AuthorizedExecutionReadScope["mode"];
type Selection = { sourceWorkspaceId: string; bindings: ReadScopeBinding[];
  enabled: boolean[]; localProjectionEnabled: boolean };
const environments: readonly ReadEnvironment[] = ["paper", "sandbox", "live"];
const fail = (code: ConstructorParameters<typeof ExecutionReadScopeError>[0], status = 503): never => {
  throw new ExecutionReadScopeError(code, status);
};
const identifier = (value: unknown): value is string => typeof value === "string" && value.length > 0 &&
  [...value].length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value);
const publicCode = (value: string | null): string | null => {
  if (value === null || /^[A-Z][A-Z0-9_]{1,95}$/.test(value)) return value;
  return fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
};

/** Finite local technical observations, not source health or business authority.
 * The additive V2 route keeps the caller's Core workspace. A separately checked
 * source-workspace principal only authorizes access to configured storage.
 * No source send/lookup/recover, full snapshot, write, or command readiness. */
@Injectable()
export class ExecutionScopedRuntimeManifestService {
  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionReadScopes) private readonly scopes: ExecutionReadScopes,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(ExecutionProfileProjectionRepository) private readonly projection: ExecutionProfileProjectionRepository,
    @Inject(ExecutionDurableMirrorRepository) private readonly mirror: ExecutionDurableMirrorRepository,
  ) {}

  async manifest(principal: ReadScopePrincipal, environment?: ReadEnvironment): Promise<Manifest> {
    try {
      // Snapshot caller-owned objects before the first await. Never replace the
      // Core principal's workspace with the configured projection workspace.
      const core: ReadScopePrincipal = structuredClone(principal);
      if (!identifier(core.workspaceId)) fail("EXECUTION_READ_NOT_AVAILABLE", 404);
      const selected = this.selection(environment);
      if (await this.scopes.coreSelectionMode(core) !== "SCOPED_V2")
        fail("EXECUTION_READ_SCOPE_REQUIRED", 403);
      const source: ReadScopePrincipal = { ...structuredClone(core), workspaceId: selected.sourceWorkspaceId };
      const sourceMode = await this.scopes.selectionMode(source);
      await this.sourceFence(source, selected, sourceMode, environment);
      const authorized: AuthorizedExecutionReadScope[] = [];
      for (const binding of selected.bindings) authorized.push(await this.scopes.authorizeTechnicalProfile(core, binding));
      if (sourceMode === "SCOPED_V2") for (const binding of selected.bindings)
        authorized.push(await this.scopes.authorizeTechnicalProfile(source, binding));

      const read = async (): Promise<Manifest> => {
        await this.sourceFence(source, selected, sourceMode, environment);
        const observations = [];
        for (const binding of selected.bindings) {
          // Bounded by three configured bindings. Scalar metadata only: do not
          // read snapshot(), payload JSONB, dataset rows, or source topology.
          const metadata = await this.projection.snapshotMetadata(selected.sourceWorkspaceId, binding.environment, binding.profileId);
          const health = await this.projection.refreshHealthObservation(selected.sourceWorkspaceId, binding.environment, binding.profileId);
          const integrity = await this.mirror.integrity({ workspaceId: selected.sourceWorkspaceId, ...binding });
          observations.push({ binding, metadata, health, integrity });
        }
        const readAt = Date.now();
        const profiles = observations.map(({ binding, metadata, health }) => {
          const lastRefresh = metadata?.lastSuccessfulRefreshAt.valueOf() ?? null;
          if (lastRefresh !== null && (!Number.isSafeInteger(lastRefresh) || lastRefresh < 0 || lastRefresh > readAt))
            fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
          if (health !== null && health.state !== "HEALTHY" && health.state !== "RECOVERING") fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
          return { environment: binding.environment, profile_id: binding.profileId, component: "LOCAL_PROJECTION" as const,
            // refreshHealth's synthetic HEALTHY for a missing row is NOT a
            // readiness fact. Missing snapshot remains explicitly unpublished.
            state: metadata && health ? health.state : "NOT_PUBLISHED", health: metadata ? "OBSERVED" as const : "NOT_PUBLISHED" as const,
            lag_ms: lastRefresh === null ? null : readAt - lastRefresh, last_error_code: publicCode(health?.reasonCode ?? null) };
        });
        const mirrors = observations.map(({ binding, integrity }) => ({
          schema_version: "portal.execution.technical-health.v1" as const, read_scope: "TECHNICAL_AUTHORIZED" as const,
          environment: binding.environment, profile_id: binding.profileId, component: "DURABLE_MIRROR" as const,
          state: integrity.state, reason_code: publicCode(integrity.reason_code), revision: integrity.measured_revision,
          observed_at: integrity.measured_at_ms,
        }));
        const result = executionScopedRuntimeManifestSchema.safeParse({
          schema_version: "portal.execution.runtime-manifest.v2", workspace_id: core.workspaceId,
          read_scope: "TECHNICAL_AUTHORIZED", read_at_ms: readAt,
          local_projection: { schema_version: "portal.execution.technical-diagnostics.v1", read_scope: "TECHNICAL_AUTHORIZED", profiles },
          durable_mirror: mirrors,
        });
        if (!result.success) return fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
        await this.sourceFence(source, selected, sourceMode, environment);
        return result.data;
      };
      // Every authorized profile is fenced before and after I/O by the
      // existing scope issuer. Never widen to a union after an individual deny.
      const deliver = (index: number): Promise<Manifest> => index === authorized.length ? read()
        : this.scopes.deliver(authorized[index], () => deliver(index + 1));
      // The read callback already performs its final source eligibility check.
      // Await inside the sanitizer; no source I/O follows the outer Core
      // delivery's final current-policy revalidation. Config is synchronously
      // fenced too. These sequential checks are not a held cross-authority transaction.
      const result = await deliver(0);
      if (JSON.stringify(this.selection(environment)) !== JSON.stringify(selected)) fail("EXECUTION_READ_ACCESS_CHANGED", 409);
      return result;
    } catch (error) {
      if (error instanceof ExecutionReadScopeError) throw error;
      throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    }
  }

  private selection(environment?: ReadEnvironment): Selection {
    if (environment !== undefined && !environments.includes(environment)) fail("EXECUTION_READ_NOT_AVAILABLE", 404);
    const sourceWorkspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if (!identifier(sourceWorkspaceId)) return fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
    const bindings: ReadScopeBinding[] = [];
    const configured = [this.config.EXECUTION_EDGE_PAPER_PROFILE_ID,
      this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID, this.config.EXECUTION_EDGE_LIVE_PROFILE_ID];
    for (let index = 0; index < environments.length; index++) {
      const profileId = configured[index];
      if (!profileId) continue;
      if (!identifier(profileId)) fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
      if (environment === undefined || environment === environments[index]) bindings.push({ environment: environments[index], profileId });
    }
    if (!bindings.length) fail(environment === undefined ? "EXECUTION_READ_AUTHORITY_UNAVAILABLE" : "EXECUTION_READ_NOT_AVAILABLE",
      environment === undefined ? 503 : 404);
    return { sourceWorkspaceId, bindings, enabled: bindings.map(binding => localProfileReadable(this.config, binding.environment)),
      localProjectionEnabled: this.config.FEATURE_EXECUTION_LOCAL_PROJECTION === "true" };
  }

  private async sourceFence(source: ReadScopePrincipal, selected: Selection, mode: Mode, environment?: ReadEnvironment): Promise<void> {
    // Configuration is eligibility only. Explicit disabled profiles are denied;
    // an all-profile request may not silently omit a configured disabled one.
    const current = this.selection(environment);
    if (JSON.stringify(current) !== JSON.stringify(selected)) fail("EXECUTION_READ_ACCESS_CHANGED", 409);
    if (!selected.localProjectionEnabled || selected.enabled.some(enabled => !enabled)) fail("EXECUTION_READ_NOT_AVAILABLE", 404);
    if (await this.scopes.selectionMode(source) !== mode) fail("EXECUTION_READ_ACCESS_CHANGED", 409);
    for (const binding of selected.bindings) {
      if (!await this.workspaces.canReadExecution(selected.sourceWorkspaceId, source.user.userId, binding.environment))
        fail("EXECUTION_READ_NOT_AVAILABLE", 404);
    }
  }
}
