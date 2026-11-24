import { Inject, Injectable, Optional } from "@nestjs/common";
import { ControlApiConfig, paperReadProfileId } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import type { Pool } from "pg";
import { withTransaction } from "../db/pool";
import { retainedReview } from "../execution/retained-read-profile";
import { retainedRevision, retainedSnapshot } from "../execution/retained-snapshot";
import { ExecutionProfileProjectionRepository, type ProjectionEnvironment, type ProfileProjectionSnapshot }
  from "../execution/profile-projection.repository";
import { retainedRelationAction } from "../execution/retained-operation-page";
import { ExecutionReadScopeError, ExecutionReadScopes, type AuthorizedExecutionReadScope, type ReadScopePrincipal } from "./read-scope";
import {
  OBSERVED_READ_SCHEMA_VERSION, OBSERVED_THRESHOLDS, ObservedReadError, observedReadResponse,
  type ObservedReadResponse,
} from "./observed-read.contract";
import { computeObservedFigures, type ObservedAccountCensusInput, type ObservedRelationInput } from "./observed-read.figures";

const EQUITY_RELATION = "account_equity_snapshots";
const EQUITY_SOURCE = "manager.performance";
const ACCOUNT_RELATION = "accounts";
const ACCOUNT_SOURCE = "manager.accounts";
const fail = (code: ConstructorParameters<typeof ExecutionReadScopeError>[0], status: number): never => {
  throw new ExecutionReadScopeError(code, status);
};

function profileFor(config: ControlApiConfig, environment: ProjectionEnvironment): string {
  const id = environment === "paper" ? (paperReadProfileId(config) ?? config.EXECUTION_EDGE_PAPER_PROFILE_ID)
    : environment === "sandbox" ? config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : config.EXECUTION_EDGE_LIVE_PROFILE_ID;
  if (!id) return fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
  return id;
}

function equityRelation(snapshot: ProfileProjectionSnapshot): ObservedRelationInput | null {
  const relation = Object.values(snapshot.document.relations)
    .find(item => item.relation === EQUITY_RELATION && item.source_id === EQUITY_SOURCE);
  if (!relation) return null;
  return {
    availability: relation.availability, completeness: relation.completeness, reason_code: relation.reason_code, freshness: relation.freshness,
    window_truncated: relation.window?.truncated === true,
    items: relation.items.map(item => item as unknown as Record<string, unknown>),
  };
}

function accountCensus(snapshot: ProfileProjectionSnapshot): ObservedAccountCensusInput | null {
  const relation = snapshot.document.relations[`${ACCOUNT_SOURCE}:${ACCOUNT_RELATION}`];
  if (!relation) return null;
  return { availability: relation.availability, completeness: relation.completeness, freshness: relation.freshness,
    items: relation.items.map(item => item as unknown as Record<string, unknown>) };
}

type Metadata = Awaited<ReturnType<ExecutionProfileProjectionRepository["snapshotMetadata"]>>;
function sameMetadata(left: Metadata, right: Metadata): boolean {
  if (!left || !right) return left === right;
  return left.payloadDigest === right.payloadDigest && left.projectionEpoch === right.projectionEpoch &&
    left.projectionSequence === right.projectionSequence && left.sourceCatalogueSha256 === right.sourceCatalogueSha256 &&
    left.sourceEpoch === right.sourceEpoch && left.sourceContractRevision === right.sourceContractRevision &&
    left.completeness === right.completeness && left.receivedAt.getTime() === right.receivedAt.getTime() &&
    left.lastSuccessfulRefreshAt.getTime() === right.lastSuccessfulRefreshAt.getTime() &&
    left.sourceAsOf?.getTime() === right.sourceAsOf?.getTime();
}

/**
 * Core-observed overview. It adds NO authorization branch to any existing path:
 *  1. the feature flag (default OFF);
 *  2. the workspace must be in LEGACY_COMPATIBILITY. A SCOPED_V2 workspace (sticky) is refused
 *     with a typed 409 BEFORE any repository call and never falls through to a scoped read;
 *  3. the same authorize/deliver fence the legacy readers use, serving only the LEGACY scope.
 * Numbers come only from the stored profile snapshot; there is no Edge call here.
 */
@Injectable()
export class ObservedReadService {
  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Optional() @Inject(ExecutionReadScopes) private readonly scopes?: ExecutionReadScopes,
    @Optional() @Inject(ExecutionProfileProjectionRepository) private readonly repository?: ExecutionProfileProjectionRepository,
  ) {}

  /** Test seam only (not a Nest dependency): the wall clock used for staleness. */
  clock: () => number = Date.now;

  enabled(): boolean { return this.config.FEATURE_EXECUTION_OBSERVED_READ === "true"; }

  async overview(principal: ReadScopePrincipal, environment: ProjectionEnvironment): Promise<ObservedReadResponse> {
    if (!this.enabled()) throw new ObservedReadError("EXECUTION_OBSERVED_READ_DISABLED", 404);
    if (!this.scopes || !this.repository) return fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    const mode = await this.scopes.selectionMode(principal);
    if (mode !== "LEGACY_COMPATIBILITY")
      throw new ObservedReadError("EXECUTION_OBSERVED_NOT_AVAILABLE_SCOPED_WORKSPACE", 409);

    const profileId = profileFor(this.config, environment);
    const metadata = await this.repository.snapshotMetadata(principal.workspaceId, environment, profileId);
    const repository = this.repository, scopes = this.scopes;
    const authorize = async (identity: Pick<ProfileProjectionSnapshot, "payloadDigest" | "projectionEpoch" | "sourceCatalogueSha256"> | null) => {
      const result: AuthorizedExecutionReadScope[] = [];
      for (const [source, relation] of [[EQUITY_SOURCE, EQUITY_RELATION], [ACCOUNT_SOURCE, ACCOUNT_RELATION]]) {
        const scope = await scopes.authorize(principal, { environment, profileId }, {
          action: retainedRelationAction(relation!), dataset: {
            dataset_id: `relation:${source}:${relation}`, source_revision: identity?.payloadDigest ?? "SNAPSHOT_NOT_RECORDED",
            projection_generation: identity?.projectionEpoch ?? "PROJECTION_NOT_RECORDED",
            catalogue_revision: identity?.sourceCatalogueSha256 ?? null, window: null,
          },
        });
        if (scope.mode !== "LEGACY_COMPATIBILITY") return fail("EXECUTION_READ_ACCESS_CHANGED", 409);
        result.push(scope);
      }
      return result;
    };
    const fenced = <T>(held: readonly AuthorizedExecutionReadScope[], read: () => Promise<T>, at = 0): Promise<T> =>
      at === held.length ? read() : scopes.deliver(held[at]!, () => fenced(held, read, at + 1));
    const entryScopes = await authorize(metadata);
    return fenced(entryScopes, async () => {
      // One bounded MVCC view for the raw snapshot, its account census and its
      // retained mirror augmentation. Never read a cached derived view beneath
      // a raw digest. withTransaction always rolls back/releases on failure.
      const retained = retainedReview(this.config);
      const captured = await withTransaction(repository.pool, async reader => {
        await reader.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
        await reader.query("SET LOCAL statement_timeout='5000ms'");
        // Existing helpers consume query() only; use the exact RR reader, not
        // the independent pool, for both scalar identity and mirror rows.
        const queryPool = reader as unknown as Pool;
        const revision = retained ? await retainedRevision(queryPool, principal.workspaceId, environment, profileId) : null;
        const current = await repository.snapshotMetadata(principal.workspaceId, environment, profileId, reader);
        if (!sameMetadata(metadata, current)) return fail("EXECUTION_READ_ACCESS_CHANGED", 409);
        const raw = await repository.snapshot(principal.workspaceId, environment, profileId, reader);
        if (current && !raw) return fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
        if (raw && (!current || raw.payloadDigest !== current.payloadDigest || raw.projectionEpoch !== current.projectionEpoch ||
            raw.projectionSequence !== current.projectionSequence || raw.sourceCatalogueSha256 !== current.sourceCatalogueSha256))
          return fail("EXECUTION_READ_ACCESS_CHANGED", 409);
        const snapshot = raw && retained
          ? await retainedSnapshot(queryPool, raw, principal.workspaceId, environment, profileId) : raw;
        return { raw, snapshot, revision, metadata: current };
      });
      const { snapshot, raw } = captured;
      if (snapshot && (snapshot.document.workspace_id !== principal.workspaceId ||
          snapshot.document.environment !== environment || snapshot.document.profile_id !== profileId))
        return fail("EXECUTION_READ_ACCESS_CHANGED", 409);
      const servedScopes = await authorize(snapshot);
      return fenced(servedScopes, async () => {
      const now = this.clock();
      const refreshAge = snapshot ? now - snapshot.lastSuccessfulRefreshAt.getTime() : null;
      const refreshStale = refreshAge !== null && refreshAge > OBSERVED_THRESHOLDS.snapshot_refresh_stale_after_ms;
      const snapshotFreshness = !snapshot || refreshAge === null || refreshAge < 0 ? "UNKNOWN" : refreshStale ? "STALE" : "FRESH";
      const computed = computeObservedFigures(snapshot ? equityRelation(snapshot) : null, now, {
        // A retained wrapper is PARTIAL by construction. Only the same MVCC
        // raw source's complete census can prove membership; served quality is
        // preserved separately, never promoted back to COMPLETE/FRESH.
        census: raw ? accountCensus(raw) : null, snapshot_completeness: snapshot?.completeness ?? "UNKNOWN",
        snapshot_freshness: snapshotFreshness,
        cumulative_net_pnl_supported: environment === "paper" && profileId === "PAPER_OKX_SWAP",
      });
      const reasons = [...computed.quality.reasons];
      if (!snapshot) reasons.unshift("SNAPSHOT_NOT_RECORDED");
      if (refreshStale) reasons.push("SNAPSHOT_REFRESH_STALE");
      const body: ObservedReadResponse = {
        schema_version: OBSERVED_READ_SCHEMA_VERSION, surface: "FUND", workspace_id: principal.workspaceId, environment,
        trust: { class: "CORE_OBSERVED_NOT_QUALIFIED", qualified: false, source_confidence: "UNKNOWN",
          label_code: "OBSERVED_BY_CORE_FROM_EDGE_SNAPSHOT", not_ts_qualified: true },
        record_authority: "PORTAL_OBSERVATION", source_authority: "EDGE_SNAPSHOT_VIA_CORE",
        observation_semantics: "BOUNDED_CURRENT_WINDOW", access_mode: "LEGACY_COMPATIBILITY",
        coverage: "WORKSPACE_WHOLE_POPULATION",
        as_of: {
          read_at_ms: now,
          snapshot_source_as_of_ms: snapshot?.sourceAsOf ? snapshot.sourceAsOf.getTime() : null,
          snapshot_received_ms: snapshot ? snapshot.receivedAt.getTime() : null,
          last_refresh_ms: snapshot ? snapshot.lastSuccessfulRefreshAt.getTime() : null,
          oldest_figure_ts_ms: computed.oldest_figure_ts_ms, newest_figure_ts_ms: computed.newest_figure_ts_ms,
        },
        projection: {
          profile_id: profileId, epoch_id: snapshot?.projectionEpoch ?? null,
          sequence: snapshot ? snapshot.projectionSequence : null, payload_digest: snapshot?.payloadDigest ?? null,
          source_catalogue_sha256: snapshot?.sourceCatalogueSha256 ?? null,
        },
        quality: {
          completeness: !snapshot ? "UNRESOLVED" : refreshStale && computed.quality.completeness === "COMPLETE"
            ? "PARTIAL" : computed.quality.completeness,
          freshness: !snapshot ? "UNKNOWN" : refreshStale ? "STALE" : computed.quality.freshness,
          reasons: [...new Set(reasons)].slice(0, 16),
        },
        figures: computed.figures,
        not_published: computed.not_published,
      };
      // Defence in depth: a body that is not exactly the observed contract never leaves the service.
      const parsed = observedReadResponse.parse(body);
      // Fresh scalar confirmation covers raw identity/clocks AND mirror input.
      // It runs inside all authority fences; the genuine final deliver checks
      // still execute after it, including on protected read/parse failures.
      if (retained) {
        const current = await retainedRevision(repository.pool, principal.workspaceId, environment, profileId);
        if (current !== captured.revision) return fail("EXECUTION_READ_ACCESS_CHANGED", 409);
      } else if (!sameMetadata(captured.metadata,
          await repository.snapshotMetadata(principal.workspaceId, environment, profileId))) {
        return fail("EXECUTION_READ_ACCESS_CHANGED", 409);
      }
      return parsed;
      });
    });
  }
}
