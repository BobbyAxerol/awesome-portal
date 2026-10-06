import type { ControlApiConfig } from "../config";
import type { PortalUser } from "../domain";
import type { ResearchMetadataRepository } from "./repository";
import type { ResearchPortalAdmission, ResearchEngineAtlasPublic } from "./foundation.contract";
import type { ResearchDatasetCatalogV2 } from "./dataset-index.contract";
import { projectResearchAlphaVersionDeclaration } from "./alpha-version-declaration";
import { researchRunVersionPrecheck } from "./version-admission";
import { IMPORTED_ALPHA_ADAPTER_ID, IMPORTED_ALPHA_PROFILE } from "./imported-alpha.profile";
import { sha256ResearchJson } from "./preflight.service";
import { RunSetupOptionsSchema, type RunSetupContext, type RunSetupProfile, type SetupRefusal } from "./run-setup.contract";
import { WHATIF_PROFILE } from "./whatif.profile";
import {executionRecipe, executionRecipeBudgets, executionRecipeQualification, EXECUTION_RECIPE_REVISION, EXECUTION_SETUP_BOUNDS} from "./execution-recipes";

type Version = NonNullable<Awaited<ReturnType<ResearchMetadataRepository["loadRunAdapterEligibility"]>>>;
/** Version-specific view. This never grants a token, admits a job or mutates defaults. */
export function runSetupOptions(user: PortalUser, config: ControlApiConfig, version: Version,
  context: RunSetupContext & { workspace_id: string }, admission: ResearchPortalAdmission,
  catalog: ResearchDatasetCatalogV2, guards: { label_horizon_bars: number; purge_bars: number; embargo_bars: number } | null,
  engine?: ResearchEngineAtlasPublic) {
  const declaration = projectResearchAlphaVersionDeclaration(version.declaredContract, version.entrypoint);
  const precheck = researchRunVersionPrecheck(user, config, version);
  const imported = version.binding?.adapterId === IMPORTED_ALPHA_ADAPTER_ID;
  const dataset = catalog.datasets.find(row => row.dataset_id === context.dataset_id);
  const symbol = dataset?.symbols.items.find(row => row.symbol === context.symbol);
  const sourceReason = !dataset || dataset.availability !== "available" ? "DATASET_NOT_AVAILABLE"
    : !symbol ? "DATASET_SYMBOL_NOT_PUBLISHED"
    : !dataset.timeframes.some(row => row.timeframe === context.timeframe && row.availability === "available")
      ? "DATASET_TIMEFRAME_NOT_AVAILABLE"
    : !symbol.coverage_by_timeframe.some(row => row.timeframe === context.timeframe && row.availability === "AVAILABLE")
      ? "SYMBOL_TIMEFRAME_COVERAGE_NOT_PUBLISHED" : null;
  const callerReason = precheck.may_create_run ? null : precheck.code;
  const declaredReason = declaration.timeframes.includes(context.timeframe) ? null : "ALPHA_TIMEFRAME_NOT_DECLARED";
  const refusal = (reason_code: string | null, field_path: string[]): SetupRefusal[] => reason_code ? [{reason_code, field_path}] : [];
  const common = [
    ...refusal(callerReason, ["alpha_binding"]),
    ...refusal(sourceReason, sourceReason === "DATASET_NOT_AVAILABLE" ? ["data", "dataset_id"]
      : sourceReason === "DATASET_SYMBOL_NOT_PUBLISHED" ? ["data", "symbol"] : ["data", "timeframe"]),
    ...refusal(declaredReason, ["data", "timeframe"]),
  ];
  const profiles: RunSetupProfile[] = admission.profiles.map(row => {
    const recipe = executionRecipe(row.profile_id);
    const importedSearch=recipe.adapter_kind==="IMPORTED_SEARCH";
    const nonnumeric=Object.values(declaration.parameter_space).some(p=>p.kind==="fixed"?typeof p.value!=="number"
      :p.kind==="categorical"?p.values.some(v=>typeof v!=="number"):false);
    const bindingReason = recipe.source_requirement === "FULL03_IMMUTABLE_DELTA_BINDING"
      ? recipe.descriptor.alpha_binding_requirements.alpha_version_id !== version.alphaVersionId
        || recipe.descriptor.adapter_id !== version.binding?.adapterId
        || recipe.descriptor.adapter_contract_digest !== version.binding?.contractDigest
      : version.binding?.adapterId === "full03.delta-rsi.v1";
    const temporal = row.protocol === "advanced";
    const optimized = executionRecipe(row.profile_id).adapter_kind === "DELTA_THREE_WINDOW_OPTIMIZED";
    const refusals = [...common, ...refusal(importedSearch?!imported?"ALPHA_EXECUTOR_MISMATCH":null:imported || bindingReason ? "ALPHA_EXECUTOR_MISMATCH" : null, ["alpha_binding"]),
      ...refusal(importedSearch&&declaration.warmup_bars>4096?"IMPORTED_WARMUP_EXCEEDS_EXECUTOR_LIMIT":null,["alpha_binding"]),
      ...refusal(importedSearch&&nonnumeric?"IMPORTED_NON_NUMERIC_SEARCH_NOT_QUALIFIED":null,["alpha_binding"]),
      ...refusal(row.dataset_id ? row.dataset_id !== context.dataset_id ? "PROFILE_DATASET_NOT_ADMITTED" : null
        : context.dataset_id === "vn-stock-daily" ? "PROFILE_DATASET_NOT_ADMITTED" : null, ["data", "dataset_id"]),
      ...refusal(row.symbol && row.symbol !== context.symbol ? "PROFILE_SYMBOL_NOT_ADMITTED" : null, ["data", "symbol"]),
      ...refusal("native_input" in recipe.descriptor&&!['BTCUSDT','ETHUSDT','SOLUSDT'].includes(context.symbol)?'PROFILE_SYMBOL_NOT_ADMITTED':null,['data','symbol']),
      ...refusal(row.timeframe !== context.timeframe ? "PROFILE_TIMEFRAME_NOT_ADMITTED" : null, ["data", "timeframe"]),
      ...refusal(row.reason ?? (row.state === "DISABLED" ? "PROFILE_NOT_ENABLED" : null), ["profile_id"])];
    const reason = refusals[0]?.reason_code ?? null;
    return {
      profile_id: row.profile_id, state: reason ? "DISABLED" : "ENABLED", reason_code: reason, refusals,
      engine_release_id: row.engine_release_id, execution_route: row.execution_route,
      protocol: row.protocol as RunSetupProfile["protocol"], optimization_mode: row.optimization_mode,
      optimization_schedule: row.optimization_schedule,
      requested_spec_versions: (row.requested_spec_versions ?? ["research.requested-spec.v1"]) as RunSetupProfile["requested_spec_versions"],
      timeframe: row.timeframe, trial_count: row.trial_count, trial_default: row.trial_default ?? row.trial_count.min,
      trial_scope: row.trial_scope ?? "GLOBAL_STUDY", max_total_trials: row.max_total_trials ?? null,
      seed_policy: row.seed_policy ?? "LOCKED", random_seed: row.random_seed,
      max_span_days: row.max_span_days, fold_bounds: row.fold_bounds,
      frequencies: row.frequencies ?? (row.frequency ? [row.frequency] : []),
      window_modes: (row.window_modes ?? (row.window_mode ? [row.window_mode] : [])) as RunSetupProfile["window_modes"],
      parameter_policy: importedSearch?"DECLARED_SEARCH_WITH_PINS":temporal || optimized ? "DELTA_SEARCH_WITH_QUALIFIED_PINS" : "FIXED_NO_OVERRIDES",
      allowed_pin_names: importedSearch?Object.keys(declaration.parameter_space):(temporal || optimized) && row.optimization_schedule !== "per_fold_decay"
        ? WHATIF_PROFILE.axes.map(axis => axis.parameter) : [],
      inner_validation: row.inner_validation ?? "NOT_APPLICABLE", inner_constraints: row.inner_constraints ?? null,
      temporal_guards: { policy: temporal ? "V1_ABSENT_V2_EXPLICIT" : "NOT_APPLICABLE", defaults: temporal ? guards : null,
        max_bars: temporal ? 10_000 : null, zero_semantics: "ZERO_APPLIES_NO_TEMPORAL_GUARD" },
      independent_holdout: !temporal,
      ...("native_input" in recipe.descriptor ? {native_input:recipe.descriptor.native_input}:{}),
      ...("account" in recipe.descriptor ? {account_model:"QUANTBT_PERCENT_EQUITY_V1" as const,account:recipe.descriptor.account}:{}),
    };
  });
  if (imported) {
    const refusals = [...common,
      ...refusal(declaration.warmup_bars > 4096 ? "IMPORTED_WARMUP_EXCEEDS_EXECUTOR_LIMIT" : null, ["alpha_binding"]),
      ...refusal(context.dataset_id === "vn-stock-daily" ? "IMPORTED_SOURCE_PROFILE_UNQUALIFIED" : null, ["data", "dataset_id"]),
      ...refusal(admission.profiles[0]?.engine_release_id !== IMPORTED_ALPHA_PROFILE.engine_release_id
        || admission.profiles[0]?.reason ? "SOURCE_RELEASE_UNVERIFIED" : null, ["client", "engine_release_id"])];
    const reason = refusals[0]?.reason_code ?? null;
    profiles.push({ profile_id: IMPORTED_ALPHA_PROFILE.profile_id, state: reason ? "DISABLED" : "ENABLED", reason_code: reason, refusals,
      engine_release_id: IMPORTED_ALPHA_PROFILE.engine_release_id, execution_route: IMPORTED_ALPHA_PROFILE.execution_route,
      protocol: "three_window_decay", optimization_mode: "mode_1_decay", optimization_schedule: "global",
      requested_spec_versions: ["research.requested-spec.v1"], timeframe: context.timeframe,
      trial_count: { min: 1, max: 1 }, trial_default: 1, trial_scope: "GLOBAL_STUDY", max_total_trials: null,
      seed_policy: declaration.determinism.seed_required ? "REQUIRED" : "OPTIONAL", random_seed: null,
      max_span_days: null, fold_bounds: null, frequencies: [], window_modes: [], parameter_policy: "DECLARED_PINS_ONLY",
      allowed_pin_names: Object.keys(declaration.parameter_space),
      inner_validation: "NOT_APPLICABLE", inner_constraints: null,
      temporal_guards: { policy: "NOT_APPLICABLE", defaults: null, max_bars: null, zero_semantics: "ZERO_APPLIES_NO_TEMPORAL_GUARD" },
      independent_holdout: true });
  }
  for (const profile of profiles) {
    const row = executionRecipe(profile.profile_id), budgets = executionRecipeBudgets(row, config);
    const qualification = executionRecipeQualification(row.profile_id);
    profile.budget = {...budgets, scope:"DECLARED_CAPS_NOT_RESERVATION_OR_ESTIMATE", profile_digest:row.profile_digest,
      recipe_digest:qualification.recipe_digest,
      qualification:qualification.kind === "LEGACY_COMPATIBILITY_REFERENCE" ? "LEGACY_EXACT_BINDING" : qualification.kind,
      queue_class:row.queue_class, resource_class:row.resource_class, preview_override:budgets.cpu_seconds !== row.budgets.cpu_seconds};
  }
  const payload = { schema_version: "research.run-setup-options.v1" as const, context,
    scope: "CONFIGURATION_FACTS_NOT_RUN_AUTHORIZATION" as const, catalog_revision: catalog.catalog_revision,
    as_of_utc_ms: catalog.as_of_utc_ms, warmup_bars: declaration.warmup_bars,
    source_timezone: context.dataset_id === "vn-stock-daily" ? "Asia/Ho_Chi_Minh" as const : "UTC" as const,
    profiles, recipe_revision:EXECUTION_RECIPE_REVISION,
    preflight_policy:{maximum_active_unbound_per_actor:config.RESEARCH_PREFLIGHT_MAXIMUM_ACTIVE_MANIFESTS_PER_ACTOR ?? 8,
      ttl_seconds:config.RESEARCH_PREFLIGHT_TTL_SECONDS ?? 600, reuse:"IDENTICAL_FRESH_SOURCE_REVALIDATED_UNBOUND_ONLY" as const,
      expiry_extension:false as const},
    ...(engine ? {engine_options: engineSetupOptions(engine, profiles)} : {}), preflight_required: true as const };
  const result = RunSetupOptionsSchema.parse({ ...payload, source_revision: sha256ResearchJson(payload) });
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > EXECUTION_SETUP_BOUNDS.maximum_bytes) throw new Error("Execution setup exceeds its bounded response");
  return result;
}

/** Actual catalogue axes, not Cartesian runnable configurations or new recipes. */
function engineSetupOptions(engine: ResearchEngineAtlasPublic, profiles: RunSetupProfile[]) {
  const choice = (matches: RunSetupProfile[], field_path: string[]) => {
    const selected = matches.find(row => row.state === "ENABLED") ?? matches[0];
    return {state: selected?.state ?? "DISABLED", reason_code: selected?.reason_code ?? (selected ? null : "PROFILE_NOT_OPENED"),
      field_path: selected?.refusals?.[0]?.field_path ?? field_path, profile_ids: matches.map(row => row.profile_id)};
  };
  return {scope: "ENGINE_CATALOGUE_NOT_RUN_AUTHORIZATION" as const,
    execution_routes: engine.routes.map(row => ({value: row.route_id,
      ...choice(profiles.filter(profile => profile.execution_route === row.route_id), ["execution_route"])})),
    optimization_pairs: engine.modes.flatMap(row => row.valid_schedules.map(schedule => ({optimization_mode: row.mode_id,
      optimization_schedule: schedule, ...choice(profiles.filter(profile => profile.optimization_mode === row.mode_id
        && profile.optimization_schedule === schedule), [profiles.some(profile => profile.optimization_mode === row.mode_id)
          ? "optimization_schedule" : "optimization_mode"])}))),
    frequencies: (engine.current_release.walk_forward_options?.frequency ?? []).map(row => ({value: row.value,
      ...choice(profiles.filter(profile => profile.frequencies.includes(row.value)), ["walk_forward", "frequency"])})),
    window_modes: (engine.current_release.walk_forward_options?.window_mode ?? []).map(row => ({value: row.value,
      ...choice(profiles.filter(profile => profile.window_modes.includes(row.value as "expanding" | "rolling")), ["walk_forward", "window_mode"])})),
  };
}
