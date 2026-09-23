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
    fixedParameters: Readonly<Record<string, number>>;
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
    ): ResearchRunAdmission => ({ allowed: false, code, message, manifest: null, requestedSpec: null, alpha: null });

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
    const unsupported = this.p04UnsupportedReason(requestedSpec, manifest);
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
        fixedParameters: P04_DELTA_FIXED_PARAMETERS,
      },
    };
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
