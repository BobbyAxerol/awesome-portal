"""Source-controlled QuantBT Research Engine Atlas (Research Loop P04).

The catalog is intentionally descriptive.  It identifies which public QuantBT
constructors exist in the pinned release, but it does *not* grant a browser or
a future run type permission to invoke every constructor.  The four capability
axes keep those facts separate:

* engine — the published wheel exposes the constructor;
* integration — Portal has a typed adapter/request mapping;
* evidence — the route has the required evidence surface;
* admission — a Research workflow has allowed that tuple to run.

This prevents an unsupported Portal route from being mislabeled as an engine
refusal, and prevents wheel presence from silently admitting a new workload.
"""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from portal_api.adapters.quantbt import PUBLIC_ROUTE_FACTORIES, QuantBTGateway
from portal_api.services.engine_capabilities import (
    EngineCapabilityError,
    EngineCapabilityLoadError,
    EngineCapabilityService,
    installed_dist_info_record_hash,
)

CATALOG_FILE = "research-engine-catalog.v1.json"
CATALOG_SCHEMA = "research-engine-catalog.v1.schema.json"
MAX_CATALOG_BYTES = 256 * 1024

FROZEN_ROUTE_IDS = tuple(PUBLIC_ROUTE_FACTORIES)
FROZEN_MODE_IDS = (
    "mode_1_decay",
    "mode_2_sbb",
    "mode_3_flat_minima",
    "mode_4_is_only_robust",
    "mode_5_full_robust",
)
FROZEN_CLAIM_IDS = (
    "close_target_v2",
    "intrabar_bracket_v1",
    "fill_replay",
    "event_lifecycle",
    "reactive",
    "native_portfolio",
    "nautilus",
)
FROZEN_EVIDENCE_FIELDS = (
    "engine_release_id",
    "route_id",
    "effective_spec_digest",
    "market_data_content_hash",
    "report_level",
    "selection_resolution",
    "result_summary",
)
FROZEN_OPTIMIZER_GROUP_IDS = (
    "study",
    "sampler",
    "objective",
    "candidate_selection",
)


class ResearchEngineCatalogError(ValueError):
    """A caller supplied an invalid catalog-backed Research selection."""


class ResearchEngineCatalogLoadError(RuntimeError):
    """The source-controlled catalog cannot safely be used."""

    def __init__(self, code: str, detail: str) -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class CatalogModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class NativeDependency(CatalogModel):
    package: str = Field(pattern=r"^[a-z][a-z0-9_-]{1,63}$")
    version: str = Field(pattern=r"^[0-9]+\.[0-9]+\.[0-9]+[a-z0-9.+]*$")
    dist_info_record_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    wheel_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    platform_marker: str = Field(min_length=3, max_length=180)


OptimizerDefaultScalar = str | int | float | bool | None


class OptimizerDefaultField(CatalogModel):
    field_id: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    default_value: OptimizerDefaultScalar | tuple[OptimizerDefaultScalar, ...]
    value_source: Literal["RELEASE_DEFAULT"]
    override_state: Literal["LOCKED", "OVERRIDE_ALLOWED"]
    detail: str = Field(min_length=1, max_length=400)


class OptimizerDefaultGroup(CatalogModel):
    group_id: Literal["study", "sampler", "objective", "candidate_selection"]
    fields: tuple[OptimizerDefaultField, ...] = Field(min_length=1, max_length=24)


class OptimizerDefaults(CatalogModel):
    schema_version: Literal["research.optimizer-defaults.v1"]
    groups: tuple[OptimizerDefaultGroup, ...] = Field(min_length=4, max_length=4)


class SubmissionConstraints(CatalogModel):
    """Exact current New Run admission, intentionally distinct from defaults."""

    profile_id: Literal["p10.fixed-qualification.v1"]
    optimization_overrides: Literal["FORBIDDEN"]
    accepted_trial_count: Literal[1]
    early_stopping: Literal["MUST_BE_NULL"]
    random_seed: Literal["MUST_BE_NULL"]
    reason: str = Field(min_length=1, max_length=500)


class SourceLocator(CatalogModel):
    """Where a mode fact is stated in the pinned engine package (RF02-B1).

    `sha256` is the file digest the wheel RECORD carries; `anchor` must occur
    inside `lines`. Both are checked against the installed release in tests,
    so a fact cannot drift from its source silently.
    """

    path: str = Field(pattern=r"^quantbt/[A-Za-z0-9_./-]{1,200}\.py$")
    lines: str = Field(pattern=r"^[1-9][0-9]{0,5}-[1-9][0-9]{0,5}$")
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    anchor: str = Field(min_length=1, max_length=200)


class WalkForwardOptionValue(CatalogModel):
    value: str = Field(pattern=r"^[a-z][a-z0-9_]{1,31}$")
    admission: Literal["ADMITTED", "NOT_ADMITTED"]
    reason: str | None = Field(default=None, min_length=1, max_length=400)

    @model_validator(mode="after")
    def validate_reason(self) -> "WalkForwardOptionValue":
        if (self.admission == "NOT_ADMITTED") != (self.reason is not None):
            raise ValueError("a NOT_ADMITTED value needs a reason and an admitted one has none")
        return self


class WalkForwardOptions(CatalogModel):
    """Published walk-forward values for New Run (RF02-B2).

    The engine's accepted values, each with the Portal's admission, so the
    browser renders the contract instead of a hardcoded list and preflight's
    refusal of a value is something the reader was told beforehand.
    """

    schema_version: Literal["research.walk-forward-options.v1"]
    frequency: tuple[WalkForwardOptionValue, ...] = Field(min_length=1, max_length=8)
    frequency_default: str
    window_mode: tuple[WalkForwardOptionValue, ...] = Field(min_length=1, max_length=4)
    window_mode_default: str
    split_mode_form: Literal["source_instant"]
    split_mode_rule: str = Field(min_length=1, max_length=400)
    source: tuple[SourceLocator, ...] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def validate_defaults(self) -> "WalkForwardOptions":
        for values, default, label in (
            (self.frequency, self.frequency_default, "frequency"),
            (self.window_mode, self.window_mode_default, "window_mode"),
        ):
            admitted = {item.value for item in values if item.admission == "ADMITTED"}
            if default not in admitted:
                raise ValueError(f"{label}_default must be an admitted value")
            if len({item.value for item in values}) != len(values):
                raise ValueError(f"{label} values must be unique")
        return self

    def admitted(self, field: Literal["frequency", "window_mode"]) -> frozenset[str]:
        return frozenset(item.value for item in getattr(self, field) if item.admission == "ADMITTED")


class EngineRelease(CatalogModel):
    release_id: str = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    role: Literal["current", "historical_reader"]
    package: str = Field(pattern=r"^[a-z][a-z0-9_-]{1,63}$")
    version: str = Field(pattern=r"^[0-9]+\.[0-9]+\.[0-9]+[a-z0-9.+]*$")
    dist_info_record_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    wheel_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    native_dependency: NativeDependency | None = None
    # Current-release descriptive defaults. They are not a run admission:
    # submission_constraints makes that distinction explicit for the browser.
    trial_ceiling: int | None = Field(default=None, ge=1, le=100_000)
    optimizer_defaults: OptimizerDefaults | None = None
    submission_constraints: SubmissionConstraints | None = None
    walk_forward_options: WalkForwardOptions | None = None


class CapabilityAxes(CatalogModel):
    engine: Literal["ENGINE_SUPPORTED", "ENGINE_PARTIAL", "ENGINE_DEFERRED"]
    integration: Literal[
        "ADAPTER_AVAILABLE", "INTEGRATION_GAP", "DEFERRED_BY_PORTAL"
    ]
    evidence: Literal["EVIDENCE_MAPPED", "EVIDENCE_GAP", "NOT_APPLICABLE"]
    admission: Literal["P04_BASELINE_ONLY", "NOT_ADMITTED", "DEFERRED"]


class RouteDescriptor(CatalogModel):
    route_id: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    family: str = Field(pattern=r"^[a-z][a-z0-9_-]{1,63}$")
    execution_contract: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    factory: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    factory_kwargs: dict[str, str] = Field(default_factory=dict)
    backend: str = Field(min_length=1, max_length=80)
    report_levels: tuple[Literal["minimal", "standard", "audit", "score"], ...]
    default_for_new_runs: bool = False
    axes: CapabilityAxes
    reason: str = Field(min_length=1, max_length=500)
    required_input_class: str = Field(min_length=1, max_length=120)


Schedule = Literal["global", "per_fold_decay", "per_fold_causal"]


class NotPublishedFact(CatalogModel):
    state: Literal["NOT_PUBLISHED"]
    reason: str = Field(min_length=1, max_length=400)
    source: SourceLocator | None = None


class ScheduleFact(CatalogModel):
    schedule: Schedule
    validation_claim: str = Field(pattern=r"^[a-z][a-z0-9_]{1,79}$")
    chronological_validation_claim: str = Field(pattern=r"^[a-z][a-z0-9_]{1,79}$")
    causality_claim: str = Field(pattern=r"^[a-z][a-z0-9_]{1,79}$")
    causality_schedule_v2: Literal[
        "retrospective_global_v2",
        "trusted_strategy_global_v2",
        "engine_enforced_per_fold_v2",
        "engine_enforced_nested_v2",
    ]
    oos_use: Literal["USED", "NOT_USED"]
    oos_use_condition: str | None = Field(default=None, min_length=1, max_length=300)
    params_semantics: str = Field(pattern=r"^[a-z][a-z0-9_]{1,79}$")
    cert_cap: NotPublishedFact
    source: tuple[SourceLocator, ...] = Field(min_length=1, max_length=4)


class ObjectiveStage(CatalogModel):
    stage: Literal["is_search", "oos_candidate_selection", "fixed_or_post_selection_evaluation"]
    formula_id: str = Field(pattern=r"^[a-z][a-z0-9_]{1,79}$")
    formula: str = Field(min_length=1, max_length=300)


class ObjectiveCoefficient(CatalogModel):
    name: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    # Exact decimal string, or null when the release leaves it unset.
    release_default: str | None = Field(default=None, pattern=r"^-?[0-9]+(\.[0-9]+)?$")
    note: str | None = Field(default=None, min_length=1, max_length=200)


class ObjectiveFact(CatalogModel):
    state: Literal["PUBLISHED"]
    direction: Literal["maximize", "minimize"]
    selection_metrics: tuple[str, ...] = Field(min_length=1, max_length=8)
    stages: tuple[ObjectiveStage, ...] = Field(min_length=1, max_length=4)
    coefficients: tuple[ObjectiveCoefficient, ...] = Field(max_length=8)
    note: str | None = Field(default=None, min_length=1, max_length=300)
    source: tuple[SourceLocator, ...] = Field(min_length=1, max_length=4)


class ReadsFact(CatalogModel):
    state: Literal["PUBLISHED"]
    selection_inputs: tuple[str, ...] = Field(min_length=1, max_length=8)
    retention: str = Field(pattern=r"^[a-z][a-z0-9_]{1,119}$")
    source: tuple[SourceLocator, ...] = Field(min_length=1, max_length=4)


class ModeFacts(CatalogModel):
    """Per mode × schedule engine facts with source locators (RF02-B1)."""

    source_release_id: str = Field(pattern=r"^er_[a-z0-9_]{1,40}$")
    schedules: tuple[ScheduleFact, ...] = Field(min_length=1, max_length=3)
    objective: ObjectiveFact | NotPublishedFact
    reads: ReadsFact | NotPublishedFact
    avoid_when: NotPublishedFact


class ModeDescriptor(CatalogModel):
    mode_id: str = Field(pattern=r"^mode_[1-5]_[a-z0-9_]+$")
    display_name: str = Field(min_length=1, max_length=120)
    valid_schedules: tuple[
        Literal["global", "per_fold_decay", "per_fold_causal"], ...
    ] = Field(min_length=1)
    default_schedule: Literal["global", "per_fold_decay", "per_fold_causal"]
    objective_summary: str = Field(min_length=1, max_length=500)
    suspect: str = Field(min_length=1, max_length=500)
    artifact_fields: tuple[str, ...] = Field(min_length=1, max_length=16)
    when_to_use: str = Field(min_length=1, max_length=400)
    rules: tuple[str, ...] = Field(min_length=1, max_length=4)
    # RF02-B1: optional so a manifest written before the facts existed still loads.
    facts: ModeFacts | None = None

    @model_validator(mode="after")
    def validate_default_schedule(self) -> "ModeDescriptor":
        if self.default_schedule not in self.valid_schedules:
            raise ValueError("default_schedule must be one of valid_schedules")
        if self.facts is not None:
            fact_schedules = tuple(fact.schedule for fact in self.facts.schedules)
            if fact_schedules != self.valid_schedules:
                raise ValueError("facts.schedules must describe exactly valid_schedules, in order")
        return self


class ClaimDescriptor(CatalogModel):
    contract_id: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    engine_certification: str = Field(pattern=r"^[A-Z][A-Z0-9_-]{1,63}$")
    numeric_guarantee: str = Field(min_length=1, max_length=400)
    never_claims: str = Field(min_length=1, max_length=500)


class EvidenceContractDescriptor(CatalogModel):
    """Declared evidence envelope; P05 owns its durable writer."""

    schema_id: Literal["research-run-evidence.v1"]
    required_fields: tuple[
        Literal[
            "engine_release_id",
            "route_id",
            "effective_spec_digest",
            "market_data_content_hash",
            "report_level",
            "selection_resolution",
            "result_summary",
        ],
        ...,
    ] = Field(min_length=len(FROZEN_EVIDENCE_FIELDS))
    writer_state: Literal["P05_OWNED_NOT_ACTIVE"]


class ResearchEngineCatalog(CatalogModel):
    schema_version: Literal["research-engine-catalog.v1"]
    manifest_revision: int = Field(ge=1)
    releases: tuple[EngineRelease, ...] = Field(min_length=2, max_length=8)
    routes: tuple[RouteDescriptor, ...] = Field(min_length=len(FROZEN_ROUTE_IDS))
    modes: tuple[ModeDescriptor, ...] = Field(min_length=len(FROZEN_MODE_IDS))
    claims: tuple[ClaimDescriptor, ...] = Field(min_length=len(FROZEN_CLAIM_IDS))
    evidence_contract: EvidenceContractDescriptor


class ReleaseRuntimePublic(CatalogModel):
    release_id: str
    package: str
    expected_version: str
    installed_version: str | None = None
    native_package: str | None = None
    native_expected_version: str | None = None
    native_installed_version: str | None = None
    verified: bool
    detail: str | None = None
    trial_ceiling: int
    optimizer_defaults: OptimizerDefaults
    submission_constraints: SubmissionConstraints
    # RF02-B2, additive: absent only on a manifest written before it existed.
    walk_forward_options: WalkForwardOptions | None = None


class HistoricalReleasePublic(CatalogModel):
    release_id: str
    package: str
    version: str
    status: Literal["HISTORICAL_IDENTITY_RETAINED"]


class ResearchRoutePublic(CatalogModel):
    route_id: str
    family: str
    execution_contract: str
    backend: str
    report_levels: tuple[str, ...]
    default_for_new_runs: bool
    axes: CapabilityAxes
    reason: str
    required_input_class: str


class ResearchEngineAtlasDocument(CatalogModel):
    schema_version: Literal["research-engine-atlas.v1"] = "research-engine-atlas.v1"
    manifest_revision: int
    current_release: ReleaseRuntimePublic
    historical_releases: tuple[HistoricalReleasePublic, ...]
    routes: tuple[ResearchRoutePublic, ...]
    modes: tuple[ModeDescriptor, ...]
    claims: tuple[ClaimDescriptor, ...]
    evidence_contract: EvidenceContractDescriptor


@dataclass(frozen=True, slots=True)
class SelectionResolution:
    """Explicit selection outcome used by later run/result contracts.

    A best trial is diagnostic; only an explicit selected trial is publication
    eligible.  A centroid can be valid yet have no evaluated trial id, which
    is represented as a non-error `NO_SELECTED_CANDIDATE` rather than silently
    substituting the last or best fold.
    """

    best_trial_id: str | None
    selected_trial_id: str | None
    target_kind: Literal["global", "per_fold", "centroid"]
    target_trial_refs: tuple[str, ...]
    selection_state: Literal["SELECTED", "NO_SELECTED_CANDIDATE"]
    integrity_state: Literal["COMPLETE", "MISSING_REQUIRED_ARTIFACT"]
    publication_eligible: bool


def resolve_selection(
    *,
    best_trial_id: str | None,
    selected_trial_id: str | None,
    target_kind: Literal["global", "per_fold", "centroid"],
    target_trial_refs: tuple[str, ...] = (),
    required_artifacts_present: bool,
) -> SelectionResolution:
    """Keep `best`, `selected`, and target evidence semantically distinct."""
    refs = tuple(target_trial_refs)
    if any(not item.strip() for item in refs) or len(refs) != len(set(refs)):
        raise ResearchEngineCatalogError("target_trial_refs must be unique non-empty ids")
    if selected_trial_id is not None and refs and selected_trial_id not in refs:
        raise ResearchEngineCatalogError(
            "selected_trial_id must be an explicit target trial reference; no fold-last fallback"
        )
    if target_kind in {"per_fold", "centroid"} and selected_trial_id is not None and not refs:
        raise ResearchEngineCatalogError(
            f"{target_kind} selected target requires explicit target_trial_refs"
        )
    selected = selected_trial_id is not None
    integrity = "COMPLETE" if required_artifacts_present else "MISSING_REQUIRED_ARTIFACT"
    return SelectionResolution(
        best_trial_id=best_trial_id,
        selected_trial_id=selected_trial_id,
        target_kind=target_kind,
        target_trial_refs=refs,
        selection_state="SELECTED" if selected else "NO_SELECTED_CANDIDATE",
        integrity_state=integrity,
        publication_eligible=selected and required_artifacts_present,
    )


class ResearchEngineCatalogService:
    """Fail-closed loader and safe public projection for the P04 Atlas."""

    def __init__(self, registry_root: Path) -> None:
        self._registry_root = registry_root
        self._catalog, self._catalog_digest = self._load()
        # Provenance verification hashes installed wheel metadata.  It belongs
        # to controlled service construction (or a deliberate validation
        # reload), not to every browser Atlas request.  The catalog itself is
        # immutable for the lifetime of this service, so caching the matching
        # runtime observation cannot make a later request less truthful.
        current = next(
            release for release in self._catalog.releases if release.role == "current"
        )
        self._current_release_runtime = self._release_runtime(current)

    @property
    def catalog(self) -> ResearchEngineCatalog:
        return self._catalog

    @property
    def catalog_digest(self) -> str:
        """Internal provenance handle; deliberately absent from browser DTOs."""
        return self._catalog_digest

    def _load(self) -> tuple[ResearchEngineCatalog, str]:
        source_path = self._registry_root / CATALOG_FILE
        schema_path = self._registry_root / "schemas" / CATALOG_SCHEMA
        try:
            raw = source_path.read_bytes()
            if len(raw) > MAX_CATALOG_BYTES:
                raise ResearchEngineCatalogLoadError(
                    "RESEARCH_ENGINE_CATALOG_TOO_LARGE", "catalog exceeds byte limit"
                )
            source = json.loads(raw)
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
        except ResearchEngineCatalogLoadError:
            raise
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_UNAVAILABLE", "catalog cannot be loaded"
            ) from exc
        try:
            Draft202012Validator.check_schema(schema)
            errors = sorted(
                Draft202012Validator(
                    schema, format_checker=FormatChecker()
                ).iter_errors(source),
                key=lambda error: tuple(str(item) for item in error.absolute_path),
            )
        except (SchemaError, ValueError) as exc:
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SCHEMA_INVALID", "catalog schema is invalid"
            ) from exc
        if errors:
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID", errors[0].message
            )
        try:
            catalog = ResearchEngineCatalog.model_validate(source)
        except ValidationError as exc:
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID", "catalog domain model is invalid"
            ) from exc
        self._validate_semantics(catalog, self._capability_trial_ceiling(catalog))
        return catalog, hashlib.sha256(raw).hexdigest()

    @staticmethod
    def _validate_semantics(
        catalog: ResearchEngineCatalog,
        capability_trial_ceiling: int,
    ) -> None:
        release_ids = [release.release_id for release in catalog.releases]
        if len(release_ids) != len(set(release_ids)):
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID", "duplicate release id"
            )
        current = [release for release in catalog.releases if release.role == "current"]
        if len(current) != 1:
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID", "exactly one current release is required"
            )
        current_release = current[0]
        if (
            current_release.trial_ceiling is None
            or current_release.optimizer_defaults is None
            or current_release.submission_constraints is None
        ):
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID",
                "current release must publish trial ceiling, optimizer defaults and submission constraints",
            )
        if current_release.trial_ceiling != capability_trial_ceiling:
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID",
                "current release trial ceiling does not match the certified three-window capability",
            )
        if current_release.submission_constraints.optimization_overrides != "FORBIDDEN":
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID",
                "current fixed-qualification admission cannot advertise optimization overrides",
            )
        groups = tuple(group.group_id for group in current_release.optimizer_defaults.groups)
        if groups != FROZEN_OPTIMIZER_GROUP_IDS:
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID",
                "optimizer default groups must be the exact ordered public vocabulary",
            )
        if any(
            field.override_state != "LOCKED"
            for group in current_release.optimizer_defaults.groups
            for field in group.fields
        ):
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID",
                "current fixed-qualification defaults must be explicitly locked",
            )
        for historical in catalog.releases:
            if historical.role == "historical_reader" and (
                historical.trial_ceiling is not None
                or historical.optimizer_defaults is not None
                or historical.submission_constraints is not None
                or historical.walk_forward_options is not None
            ):
                raise ResearchEngineCatalogLoadError(
                    "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID",
                    "historical reader releases cannot carry current submission defaults",
                )
        route_ids = tuple(route.route_id for route in catalog.routes)
        if len(route_ids) != len(set(route_ids)) or set(route_ids) != set(FROZEN_ROUTE_IDS):
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID", "route ids must equal the frozen public map"
            )
        for route in catalog.routes:
            expected_factory, expected_kwargs = PUBLIC_ROUTE_FACTORIES[route.route_id]
            if route.factory != expected_factory or route.factory_kwargs != dict(expected_kwargs):
                raise ResearchEngineCatalogLoadError(
                    "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID",
                    f"route {route.route_id} does not match the allowlisted public factory",
                )
        defaults = [route.route_id for route in catalog.routes if route.default_for_new_runs]
        if defaults != ["signal_notional"]:
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID", "signal_notional must be the sole new-job default"
            )
        mode_ids = tuple(mode.mode_id for mode in catalog.modes)
        if len(mode_ids) != len(set(mode_ids)) or set(mode_ids) != set(FROZEN_MODE_IDS):
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID", "mode ids must equal the frozen mode set"
            )
        claim_ids = tuple(claim.contract_id for claim in catalog.claims)
        if len(claim_ids) != len(set(claim_ids)) or set(claim_ids) != set(FROZEN_CLAIM_IDS):
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID", "claim ids must equal the frozen claim set"
            )
        evidence_fields = tuple(catalog.evidence_contract.required_fields)
        if (
            len(evidence_fields) != len(set(evidence_fields))
            or set(evidence_fields) != set(FROZEN_EVIDENCE_FIELDS)
        ):
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID",
                "evidence fields must equal the frozen P04 evidence envelope",
            )

    def _capability_trial_ceiling(self, catalog: ResearchEngineCatalog) -> int:
        """Bind the Atlas ceiling to the certified existing capability manifest.

        Keeping two independently edited manifests in agreement at startup is
        cheaper and safer than allowing the UI to display a ceiling the engine
        capability authority will later reject.
        """

        current = next(release for release in catalog.releases if release.role == "current")
        try:
            capabilities = EngineCapabilityService(self._registry_root).manifest
        except EngineCapabilityLoadError as exc:
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID",
                "certified engine capability manifest cannot validate Atlas trial ceiling",
            ) from exc
        matching = [
            capability
            for capability in capabilities.capabilities
            if capability.engine_release_id == current.release_id
            and capability.protocol == "three_window_decay"
            and capability.certified
            and capability.requirements.resource_profile is not None
            and capability.requirements.resource_profile.max_optuna_trials is not None
        ]
        if len(matching) != 1:
            raise ResearchEngineCatalogLoadError(
                "RESEARCH_ENGINE_CATALOG_SOURCE_INVALID",
                "exactly one certified three-window capability with a trial ceiling is required",
            )
        return matching[0].requirements.resource_profile.max_optuna_trials

    def validate_mode_schedule(self, *, mode_id: str, schedule: str) -> ModeDescriptor:
        mode = next((item for item in self._catalog.modes if item.mode_id == mode_id), None)
        if mode is None:
            raise ResearchEngineCatalogError(f"unknown optimization mode {mode_id!r}")
        if schedule not in mode.valid_schedules:
            raise ResearchEngineCatalogError(
                f"schedule {schedule!r} is not valid for mode {mode_id!r}"
            )
        return mode

    def verify_public_route_surface(self, gateway: QuantBTGateway) -> dict[str, bool]:
        observed = gateway.public_route_surface()
        missing = sorted(route_id for route_id in FROZEN_ROUTE_IDS if not observed.get(route_id))
        if missing:
            raise ResearchEngineCatalogError(
                "installed QuantBT public route surface is missing: " + ", ".join(missing)
            )
        return {route_id: True for route_id in FROZEN_ROUTE_IDS}

    def require_p04_baseline_admission(self, route_id: str) -> RouteDescriptor:
        """Return only a route explicitly usable by P04's narrow baseline.

        The wheel exposes more constructors than this phase may run.  Keeping
        this check next to the catalog makes a future typed request opt in
        deliberately instead of bypassing the four-axis record by calling the
        generic gateway directly.
        """
        route = next((item for item in self._catalog.routes if item.route_id == route_id), None)
        if route is None:
            raise ResearchEngineCatalogError(f"unknown QuantBT public route {route_id!r}")
        axes = route.axes
        if not (
            axes.integration == "ADAPTER_AVAILABLE"
            and axes.evidence == "EVIDENCE_MAPPED"
            and axes.admission == "P04_BASELINE_ONLY"
        ):
            raise ResearchEngineCatalogError(
                f"route {route_id!r} is not admitted for P04 baseline: {route.reason}"
            )
        return route

    @staticmethod
    def _release_runtime(release: EngineRelease) -> ReleaseRuntimePublic:
        try:
            installed_version = importlib.metadata.version(release.package)
            verified = (
                installed_version == release.version
                and installed_dist_info_record_hash(release.package)
                == release.dist_info_record_sha256
            )
            detail = None if verified else "installed package provenance does not match catalog"
        except (EngineCapabilityError, importlib.metadata.PackageNotFoundError) as exc:
            installed_version = None
            verified = False
            detail = str(exc)

        native = release.native_dependency
        native_installed_version: str | None = None
        if native is not None:
            try:
                native_installed_version = importlib.metadata.version(native.package)
                native_verified = (
                    native_installed_version == native.version
                    and installed_dist_info_record_hash(native.package)
                    == native.dist_info_record_sha256
                )
                verified = verified and native_verified
                if not native_verified and detail is None:
                    detail = "installed native package provenance does not match catalog"
            except (EngineCapabilityError, importlib.metadata.PackageNotFoundError) as exc:
                verified = False
                if detail is None:
                    detail = str(exc)
        return ReleaseRuntimePublic(
            release_id=release.release_id,
            package=release.package,
            expected_version=release.version,
            installed_version=installed_version,
            native_package=native.package if native else None,
            native_expected_version=native.version if native else None,
            native_installed_version=native_installed_version,
            verified=verified,
            detail=detail,
            # _validate_semantics proves current release fields are present
            # before runtime observation is constructed.
            trial_ceiling=release.trial_ceiling,  # type: ignore[arg-type]
            optimizer_defaults=release.optimizer_defaults,  # type: ignore[arg-type]
            submission_constraints=release.submission_constraints,  # type: ignore[arg-type]
            walk_forward_options=release.walk_forward_options,
        )

    def walk_forward_options(self) -> WalkForwardOptions:
        """The current release's published walk-forward values (RF02-B2)."""

        current = next(release for release in self._catalog.releases if release.role == "current")
        if current.walk_forward_options is None:
            raise ResearchEngineCatalogError("current release publishes no walk-forward options")
        return current.walk_forward_options

    def public_document(self) -> ResearchEngineAtlasDocument:
        return ResearchEngineAtlasDocument(
            manifest_revision=self._catalog.manifest_revision,
            current_release=self._current_release_runtime,
            historical_releases=tuple(
                HistoricalReleasePublic(
                    release_id=release.release_id,
                    package=release.package,
                    version=release.version,
                    status="HISTORICAL_IDENTITY_RETAINED",
                )
                for release in self._catalog.releases
                if release.role == "historical_reader"
            ),
            routes=tuple(
                ResearchRoutePublic(
                    route_id=route.route_id,
                    family=route.family,
                    execution_contract=route.execution_contract,
                    backend=route.backend,
                    report_levels=route.report_levels,
                    default_for_new_runs=route.default_for_new_runs,
                    axes=route.axes,
                    reason=route.reason,
                    required_input_class=route.required_input_class,
                )
                for route in self._catalog.routes
            ),
            modes=self._catalog.modes,
            claims=self._catalog.claims,
            evidence_contract=self._catalog.evidence_contract,
        )


__all__ = [
    "CATALOG_FILE",
    "CATALOG_SCHEMA",
    "FROZEN_CLAIM_IDS",
    "FROZEN_EVIDENCE_FIELDS",
    "FROZEN_MODE_IDS",
    "FROZEN_OPTIMIZER_GROUP_IDS",
    "FROZEN_ROUTE_IDS",
    "ResearchEngineAtlasDocument",
    "ResearchEngineCatalog",
    "ResearchEngineCatalogError",
    "ResearchEngineCatalogLoadError",
    "ResearchEngineCatalogService",
    "SelectionResolution",
    "resolve_selection",
]
