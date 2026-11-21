/**
 * ELP2-09 `alpha_fleet_overview`: the authority port of the realtime service, and its one implementation over the existing
 * `ExecutionReadScopes`. The port exists so the service's bounds (caps, cursor, eviction, revoke recheck) can be proved
 * against a plain double with no database, while the default implementation is the only code that touches minted scopes.
 *
 * No second authorization model: the baseline is a FLEET read scope (`alpha.read`, exactly what the named fleet read
 * mints); the stream additionally needs whole-fleet business authority at the single authority root AND the exact
 * `stream.subscribe` grant, re-evaluated inside the DB transaction on EVERY delivery (`deliverRealtime`).
 */
import { AccessPolicyError, type AccessResource } from "./access.contract";
import { ExecutionReadScopes, ExecutionReadScopeError, scopeRealtimeIdentity, scopeReplayFieldPolicyRevision,
  type AuthorizedExecutionReadScope, type ReadScopePrincipal } from "./read-scope";
import type { ReadDatasetBinding } from "./read-publication";
import { scopedNoticeGuard, type ReplayDeliveryGuard } from "./realtime";
import type { AlphaFleetStreamUnavailableReason } from "./alpha-fleet-realtime.contract";
import { fleetReadRequirement } from "./manager-model";

export type FleetEnvironment = "paper" | "sandbox" | "live";
export type FleetStreamEligibility = { eligible: true } | { eligible: false; reason: AlphaFleetStreamUnavailableReason };

export interface FleetSnapshotAuthorization<T> {
  /** `scopeRealtimeIdentity`: stable across publication revisions, changes with actor, session, policy, grants, visible resources. */
  identity: string;
  /**
   * Fingerprint of the `alpha.read` scope `GET /manager/fleet` mints for this actor and this dataset binding (CR-01). The named
   * read's `lineage.revision` is bound to it. It is NOT `identity`: the stream identity is the root business scope and excludes the
   * changing source revision. It is never sent on its own; only the digest derived from it is.
   */
  named_scope_fingerprint: string;
  stream: FleetStreamEligibility;
  /** Only meaningful when `stream.eligible`: the revisions a cursor for this stream binds. */
  policy_revision: string | null;
  field_policy_revision: string | null;
  value: T;
}
export interface FleetStreamAuthorization {
  identity: string;
  policy_revision: string;
  field_policy_revision: string;
  /** Resolves a NEW scope from CURRENT authority for every poll and every write; it caches no entitlement. */
  guard: ReplayDeliveryGuard;
}

export interface AlphaFleetAuthority {
  /** Authorize the baseline under the FLEET read scope, run `read` between two current-authority fences, report stream eligibility. */
  snapshot<T>(principal: ReadScopePrincipal, environment: FleetEnvironment, profileId: string, dataset: ReadDatasetBinding,
    read: () => Promise<T>): Promise<FleetSnapshotAuthorization<T>>;
  /** Authorize a stream open. Refuses (ExecutionReadScopeError) unless whole-fleet root authority exists NOW.
   * `currentDataset` is called for each re-authorization and MUST throw `ScopedReplayError` when the lineage moved. */
  openStream(principal: ReadScopePrincipal, environment: FleetEnvironment, profileId: string, dataset: ReadDatasetBinding,
    currentDataset: () => Promise<ReadDatasetBinding>): Promise<FleetStreamAuthorization>;
}

export class ScopesFleetAuthority implements AlphaFleetAuthority {
  constructor(private readonly scopes: ExecutionReadScopes) {}

  async snapshot<T>(principal: ReadScopePrincipal, environment: FleetEnvironment, profileId: string, dataset: ReadDatasetBinding,
    read: () => Promise<T>): Promise<FleetSnapshotAuthorization<T>> {
    const binding = { environment, profileId };
    let root: { scope: AuthorizedExecutionReadScope; resource: AccessResource } | null = null;
    try { root = await this.scopes.authorizeFleetRoot(principal, binding, dataset); }
    catch (error) {
      // Only "no whole-fleet root authority" is a typed stream limit. A stale, pending or unavailable authority is the caller's error.
      if (!(error instanceof ExecutionReadScopeError) || error.code !== "EXECUTION_READ_NOT_AVAILABLE") throw error;
    }
    if (root) {
      const { scope, resource } = root;
      // The named Fleet read is an `alpha.read` read, not the root business read the stream is gated on. Mint ITS scope too and fence
      // the baseline under both, so the identity published for pairing is one the actor really holds right now. A root holder the
      // named read would refuse gets no baseline: a barrier that can never pair is not offered.
      const named = await this.scopes.authorize(principal, binding, fleetReadRequirement(dataset));
      const value = await this.scopes.deliver(named, () => this.scopes.deliver(scope, read));
      let stream: FleetStreamEligibility = { eligible: true };
      try { await this.scopes.deliverRealtime(scope, resource, () => true); }
      catch (error) {
        // The probe only asks "is stream.subscribe granted right now". Any other failure is not a statement about the grant.
        if (error instanceof AccessPolicyError && error.code === "ACCESS_DENIED") stream = { eligible: false, reason: "STREAM_AUTHORITY_NOT_GRANTED" };
        else throw error;
      }
      return { identity: scopeRealtimeIdentity(scope), named_scope_fingerprint: named.fingerprint, stream,
        policy_revision: stream.eligible ? scope.policyRevision : null,
        field_policy_revision: stream.eligible ? scopeReplayFieldPolicyRevision(scope) : null, value };
    }
    // Same scope the named fleet read mints: a partial viewer still gets the baseline, with a typed "no stream for you".
    const scope = await this.scopes.authorize(principal, binding, fleetReadRequirement(dataset));
    const value = await this.scopes.deliver(scope, read);
    return { identity: scopeRealtimeIdentity(scope), named_scope_fingerprint: scope.fingerprint, stream: { eligible: false, reason: "WHOLE_FLEET_AUTHORITY_REQUIRED" },
      policy_revision: null, field_policy_revision: null, value };
  }

  async openStream(principal: ReadScopePrincipal, environment: FleetEnvironment, profileId: string, dataset: ReadDatasetBinding,
    currentDataset: () => Promise<ReadDatasetBinding>): Promise<FleetStreamAuthorization> {
    const binding = { environment, profileId };
    const { scope, resource } = await this.scopes.authorizeFleetRoot(principal, binding, dataset);
    if (scope.policyRevision === null) throw new ExecutionReadScopeError("EXECUTION_READ_POLICY_PENDING", 403);
    const current = async () => (await this.scopes.authorizeFleetRoot(principal, binding, await currentDataset())).scope;
    return { identity: scopeRealtimeIdentity(scope), policy_revision: scope.policyRevision,
      field_policy_revision: scopeReplayFieldPolicyRevision(scope), guard: scopedNoticeGuard(this.scopes, current, resource) };
  }
}
