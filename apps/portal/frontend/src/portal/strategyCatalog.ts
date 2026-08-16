/**
 * Strategy catalog — one list for the New Run picker.
 *
 * Per `upgrade/STRATEGY_IMPORT_AND_RUNTIME_CONTRACT.md` §1, the picker reads
 * two projections and they go through the same adapter port downstream:
 *
 *   GET /api/strategies              built-in registry projection
 *   GET /api/v1/alphas               imported alpha registry projection
 *   GET /api/v1/portal/capabilities  which protocols the exact engine release
 *                                    is certified for
 *
 * Nothing here hard-codes `delta-rsi-polynomial-alpha`, a protocol list or an
 * endpoint id: a strategy is runnable only when the capability manifest of the
 * installed release says so (§4 — "khai báo, không suy đoán").
 *
 * DISCREPANCY (evidence: `apps/portal/registry/openapi/portal-api.openapi.json`
 * — `/api/v1/alphas` responds `{additionalProperties: true}` and
 * `/api/v1/portal/capabilities` responds `{}`): neither projection is named in
 * `components/schemas`, so codegen produces no type. Both are narrowed at the
 * boundary below and a Backend request is open with codex.
 */
import type { StrategyResponse } from "./contracts";

/* -------------------------------------------------------------------------
 * Boundary narrowing for the untyped projections
 * ---------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export interface EngineCapability {
  capabilityId: string;
  /** Run protocol this capability certifies, e.g. `three_window_decay`. */
  protocol: string;
  /** QuantBT public endpoint family, e.g. `walk_forward`. */
  endpointId: string;
  engineReleaseId: string;
  certified: boolean;
  maxTrials: number | null;
  maxParameterSpaceEntries: number | null;
}

export interface EngineRelease {
  releaseId: string;
  packageName: string;
  version: string;
}

export interface CapabilityDocument {
  releases: EngineRelease[];
  capabilities: EngineCapability[];
  /** Whether the declared release is the one actually installed. */
  installedMatches: boolean | null;
  installedDetail: string | null;
}

export function parseCapabilities(raw: unknown): CapabilityDocument {
  if (!isRecord(raw)) {
    return { releases: [], capabilities: [], installedMatches: null, installedDetail: null };
  }
  const releases = Array.isArray(raw.engine_releases) ? raw.engine_releases : [];
  const capabilities = Array.isArray(raw.capabilities) ? raw.capabilities : [];
  const installed = isRecord(raw.installed) ? raw.installed : null;

  return {
    releases: releases.filter(isRecord).map((release) => ({
      releaseId: stringOr(release.release_id, ""),
      packageName: stringOr(release.package, ""),
      version: stringOr(release.version, ""),
    })),
    capabilities: capabilities.filter(isRecord).map((capability) => {
      const requirements = isRecord(capability.requirements) ? capability.requirements : {};
      const profile = isRecord(requirements.resource_profile) ? requirements.resource_profile : {};
      return {
        capabilityId: stringOr(capability.capability_id, ""),
        protocol: stringOr(capability.protocol, ""),
        endpointId: stringOr(capability.endpoint_id, ""),
        engineReleaseId: stringOr(capability.engine_release_id, ""),
        certified: capability.certified === true,
        maxTrials:
          typeof profile.max_optuna_trials === "number" ? profile.max_optuna_trials : null,
        maxParameterSpaceEntries:
          typeof profile.max_parameter_space_entries === "number"
            ? profile.max_parameter_space_entries
            : null,
      };
    }),
    installedMatches:
      installed && typeof installed.matches === "boolean" ? installed.matches : null,
    installedDetail: installed && typeof installed.detail === "string" ? installed.detail : null,
  };
}

export interface ImportedAlpha {
  alphaId: string;
  version: string;
  name: string;
  ownerTeam: string | null;
  entrypoint: string | null;
  artifactDigest: string | null;
  family: string | null;
  inputKind: string | null;
  supportedEndpointIds: string[];
  executionContracts: string[];
  assetClasses: string[];
  columns: string[];
  timeframes: string[];
  warmupBars: number | null;
  managerExposed: string[];
  lifecycleStage: string | null;
  quarantined: boolean;
  certification: string | null;
}

export function parseAlphas(raw: unknown): ImportedAlpha[] {
  if (!isRecord(raw) || !Array.isArray(raw.alphas)) return [];
  return raw.alphas.filter(isRecord).map((alpha) => {
    const strategy = isRecord(alpha.strategy) ? alpha.strategy : {};
    const data = isRecord(alpha.data_requirements) ? alpha.data_requirements : {};
    const parameters = isRecord(alpha.parameters) ? alpha.parameters : {};
    const lifecycle = isRecord(alpha.lifecycle) ? alpha.lifecycle : {};
    const owner = isRecord(alpha.owner) ? alpha.owner : {};
    return {
      alphaId: stringOr(alpha.alpha_id, ""),
      version: stringOr(alpha.version, ""),
      name: stringOr(alpha.name, stringOr(alpha.alpha_id, "")),
      ownerTeam: typeof owner.team === "string" ? owner.team : null,
      entrypoint: typeof alpha.entrypoint === "string" ? alpha.entrypoint : null,
      artifactDigest: typeof alpha.artifact_digest === "string" ? alpha.artifact_digest : null,
      family: typeof strategy.family === "string" ? strategy.family : null,
      inputKind: typeof strategy.input_kind === "string" ? strategy.input_kind : null,
      supportedEndpointIds: stringList(strategy.supported_endpoint_ids),
      executionContracts: stringList(strategy.execution_contracts),
      assetClasses: stringList(data.asset_classes),
      columns: stringList(data.columns),
      timeframes: stringList(data.timeframes),
      warmupBars: typeof data.warmup_bars === "number" ? data.warmup_bars : null,
      managerExposed: stringList(parameters.manager_exposed),
      lifecycleStage: typeof lifecycle.stage === "string" ? lifecycle.stage : null,
      quarantined: lifecycle.quarantined === true,
      certification: typeof lifecycle.certification === "string" ? lifecycle.certification : null,
    };
  });
}

/* -------------------------------------------------------------------------
 * Unified catalog entry
 * ---------------------------------------------------------------------- */

export type StrategyOrigin = "builtin" | "imported";

export interface CatalogEntry {
  /** The id sent as `strategy_id` in a run request. */
  strategyId: string;
  displayName: string;
  version: string;
  origin: StrategyOrigin;
  /** Present for built-ins: the runnable contract from `/api/strategies`. */
  runtime: StrategyResponse | null;
  /** Present for imported alphas: manifest metadata from `/api/v1/alphas`. */
  manifest: ImportedAlpha | null;
  family: string | null;
  defaultTimeframe: string | null;
  timeframes: string[];
  requiredColumns: string[];
  warmupBars: number | null;
  supportedEndpointIds: string[];
  lifecycleStage: string | null;
  certification: string | null;
  quarantined: boolean;
  /**
   * `null` when the strategy can be run now; otherwise the specific reason it
   * cannot. The picker shows the entry either way — hiding it would make the
   * catalog look smaller than it is (v0.4 §P0.5).
   */
  blockedReason: string | null;
}

/**
 * Builds the catalog.
 *
 * A built-in strategy is runnable because `/api/strategies` publishes its
 * runtime contract. An imported alpha is listed from its manifest but is only
 * runnable once the same `strategy_id` also appears in the runtime registry —
 * which is exactly the registration step in the import contract §5. Until
 * then it carries an explicit reason rather than a disabled control with no
 * explanation.
 */
export function buildCatalog(
  strategies: StrategyResponse[] | undefined,
  alphas: ImportedAlpha[] | undefined,
  capabilities: CapabilityDocument | undefined,
): CatalogEntry[] {
  const runtimeById = new Map((strategies ?? []).map((s) => [s.strategy_id, s]));
  const certifiedEndpoints = new Set(
    (capabilities?.capabilities ?? []).filter((c) => c.certified).map((c) => c.endpointId),
  );

  const entries: CatalogEntry[] = [];
  const claimed = new Set<string>();

  for (const alpha of alphas ?? []) {
    // The manifest id and the runtime id are allowed to differ (the manifest
    // is `delta-rsi-polynomial`, the runtime id `delta-rsi-polynomial-alpha`),
    // so match on either the exact id or the entrypoint-registered one.
    const runtime =
      runtimeById.get(alpha.alphaId) ??
      [...runtimeById.values()].find((s) => s.strategy_id.startsWith(alpha.alphaId)) ??
      null;

    const endpointCertified =
      alpha.supportedEndpointIds.length === 0 ||
      alpha.supportedEndpointIds.some((id) => certifiedEndpoints.has(id));

    const blockedReason = alpha.quarantined
      ? "Alpha đang bị quarantine — không thể chạy cho tới khi gỡ."
      : !runtime
        ? "Alpha đã import nhưng chưa đăng ký vào runtime registry, nên chưa chạy được."
        : !endpointCertified
          ? `Engine release hiện tại chưa certify endpoint ${alpha.supportedEndpointIds.join(", ")}.`
          : null;

    if (runtime) claimed.add(runtime.strategy_id);

    entries.push({
      strategyId: runtime?.strategy_id ?? alpha.alphaId,
      displayName: alpha.name,
      version: alpha.version,
      origin: "imported",
      runtime,
      manifest: alpha,
      family: alpha.family,
      defaultTimeframe: runtime?.default_timeframe ?? alpha.timeframes[0] ?? null,
      timeframes: alpha.timeframes,
      requiredColumns: alpha.columns.length ? alpha.columns : (runtime?.required_columns ?? []),
      warmupBars: alpha.warmupBars,
      supportedEndpointIds: alpha.supportedEndpointIds,
      lifecycleStage: alpha.lifecycleStage,
      certification: alpha.certification,
      quarantined: alpha.quarantined,
      blockedReason,
    });
  }

  for (const strategy of strategies ?? []) {
    if (claimed.has(strategy.strategy_id)) continue;
    entries.push({
      strategyId: strategy.strategy_id,
      displayName: strategy.display_name,
      version: strategy.version,
      origin: "builtin",
      runtime: strategy,
      manifest: null,
      family: null,
      defaultTimeframe: strategy.default_timeframe,
      timeframes: [],
      requiredColumns: strategy.required_columns,
      warmupBars: null,
      supportedEndpointIds: [],
      lifecycleStage: null,
      certification: null,
      quarantined: false,
      blockedReason: null,
    });
  }

  return entries.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Protocols the installed engine release is certified for.
 *
 * Returns an empty list when the manifest is unavailable — the caller must
 * then say so rather than falling back to a hard-coded protocol list.
 */
export function certifiedProtocols(capabilities: CapabilityDocument | undefined): string[] {
  const seen = new Set<string>();
  for (const capability of capabilities?.capabilities ?? []) {
    if (capability.certified && capability.protocol) seen.add(capability.protocol);
  }
  return [...seen].sort();
}

/** Resource ceiling the manifest declares for a protocol, if any. */
export function protocolLimits(
  capabilities: CapabilityDocument | undefined,
  protocol: string,
): { maxTrials: number | null; maxParameterSpaceEntries: number | null } {
  const match = (capabilities?.capabilities ?? []).find(
    (capability) => capability.protocol === protocol && capability.certified,
  );
  return {
    maxTrials: match?.maxTrials ?? null,
    maxParameterSpaceEntries: match?.maxParameterSpaceEntries ?? null,
  };
}
