import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";

import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { newUlid } from "../id";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  RESEARCH_DB_BUDGET,
  type ResearchAlphaVersionDataContract,
  type ResearchPreflightManifestRecord,
  type ResearchScope,
  ResearchMetadataError,
} from "./contracts";
import { projectResearchAlphaVersionDeclaration, ResearchAlphaVersionDeclarationError } from "./alpha-version-declaration";
import {
  ResearchPreflightPrivateResponseSchema,
  ResearchRequestedSpecSchema,
  VnObservedProvenanceSchema,
  type ResearchPreflightPrivateResponse,
  type ResearchPreflightResponse,
  type ResearchRequestedSpec,
} from "./preflight.contract";
import { ResearchPreflightSnapshotClient } from "./preflight.client";
import { preflightGates } from "./preflight-gates";
import { ResearchPreflightError } from "./preflight.error";
import { ResearchMetadataRepository } from "./repository";
import { VN_OBSERVED_FIXED_PROFILE } from "./vn-observed-fixed.profile";

const DEFAULT_COLUMNS = ["open", "high", "low", "close", "volume"] as const;
const MAX_ALPHA_WARMUP_BARS = 100_000;

/** Deterministic JSON equivalent to Python P08 `canonical_json`. */
export function canonicalResearchJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          // Python's `sort_keys=True` uses Unicode code-point ordering. Do
          // not use localeCompare here: locale collation can produce a
          // different requested-spec SHA for valid mixed-case option keys.
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

export function sha256ResearchJson(value: unknown): string {
  return createHash("sha256").update(canonicalResearchJson(value), "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

interface ResolvedSourceRequirements {
  requiredColumns: readonly string[];
  warmupBars: number;
  requiresFunding: boolean;
  /** CG-P08-05: swept dimensions after overrides; P08's private side applies the ceiling. */
  sweptDimensions: number;
}

/**
 * CG-P08-05: swept dimensions, counted from the immutable declaration.
 *
 * A declared range or categorical parameter is swept unless the request pins
 * it; a `fixed` declaration never is. A scratch request has no declaration,
 * so only its explicit sweep overrides count.
 */
export function sweptDimensionCount(
  declaredSpace: Readonly<Record<string, { kind: string }>> | null,
  spec: ResearchRequestedSpec,
): number {
  if (declaredSpace === null) {
    return spec.parameter_space_overrides.filter((override) => override.kind === "sweep").length;
  }
  const pinned = new Set(spec.parameter_space_overrides.filter((override) => override.kind === "pin").map((override) => override.name));
  return Object.entries(declaredSpace).filter(([name, declared]) => declared.kind !== "fixed" && !pinned.has(name)).length;
}

/** P08 checks only immutable P07 declarations; preflight is not execution admission. */
export function assertDeclaredOptimization(alpha: ResearchAlphaVersionDataContract, spec: ResearchRequestedSpec): void {
  let declaration: ReturnType<typeof projectResearchAlphaVersionDeclaration>;
  try {
    declaration = projectResearchAlphaVersionDeclaration(alpha.declaredContract, alpha.entrypoint);
  } catch (error) {
    if (!(error instanceof ResearchAlphaVersionDeclarationError)) throw error;
    throw new ResearchPreflightError("RESEARCH_PREFLIGHT_INVALID", "The bound AlphaVersion declaration is unavailable.", 409, {
      gate: "alpha_declaration", field_path: ["alpha_binding"],
    });
  }
  if (declaration.determinism.seed_required && spec.random_seed === null) {
    throw new ResearchPreflightError("RESEARCH_PREFLIGHT_INVALID", "The bound AlphaVersion requires random_seed.", 409, {
      gate: "alpha_declaration", field_path: ["random_seed"],
    });
  }
  const sameScalar = (left: unknown, right: unknown): boolean =>
    typeof left === typeof right && left === right;
  const rangeContains = (value: unknown, low: number, high: number, step: number, integral: boolean): boolean => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high ||
        (integral && !Number.isInteger(value))) return false;
    const steps = (value - low) / step;
    return Math.abs(steps - Math.round(steps)) <= 1e-9;
  };
  for (const override of spec.parameter_space_overrides) {
    const declared = declaration.parameter_space[override.name];
    if (!declared) {
      throw new ResearchPreflightError("RESEARCH_PREFLIGHT_INVALID", "A parameter override is not declared by the bound AlphaVersion.", 409, {
        gate: "alpha_declaration", field_path: ["parameter_space_overrides"],
      });
    }
    let valid = false;
    if (override.kind === "pin") {
      if (declared.kind === "fixed") valid = sameScalar(override.value, declared.value);
      else if (declared.kind === "categorical") valid = declared.values.some((value) => sameScalar(override.value, value));
      else valid = rangeContains(override.value, declared.low, declared.high, declared.step, declared.kind === "int_range");
    } else if (declared.kind === "int_range" || declared.kind === "float_range") {
      valid = rangeContains(override.low, declared.low, declared.high, declared.step, declared.kind === "int_range") &&
        rangeContains(override.high, declared.low, declared.high, declared.step, declared.kind === "int_range") &&
        typeof override.low === "number" && typeof override.high === "number" && override.low <= override.high;
    }
    if (!valid) {
      throw new ResearchPreflightError("RESEARCH_PREFLIGHT_INVALID", "A parameter override exceeds the bound AlphaVersion declaration.", 409, {
        gate: "alpha_declaration", field_path: ["parameter_space_overrides"],
      });
    }
  }
}

@Injectable()
export class ResearchPreflightService {
  constructor(
    private readonly repository: ResearchMetadataRepository,
    private readonly snapshotClient: ResearchPreflightSnapshotClient,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async create(
    user: PortalUser,
    scope: ResearchScope,
    requestedSpec: ResearchRequestedSpec,
    requestId: string,
  ): Promise<ResearchPreflightResponse> {
    const requested = requestedSpec as unknown as Record<string, unknown>;
    this.assertPersistableDocument(
      "requested specification",
      requested,
      "RESEARCH_PREFLIGHT_INVALID",
      400,
    );
    const requestedSpecDigest = sha256ResearchJson(requested);
    // Bound only this actor's expired metadata before asking Portal API for a
    // potentially reusable shared snapshot. This never deletes source data.
    await this.repository.cleanupExpiredPreflightManifests(
      scope,
      Math.min(8, this.config.RESEARCH_PREFLIGHT_MAXIMUM_ACTIVE_MANIFESTS_PER_ACTOR),
    );
    const requirements = await this.resolveRequirements(scope, requestedSpec);
    const privateResult = await this.snapshotClient.create(user, {
      requestedSpec: requested,
      requestedSpecDigest,
      requiredColumns: requirements.requiredColumns,
      warmupBars: requirements.warmupBars,
      requiresFunding: requirements.requiresFunding,
      sweptDimensions: requirements.sweptDimensions,
      requestId,
    });
    this.assertPrivateTruth(privateResult, requestedSpecDigest, requestedSpec);
    this.assertPersistablePrivateResult(privateResult);
    const preflightToken = newUlid("rpft");
    const manifestDigest = this.manifestDigest(privateResult, requestedSpecDigest);
    const expiresAt = new Date(Date.now() + this.config.RESEARCH_PREFLIGHT_TTL_SECONDS * 1_000);
    const stored = await this.repository.storePreflightManifest(
      scope,
      {
        preflightToken,
        requestedSpecDigest,
        effectiveSpecDigest: privateResult.effective_spec_digest,
        datasetBindingDigest: privateResult.dataset_binding_digest,
        manifestDigest,
        requestedSpec: requested,
        effectiveSpec: privateResult.effective_spec,
        datasetBinding: privateResult.dataset_binding,
        topology: privateResult.topology,
        resourceEstimate: privateResult.resource_estimate,
        snapshot: privateResult.snapshot,
        expiresAt,
      },
      this.config.RESEARCH_PREFLIGHT_MAXIMUM_ACTIVE_MANIFESTS_PER_ACTOR,
    );
    return this.toResponse(stored);
  }

  async get(scope: ResearchScope, preflightToken: string): Promise<ResearchPreflightResponse> {
    return this.toResponse(await this.repository.loadPreflightManifest(scope, preflightToken));
  }

  /** P10 must call this rather than trusting a browser-held token/digest pair. */
  async assertFreshForRequestedSpec(
    scope: ResearchScope,
    preflightToken: string,
    requestedSpec: ResearchRequestedSpec,
  ): Promise<ResearchPreflightManifestRecord> {
    return this.repository.assertPreflightManifestFresh(
      scope,
      preflightToken,
      sha256ResearchJson(requestedSpec),
    );
  }

  private async resolveRequirements(
    scope: ResearchScope,
    requestedSpec: ResearchRequestedSpec,
  ): Promise<ResolvedSourceRequirements> {
    if (!requestedSpec.alpha_binding) {
      return {
        requiredColumns: DEFAULT_COLUMNS, warmupBars: 0, requiresFunding: false,
        sweptDimensions: sweptDimensionCount(null, requestedSpec),
      };
    }
    const alpha = await this.repository.loadAlphaVersionDataContract(
      scope,
      requestedSpec.alpha_binding.alpha_id,
      requestedSpec.alpha_binding.alpha_version_id,
    );
    assertDeclaredOptimization(alpha, requestedSpec);
    const requirements = this.parseAlphaRequirements(alpha, requestedSpec.data.timeframe);
    const declaration = projectResearchAlphaVersionDeclaration(alpha.declaredContract, alpha.entrypoint);
    return { ...requirements, sweptDimensions: sweptDimensionCount(declaration.parameter_space, requestedSpec) };
  }

  private parseAlphaRequirements(
    alpha: ResearchAlphaVersionDataContract,
    selectedTimeframe: string,
  ): Omit<ResolvedSourceRequirements, "sweptDimensions"> {
    const contract = alpha.declaredContract;
    const columns = contract.required_columns;
    const timeframes = contract.timeframes;
    const warmup = contract.warmup_bars;
    if (!Array.isArray(columns) || columns.length === 0 || columns.length > DEFAULT_COLUMNS.length ||
        columns.some((column) => typeof column !== "string" || !DEFAULT_COLUMNS.includes(column as typeof DEFAULT_COLUMNS[number])) ||
        new Set(columns).size !== columns.length) {
      throw new ResearchPreflightError(
        "RESEARCH_PREFLIGHT_REQUIRED_COLUMNS_UNAVAILABLE",
        "The bound AlphaVersion does not declare a compatible bounded candle-input contract.",
        409,
        { gate: "required_inputs", field_path: ["alpha_binding"] },
      );
    }
    if (!Array.isArray(timeframes) || !timeframes.includes(selectedTimeframe)) {
      throw new ResearchPreflightError(
        "RESEARCH_PREFLIGHT_DATA_UNAVAILABLE",
        "The selected timeframe is not declared by the bound AlphaVersion.",
        409,
        { gate: "alpha_declaration", field_path: ["data", "timeframe"] },
      );
    }
    if (!Number.isSafeInteger(warmup) || typeof warmup !== "number" || warmup < 0 || warmup > MAX_ALPHA_WARMUP_BARS) {
      throw new ResearchPreflightError(
        "RESEARCH_PREFLIGHT_WARMUP_UNAVAILABLE",
        "The bound AlphaVersion does not declare a valid warmup boundary.",
        409,
        { gate: "warmup_available", field_path: ["alpha_binding"] },
      );
    }
    // P07's admitted source contract has no funding field. A future version
    // must add a published adapter/contract rather than smuggling it through
    // this metadata path, so false is an explicit current-source fact.
    return { requiredColumns: columns as readonly string[], warmupBars: warmup, requiresFunding: false };
  }

  private assertPrivateTruth(
    result: ResearchPreflightPrivateResponse,
    requestedSpecDigest: string,
    requestedSpec: ResearchRequestedSpec,
  ): void {
    const effectiveCapability = result.effective_spec.engine;
    const effectiveBinding = result.effective_spec.data_binding;
    const binding = result.dataset_binding;
    const snapshot = result.snapshot;
    if (result.requested_spec_digest !== requestedSpecDigest ||
        result.effective_spec.requested_spec_digest !== requestedSpecDigest ||
        sha256ResearchJson(result.effective_spec) !== result.effective_spec_digest ||
        sha256ResearchJson(result.dataset_binding) !== result.dataset_binding_digest ||
        !isRecord(effectiveCapability) ||
        canonicalResearchJson(effectiveCapability) !== canonicalResearchJson(result.capability) ||
        // A private adapter must not be able to make independently valid
        // sub-documents point at different data. These are the exact
        // cross-document facts P10 will bind to a worker later.
        binding.snapshot_id !== snapshot.snapshot_id ||
        binding.snapshot_content_hash !== snapshot.snapshot_content_hash ||
        binding.market_content_hash !== snapshot.market_content_hash ||
        binding.source_manifest_digest !== snapshot.source_manifest_digest ||
        effectiveBinding.snapshot_id !== binding.snapshot_id ||
        effectiveBinding.snapshot_content_hash !== binding.snapshot_content_hash ||
        effectiveBinding.market_content_hash !== binding.market_content_hash ||
        effectiveBinding.source_manifest_digest !== binding.source_manifest_digest ||
        effectiveBinding.timezone !== binding.timezone ||
        effectiveBinding.calendar_policy !== binding.calendar_policy ||
        effectiveBinding.closed_bar_policy !== binding.closed_bar_policy ||
        // New observed-date custody is one binding, not independently valid
        // index documents for different snapshots. Legacy crypto has no such field.
        binding.closed_bar_policy === "SOURCE_LOCAL_DATE_OBSERVED_AT_AS_OF_V1" && (
          snapshot.closed_bar_policy !== binding.closed_bar_policy || snapshot.timezone !== binding.timezone
          || canonicalResearchJson(effectiveBinding.provenance) !== canonicalResearchJson(binding.provenance)
          || Object.entries(binding.provenance!).some(([key, value]) => snapshot.provenance[key] !== value)) ||
        effectiveBinding.range_start_utc_ms !== binding.range_start_utc_ms ||
        effectiveBinding.range_end_exclusive_utc_ms !== binding.range_end_exclusive_utc_ms ||
        canonicalResearchJson(effectiveBinding.columns) !== canonicalResearchJson(snapshot.columns) ||
        effectiveBinding.warmup_bars !== snapshot.warmup.requested_bars ||
        result.capability.optimization_mode !== requestedSpec.optimization_mode ||
        result.capability.optimization_schedule !== requestedSpec.optimization_schedule ||
        result.effective_spec.optimization.trial_count !== requestedSpec.optuna_trials ||
        result.effective_spec.optimization.early_stopping !== requestedSpec.early_stopping ||
        result.effective_spec.optimization.random_seed !== requestedSpec.random_seed ||
        canonicalResearchJson(result.effective_spec.topology) !== canonicalResearchJson(result.topology)) {
      throw new ResearchPreflightError(
        "RESEARCH_PREFLIGHT_REJECTED",
        "Research preflight returned a digest-inconsistent manifest.",
        502,
      );
    }
    const vn = VN_OBSERVED_FIXED_PROFILE;
    const qualifiedObservedSource = this.config.FEATURE_RESEARCH_VN_OBSERVED_PROFILE === "true"
      && requestedSpec.schema_version === "research.requested-spec.v1"
      && requestedSpec.data.dataset_id === vn.dataset_id && requestedSpec.data.symbol === vn.symbol && requestedSpec.data.timeframe === vn.timeframe
      && requestedSpec.execution_route === vn.execution_route && requestedSpec.protocol === vn.protocol
      && requestedSpec.client.engine_release_id === vn.engine_release_id && result.capability.engine_release_id === vn.engine_release_id
      && binding.dataset_id === vn.dataset_id && binding.symbol === vn.symbol && binding.timeframe === vn.timeframe
      && binding.timezone === vn.source_timezone && snapshot.timezone === vn.source_timezone
      && snapshot.calendar_policy === "SOURCE_DECLARED" && binding.calendar_policy === snapshot.calendar_policy
      && snapshot.closed_bar_policy === "SOURCE_LOCAL_DATE_OBSERVED_AT_AS_OF_V1"
      && snapshot.quality.state === "OBSERVED_TAPE_INTEGRITY_ONLY"
      && snapshot.quality.gaps === null && snapshot.quality.gap_ratio === null && snapshot.quality.missing_bar_count === null
      && VnObservedProvenanceSchema.safeParse(binding.provenance).success
      && snapshot.warmup.requested_bars === vn.warmup_bars && snapshot.warmup.bars === vn.warmup_bars
      && snapshot.warmup.start_utc_ms === binding.provenance?.warmup_start_utc_ms;
    const safeSourcePolicy = requestedSpec.data.dataset_id === vn.dataset_id
      ? qualifiedObservedSource : snapshot.closed_bar_policy === "CLOSED_BARS_ONLY";
    if (!safeSourcePolicy ||
        result.capability.preflight_admission !== "PREFLIGHT_ONLY" ||
        result.snapshot.quality.passed !== true) {
      throw new ResearchPreflightError(
        "RESEARCH_PREFLIGHT_REJECTED",
        "Research preflight returned an unsafe admission contract.",
        502,
      );
    }
  }

  private assertPersistablePrivateResult(result: ResearchPreflightPrivateResponse): void {
    for (const [label, value] of [
      ["effective specification", result.effective_spec],
      ["dataset binding", result.dataset_binding],
      ["topology", result.topology],
      ["resource estimate", result.resource_estimate],
      ["snapshot metadata", result.snapshot],
    ] as const) {
      this.assertPersistableDocument(label, value, "RESEARCH_PREFLIGHT_REJECTED", 502);
    }
  }

  private assertPersistableDocument(
    label: string,
    value: Record<string, unknown>,
    code: "RESEARCH_PREFLIGHT_INVALID" | "RESEARCH_PREFLIGHT_REJECTED",
    status: 400 | 502,
  ): void {
    if (Buffer.byteLength(canonicalResearchJson(value), "utf8") > RESEARCH_DB_BUDGET.maxPreflightManifestBytes) {
      throw new ResearchPreflightError(
        code,
        `${label} exceeds the bounded immutable preflight contract.`,
        status,
      );
    }
  }

  private toResponse(record: ResearchPreflightManifestRecord): ResearchPreflightResponse {
    const requested = ResearchRequestedSpecSchema.safeParse(record.requestedSpec);
    if (!requested.success || sha256ResearchJson(requested.data) !== record.requestedSpecDigest) {
      throw new ResearchPreflightError(
        "RESEARCH_PREFLIGHT_REJECTED",
        "Stored Research preflight requested metadata no longer satisfies its immutable contract.",
        502,
      );
    }
    const parsed = ResearchPreflightPrivateResponseSchema.safeParse({
      schema_version: "research.preflight-snapshot.v1",
      requested_spec_digest: record.requestedSpecDigest,
      effective_spec: record.effectiveSpec,
      effective_spec_digest: record.effectiveSpecDigest,
      dataset_binding: record.datasetBinding,
      dataset_binding_digest: record.datasetBindingDigest,
      snapshot: record.snapshot,
      topology: record.topology,
      resource_estimate: record.resourceEstimate,
      capability: isRecord(record.effectiveSpec) ? record.effectiveSpec.engine : undefined,
    });
    if (!parsed.success) {
      throw new ResearchPreflightError(
        "RESEARCH_PREFLIGHT_REJECTED",
        "Stored Research preflight metadata no longer satisfies its immutable contract.",
        502,
      );
    }
    const source = parsed.data;
    this.assertPrivateTruth(source, record.requestedSpecDigest, requested.data);
    if (this.manifestDigest(source, record.requestedSpecDigest) !== record.manifestDigest) {
      throw new ResearchPreflightError(
        "RESEARCH_PREFLIGHT_REJECTED",
        "Stored Research preflight manifest digest no longer matches its immutable metadata.",
        502,
      );
    }
    return {
      schema_version: "research.preflight.v1",
      preflight_token: record.preflightToken,
      issued_at_utc_ms: record.createdAt.getTime(),
      expires_at_utc_ms: record.expiresAt.getTime(),
      gates: preflightGates(source, requested.data),
      // P08 is deliberately preflight-only.  Publish the negative authority
      // rather than making a client infer it from a token, an object state or
      // a browser-held role.  P10 may change this only alongside a create
      // route that evaluates the same server-side predicate at execution.
      may_create_run: false,
      requested_spec_digest: record.requestedSpecDigest,
      effective_spec_digest: record.effectiveSpecDigest,
      dataset_binding_digest: record.datasetBindingDigest,
      manifest_digest: record.manifestDigest,
      effective_spec: source.effective_spec,
      dataset_binding: source.dataset_binding,
      snapshot: source.snapshot,
      topology: source.topology,
      resource_estimate: source.resource_estimate,
      capability: source.capability,
    };
  }

  private manifestDigest(
    result: ResearchPreflightPrivateResponse,
    requestedSpecDigest: string,
  ): string {
    return sha256ResearchJson({
      schema_version: "research.preflight-manifest.v1",
      requested_spec_digest: requestedSpecDigest,
      effective_spec_digest: result.effective_spec_digest,
      dataset_binding_digest: result.dataset_binding_digest,
      topology_digest: result.topology.topology_digest,
      snapshot: {
        snapshot_id: result.snapshot.snapshot_id,
        snapshot_content_hash: result.snapshot.snapshot_content_hash,
        source_manifest_digest: result.snapshot.source_manifest_digest,
      },
      capability: result.capability,
    });
  }
}

/** Translate repository errors without exposing persistence internals. */
export function asResearchPreflightError(error: unknown): never {
  if (error instanceof ResearchPreflightError) throw error;
  if (error instanceof ResearchMetadataError) {
    const code = error.code;
    if (code === "RESEARCH_PREFLIGHT_NOT_FOUND" || code === "RESEARCH_PREFLIGHT_EXPIRED" || code === "RESEARCH_PREFLIGHT_STALE") {
      throw new ResearchPreflightError(code, error.message, error.status);
    }
    if (code === "RESEARCH_ADMISSION_SATURATED" || code === "RESEARCH_DB_ROLE_UNAVAILABLE") {
      throw new ResearchPreflightError("RESEARCH_PREFLIGHT_UNAVAILABLE", "Research preflight is temporarily unavailable.", 503);
    }
    if (code === "RESEARCH_INVALID_INPUT") {
      throw new ResearchPreflightError("RESEARCH_PREFLIGHT_INVALID", "Invalid Research preflight request.", 400);
    }
    if (code === "RESEARCH_CONCURRENT_TRANSACTION") {
      throw new ResearchPreflightError("RESEARCH_PREFLIGHT_REJECTED", "Research preflight changed concurrently; retry.", 409);
    }
  }
  throw error;
}
