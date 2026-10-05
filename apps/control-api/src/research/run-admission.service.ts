/**
 * P10's single server-owned run-admission predicate.
 *
 * The predicate is intentionally reusable by the P08 read response and the
 * P10 write transaction.  A browser can display its boolean, but neither a
 * browser-held token nor an ACTIVE AlphaVersion is authority to create work.
 */

import { Inject, Injectable } from "@nestjs/common";
import {executionRecipe, wfoExecutionRecipe} from "./execution-recipes";

import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchPreflightManifestRecord, ResearchScope } from "./contracts";
import { ResearchRequestedSpecSchema, type ResearchRequestedSpec } from "./preflight.contract";
import { sha256ResearchJson } from "./preflight.service";
import type { SetupRefusal } from "./run-setup.contract";
import {
  DELTA_WFO_PROFILE,
  DELTA_WFO_PROFILE_DIGEST,
  DELTA_WFO_PROFILE_ID,
  DELTA_WFO_PREVIEW_LONG_LIMITS,
  P04_FIXED_QUALIFICATION_PROFILE_ID,
  deltaWfoPreviewLongEnabled,
  type ResearchExecutionProfileId,
} from "./delta-wfo.profile";
import {
  P04_DELTA_ADAPTER_CONTRACT_DIGEST,
  P04_DELTA_ADAPTER_ID,
  P04_DELTA_ALPHA_ID,
  P04_DELTA_ALPHA_VERSION_ID,
  P04_DELTA_DECLARED_CONTRACT,
  P04_DELTA_FIXED_PARAMETERS,
} from "./p04-delta.binding";
import { ResearchMetadataRepository } from "./repository";
import { DELTA_WFO_V2_PROFILE, DELTA_WFO_V2_PROFILE_ID, DELTA_WFO_V2_PROFILE_DIGEST } from "./delta-wfo-v2.profile";
import { DELTA_CAUSAL_INNER_PROFILE, DELTA_CAUSAL_INNER_PROFILE_ID, DELTA_CAUSAL_INNER_PROFILE_DIGEST } from "./delta-causal-inner.profile";
import { parseDecimal } from "./whatif.grid";
import { WHATIF_PROFILE } from "./whatif.profile";
import { ResearchRunCreateError } from "./run-create.error";
import { engine110QualificationEnabled } from "./engine-qualification.profile";
import { researchRunVersionPrecheck } from "./version-admission";
import { VN_OBSERVED_FIXED_PROFILE, VN_OBSERVED_FIXED_PROFILE_ID, VN_OBSERVED_FIXED_PROFILE_DIGEST, vnObservedSourceDateMs } from "./vn-observed-fixed.profile";
import {
  IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
  IMPORTED_ALPHA_ADAPTER_ID,
  IMPORTED_ALPHA_PROFILE,
  IMPORTED_ALPHA_PROFILE_DIGEST,
  IMPORTED_ALPHA_PROFILE_ID,
} from "./imported-alpha.profile";

export interface ResearchRunAdmission {
  allowed: boolean;
  code: ResearchRunCreateError["code"] | null;
  message: string | null;
  manifest: ResearchPreflightManifestRecord | null;
  requestedSpec: ResearchRequestedSpec | null;
  alpha: {
    alphaId: string;
    alphaVersionId: string;
    adapterId: "p04.delta-rsi.v1" | "p17.imported-signal-notional.v1";
    adapterContractDigest: string;
    /** P04 fixed map; null for the WFO profile, which searches its parameters. */
    fixedParameters: Readonly<Record<string, number>> | null;
    /** Exact declaration-bound pins for E17; never browser-selected source bytes. */
    importedParameters: Readonly<Record<string, string | number | boolean>> | null;
    sourceDigest: string | null;
    entrypoint: string;
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
    return (await this.admissionFacts(user, scope, preflightToken)).allowed;
  }

  /**
   * CG-P08-03: the same predicate, with the typed reason when it says no.
   * Only the predicate's own code and sentence are exposed; a failure to
   * even load the manifest stays an opaque "no" exactly as before.
   */
  async admissionFacts(
    user: PortalUser,
    scope: ResearchScope,
    preflightToken: string,
  ): Promise<{ allowed: boolean; code: ResearchRunCreateError["code"] | null; message: string | null }> {
    try {
      const manifest = await this.repository.loadPreflightManifest(scope, preflightToken);
      const result = await this.evaluate(user, scope, manifest);
      return { allowed: result.allowed, code: result.code, message: result.message };
    } catch {
      // P08 owns detailed preflight errors. A capability indicator must not
      // become a second oracle for token ownership, data state or internals.
      return { allowed: false, code: null, message: null };
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
    const versionPrecheck = researchRunVersionPrecheck(user, this.config, eligibility);
    if (!versionPrecheck.may_create_run) {
      return denied(versionPrecheck.code!, versionPrecheck.message!);
    }
    // An immutable imported declaration identifies the missing executor, not
    // permission to execute. Preserve the legacy lifecycle denial when the
    // imported lane is off; when it is on, report the actual absent binding.
    if (this.config.FEATURE_RESEARCH_IMPORTED_EXECUTION === "true" &&
        eligibility.binding === null && eligibility.sourceDigest !== null &&
        eligibility.declaredContract.schema_version === IMPORTED_ALPHA_PROFILE.source_contract &&
        (eligibility.lifecycleState === "DRAFT" || eligibility.lifecycleState === "ACTIVE")) {
      return denied("RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", "The imported AlphaVersion has no installed execution adapter binding.");
    }
    if (eligibility.binding?.adapterId === IMPORTED_ALPHA_ADAPTER_ID) {
      if (eligibility.lifecycleState !== "DRAFT" && eligibility.lifecycleState !== "ACTIVE") {
        return denied("RESEARCH_RUN_ALPHA_NOT_ACTIVE", "The bound imported AlphaVersion is neither DRAFT nor active.");
      }
      if (this.config.FEATURE_RESEARCH_IMPORTED_EXECUTION !== "true") {
        return denied("RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", "Imported Alpha execution is not enabled in this environment.");
      }
      if (eligibility.binding.contractDigest !== IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST || eligibility.sourceDigest === null) {
        return denied("RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", "The imported AlphaVersion is not bound to the installed restricted adapter contract.");
      }
      const imported = this.importedUnsupportedReason(requestedSpec, eligibility.declaredContract, eligibility.entrypoint);
      if (imported.reason !== null) {
        return denied("RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", imported.reason);
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
          fixedParameters: null,
          importedParameters: imported.parameters,
          sourceDigest: eligibility.sourceDigest,
          entrypoint: eligibility.entrypoint,
        },
        profile: { id: IMPORTED_ALPHA_PROFILE_ID, digest: IMPORTED_ALPHA_PROFILE_DIGEST },
      };
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
    const vnObserved = requestedSpec.data.dataset_id === VN_OBSERVED_FIXED_PROFILE.dataset_id;
    const unsupported = vnObserved
      ? this.vnObservedUnsupportedReason(requestedSpec, manifest)
      : wfo
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
        fixedParameters: wfo && !vnObserved ? null : P04_DELTA_FIXED_PARAMETERS,
        importedParameters: null,
        sourceDigest: null,
        entrypoint: eligibility.entrypoint,
      },
      profile: vnObserved
        ? { id: VN_OBSERVED_FIXED_PROFILE_ID, digest: VN_OBSERVED_FIXED_PROFILE_DIGEST }
        : wfo
        ? this.wfoProfileIdentity(requestedSpec)
        : { id: P04_FIXED_QUALIFICATION_PROFILE_ID, digest: null },
    };
  }

  private wfoProfileIdentity(spec: ResearchRequestedSpec): {id: ResearchExecutionProfileId; digest: string | null} {
    const row = wfoExecutionRecipe(spec);
    if (!row) throw new ResearchRunCreateError("RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", "No exact qualified execution recipe matches this request.", 409);
    return {id: row.profile_id, digest: row.profile_digest};
  }

  /** Only P08's source-qualified observed FPT tape grants this source pair. */
  private vnObservedUnsupportedReason(requested: ResearchRequestedSpec, manifest: ResearchPreflightManifestRecord): string | null {
    const p = VN_OBSERVED_FIXED_PROFILE;
    if (this.config.FEATURE_RESEARCH_VN_OBSERVED_PROFILE !== "true") return "The VN observed daily fixed profile is not enabled.";
    if (requested.schema_version !== "research.requested-spec.v1") return "The VN observed daily fixed profile admits requested-spec v1 only.";
    const fixedReason = this.p04UnsupportedReason(requested, manifest);
    if (fixedReason) return fixedReason;
    if (requested.data.symbol !== p.symbol || requested.data.timeframe !== p.timeframe || !requested.windows || requested.walk_forward) {
      return "The VN observed daily fixed profile admits only source-qualified FPT 1d three-window research.";
    }
    const binding = manifest.datasetBinding;
    const raw = binding.provenance;
    const provenance = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
    if (binding.dataset_id !== p.dataset_id || binding.symbol !== p.symbol || binding.timeframe !== p.timeframe
      || binding.timezone !== p.source_timezone || binding.closed_bar_policy !== "SOURCE_LOCAL_DATE_OBSERVED_AT_AS_OF_V1"
      || provenance.clock_basis !== p.clock_basis
      || provenance.source_timezone !== p.source_timezone || provenance.warmup_semantics !== p.warmup_semantics
      || !hash(provenance.metadata_index_revision) || !hash(provenance.metadata_index_source_manifest_digest)
      || !Number.isSafeInteger(provenance.metadata_index_as_of_utc_ms) || (provenance.metadata_index_as_of_utc_ms as number) < 0
      || !Number.isSafeInteger(provenance.warmup_start_utc_ms) || (provenance.warmup_start_utc_ms as number) < 0) {
      return "The preflight does not carry a verified VN observed-date index and predecessor warmup binding.";
    }
    const ranges = [requested.windows.is, requested.windows.oos, requested.windows.holdout].map(window => ({
      start: vnObservedSourceDateMs(window.start), end: vnObservedSourceDateMs(window.end_exclusive),
    }));
    if (ranges.some(window => window.start === null || window.end === null || window.start >= window.end)
      || ranges[0]!.end! !== ranges[1]!.start! || ranges[1]!.end! !== ranges[2]!.start!
      || ranges[2]!.end! - ranges[0]!.start! > p.max_span_days * 86_400_000
      || (provenance.warmup_start_utc_ms as number) >= ranges[0]!.start!
      || binding.range_start_utc_ms !== provenance.warmup_start_utc_ms || binding.range_end_exclusive_utc_ms !== ranges[2]!.end) {
      return "The VN source-local windows and observed predecessor warmup must match the immutable bounded preflight.";
    }
    const effectiveBinding = manifest.effectiveSpec.data_binding as Record<string, unknown> | undefined;
    const warmup = manifest.snapshot.warmup as Record<string, unknown> | undefined;
    if (effectiveBinding?.warmup_bars !== p.warmup_bars || warmup?.requested_bars !== p.warmup_bars
      || warmup?.bars !== p.warmup_bars || warmup?.start_utc_ms !== provenance.warmup_start_utc_ms
      || effectiveBinding?.closed_bar_policy !== binding.closed_bar_policy
      || sha256ResearchJson(effectiveBinding?.provenance) !== sha256ResearchJson(provenance)) {
      return "The VN observed fixed profile requires exactly 300 indexed predecessor bars bound by the preflight.";
    }
    return null;
  }

  /**
   * E17 admits one deliberately small source-as-data contract. All variable
   * parameters must be pinned inside the P07 declaration; a range is never
   * silently optimized and a fixed value is never overridden.
   */
  private importedUnsupportedReason(
    requested: ResearchRequestedSpec,
    declaration: Record<string, unknown>,
    entrypoint: string,
  ): { reason: string | null; parameters: Readonly<Record<string, string | number | boolean>> | null; refusal?: SetupRefusal } {
    const reject = (reason: string, reason_code: string, field_path: string[]) => ({reason, parameters: null, refusal: {reason_code, field_path}});
    if (requested.schema_version !== "research.requested-spec.v1") {
      return reject("The installed imported Alpha adapter accepts requested-spec v1 only.", "REQUESTED_SPEC_EXECUTOR_NOT_INSTALLED", ["schema_version"]);
    }
    if (declaration.schema_version !== IMPORTED_ALPHA_PROFILE.source_contract || declaration.entrypoint !== entrypoint) {
      return reject("The imported Alpha source declaration no longer matches its immutable entrypoint.", "ALPHA_DECLARATION_NOT_PUBLISHED", ["alpha_binding"]);
    }
    if (requested.client.engine_release_id !== IMPORTED_ALPHA_PROFILE.engine_release_id ||
        requested.execution_route !== IMPORTED_ALPHA_PROFILE.execution_route ||
        requested.protocol !== IMPORTED_ALPHA_PROFILE.protocol || !requested.windows || requested.walk_forward) {
      return reject("The imported Alpha adapter accepts only the QuantBT 1.1.1 three-window signal-notional profile.",
        requested.client.engine_release_id !== IMPORTED_ALPHA_PROFILE.engine_release_id ? "ENGINE_RELEASE_MISMATCH"
          : requested.execution_route !== IMPORTED_ALPHA_PROFILE.execution_route ? "PROFILE_ROUTE_NOT_ADMITTED" : "PROFILE_PROTOCOL_NOT_ADMITTED",
        requested.client.engine_release_id !== IMPORTED_ALPHA_PROFILE.engine_release_id ? ["client", "engine_release_id"]
          : requested.execution_route !== IMPORTED_ALPHA_PROFILE.execution_route ? ["execution_route"] : ["protocol"]);
    }
    if (Object.keys(requested.route_params).length !== 0 || requested.optuna_trials !== 1 ||
        requested.early_stopping !== null || Object.keys(requested.optimization_config).length !== 0) {
      const axis = Object.keys(requested.route_params).length ? "route_params" : requested.optuna_trials !== 1 ? "optuna_trials"
        : requested.early_stopping !== null ? "early_stopping" : "optimization_config";
      return reject("The imported Alpha fixed profile accepts no route configuration, optimizer study or early stopping.",
        axis === "route_params" ? "PROFILE_ROUTE_PARAMS_NOT_ADMITTED" : axis === "optuna_trials" ? "PROFILE_TRIAL_COUNT_NOT_ADMITTED"
          : axis === "early_stopping" ? "PROFILE_EARLY_STOPPING_NOT_ADMITTED" : "PROFILE_OPTIMIZER_OVERRIDES_NOT_ADMITTED", [axis]);
    }
    const timeframes = declaration.timeframes;
    if (!Array.isArray(timeframes) || !timeframes.includes(requested.data.timeframe)) {
      return reject("The requested timeframe is outside the imported Alpha declaration.", "ALPHA_TIMEFRAME_NOT_DECLARED", ["data", "timeframe"]);
    }
    if (!Number.isInteger(declaration.warmup_bars) || (declaration.warmup_bars as number) < 0 ||
        (declaration.warmup_bars as number) > 4_096) {
      return reject("The imported Alpha warmup exceeds the restricted execution profile ceiling of 4096 bars.", "IMPORTED_WARMUP_EXCEEDS_EXECUTOR_LIMIT", ["alpha_binding"]);
    }
    const determinism = declaration.determinism;
    if (!determinism || typeof determinism !== "object" || Array.isArray(determinism) ||
        (determinism as Record<string, unknown>).seed_required === true && requested.random_seed === null) {
      return reject("The imported Alpha determinism declaration requires an explicit random seed.", "ALPHA_RANDOM_SEED_REQUIRED", ["random_seed"]);
    }
    const space = declaration.parameter_space;
    if (!space || typeof space !== "object" || Array.isArray(space)) {
      return reject("The imported Alpha parameter declaration is unavailable.", "ALPHA_DECLARATION_NOT_PUBLISHED", ["alpha_binding"]);
    }
    const overrides = new Map(requested.parameter_space_overrides.map((row) => [row.name, row]));
    if (requested.parameter_space_overrides.some((row) => row.kind !== "pin")) {
      return reject("The imported Alpha fixed profile accepts parameter pins only; sweeps require a separately versioned adapter.", "IMPORTED_PARAMETER_PIN_REQUIRED", ["parameter_space_overrides"]);
    }
    const parameters: Record<string, string | number | boolean> = {};
    for (const [name, raw] of Object.entries(space as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return reject(`The imported Alpha parameter ${name} has an invalid declaration.`, "ALPHA_DECLARATION_NOT_PUBLISHED", ["alpha_binding"]);
      }
      const spec = raw as Record<string, unknown>;
      const override = overrides.get(name);
      if (spec.kind === "fixed") {
        const value = spec.value;
        if (!["string", "number", "boolean"].includes(typeof value) ||
            (typeof value === "number" && !Number.isFinite(value))) {
          return reject(`The imported Alpha fixed parameter ${name} is invalid.`, "ALPHA_DECLARATION_NOT_PUBLISHED", ["alpha_binding"]);
        }
        if (override && (override.kind !== "pin" || override.value !== value)) {
          return reject(`The imported Alpha fixed parameter ${name} cannot be overridden.`, "ALPHA_PARAMETER_OUTSIDE_DECLARATION", ["parameter_space_overrides"]);
        }
        parameters[name] = value as string | number | boolean;
      } else {
        if (!override || override.kind !== "pin") {
          return reject(`The imported Alpha parameter ${name} must be pinned for this execution profile.`, "IMPORTED_PARAMETER_PIN_REQUIRED", ["parameter_space_overrides"]);
        }
        if (spec.kind === "categorical") {
          if (!Array.isArray(spec.values) || !spec.values.some((value) => value === override.value)) {
            return reject(`The imported Alpha parameter ${name} is outside its categorical declaration.`, "ALPHA_PARAMETER_OUTSIDE_DECLARATION", ["parameter_space_overrides"]);
          }
        } else if (spec.kind === "int_range" || spec.kind === "float_range") {
          const value = override.value;
          const low = spec.low;
          const high = spec.high;
          const step = spec.step;
          if (typeof value !== "number" || !Number.isFinite(value) || typeof low !== "number" ||
              typeof high !== "number" || typeof step !== "number" || step <= 0 || value < low || value > high ||
              Math.abs((value - low) / step - Math.round((value - low) / step)) > 1e-9 ||
              (spec.kind === "int_range" && !Number.isInteger(value))) {
            return reject(`The imported Alpha parameter ${name} is outside its declared range/step.`, "ALPHA_PARAMETER_OUTSIDE_DECLARATION", ["parameter_space_overrides"]);
          }
        } else {
          return reject(`The imported Alpha parameter ${name} has an unsupported declaration kind.`, "ALPHA_DECLARATION_NOT_PUBLISHED", ["alpha_binding"]);
        }
        parameters[name] = override.value;
      }
      overrides.delete(name);
    }
    if (overrides.size > 0) {
      return reject(`The imported Alpha request pins undeclared parameters: ${[...overrides.keys()].sort().join(", ")}.`, "ALPHA_PARAMETER_NOT_DECLARED", ["parameter_space_overrides"]);
    }
    return { reason: null, parameters };
  }

  /** Advisory S02/P08 check reuses the exact imported executor predicate. */
  importedConfigurationReason(requested: ResearchRequestedSpec, declaration: Record<string, unknown>, entrypoint: string): string | null {
    return this.importedUnsupportedReason(requested, declaration, entrypoint).reason;
  }

  importedConfigurationRefusal(requested: ResearchRequestedSpec, declaration: Record<string, unknown>, entrypoint: string): SetupRefusal | null {
    return this.importedUnsupportedReason(requested, declaration, entrypoint).refusal ?? null;
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
    const row = wfoExecutionRecipe(requested);
    const profile = (row ?? executionRecipe(DELTA_WFO_PROFILE_ID)).public_profile;
    const temporal = requested.schema_version === "research.requested-spec.v2";
    const causal = temporal && requested.optimization_schedule === DELTA_CAUSAL_INNER_PROFILE.optimization_schedule;
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
    if (requested.optimization_mode !== profile.optimization_mode ||
        (!causal && requested.optimization_schedule !== profile.optimization_schedule)) {
      return "The Delta walk-forward profile executes only mode_1_decay with the global schedule.";
    }
    if (requested.route_params && Object.keys(requested.route_params).length !== 0) {
      return "The Delta walk-forward profile does not accept route-specific parameters.";
    }
    // W5a · A10c sibling: the only admitted overrides are pins of the two
    // what-if axes, on a declared step inside the declared range; every other
    // parameter is still searched exactly as the locked profile says.
    const pinReason = siblingPinReason(requested.parameter_space_overrides);
    if (pinReason !== null ||
        (requested.optimization_config && Object.keys(requested.optimization_config).length !== 0)) {
      return pinReason ?? "The Delta walk-forward profile searches only the installed Delta parameter space and accepts no overrides.";
    }
    // Preview's 400-trial GLOBAL exception must not become 400 per fold.
    if (deltaWfoPreviewLongEnabled(this.config) && !causal) {
      // Research preview only: a long study, bounded; the seed stays locked.
      const trials = requested.optuna_trials;
      if (!Number.isSafeInteger(trials) || trials < DELTA_WFO_PREVIEW_LONG_LIMITS.min_trials ||
          trials > DELTA_WFO_PREVIEW_LONG_LIMITS.max_trials) {
        return "The preview long walk-forward profile admits 2 to 400 Optuna trials.";
      }
    } else if (requested.optuna_trials !== profile.trial_default) {
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
    if (temporal && !causal && walkForward.inner !== undefined) {
      return "Inner causal selection requires a retained per-fold selection profile; the installed v2 executor is global only.";
    }
    if (causal && !causalInnerTopologyMatches(walkForward, manifest.topology)) {
      return "The causal inner profile requires a matching engine-built inner plan with 2 to 16 folds inside every outer IS window.";
    }
    if (temporal && (!(DELTA_WFO_V2_PROFILE.frequencies as readonly string[]).includes(walkForward.frequency)
        || !(DELTA_WFO_V2_PROFILE.window_modes as readonly string[]).includes(walkForward.window_mode))) {
      return "The temporal executor admits weekly/monthly/quarterly expanding or rolling folds only.";
    }
    if (!temporal && (walkForward.frequency !== profile.frequency || walkForward.window_mode !== profile.window_mode)) {
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
    const folds = advancedFoldCount(manifest.topology, walkForward.frequency, walkForward.window_mode);
    if (folds === null || folds < profile.fold_bounds.min || folds > profile.fold_bounds.max) {
      return temporal
        ? "The selected temporal walk-forward profile requires 2 to 16 engine-planned outer folds in the preflight topology."
        : "The Delta walk-forward profile admits 2 to 16 weekly expanding folds in the preflight topology.";
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
    if (requested.client.engine_release_id !== P04_DELTA_DECLARED_CONTRACT.execution.engine_release_id) {
      if (!(engine110QualificationEnabled(this.config) && requested.client.engine_release_id === "er_quantbt_110"
          && requested.schema_version === "research.requested-spec.v1" && requested.data.dataset_id === "crypto-binance-1m"
          && requested.data.symbol === "BTCUSDT" && requested.data.timeframe === "1h")) {
        return "The installed Delta adapter is bound to engine release er_quantbt_111.";
      }
    }
    const profile = executionRecipe(P04_FIXED_QUALIFICATION_PROFILE_ID).public_profile;
    if (requested.execution_route !== profile.execution_route || requested.protocol !== profile.protocol) {
      return "The installed Delta adapter currently accepts only the signal-notional three-window profile.";
    }
    if (requested.optimization_mode !== profile.optimization_mode || requested.optimization_schedule !== profile.optimization_schedule) {
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

/**
 * W5a: pins a what-if sibling may carry (the two Screen-07 axes), each on its
 * declared step inside its declared range. Null when admitted.
 */
function siblingPinReason(overrides: ResearchRequestedSpec["parameter_space_overrides"]): string | null {
  if (overrides.length === 0) return null;
  const refused = "The Delta walk-forward profile searches only the installed Delta parameter space and accepts no overrides except what-if pins on rvol and slpercent.";
  if (overrides.length > WHATIF_PROFILE.axes.length) return refused;
  const seen = new Set<string>();
  for (const override of overrides) {
    const axis = WHATIF_PROFILE.axes.find((entry) => entry.parameter === override.name);
    if (override.kind !== "pin" || !axis || seen.has(override.name)) return refused;
    seen.add(override.name);
    const range = P04_DELTA_DECLARED_CONTRACT.parameter_space[axis.parameter as "rvol" | "slpercent"];
    const value = parseDecimal(String(override.value));
    const low = parseDecimal(String(range.minimum));
    const high = parseDecimal(String(range.maximum));
    const step = parseDecimal(String(range.step));
    if (!value || !low || !high || !step) return "A what-if pin must be an exact decimal.";
    const scale = Math.max(value.scale, low.scale, high.scale, step.scale);
    const at = (entry: { units: bigint; scale: number }) => entry.units * 10n ** BigInt(scale - entry.scale);
    const v = at(value);
    if (v < at(low) || v > at(high) || (v - at(low)) % at(step) !== 0n) {
      return `The what-if pin ${override.name} must lie on its declared step inside ${range.minimum}–${range.maximum}.`;
    }
  }
  return null;
}

/** Bind declared inner controls to the actual P08 engine-built plan. */
function causalInnerTopologyMatches(walkForward: NonNullable<ResearchRequestedSpec["walk_forward"]>, topology: Record<string, unknown>): boolean {
  const inner = walkForward.inner, bounds = DELTA_CAUSAL_INNER_PROFILE.inner_constraints;
  if (!inner || !bounds.frequencies.some(value => value === inner.split_frequency) ||
      !bounds.window_modes.some(value => value === inner.window_mode) ||
      !new RegExp(bounds.train_window_pattern).test(inner.train_window)) return false;
  const minimum = inner.min_folds ?? bounds.fold_bounds.min;
  if (minimum < bounds.fold_bounds.min || minimum > bounds.fold_bounds.max ||
      topology.plan_source !== "quantbt.walkforward.WalkForwardEngine.build_folds") return false;
  const plan = topology.inner_validation;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return false;
  const actual = plan as Record<string, unknown>;
  if (actual.split_frequency !== inner.split_frequency || actual.window_mode !== inner.window_mode ||
      actual.train_window !== inner.train_window || actual.min_folds !== minimum) return false;
  const folds = topology.folds;
  return Array.isArray(folds) && folds.length >= DELTA_CAUSAL_INNER_PROFILE.fold_bounds.min &&
    folds.length <= DELTA_CAUSAL_INNER_PROFILE.fold_bounds.max && folds.every(fold => {
      if (!fold || typeof fold !== "object" || Array.isArray(fold)) return false;
      const count = (fold as Record<string, unknown>).inner_fold_count;
      return typeof count === "number" && Number.isSafeInteger(count) && count >= minimum && count <= bounds.fold_bounds.max;
    });
}

/** Fold count of the immutable P08 advanced topology; null for any other shape. */
function advancedFoldCount(topology: Record<string, unknown>, frequency: string, windowMode: string): number | null {
  if (!topology || typeof topology !== "object" || Array.isArray(topology)) return null;
  // Bind the source topology to the admitted request, not W1's constants.
  // W1 still rejects other schedules above; v2 owns its separately pinned set.
  if (topology.protocol !== "advanced_walk_forward" || topology.frequency !== frequency ||
      topology.window_mode !== windowMode || topology.sealed_holdout !== null) {
    return null;
  }
  return Array.isArray(topology.folds) ? topology.folds.length : null;
}
