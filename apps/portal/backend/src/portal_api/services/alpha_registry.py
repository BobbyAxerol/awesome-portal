"""Alpha registry authority (U14 / BAR-11).

Immutable alpha identity/version/artifact metadata from the source-controlled
manifest set (draft per guide §9.3), lifecycle/quarantine rules and
digest verification of the protected strategy package. The browser never
executes arbitrary source; only registered manifests are exposed.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Literal

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from portal_api.domain.errors import PortalDomainError

ALPHAS_FILE = "alphas.v1.json"
ALPHAS_SCHEMA = "alpha-manifest.v1.schema.json"

LIFECYCLE_ORDER = (
    "DRAFT",
    "REGISTERED",
    "CANDIDATE",
    "RESEARCH",
    "PAPER",
    "SANDBOX",
    "LIVE",
)


class AlphaRegistryError(PortalDomainError):
    code = "ALPHA_REGISTRY_DENIED"


class AlphaRegistryLoadError(RuntimeError):
    def __init__(self, code: str, detail: str) -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class AlphaModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AlphaOwner(AlphaModel):
    team: str
    maintainers: tuple[str, ...]


class AlphaArtifact(AlphaModel):
    type: Literal["python-wheel"]
    digest: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    lock_digest: str | None = Field(default=None, pattern=r"^sha256:[0-9a-f]{64}$")
    sbom_digest: str | None = Field(default=None, pattern=r"^sha256:[0-9a-f]{64}$")


class AlphaStrategy(AlphaModel):
    family: str = Field(pattern=r"^[a-z][a-z0-9_-]{1,63}$")
    input_kind: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    supported_endpoint_ids: tuple[str, ...]
    execution_contracts: tuple[str, ...]
    determinism: dict[str, bool]


class AlphaDataRequirements(AlphaModel):
    asset_classes: tuple[str, ...]
    columns: tuple[str, ...]
    timeframes: tuple[str, ...]
    warmup_bars: int = Field(ge=0)
    point_in_time: bool
    funding: Literal["optional", "required", "none"] | None = None
    borrow: Literal["optional", "required", "none"] | None = None
    corporate_actions: Literal["optional", "required", "none"] | None = None


class AlphaParameters(AlphaModel):
    parameter_schema: str = Field(validation_alias="schema")
    manager_exposed: tuple[str, ...]
    immutable_for_live: tuple[str, ...]


class AlphaLifecycle(AlphaModel):
    stage: Literal[
        "DRAFT", "REGISTERED", "CANDIDATE", "RESEARCH", "PAPER", "SANDBOX", "LIVE"
    ]
    quarantined: bool
    quarantine_reason: str | None = None
    certification: str | None = None
    promotion_evidence: tuple[str, ...]


class AlphaManifest(AlphaModel):
    schema_version: Literal["alpha-manifest/v1"]
    alpha_id: str = Field(pattern=r"^[a-z][a-z0-9-]{2,63}$")
    version: str = Field(pattern=r"^[0-9]+\.[0-9]+\.[0-9]+$")
    name: str
    owner: AlphaOwner
    entrypoint: str = Field(
        pattern=r"^[a-z][a-z0-9_.]{1,127}:[A-Za-z][A-Za-z0-9_]{1,63}$"
    )
    artifact: AlphaArtifact
    strategy: AlphaStrategy
    data_requirements: AlphaDataRequirements
    parameters: AlphaParameters
    lifecycle: AlphaLifecycle


class AlphaOwnerPublic(AlphaModel):
    team: str


class AlphaStrategyPublic(AlphaModel):
    family: str
    input_kind: str
    supported_endpoint_ids: tuple[str, ...]
    execution_contracts: tuple[str, ...]


class AlphaDataRequirementsPublic(AlphaModel):
    asset_classes: tuple[str, ...]
    columns: tuple[str, ...]
    timeframes: tuple[str, ...]
    warmup_bars: int


class AlphaParametersPublic(AlphaModel):
    manager_exposed: tuple[str, ...]


class AlphaLifecyclePublic(AlphaModel):
    stage: Literal[
        "DRAFT", "REGISTERED", "CANDIDATE", "RESEARCH", "PAPER", "SANDBOX", "LIVE"
    ]
    quarantined: bool
    certification: str | None = None


class AlphaSummary(AlphaModel):
    alpha_id: str
    version: str
    name: str
    owner: AlphaOwnerPublic
    entrypoint: str
    artifact_digest: str
    strategy: AlphaStrategyPublic
    data_requirements: AlphaDataRequirementsPublic
    parameters: AlphaParametersPublic
    lifecycle: AlphaLifecyclePublic


class AlphaRegistryDocument(AlphaModel):
    schema_version: Literal["alpha-manifest/v1"]
    alphas: tuple[AlphaSummary, ...]


class AlphaLifecycleDetail(AlphaModel):
    stage: Literal[
        "DRAFT", "REGISTERED", "CANDIDATE", "RESEARCH", "PAPER", "SANDBOX", "LIVE"
    ]
    quarantined: bool
    quarantine_reason: str | None = None
    certification: str | None = None
    promotion_evidence: tuple[str, ...] = ()


class AlphaVersionDetail(AlphaModel):
    alpha_id: str
    version: str
    name: str
    entrypoint: str
    artifact_digest: str
    lifecycle: AlphaLifecycleDetail


class AlphaVerifyResult(AlphaModel):
    alpha_id: str
    version: str
    registered_digest: str
    computed_digest: str
    matches: bool


class AlphaRegistry:
    def __init__(self, registry_root: Path) -> None:
        self._registry_root = registry_root
        self._alphas = self._load()

    @property
    def alphas(self) -> tuple[AlphaManifest, ...]:
        return self._alphas

    def _load(self) -> tuple[AlphaManifest, ...]:
        source_path = self._registry_root / ALPHAS_FILE
        schema_path = self._registry_root / "schemas" / ALPHAS_SCHEMA
        try:
            source = json.loads(source_path.read_text(encoding="utf-8"))
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise AlphaRegistryLoadError(
                "ALPHAS_FILE_UNAVAILABLE", "alpha registry cannot be loaded"
            ) from exc
        try:
            Draft202012Validator.check_schema(schema)
        except (SchemaError, ValueError) as exc:
            raise AlphaRegistryLoadError("ALPHAS_SCHEMA_INVALID", "alpha schema invalid") from exc
        if not isinstance(source.get("alphas"), list) or not source["alphas"]:
            raise AlphaRegistryLoadError("ALPHAS_SOURCE_INVALID", "registry must list alphas")

        alphas: list[AlphaManifest] = []
        try:
            for entry in source["alphas"]:
                validator = Draft202012Validator(schema, format_checker=FormatChecker())
                entry_errors = sorted(
                    validator.iter_errors(entry),
                    key=lambda error: tuple(str(item) for item in error.absolute_path),
                )
                if entry_errors:
                    raise AlphaRegistryLoadError(
                        "ALPHAS_SOURCE_INVALID", entry_errors[0].message
                    )
                alphas.append(AlphaManifest.model_validate(entry))
        except AlphaRegistryLoadError:
            raise
        except (KeyError, ValidationError) as exc:
            raise AlphaRegistryLoadError("ALPHAS_SOURCE_INVALID", "alpha model invalid") from exc

        identities = [(alpha.alpha_id, alpha.version) for alpha in alphas]
        if len(identities) != len(set(identities)):
            raise AlphaRegistryLoadError("ALPHAS_SOURCE_INVALID", "duplicate alpha version")
        return tuple(alphas)

    def get(self, alpha_id: str) -> AlphaManifest:
        for alpha in self._alphas:
            if alpha.alpha_id == alpha_id:
                return alpha
        raise AlphaRegistryError(f"alpha {alpha_id!r} is not registered")

    def get_version(self, alpha_id: str, version: str) -> AlphaManifest:
        for alpha in self._alphas:
            if alpha.alpha_id == alpha_id and alpha.version == version:
                return alpha
        raise AlphaRegistryError(f"alpha {alpha_id!r}@{version} is not registered")

    def quarantine_block(self, alpha_id: str) -> None:
        alpha = self.get(alpha_id)
        if alpha.lifecycle.quarantined:
            raise AlphaRegistryError(
                f"alpha {alpha_id!r} is quarantined: {alpha.lifecycle.quarantine_reason or 'no reason'}"
            )

    def verify_artifact(self, alpha_id: str, version: str) -> dict[str, Any]:
        """Compare the registered digest with the protected strategy package."""
        alpha = self.get_version(alpha_id, version)
        package_dir = self._registry_root.parent / "strategy"
        payload: dict[str, str] = {}
        for path in sorted(package_dir.rglob("*.py")):
            payload[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        digest_material = json.dumps(payload, sort_keys=True).encode("utf-8")
        computed = f"sha256:{hashlib.sha256(digest_material).hexdigest()}"
        return {
            "alpha_id": alpha.alpha_id,
            "version": alpha.version,
            "registered_digest": alpha.artifact.digest,
            "computed_digest": computed,
            "matches": computed == alpha.artifact.digest,
        }

    def public_document(self) -> AlphaRegistryDocument:
        return AlphaRegistryDocument(
            schema_version="alpha-manifest/v1",
            alphas=tuple(
                AlphaSummary(
                    alpha_id=alpha.alpha_id,
                    version=alpha.version,
                    name=alpha.name,
                    owner=AlphaOwnerPublic(team=alpha.owner.team),
                    entrypoint=alpha.entrypoint,
                    artifact_digest=alpha.artifact.digest,
                    strategy=AlphaStrategyPublic(
                        family=alpha.strategy.family,
                        input_kind=alpha.strategy.input_kind,
                        supported_endpoint_ids=alpha.strategy.supported_endpoint_ids,
                        execution_contracts=alpha.strategy.execution_contracts,
                    ),
                    data_requirements=AlphaDataRequirementsPublic(
                        asset_classes=alpha.data_requirements.asset_classes,
                        columns=alpha.data_requirements.columns,
                        timeframes=alpha.data_requirements.timeframes,
                        warmup_bars=alpha.data_requirements.warmup_bars,
                    ),
                    parameters=AlphaParametersPublic(
                        manager_exposed=alpha.parameters.manager_exposed,
                    ),
                    lifecycle=AlphaLifecyclePublic(
                        stage=alpha.lifecycle.stage,
                        quarantined=alpha.lifecycle.quarantined,
                        certification=alpha.lifecycle.certification,
                    ),
                )
                for alpha in self._alphas
            )
        )


__all__ = ["AlphaManifest", "AlphaRegistry", "AlphaRegistryError", "AlphaRegistryLoadError", "LIFECYCLE_ORDER"]
