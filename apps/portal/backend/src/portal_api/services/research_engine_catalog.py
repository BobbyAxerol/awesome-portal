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


class EngineRelease(CatalogModel):
    release_id: str = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    role: Literal["current", "historical_reader"]
    package: str = Field(pattern=r"^[a-z][a-z0-9_-]{1,63}$")
    version: str = Field(pattern=r"^[0-9]+\.[0-9]+\.[0-9]+[a-z0-9.+]*$")
    dist_info_record_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    wheel_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    native_dependency: NativeDependency | None = None


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

    @model_validator(mode="after")
    def validate_default_schedule(self) -> "ModeDescriptor":
        if self.default_schedule not in self.valid_schedules:
            raise ValueError("default_schedule must be one of valid_schedules")
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
        self._validate_semantics(catalog)
        return catalog, hashlib.sha256(raw).hexdigest()

    @staticmethod
    def _validate_semantics(catalog: ResearchEngineCatalog) -> None:
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
        )

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
    "FROZEN_ROUTE_IDS",
    "ResearchEngineAtlasDocument",
    "ResearchEngineCatalog",
    "ResearchEngineCatalogError",
    "ResearchEngineCatalogLoadError",
    "ResearchEngineCatalogService",
    "SelectionResolution",
    "resolve_selection",
]
