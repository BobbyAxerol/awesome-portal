/**
 * P10's single server-owned run-admission predicate.
 *
 * The predicate is intentionally reusable by the P08 read response and the
 * P10 write transaction.  A browser can display its boolean, but neither a
 * browser-held token nor an ACTIVE AlphaVersion is authority to create work.
 */

import { Inject, Injectable } from "@nestjs/common";

import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchPreflightManifestRecord, ResearchScope } from "./contracts";
import { ResearchRequestedSpecSchema, type ResearchRequestedSpec } from "./preflight.contract";
import { sha256ResearchJson } from "./preflight.service";
import {
  DELTA_WFO_PROFILE,
  DELTA_WFO_PROFILE_DIGEST,
  DELTA_WFO_PROFILE_ID,
  P04_FIXED_QUALIFICATION_PROFILE_ID,
  type ResearchExecutionProfileId,
} from "./delta-wfo.profile";
import {
  P04_DELTA_ADAPTER_CONTRACT_DIGEST,
  P04_DELTA_ADAPTER_ID,
  P04_DELTA_ALPHA_ID,
  P04_DELTA_ALPHA_VERSION_ID,
  P04_DELTA_FIXED_PARAMETERS,
} from "./p04-delta.binding";
import { ResearchMetadataRepository } from "./repository";
import { ResearchRunCreateError } from "./run-create.error";

export interface ResearchRunAdmission {
  allowed: boolean;
  code: ResearchRunCreateError["code"] | null;
  message: string | null;
  manifest: ResearchPreflightManifestRecord | null;
  requestedSpec: ResearchRequestedSpec | null;
  alpha: {
    alphaId: string;
    alphaVersionId: string;
    adapterId: "p04.delta-rsi.v1";
    adapterContractDigest: string;
    /** P04 fixed map; null for the WFO profile, which searches its parameters. */
    fixedParameters: Readonly<Record<string, number>> | null;
  } | null;
  /** W1 execution profile selected by the server predicate; null when denied. */
  profile: {
    id: ResearchExecutionProfileId;
    /** NULL exactly for the P04 fixed qualification. */
    digest: string | null;
  } | null;
}

@Injectable()
export class ResearchRunAdmissionService {
  constructor(
    private readonly repository: ResearchMetadataRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  /** P08 reads this boolean; known denials stay truthful rather than throwing. */
  async mayCreate(
    user: PortalUser,
    scope: ResearchScope,
    preflightToken: string,
  ): Promise<boolean> {
    try {
      const manifest = await this.repository.loadPreflightManifest(scope, preflightToken);
      return (await this.evaluate(user, scope, manifest)).allowed;
    } catch {
      // P08 owns detailed preflight errors. A capability indicator must not
      // become a second oracle for token ownership, data state or internals.
      return false;
    }
  }

  /** P10 calls this after pinning the token to the exact submitted spec. */
  async require(
    user: PortalUser,
    scope: ResearchScope,
    preflightToken: string,
    requestedSpec: ResearchRequestedSpec,
  ): Promise<ResearchRunAdmission> {
    const manifest = await this.repository.assertPreflightManifestFresh(
      scope,
      preflightToken,
      sha256ResearchJson(requestedSpec),
    );
    const result = await this.evaluate(user, scope, manifest);
    if (!result.allowed || !result.manifest || !result.requestedSpec || !result.alpha) {
      throw new ResearchRunCreateError(
        result.code ?? "RESEARCH_RUN_PREFLIGHT_NOT_READY",
        result.message ?? "Research run admission is not currently available.",
        this.statusFor(result.code),
      );
    }
    return result;
  }

  private async evaluate(
    user: PortalUser,
    scope: ResearchScope,
    manifest: ResearchPreflightManifestRecord,
  ): Promise<ResearchRunAdmission> {
    const denied = (
      code: ResearchRunCreateError["code"],
      message: string,
    ): ResearchRunAdmission => ({
      allowed: false, code, message, manifest: null, requestedSpec: null, alpha: null, profile: null,
    });

    if (this.config.FEATURE_RESEARCH_RUN_PRODUCER !== "true") {
      return denied("RESEARCH_RUN_PRODUCER_UNAVAILABLE", "Research run creation is not enabled in this environment.");
    }
    if (user.role !== "ADMIN" || user.status !== "ACTIVE" || user.mustChangePassword) {
      return denied("RESEARCH_RUN_CREATE_FORBIDDEN", "The current account is not eligible to create a Research run.");
    }
    const parsed = ResearchRequestedSpecSchema.safeParse(manifest.requestedSpec);
    if (!parsed.success || sha256ResearchJson(parsed.data) !== manifest.requestedSpecDigest) {
      return denied("RESEARCH_RUN_PREFLIGHT_NOT_READY", "The immutable preflight specification is no longer valid.");
    }
    const requestedSpec = parsed.data;
    if (requestedSpec.alpha_binding === null || requestedSpec.not_publishable) {
      return denied("RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", "Scratch specifications have no installed execution adapter.");
    }
    const eligibility = await this.repository.loadRunAdapterEligibility(
      scope,
      requestedSpec.alpha_binding.alpha_id,
      requestedSpec.alpha_binding.alpha_version_id,
    );
    if (!eligibility) {
      return denied("RESEARCH_RUN_PREFLIGHT_NOT_READY", "The preflight AlphaVersion is no longer available in this workspace.");
    }
    if (eligibility.lifecycleState !== "ACTIVE") {
      return denied("RESEARCH_RUN_ALPHA_NOT_ACTIVE", "The bound AlphaVersion is not active.");
    }
    if (!eligibility.binding || eligibility.binding.adapterId !== P04_DELTA_ADAPTER_ID ||
        eligibility.binding.contractDigest !== P04_DELTA_ADAPTER_CONTRACT_DIGEST ||
        eligibility.alphaId !== P04_DELTA_ALPHA_ID ||
        eligibility.alphaVersionId !== P04_DELTA_ALPHA_VERSION_ID) {
      return denied("RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", "No installed durable executor is bound to this active AlphaVersion.");
    }
    // W1 profile selection. An `advanced` request is the only shape the WFO
    // profile can own, and only while its flag is on; every other request
    // (including `advanced` with the flag off) takes the unchanged P04 branch,
    // so P04 admission, wording and bytes are identical to the pre-W1 release.
    const wfo = requestedSpec.protocol === "advanced" && this.config.FEATURE_RESEARCH_WFO_PROFILE === "true";
    const unsupported = wfo
      ? this.deltaWfoUnsupportedReason(requestedSpec, manifest)
      : this.p04UnsupportedReason(requestedSpec, manifest);
    if (unsupported) {
      return denied("RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", unsupported);
    }
    return {
      allowed: true,
      code: null,
      message: null,
      manifest,
      requestedSpec,
      alpha: {
        alphaId: eligibility.alphaId,
        alphaVersionId: eligibility.alphaVersionId,
        adapterId: eligibility.binding.adapterId,
        adapterContractDigest: eligibility.binding.contractDigest,
        fixedParameters: wfo ? null : P04_DELTA_FIXED_PARAMETERS,
      },
      profile: wfo
        ? { id: DELTA_WFO_PROFILE_ID, digest: DELTA_WFO_PROFILE_DIGEST }
        : { id: P04_FIXED_QUALIFICATION_PROFILE_ID, digest: null },
    };
  }

  /**
   * W1 §1.1: the one locked Delta signal-notional walk-forward profile. It
   * accepts exactly the profile object's values and nothing else; each
   * deviation is refused with its own sentence rather than silently falling
   * back to the fixed qualification or a child default.
   */
  private deltaWfoUnsupportedReason(
    requested: ResearchRequestedSpec,
    manifest: ResearchPreflightManifestRecord,
  ): string | null {
    const profile = DELTA_WFO_PROFILE;
    const engine = manifest.effectiveSpec.engine;
    if (!engine || typeof engine !== "object" || Array.isArray(engine) ||
        (engine as Record<string, unknown>).execution_route !== requested.execution_route ||
        (engine as Record<string, unknown>).engine_release_id !== requested.client.engine_release_id) {
      return "The effective preflight engine binding no longer matches the submitted request.";
    }
    if (requested.client.engine_release_id !== profile.engine_release_id) {
      return "The Delta walk-forward profile is bound to engine release er_quantbt_111.";
    }
    if (requested.execution_route !== profile.execution_route) {
      return "The Delta walk-forward profile accepts only the signal-notional route.";
    }
    if (requested.protocol !== profile.protocol || !requested.walk_forward || requested.windows) {
      return "The Delta walk-forward profile accepts only the advanced walk-forward protocol.";
    }
    if (requested.optimization_mode !== profile.optimization_mode || requested.optimization_schedule !== profile.optimization_schedule) {
      return "The Delta walk-forward profile executes only mode_1_decay with the global schedule.";
    }
    if (requested.route_params && Object.keys(requested.route_params).length !== 0) {
      return "The Delta walk-forward profile does not accept route-specific parameters.";
    }
    if (requested.parameter_space_overrides.length !== 0 ||
        (requested.optimization_config && Object.keys(requested.optimization_config).length !== 0)) {
      return "The Delta walk-forward profile searches only the installed Delta parameter space and accepts no overrides.";
    }
    if (requested.optuna_trials !== profile.optuna_trials) {
      return "The Delta walk-forward profile runs exactly 3 Optuna trials.";
    }
    if (requested.random_seed !== profile.random_seed) {
      return "The Delta walk-forward profile runs exactly random seed 42.";
    }
    if (requested.early_stopping !== null) {
      return "The Delta walk-forward profile does not admit early stopping.";
    }
    if (requested.data.timeframe !== profile.timeframe) {
      return "The Delta walk-forward profile accepts only the 1h timeframe.";
    }
    const walkForward = requested.walk_forward;
    if (walkForward.frequency !== profile.frequency || walkForward.window_mode !== profile.window_mode) {
      return "The Delta walk-forward profile accepts only weekly expanding folds.";
    }
    const start = utcInstantMs(walkForward.start);
    const end = utcInstantMs(walkForward.end_exclusive);
    const split = utcInstantMs(walkForward.split_mode);
    if (start === null || end === null || split === null || !(start < split && split < end)) {
      return "The Delta walk-forward first out-of-sample boundary must lie strictly inside the walk-forward span.";
    }
    if (end - start > profile.max_span_days * 86_400_000) {
      return "The Delta walk-forward span exceeds the admitted 92 days.";
    }
    const folds = advancedFoldCount(manifest.topology);
    if (folds === null || folds < profile.fold_bounds.min || folds > profile.fold_bounds.max) {
      return "The Delta walk-forward profile admits 2 to 16 weekly expanding folds in the preflight topology.";
    }
    if (requested.alpha_binding === null || requested.strategy_id !== requested.alpha_binding.alpha_id) {
      return "The run strategy identity must equal the explicitly bound AlphaVersion identity.";
    }
    return null;
  }

  /**
   * P04 only ships one real bounded child.  Refuse every field combination it
   * cannot consume rather than silently applying fixed child defaults behind
   * a rich S02 form.  Future installed adapters extend this switch with a new
   * versioned branch; they never broaden P04 by implication.
   */
  private p04UnsupportedReason(
    requested: ResearchRequestedSpec,
    manifest: ResearchPreflightManifestRecord,
  ): string | null {
    const engine = manifest.effectiveSpec.engine;
    if (!engine || typeof engine !== "object" || Array.isArray(engine) ||
        (engine as Record<string, unknown>).execution_route !== requested.execution_route ||
        (engine as Record<string, unknown>).engine_release_id !== requested.client.engine_release_id) {
      return "The effective preflight engine binding no longer matches the submitted request.";
    }
    if (requested.execution_route !== "signal_notional" || requested.protocol !== "three_window_decay") {
      return "The installed Delta adapter currently accepts only the signal-notional three-window profile.";
    }
    if (requested.optimization_mode !== "mode_1_decay" || requested.optimization_schedule !== "global") {
      return "The installed fixed Delta adapter does not execute the requested optimization mode or schedule.";
    }
    if (requested.route_params && Object.keys(requested.route_params).length !== 0) {
      return "The installed Delta adapter does not accept route-specific parameters in this release.";
    }
    if (requested.parameter_space_overrides.length !== 0 || requested.optimization_config && Object.keys(requested.optimization_config).length !== 0 ||
        requested.optuna_trials !== 1 || requested.early_stopping !== null || requested.random_seed !== null) {
      return "The installed Delta adapter is a fixed-parameter qualification path and does not accept optimization overrides.";
    }
    if (requested.alpha_binding === null || requested.strategy_id !== requested.alpha_binding.alpha_id) {
      return "The run strategy identity must equal the explicitly bound AlphaVersion identity.";
    }
    return null;
  }

  private statusFor(code: ResearchRunCreateError["code"] | null): 400 | 403 | 404 | 409 | 502 | 503 {
    switch (code) {
      case "RESEARCH_RUN_CREATE_FORBIDDEN": return 403;
      case "RESEARCH_RUN_ALPHA_NOT_ACTIVE":
      case "RESEARCH_RUN_PREFLIGHT_STALE": return 409;
      case "RESEARCH_RUN_PREFLIGHT_NOT_READY": return 409;
      case "RESEARCH_RUN_PRODUCER_UNAVAILABLE": return 503;
      case "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE": return 409;
      default: return 503;
    }
  }
}

/**
 * Parse an ISO-8601 instant as the Python producer DTO does: an instant
 * without an explicit offset is UTC, never the host's local zone.
 */
function utcInstantMs(value: string): number | null {
  if (typeof value !== "string" || value.length < 10 || value.length > 64) return null;
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) return null;
  const normalized = value.replace(" ", "T");
  const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized);
  const withTime = normalized.length === 10 ? `${normalized}T00:00:00` : normalized;
  const parsed = Date.parse(hasZone ? withTime : `${withTime}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Fold count of the immutable P08 advanced topology; null for any other shape. */
function advancedFoldCount(topology: Record<string, unknown>): number | null {
  if (!topology || typeof topology !== "object" || Array.isArray(topology)) return null;
  if (topology.protocol !== "advanced_walk_forward" || topology.frequency !== DELTA_WFO_PROFILE.frequency ||
      topology.window_mode !== DELTA_WFO_PROFILE.window_mode || topology.sealed_holdout !== null) {
    return null;
  }
  return Array.isArray(topology.folds) ? topology.folds.length : null;
}
