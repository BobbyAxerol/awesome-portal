from __future__ import annotations

from typing import Any

from portal_api.domain.portal_links import PortalLinksDocument
from portal_api.repositories.portal_links import (
    PortalLinksRepository,
    links_source_digest,
)


class PortalLinksService:
    """Read-only application boundary over one validated cross-link snapshot."""

    def __init__(
        self, repository: PortalLinksRepository, registry_document: Any
    ) -> None:
        loaded = repository.load(registry_document)
        self._document = loaded.document
        self._etag = f'"{links_source_digest(loaded.source)}"'

    @property
    def document(self) -> PortalLinksDocument:
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


__all__ = ["PortalLinksService"]
