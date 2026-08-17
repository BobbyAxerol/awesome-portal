from __future__ import annotations

import hashlib
import json
from collections import Counter
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError
from pydantic import ValidationError
from referencing import Registry, Resource

from portal_api.domain.portal_registry import (
    PortalRegistryDocument,
    PortalRegistrySource,
)


MAX_REGISTRY_FILE_BYTES = 2 * 1024 * 1024
SOURCE_SCHEMA_NAME = "portal-registry-source.v1.schema.json"
PUBLIC_SCHEMA_NAME = "portal-registry.v1.schema.json"


class PortalRegistryLoadError(RuntimeError):
    """Fail-closed deployment error with a stable machine-readable code."""

    def __init__(self, code: str, detail: str) -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


@dataclass(frozen=True, slots=True)
class LoadedPortalRegistry:
    source: PortalRegistrySource
    document: PortalRegistryDocument
    source_digest: str


def canonical_digest(document: dict[str, Any]) -> str:
    encoded = json.dumps(
        document,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def _duplicates(values: Iterable[object]) -> set[object]:
    counts = Counter(values)
    return {value for value, count in counts.items() if count > 1}


def _normalize_route(route: str) -> str:
    path = route.split("?", 1)[0]
    return path if path == "/" else path.rstrip("/")


def _unsafe_route(route: str) -> bool:
    return (
        not route.startswith("/")
        or route.startswith("//")
        or any(character in route for character in ("<", ">", "\\", "\n", "\r", "\t"))
    )


def _unsafe_metadata(value: str) -> bool:
    lowered = value.lower()
    forbidden = (
        "<script",
        "javascript:",
        "://",
        "/home/",
        "/srv/",
        "/var/lib/",
        "begin private key",
        "password=",
        "token=",
        "secret=",
    )
    return any(marker in lowered for marker in forbidden)


def registry_invariant_errors(registry: PortalRegistrySource) -> tuple[str, ...]:
    """Return every deterministic cross-reference/security invariant failure."""

    errors: list[str] = []
    groups = {item.id: item for item in registry.feature_groups}
    features = {item.id: item for item in registry.features}
    screens = {item.screen_id: item for item in registry.screens}
    concerns = {item.id: item for item in registry.concerns}
    lifecycle = {item.id: item for item in registry.lifecycle_stages}

    id_collections = {
        "feature group": [item.id for item in registry.feature_groups],
        "feature": [item.id for item in registry.features],
        "screen": [item.screen_id for item in registry.screens],
        "concern": [item.id for item in registry.concerns],
        "lifecycle": [item.id for item in registry.lifecycle_stages],
    }
    for label, identifiers in id_collections.items():
        if duplicates := _duplicates(identifiers):
            errors.append(f"duplicate {label} IDs: {sorted(duplicates)}")

    for label, orders in (
        ("feature-group", [item.order for item in registry.feature_groups]),
        ("lifecycle", [item.order for item in registry.lifecycle_stages]),
    ):
        if duplicates := _duplicates(orders):
            errors.append(f"duplicate {label} orders: {sorted(duplicates)}")

    for group in registry.feature_groups:
        if _unsafe_metadata(group.label):
            errors.append(f"feature group {group.id} contains unsafe metadata")

    route_owners: dict[str, str] = {}
    for feature in registry.features:
        if feature.group not in groups:
            errors.append(f"feature {feature.id} references unknown group {feature.group}")
        for route in (feature.canonical_route, *feature.legacy_routes):
            normalized = _normalize_route(route)
            if _unsafe_route(route):
                errors.append(f"feature {feature.id} has unsafe route")
            if previous := route_owners.get(normalized):
                errors.append(
                    f"feature route collision {normalized}: {previous}, {feature.id}"
                )
            route_owners[normalized] = feature.id

        for screen_id in feature.screen_ids:
            if screen_id not in screens:
                errors.append(f"feature {feature.id} has dangling screen_ids: {screen_id}")
        for concern_id in feature.concern_ids:
            if concern_id not in concerns:
                errors.append(f"feature {feature.id} has dangling concern_ids: {concern_id}")
        for lifecycle_id in feature.lifecycle_stage_ids:
            if lifecycle_id not in lifecycle:
                errors.append(
                    f"feature {feature.id} has dangling lifecycle_stage_ids: {lifecycle_id}"
                )
        if feature.maturity == "DEPRECATED" and (
            feature.navigation.show_in_sidebar
            or feature.navigation.show_in_command_palette
        ):
            errors.append(f"deprecated feature {feature.id} appears in default navigation")
        for value in (feature.label, feature.description, feature.activation_gate or ""):
            if _unsafe_metadata(value):
                errors.append(f"feature {feature.id} contains unsafe metadata")

    screen_route_owners: dict[str, str] = {}
    screens_by_feature: dict[str, set[str]] = {feature_id: set() for feature_id in features}
    for screen in registry.screens:
        normalized = _normalize_route(screen.route)
        if _unsafe_route(screen.route):
            errors.append(f"screen {screen.screen_id} has unsafe route")
        if previous := screen_route_owners.get(normalized):
            errors.append(
                f"screen route collision {normalized}: {previous}, {screen.screen_id}"
            )
        screen_route_owners[normalized] = screen.screen_id

        if screen.feature_id not in features:
            errors.append(
                f"screen {screen.screen_id} references unknown feature {screen.feature_id}"
            )
        else:
            screens_by_feature[screen.feature_id].add(screen.screen_id)
        for concern_id in screen.concern_ids:
            if concern_id not in concerns:
                errors.append(
                    f"screen {screen.screen_id} references unknown concern {concern_id}"
                )
            elif screen.screen_id not in concerns[concern_id].screen_ids:
                errors.append(
                    f"screen {screen.screen_id} concern {concern_id} is not reciprocal"
                )
        for value in (
            screen.primary_persona,
            screen.primary_decision,
            screen.primary_action or "",
            screen.activation_gate or "",
        ):
            if _unsafe_metadata(value):
                errors.append(f"screen {screen.screen_id} contains unsafe metadata")

    for feature_id, feature in features.items():
        if set(feature.screen_ids) != screens_by_feature[feature_id]:
            errors.append(f"feature {feature_id} screen links are not symmetric")
        for concern_id in feature.concern_ids:
            if concern_id in concerns and feature_id not in concerns[concern_id].feature_ids:
                errors.append(
                    f"feature {feature_id} concern {concern_id} is not reciprocal"
                )
    for concern in registry.concerns:
        for feature_id in concern.feature_ids:
            if feature_id not in features:
                errors.append(
                    f"concern {concern.id} references unknown feature {feature_id}"
                )
            elif concern.id not in features[feature_id].concern_ids:
                errors.append(
                    f"concern {concern.id} feature {feature_id} is not reciprocal"
                )
        for screen_id in concern.screen_ids:
            if screen_id not in screens:
                errors.append(f"concern {concern.id} references unknown screen {screen_id}")
            elif concern.id not in screens[screen_id].concern_ids:
                errors.append(
                    f"concern {concern.id} screen {screen_id} is not reciprocal"
                )
        for value in (
            concern.statement,
            concern.activation_gate or "",
            *concern.evidence_refs,
        ):
            if _unsafe_metadata(value):
                errors.append(f"concern {concern.id} contains unsafe metadata")

    for stage in registry.lifecycle_stages:
        for feature_id in stage.feature_ids:
            if feature_id not in features:
                errors.append(
                    f"lifecycle {stage.id} references unknown feature {feature_id}"
                )
            elif stage.id not in features[feature_id].lifecycle_stage_ids:
                errors.append(
                    f"lifecycle {stage.id} feature {feature_id} is not reciprocal"
                )
        for value in (stage.label, stage.description):
            if _unsafe_metadata(value):
                errors.append(f"lifecycle {stage.id} contains unsafe metadata")

    visible_navigation = [
        (feature.group, feature.navigation.order)
        for feature in registry.features
        if feature.maturity not in {"HIDDEN", "DEPRECATED"}
    ]
    if duplicates := _duplicates(visible_navigation):
        errors.append(f"duplicate visible navigation positions: {sorted(duplicates)}")

    return tuple(sorted(set(errors)))


def _public_projection(source: dict[str, Any]) -> dict[str, Any]:
    hidden_feature_ids = {
        feature["id"] for feature in source["features"] if feature["maturity"] == "HIDDEN"
    }
    visible_screen_ids = {
        screen["screen_id"]
        for screen in source["screens"]
        if screen["maturity"] != "HIDDEN" and screen["feature_id"] not in hidden_feature_ids
    }
    visible_lifecycle_ids = {
        stage["id"]
        for stage in source["lifecycle_stages"]
        if stage["maturity"] != "HIDDEN"
    }

    visible_concern_ids: set[str] = set()
    for concern in source["concerns"]:
        visible_features = set(concern["feature_ids"]) - hidden_feature_ids
        visible_screens = set(concern["screen_ids"]) & visible_screen_ids
        if visible_features or visible_screens or not (
            concern["feature_ids"] or concern["screen_ids"]
        ):
            visible_concern_ids.add(concern["id"])

    projected = deepcopy(source)
    projected["features"] = [
        {
            **feature,
            "screen_ids": [
                item for item in feature["screen_ids"] if item in visible_screen_ids
            ],
            "concern_ids": [
                item for item in feature["concern_ids"] if item in visible_concern_ids
            ],
            "lifecycle_stage_ids": [
                item
                for item in feature["lifecycle_stage_ids"]
                if item in visible_lifecycle_ids
            ],
        }
        for feature in source["features"]
        if feature["id"] not in hidden_feature_ids
    ]
    projected["screens"] = [
        {
            **screen,
            "concern_ids": [
                item for item in screen["concern_ids"] if item in visible_concern_ids
            ],
        }
        for screen in source["screens"]
        if screen["screen_id"] in visible_screen_ids
    ]
    projected["concerns"] = [
        {
            **concern,
            "feature_ids": [
                item for item in concern["feature_ids"] if item not in hidden_feature_ids
            ],
            "screen_ids": [
                item for item in concern["screen_ids"] if item in visible_screen_ids
            ],
        }
        for concern in source["concerns"]
        if concern["id"] in visible_concern_ids
    ]
    personas_by_feature: dict[str, list[str]] = {}
    for screen in projected["screens"]:
        persona = screen.get("primary_persona") or ""
        if persona:
            personas_by_feature.setdefault(screen["feature_id"], []).append(persona)

    projected["lifecycle_stages"] = [
        {
            **stage,
            "feature_ids": [
                item for item in stage["feature_ids"] if item not in hidden_feature_ids
            ],
            "personas": sorted(
                {
                    persona
                    for feature_id in stage["feature_ids"]
                    if feature_id not in hidden_feature_ids
                    for persona in personas_by_feature.get(feature_id, ())
                }
            ),
        }
        for stage in source["lifecycle_stages"]
        if stage["id"] in visible_lifecycle_ids
    ]
    return projected


class PortalRegistryRepository:
    """Load and retain one immutable registry snapshot for the deployed commit."""

    def __init__(self, registry_root: Path) -> None:
        self.registry_root = registry_root
        self._loaded: LoadedPortalRegistry | None = None

    def load(self) -> LoadedPortalRegistry:
        if self._loaded is not None:
            return self._loaded

        source_document = self._read_json(self.registry_root / "registry.json", "source")
        source_schema = self._read_json(
            self.registry_root / "schemas" / SOURCE_SCHEMA_NAME,
            "source schema",
        )
        public_schema = self._read_json(
            self.registry_root / "schemas" / PUBLIC_SCHEMA_NAME,
            "public schema",
        )
        schemas = (source_schema, public_schema)
        try:
            for schema in schemas:
                Draft202012Validator.check_schema(schema)
            schema_registry = Registry().with_resources(
                (schema["$id"], Resource.from_contents(schema)) for schema in schemas
            )
        except (KeyError, SchemaError, ValueError) as exc:
            raise PortalRegistryLoadError(
                "REGISTRY_SCHEMA_INVALID", "registry schema contract is invalid"
            ) from exc

        self._validate_schema(
            source_schema,
            source_document,
            schema_registry,
            code="REGISTRY_SOURCE_INVALID",
        )
        try:
            source_model = PortalRegistrySource.model_validate(source_document)
        except ValidationError as exc:
            raise PortalRegistryLoadError(
                "REGISTRY_SOURCE_INVALID", "registry source domain model is invalid"
            ) from exc
        self._validate_invariants(source_model, code="REGISTRY_SOURCE_INVALID")

        public_without_digest = _public_projection(source_document)
        self._validate_schema(
            source_schema,
            public_without_digest,
            schema_registry,
            code="REGISTRY_PUBLIC_INVALID",
        )
        try:
            public_source_model = PortalRegistrySource.model_validate(public_without_digest)
        except ValidationError as exc:
            raise PortalRegistryLoadError(
                "REGISTRY_PUBLIC_INVALID", "public registry projection is invalid"
            ) from exc
        self._validate_invariants(public_source_model, code="REGISTRY_PUBLIC_INVALID")

        digest = canonical_digest(public_without_digest)
        public_document = {**public_without_digest, "content_digest": digest}
        self._validate_schema(
            public_schema,
            public_document,
            schema_registry,
            code="REGISTRY_PUBLIC_INVALID",
        )
        try:
            document_model = PortalRegistryDocument.model_validate(public_document)
        except ValidationError as exc:
            raise PortalRegistryLoadError(
                "REGISTRY_PUBLIC_INVALID", "public registry domain model is invalid"
            ) from exc

        self._loaded = LoadedPortalRegistry(
            source=source_model,
            document=document_model,
            source_digest=canonical_digest(source_document),
        )
        return self._loaded

    @staticmethod
    def _read_json(path: Path, label: str) -> dict[str, Any]:
        try:
            size = path.stat().st_size
            if size > MAX_REGISTRY_FILE_BYTES:
                raise PortalRegistryLoadError(
                    "REGISTRY_FILE_TOO_LARGE", f"{label} exceeds the size limit"
                )
            payload = json.loads(path.read_text(encoding="utf-8"))
        except PortalRegistryLoadError:
            raise
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise PortalRegistryLoadError(
                "REGISTRY_FILE_UNAVAILABLE", f"{label} cannot be loaded"
            ) from exc
        if not isinstance(payload, dict):
            raise PortalRegistryLoadError(
                "REGISTRY_FILE_INVALID", f"{label} must contain a JSON object"
            )
        return payload

    @staticmethod
    def _validate_schema(
        schema: dict[str, Any],
        document: dict[str, Any],
        schema_registry: Registry,
        *,
        code: str,
    ) -> None:
        try:
            validator = Draft202012Validator(
                schema,
                registry=schema_registry,
                format_checker=FormatChecker(),
            )
            errors = sorted(
                validator.iter_errors(document),
                key=lambda error: tuple(str(item) for item in error.absolute_path),
            )
        except Exception as exc:  # reference resolution must also fail closed
            raise PortalRegistryLoadError(code, "registry schema validation failed") from exc
        if errors:
            first = errors[0]
            location = ".".join(str(item) for item in first.absolute_path) or "$"
            raise PortalRegistryLoadError(
                code,
                f"registry contract rejected at {location}: {first.message}",
            )

    @staticmethod
    def _validate_invariants(registry: PortalRegistrySource, *, code: str) -> None:
        if errors := registry_invariant_errors(registry):
            raise PortalRegistryLoadError(code, "; ".join(errors))


__all__ = [
    "LoadedPortalRegistry",
    "PortalRegistryLoadError",
    "PortalRegistryRepository",
    "canonical_digest",
    "registry_invariant_errors",
]
