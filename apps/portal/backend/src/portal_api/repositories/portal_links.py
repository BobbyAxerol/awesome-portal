from __future__ import annotations

import hashlib
import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError
from pydantic import ValidationError

from portal_api.domain.portal_links import (
    PortalLinkEntry,
    PortalLinksDocument,
    PortalLinksIntegrity,
    PortalLinksSource,
)
from portal_api.domain.portal_registry import PortalRegistryDocument

LINKS_FILE_NAME = "links.v1.json"
LINKS_SCHEMA_NAME = "portal-links.v1.schema.json"
MAX_LINKS_FILE_BYTES = 256 * 1024


class PortalLinksLoadError(RuntimeError):
    """Fail-closed deployment error with a stable machine-readable code."""

    def __init__(self, code: str, detail: str) -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


@dataclass(frozen=True, slots=True)
class LoadedPortalLinks:
    source: PortalLinksSource
    document: PortalLinksDocument


def links_invariant_errors(
    links: PortalLinksSource, registry: PortalRegistryDocument
) -> tuple[str, ...]:
    """Return every deterministic cross-reference/security invariant failure."""
    errors: list[str] = []
    features = {item.id for item in registry.features}
    screens = {item.screen_id for item in registry.screens}
    concerns = {item.id for item in registry.concerns}

    identifiers = [entry.id for entry in links.entries]
    if duplicates := {value for value, count in Counter(identifiers).items() if count > 1}:
        errors.append(f"duplicate link entry IDs: {sorted(duplicates)}")

    for entry in links.entries:
        if not (entry.feature_id or entry.screen_id or entry.concern_id):
            errors.append(
                f"link entry {entry.id} references no feature, screen or concern"
            )
        if entry.feature_id and entry.feature_id not in features:
            errors.append(f"link entry {entry.id} references unknown feature")
        if entry.screen_id and entry.screen_id not in screens:
            errors.append(f"link entry {entry.id} references unknown screen")
        if entry.concern_id and entry.concern_id not in concerns:
            errors.append(f"link entry {entry.id} references unknown concern")
        if duplicates := {
            value
            for value, count in Counter(entry.planning_task_ids).items()
            if count > 1
        }:
            errors.append(f"link entry {entry.id} repeats task IDs: {sorted(duplicates)}")
        for value in (entry.activation_gate or "",):
            lowered = value.lower()
            if any(
                marker in lowered
                for marker in (
                    "<script",
                    "javascript:",
                    "://",
                    "/home/",
                    "/srv/",
                    "password=",
                    "token=",
                    "secret=",
                )
            ):
                errors.append(f"link entry {entry.id} contains unsafe metadata")
    return tuple(sorted(set(errors)))


class PortalLinksRepository:
    """Load and retain one immutable cross-link snapshot for the deploy commit."""

    def __init__(self, registry_root: Path) -> None:
        self._registry_root = registry_root
        self._loaded: LoadedPortalLinks | None = None

    def load(self, registry: PortalRegistryDocument) -> LoadedPortalLinks:
        if self._loaded is not None:
            return self._loaded
        source_document = self._read_json(self._registry_root / LINKS_FILE_NAME)
        schema_document = self._read_json(
            self._registry_root / "schemas" / LINKS_SCHEMA_NAME
        )
        try:
            Draft202012Validator.check_schema(schema_document)
        except (SchemaError, ValueError) as exc:
            raise PortalLinksLoadError(
                "LINKS_SCHEMA_INVALID", "links schema contract is invalid"
            ) from exc
        try:
            validator = Draft202012Validator(
                schema_document, format_checker=FormatChecker()
            )
            errors = sorted(
                validator.iter_errors(source_document),
                key=lambda error: tuple(str(item) for item in error.absolute_path),
            )
        except Exception as exc:  # reference resolution must also fail closed
            raise PortalLinksLoadError(
                "LINKS_SOURCE_INVALID", "links schema validation failed"
            ) from exc
        if errors:
            first = errors[0]
            location = ".".join(str(item) for item in first.absolute_path) or "$"
            raise PortalLinksLoadError(
                "LINKS_SOURCE_INVALID",
                f"links contract rejected at {location}: {first.message}",
            )
        try:
            source = PortalLinksSource.model_validate(source_document)
        except ValidationError as exc:
            raise PortalLinksLoadError(
                "LINKS_SOURCE_INVALID", "links source domain model is invalid"
            ) from exc
        if invariant_errors := links_invariant_errors(source, registry):
            raise PortalLinksLoadError(
                "LINKS_SOURCE_INVALID", "; ".join(invariant_errors)
            )
        integrity = PortalLinksIntegrity(
            status="valid",
            dangling_links=0,
            features_linked=sum(1 for entry in source.entries if entry.feature_id),
            screens_linked=sum(1 for entry in source.entries if entry.screen_id),
            concerns_linked=sum(1 for entry in source.entries if entry.concern_id),
            planning_tasks_referenced=sum(
                len(entry.planning_task_ids) for entry in source.entries
            ),
        )
        document = PortalLinksDocument(
            schema_version=source.schema_version,
            links_revision=source.links_revision,
            reviewed_at=source.reviewed_at,
            entries=source.entries,
            integrity=integrity,
        )
        self._loaded = LoadedPortalLinks(source=source, document=document)
        return self._loaded

    @staticmethod
    def _read_json(path: Path) -> dict[str, Any]:
        try:
            size = path.stat().st_size
            if size > MAX_LINKS_FILE_BYTES:
                raise PortalLinksLoadError(
                    "LINKS_FILE_TOO_LARGE", "links file exceeds the size limit"
                )
            payload = json.loads(path.read_text(encoding="utf-8"))
        except PortalLinksLoadError:
            raise
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise PortalLinksLoadError(
                "LINKS_FILE_UNAVAILABLE", "links sidecar cannot be loaded"
            ) from exc
        if not isinstance(payload, dict):
            raise PortalLinksLoadError(
                "LINKS_FILE_INVALID", "links sidecar must contain a JSON object"
            )
        return payload


def links_source_digest(source: PortalLinksSource) -> str:
    encoded = json.dumps(
        source.model_dump(mode="json"),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


__all__ = [
    "LoadedPortalLinks",
    "PortalLinksLoadError",
    "PortalLinksRepository",
    "links_invariant_errors",
    "links_source_digest",
]
