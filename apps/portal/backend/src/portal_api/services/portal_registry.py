from __future__ import annotations

from typing import Any

from portal_api.domain.portal_registry import PortalRegistryDocument
from portal_api.repositories.portal_registry import PortalRegistryRepository


class PortalRegistryService:
    """Read-only application boundary over one validated registry snapshot."""

    def __init__(self, repository: PortalRegistryRepository) -> None:
        loaded = repository.load()
        self._document = loaded.document
        self._etag = f'"{loaded.document.content_digest}"'

    @property
    def document(self) -> PortalRegistryDocument:
        return self._document

    @property
    def etag(self) -> str:
        return self._etag

    @property
    def headers(self) -> dict[str, str]:
        return {
            "ETag": self._etag,
            "Cache-Control": "no-cache, must-revalidate",
            "Vary": "Authorization, Cookie",
        }

    def response_document(self) -> dict[str, Any]:
        return self._document.model_dump(mode="json")

    def matches_if_none_match(self, header_value: str | None) -> bool:
        if header_value is None:
            return False
        for candidate in header_value.split(","):
            candidate = candidate.strip()
            if candidate == "*":
                return True
            if candidate.startswith("W/"):
                candidate = candidate[2:].strip()
            if candidate == self._etag:
                return True
        return False


__all__ = ["PortalRegistryService"]
