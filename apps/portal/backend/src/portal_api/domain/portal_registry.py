from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


FeatureGroupId = Literal[
    "command",
    "governance",
    "research",
    "backtests",
    "deployments",
    "data_ops",
    "planning",
    "administration",
]
FeatureMaturity = Literal[
    "AVAILABLE",
    "PROTOTYPE",
    "COMMISSIONED",
    "BLOCKED",
    "HIDDEN",
    "DEPRECATED",
]
FeatureDataMode = Literal["REAL", "FIXTURE", "STATIC_PREVIEW", "NONE"]
DeliveryProfile = Literal[
    "fixture",
    "shadow",
    "paper",
    "sandbox",
    "live_canary",
    "live_full",
]
PortalEnvironment = Literal["local", "research", "paper", "sandbox", "live"]
ConcernCategory = Literal[
    "PRODUCT_DECISION",
    "AUTHORIZATION",
    "SOURCE_OF_TRUTH",
    "BACKEND_CONTRACT",
    "STATE_MACHINE",
    "RESILIENCE_STATE",
    "QUANT_SEMANTICS",
    "PERFORMANCE",
    "AUDIT_LINEAGE",
    "SECURITY",
    "ACCESSIBILITY",
    "TEST_EVIDENCE",
    "DEPENDENCY",
    "ACTIVATION_GATE",
]
ConcernStatus = Literal[
    "OPEN",
    "PARTIAL",
    "VERIFIED_CURRENT",
    "BLOCKED",
    "NOT_APPLICABLE",
]
ConcernSeverity = Literal["BLOCKING", "HIGH", "MEDIUM", "LOW"]
ContentDigest = Annotated[str, Field(pattern=r"^sha256:[0-9a-f]{64}$")]


class RegistryModel(BaseModel):
    """Immutable runtime projection of schema-validated registry metadata."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class FeatureGroupDefinition(RegistryModel):
    id: FeatureGroupId
    label: str
    order: int


class NavigationDefinition(RegistryModel):
    order: int
    icon_key: str
    show_in_sidebar: bool
    show_in_command_palette: bool


class PortalFeatureDefinition(RegistryModel):
    id: str
    group: FeatureGroupId
    label: str
    description: str
    canonical_route: str
    legacy_routes: tuple[str, ...]
    maturity: FeatureMaturity
    data_mode: FeatureDataMode
    permissions: tuple[str, ...]
    environments: tuple[PortalEnvironment, ...]
    source_module: str | None
    prototype_frame_id: str | None
    roadmap_epic_id: str | None
    default_task_id: str | None
    screen_ids: tuple[str, ...]
    concern_ids: tuple[str, ...]
    lifecycle_stage_ids: tuple[str, ...]
    summary_source_ids: tuple[str, ...]
    hidden_for_roles: tuple[str, ...]
    activation_gate: str | None
    navigation: NavigationDefinition


class ScreenInputDefinition(RegistryModel):
    id: str
    authority: str
    required: bool


class DeliveryPolicyDefinition(RegistryModel):
    """Commissioning flags, never a substitute for runtime authorization."""

    policy_revision: int = Field(ge=1)
    query_enabled: bool
    projection_ingestion_enabled: bool
    sse_enabled: bool
    governance_write_enabled: bool
    paper_commands_enabled: bool
    sandbox_commands_enabled: bool
    live_protective_commands_enabled: bool
    live_risk_increasing_commands_enabled: bool


class ScreenContract(RegistryModel):
    screen_id: str
    contract_revision: int
    feature_id: str
    maturity: FeatureMaturity
    data_mode: FeatureDataMode
    delivery_profile: DeliveryProfile | None
    delivery_policy: DeliveryPolicyDefinition | None
    route: str
    primary_persona: str
    primary_decision: str
    primary_action: str | None
    permissions: tuple[str, ...]
    inputs: tuple[ScreenInputDefinition, ...]
    backend_dependency_ids: tuple[str, ...]
    concern_ids: tuple[str, ...]
    related_repositories: tuple[str, ...]
    related_task_ids: tuple[str, ...]
    activation_gate: str | None


class ConcernDefinition(RegistryModel):
    id: str
    category: ConcernCategory
    status: ConcernStatus
    severity: ConcernSeverity
    statement: str
    feature_ids: tuple[str, ...]
    screen_ids: tuple[str, ...]
    evidence_refs: tuple[str, ...]
    task_ids: tuple[str, ...]
    activation_gate: str | None
    reviewed_at: str


class LifecycleStageDefinition(RegistryModel):
    """Roll-up of ``primary_persona`` across the stage's feature screens.

    ``personas`` is derived at projection time (never stored in the source
    registry document); stages whose features have no screens yet carry an
    empty tuple so the UI can filter/hide them on persona mismatch.
    """

    id: str
    label: str
    order: int
    feature_ids: tuple[str, ...]
    maturity: FeatureMaturity
    description: str
    personas: tuple[str, ...] = ()


class PortalRegistrySource(RegistryModel):
    schema_version: Literal["portal.registry.v1"]
    registry_id: Literal["portal-default"]
    revision: int
    feature_groups: tuple[FeatureGroupDefinition, ...]
    lifecycle_stages: tuple[LifecycleStageDefinition, ...]
    features: tuple[PortalFeatureDefinition, ...]
    screens: tuple[ScreenContract, ...]
    concerns: tuple[ConcernDefinition, ...]


class PortalRegistryDocument(PortalRegistrySource):
    content_digest: ContentDigest


__all__ = [
    "ConcernDefinition",
    "DeliveryPolicyDefinition",
    "FeatureGroupDefinition",
    "LifecycleStageDefinition",
    "PortalFeatureDefinition",
    "PortalRegistryDocument",
    "PortalRegistrySource",
    "ScreenContract",
]
