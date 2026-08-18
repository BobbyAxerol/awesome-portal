from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class LinksModel(BaseModel):
    """Immutable runtime projection of the validated cross-link sidecar."""

    model_config = ConfigDict(extra="forbid", frozen=True)


SafeRegistryId = Annotated[str, Field(pattern=r"^[A-Z][A-Z0-9_]{2,63}$")]
SafePlanningId = Annotated[
    str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$")
]
SafeEpicId = Annotated[str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")]
SafeScopeId = Annotated[str, Field(pattern=r"^[a-z][a-z0-9-]{1,63}$")]


class PortalLinkEntry(LinksModel):
    id: SafeRegistryId
    feature_id: SafeRegistryId | None
    screen_id: SafeRegistryId | None
    concern_id: SafeRegistryId | None
    roadmap_epic_id: SafeEpicId | None
    planning_task_ids: tuple[SafePlanningId, ...] = Field(max_length=50)
    figma_frame_id: SafeEpicId | None
    repository_scope: tuple[SafeScopeId, ...] = Field(max_length=16)
    prototype_route: str | None = Field(default=None, pattern=r"^/", max_length=240)
    activation_gate: str | None = Field(default=None, max_length=500)


class PortalLinksSource(LinksModel):
    schema_version: Literal["portal.links.v1"]
    links_revision: int = Field(ge=1)
    reviewed_at: str
    entries: tuple[PortalLinkEntry, ...] = Field(max_length=128)


class PortalLinksIntegrity(LinksModel):
    status: Literal["valid"]
    dangling_links: int = 0
    features_linked: int = Field(ge=0)
    screens_linked: int = Field(ge=0)
    concerns_linked: int = Field(ge=0)
    planning_tasks_referenced: int = Field(ge=0)


class PortalLinksDocument(PortalLinksSource):
    integrity: PortalLinksIntegrity


__all__ = [
    "PortalLinkEntry",
    "PortalLinksDocument",
    "PortalLinksIntegrity",
    "PortalLinksSource",
]
