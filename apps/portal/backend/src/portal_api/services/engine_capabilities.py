"""Engine capability authority (U12 / BAR-09).

Loads the source-controlled capability manifest (fail-closed, like the
registry), verifies the exact installed wheel against the pinned
dist-info RECORD digest and preflights requests against declared
capability requirements. A crafted request for an unadvertised or
uncertified capability is rejected even when syntactically valid; a newly
certified capability in the manifest needs no dispatch-code change.
"""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from portal_api.domain.errors import PortalDomainError

CAPABILITIES_FILE = "engine-capabilities.v1.json"
CAPABILITIES_SCHEMA = "engine-capabilities.v1.schema.json"
MAX_CAPABILITIES_FILE_BYTES = 256 * 1024


class EngineCapabilityError(PortalDomainError):
    code = "ENGINE_CAPABILITY_DENIED"


class EngineCapabilityLoadError(RuntimeError):
    def __init__(self, code: str, detail: str) -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class CapabilityModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class EngineRelease(CapabilityModel):
    release_id: str = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    package: str = Field(pattern=r"^[a-z][a-z0-9_-]{1,63}$")
    version: str = Field(pattern=r"^[0-9]+\.[0-9]+\.[0-9]+[a-z0-9.+]*$")
    dist_info_record_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class ResourceProfile(CapabilityModel):
    max_optuna_trials: int | None = Field(default=None, ge=1)
    max_parameter_space_entries: int | None = Field(default=None, ge=1)


class CapabilityRequirements(CapabilityModel):
    backend: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    data_class: tuple[str, ...] = Field(min_length=1, max_length=8)
    methodology: str = Field(pattern=r"^[a-z][a-z0-9_-]{1,63}$")
    resource_profile: ResourceProfile | None = None


class EngineCapability(CapabilityModel):
    capability_id: str = Field(pattern=r"^[A-Z][A-Z0-9_]{2,63}$")
    protocol: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    endpoint_id: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    engine_release_id: str = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    certified: bool
    requirements: CapabilityRequirements


class EngineCapabilitiesManifest(CapabilityModel):
    schema_version: str
    manifest_revision: int = Field(ge=1)
    engine_releases: tuple[EngineRelease, ...]
    capabilities: tuple[EngineCapability, ...]


class EngineReleasePublic(CapabilityModel):
    release_id: str
    package: str
    version: str


class CapabilityPublic(CapabilityModel):
    capability_id: str
    protocol: str
    endpoint_id: str
    engine_release_id: str
    certified: bool
    requirements: CapabilityRequirements


class InstalledProbe(CapabilityModel):
    ok: bool
    installed_version: str | None = None
    installed_record_sha256: str | None = None
    detail: str | None = None


class EngineCapabilitiesDocument(CapabilityModel):
    schema_version: str
    manifest_revision: int
    engine_releases: tuple[EngineReleasePublic, ...]
    capabilities: tuple[CapabilityPublic, ...]
    installed: dict[str, InstalledProbe]


def installed_dist_info_record_hash(package: str) -> str:
    """Digest of the installed distribution's RECORD file (wheel identity)."""
    try:
        dist = importlib.metadata.distribution(package)
    except importlib.metadata.PackageNotFoundError as exc:
        raise EngineCapabilityError(f"engine package {package} is not installed") from exc
    record = Path(dist._path) / "RECORD"  # noqa: SLF001 - dist-info identity
    return hashlib.sha256(record.read_bytes()).hexdigest()


@dataclass(frozen=True, slots=True)
class CapabilityPreflightResult:
    capability_id: str
    protocol: str
    certified: bool


class EngineCapabilityService:
    """Loads one immutable capability manifest for the deployed commit."""

    def __init__(self, registry_root: Path) -> None:
        self._registry_root = registry_root
        self._manifest = self._load()

    @property
    def manifest(self) -> EngineCapabilitiesManifest:
        return self._manifest

    def _load(self) -> EngineCapabilitiesManifest:
        source_path = self._registry_root / CAPABILITIES_FILE
        schema_path = self._registry_root / "schemas" / CAPABILITIES_SCHEMA
        try:
            source = json.loads(source_path.read_text(encoding="utf-8"))
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise EngineCapabilityLoadError(
                "CAPABILITIES_FILE_UNAVAILABLE", "capability manifest cannot be loaded"
            ) from exc
        try:
            Draft202012Validator.check_schema(schema)
            validator = Draft202012Validator(schema, format_checker=FormatChecker())
            errors = sorted(
                validator.iter_errors(source),
                key=lambda error: tuple(str(item) for item in error.absolute_path),
            )
        except (SchemaError, ValueError) as exc:
            raise EngineCapabilityLoadError(
                "CAPABILITIES_SCHEMA_INVALID", "capability schema is invalid"
            ) from exc
        if errors:
            raise EngineCapabilityLoadError(
                "CAPABILITIES_SOURCE_INVALID", errors[0].message
            )
        try:
            manifest = EngineCapabilitiesManifest.model_validate(source)
        except ValidationError as exc:
            raise EngineCapabilityLoadError(
                "CAPABILITIES_SOURCE_INVALID", "capability domain model is invalid"
            ) from exc

        release_ids = {release.release_id for release in manifest.engine_releases}
        protocol_ids = [capability.protocol for capability in manifest.capabilities]
        capability_ids = [capability.capability_id for capability in manifest.capabilities]
        if len(protocol_ids) != len(set(protocol_ids)):
            raise EngineCapabilityLoadError(
                "CAPABILITIES_SOURCE_INVALID", "duplicate capability protocol"
            )
        if len(capability_ids) != len(set(capability_ids)):
            raise EngineCapabilityLoadError(
                "CAPABILITIES_SOURCE_INVALID", "duplicate capability id"
            )
        for capability in manifest.capabilities:
            if capability.engine_release_id not in release_ids:
                raise EngineCapabilityLoadError(
                    "CAPABILITIES_SOURCE_INVALID",
                    f"capability {capability.capability_id} references unknown release",
                )
        return manifest

    def verify_installed(self) -> dict[str, Any]:
        """Verify every pinned engine release against the installed wheel."""
        results: dict[str, Any] = {}
        for release in self._manifest.engine_releases:
            try:
                version = importlib.metadata.version(release.package)
                digest = installed_dist_info_record_hash(release.package)
            except EngineCapabilityError as exc:
                results[release.release_id] = {"ok": False, "detail": str(exc)}
                continue
            results[release.release_id] = {
                "ok": version == release.version and digest == release.dist_info_record_sha256,
                "installed_version": version,
                "installed_record_sha256": digest,
            }
        return results

    def capability_for(self, protocol: str) -> EngineCapability | None:
        for capability in self._manifest.capabilities:
            if capability.protocol == protocol:
                return capability
        return None

    def preflight(
        self,
        *,
        protocol: str,
        data_class: str,
        optuna_trials: int | None = None,
        parameter_space_entries: int | None = None,
    ) -> CapabilityPreflightResult:
        capability = self.capability_for(protocol)
        if capability is None:
            raise EngineCapabilityError(
                f"protocol {protocol!r} is not an advertised engine capability"
            )
        if not capability.certified:
            raise EngineCapabilityError(
                f"capability {capability.capability_id} is not certified"
            )
        if data_class not in capability.requirements.data_class:
            raise EngineCapabilityError(
                f"capability {capability.capability_id} does not support data class {data_class!r}"
            )
        profile = capability.requirements.resource_profile
        if profile is not None:
            if (
                profile.max_optuna_trials is not None
                and optuna_trials is not None
                and optuna_trials > profile.max_optuna_trials
            ):
                raise EngineCapabilityError("optuna trials exceed the declared resource profile")
            if (
                profile.max_parameter_space_entries is not None
                and parameter_space_entries is not None
                and parameter_space_entries > profile.max_parameter_space_entries
            ):
                raise EngineCapabilityError(
                    "parameter space exceeds the declared resource profile"
                )
        return CapabilityPreflightResult(
            capability_id=capability.capability_id,
            protocol=capability.protocol,
            certified=capability.certified,
        )

    def public_document(self) -> EngineCapabilitiesDocument:
        """Safe read-only projection for the API: no digests leak semantics."""
        return EngineCapabilitiesDocument(
            schema_version=self._manifest.schema_version,
            manifest_revision=self._manifest.manifest_revision,
            engine_releases=tuple(
                EngineReleasePublic(
                    release_id=release.release_id,
                    package=release.package,
                    version=release.version,
                )
                for release in self._manifest.engine_releases
            ),
            capabilities=tuple(
                CapabilityPublic(
                    capability_id=capability.capability_id,
                    protocol=capability.protocol,
                    endpoint_id=capability.endpoint_id,
                    engine_release_id=capability.engine_release_id,
                    certified=capability.certified,
                    requirements=capability.requirements,
                )
                for capability in self._manifest.capabilities
            ),
            installed=self.verify_installed(),
        )


__all__ = [
    "CapabilityPreflightResult",
    "EngineCapability",
    "EngineCapabilityError",
    "EngineCapabilityLoadError",
    "EngineCapabilityService",
    "EngineCapabilitiesManifest",
    "EngineRelease",
    "installed_dist_info_record_hash",
]
