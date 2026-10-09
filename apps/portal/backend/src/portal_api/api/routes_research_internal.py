"""Private Research Loop adapter routes.

This route is intentionally outside the public ``/api`` namespace, has no
browser/facade path, and accepts only a Control-API signed internal principal.
It does not persist bytes or connect to the Research database; the Control API
remains the owner of custody, TTL, receipts and immutable version binding.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Query
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from portal_api.auth.internal_principal import InternalPrincipalError, require_internal_principal
from portal_api.services.research_alpha_analyzer import MAX_SOURCE_BYTES, analyze_alpha_source
from portal_api.services.durable_runs import AttemptRegistry, DurableRunError
from portal_api.services.research_dataset_catalog import (
    ResearchDatasetCatalogError,
    build_research_dataset_catalog,
)
from portal_api.services.research_artifacts import ResearchArtifactError, observe_sealed_artifact_bytes
from portal_api.domain.research_final_audit import PinnedAuditPreparation
from portal_api.services.research_preflight_snapshot import (
    ResearchPreflightSnapshotError,
    refusal_detail,
)
from portal_api.services.enrich_dataset_catalog import (
    DatasetIndexError, DatasetIndexStore, enrich_dataset_catalog, source_digest, window_metadata, declaration_estimate,
)

router = APIRouter(prefix="/internal/research", include_in_schema=False)


class AlphaAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    original_filename: str = Field(min_length=1, max_length=128)
    source_text: str = Field(min_length=1, max_length=MAX_SOURCE_BYTES)


class PreflightSnapshotRequest(BaseModel):
    """Bounded private request from Control API, never a browser DTO."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    requested_spec: dict[str, Any] = Field(min_length=1, max_length=64)
    requested_spec_digest: str = Field(pattern=r"^[0-9a-f]{64}$")
    required_columns: tuple[str, ...] = Field(default=("open", "high", "low", "close", "volume"), min_length=1, max_length=16)
    warmup_bars: int = Field(default=0, ge=0, le=100_000)
    requires_funding: bool = False
    # CG-P08-05: swept dimensions counted by Control API from the immutable
    # AlphaVersion declaration and the overrides; the ceiling is the release's.
    swept_dimensions: int = Field(default=0, ge=0, le=128)


class ArtifactByteObservationRequest(BaseModel):
    """A10a: Control API names the artifact and the part paths it sealed."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    artifact_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$")
    part_paths: tuple[str, ...] = Field(min_length=1, max_length=256)


class NativeReadPreparationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    workspace_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$")
    run_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$")
    artifact_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$")
    artifact_revision: int = Field(ge=1)
    manifest_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    requested_spec_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    effective_spec_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    dataset_binding_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    execution_profile_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$")
    execution_profile_digest: str = Field(pattern=r"^[a-f0-9]{64}$")


@router.post("/native-read/prepare")
def prepare_native_read_models(request: Request, body: NativeReadPreparationRequest) -> dict[str, Any]:
    try:
        principal = require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    if principal.role != "ADMIN" or "research_native_read_prepare" not in principal.authn_methods:
        raise HTTPException(status_code=403, detail="private native preparation is not authorized")
    from portal_api.services.research_native_read import prepare_native_read
    try:
        return prepare_native_read(retained_artifact_root(), body.model_dump())
    except (ResearchArtifactError, OSError, ValueError, TypeError, KeyError) as exc:
        raise HTTPException(status_code=409, detail="native retained evidence is missing or incompatible") from exc


def retained_artifact_root() -> Path:
    """The P05 retained store the durable worker writes (``durable-store/research-retained``)."""

    explicit = os.getenv("PORTAL_RESEARCH_RETAINED_ROOT", "").strip()
    if explicit:
        return Path(explicit)
    return Path(os.getenv("PORTAL_ARTIFACT_ROOT", "artifacts/runs")) / "durable-store" / "research-retained"


class ProgressCancellationRequest(BaseModel):
    """Control-API-to-worker cancellation marker, never a browser DTO."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    worker_attempt_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$")
    lease_epoch: int = Field(ge=1, le=2_147_483_647)


@router.post("/alpha-analysis")
async def analyze_imported_alpha(
    request: Request,
    body: AlphaAnalysisRequest,
) -> dict[str, object]:
    try:
        require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        # This is a private service-to-service boundary.  Never turn an
        # arbitrary browser header into a useful authentication oracle.
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    try:
        return analyze_alpha_source(body.source_text, body.original_filename).as_dict()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid single-file import contract") from exc


@router.get("/engine-atlas")
async def read_engine_atlas(request: Request) -> dict[str, object]:
    """Return the already-loaded P04 manifest document to Control API only.

    This route imports no QuantBT package, starts no engine and performs no
    side effect.  It is the only Python source of the Atlas: RF-01 retired the
    public P04 route ``/api/v1/research/quantbt/atlas`` because Control API's
    P09 BFF serves that same path with a different, wrapped document, and a
    gateway rollback to this service would have swapped the shape silently.
    """
    try:
        require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    return request.app.state.research_engine_catalog.public_document().model_dump(mode="json")


@router.get("/datasets")
async def read_research_dataset_catalog(request: Request) -> dict[str, object]:
    """CG-P08-04: the bounded research dataset catalog, for Control API only.

    Names and month partitions from the approved reader's storage layout; no
    data file is opened, no path or price is returned.
    """
    try:
        require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    try:
        return build_research_dataset_catalog(request.app.state.market_data_provider)
    except ResearchDatasetCatalogError as exc:
        raise HTTPException(status_code=503, detail="historical dataset catalog is unavailable") from exc


def dataset_index_store(request: Request) -> DatasetIndexStore:
    if not hasattr(request.app.state, "research_dataset_index"):
        request.app.state.research_dataset_index = DatasetIndexStore()
    return request.app.state.research_dataset_index


@router.get("/datasets-v2")
async def read_indexed_dataset_catalog(request: Request) -> dict[str, object]:
    try:
        require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    try:
        return enrich_dataset_catalog(request.app.state.market_data_provider, dataset_index_store(request))
    except (DatasetIndexError, ResearchDatasetCatalogError, OSError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="historical metadata index is unavailable") from exc


class DeclarationEstimateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requested_spec: dict[str, Any]
    warmup_bars: int = Field(ge=0, le=100_000)


class WindowSuggestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dataset_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$")
    symbol: str = Field(pattern=r"^[A-Z0-9][A-Z0-9_-]{1,31}$")
    timeframe: str = Field(pattern=r"^[1-9][0-9]*(min|m|h|d)$")
    protocol: Literal["three_window_decay", "advanced"]
    warmup_bars: int = Field(ge=0, le=100_000)
    max_span_days: int | None = Field(ge=1, le=10000)
    expected_catalog_revision: str | None = Field(pattern=r"^[a-f0-9]{64}$")
    start_utc_ms: int | None = Field(default=None, ge=0, le=9_007_199_254_740_991)
    end_exclusive_utc_ms: int | None = Field(default=None, ge=0, le=9_007_199_254_740_991)
    frequency: Literal["weekly", "monthly", "quarterly"] | None = None
    window_mode: Literal["expanding", "rolling"] | None = None
    train_window: str | None = Field(default=None, pattern=r"^[1-9][0-9]{0,4}(D|h)$")
    initial_train_bars: int | None = Field(default=None, ge=1, le=100_000)


@router.post("/dataset-window-suggestion")
async def read_window_suggestion(request: Request, payload: WindowSuggestionRequest) -> dict:
    try:
        require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    from portal_api.services.research_window_suggestion import window_suggestion
    values = payload.model_dump(exclude_none=True)
    values.update(max_span_days=payload.max_span_days, expected_catalog_revision=payload.expected_catalog_revision)
    if (payload.start_utc_ms is None) != (payload.end_exclusive_utc_ms is None) or (
        payload.start_utc_ms is not None and payload.start_utc_ms >= payload.end_exclusive_utc_ms):
        raise HTTPException(status_code=400, detail="Invalid window range.")
    try:
        revision, document, reason = dataset_index_store(request).read(source_digest(request.app.state.market_data_provider))
        result = window_suggestion(document, revision, values)
        if document is None and reason:
            result["reason_code"] = reason
        return result
    except (DatasetIndexError, OSError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="historical window metadata is unavailable") from exc


@router.post("/dataset-declaration-estimate")
async def read_declaration_estimate(request: Request, payload: DeclarationEstimateRequest) -> dict:
    try:
        require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    provider = request.app.state.market_data_provider
    store = dataset_index_store(request)
    try:
        revision, document, reason = store.read(source_digest(provider))
    except (DatasetIndexError, OSError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="historical metadata index is unavailable") from exc
    try:
        result = store.estimate(revision if document else None, document, payload.requested_spec, warmup_bars=payload.warmup_bars,
            engine_catalog=request.app.state.research_engine_catalog,
            gateway=request.app.state.quantbt_gateway)
        result["catalog_revision"] = revision
        if document is None and reason:
            result["planned_folds"]["reason_code"] = reason
            for row in result["windows"]:
                row["reason_code"] = reason
        return result
    except (DatasetIndexError, ResearchPreflightSnapshotError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Historical declaration estimate refused.") from exc


@router.get("/dataset-bar-metadata")
async def read_dataset_bar_metadata(request: Request, dataset_id: str, symbol: str, timeframe: str,
        start_utc_ms: int = Query(ge=0), end_exclusive_utc_ms: int = Query(ge=0),
        warmup_bars: int = Query(default=0, ge=0, le=100_000)) -> dict[str, object]:
    try:
        require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    try:
        provider = request.app.state.market_data_provider
        revision, document, reason = dataset_index_store(request).read(source_digest(provider))
        metadata = window_metadata(document, dataset_id=dataset_id, symbol=symbol, timeframe=timeframe,
            start_ms=start_utc_ms, end_ms=end_exclusive_utc_ms, warmup_bars=warmup_bars)
        if reason:
            metadata["reason_code"] = reason
        return {"schema_version": "research.dataset-bar-metadata.v1", "catalog_revision": revision,
            "as_of_utc_ms": document["as_of_utc_ms"] if document else None,
            "dataset_id": dataset_id, "symbol": symbol, "timeframe": timeframe.lower(),
            "start_utc_ms": start_utc_ms, "end_exclusive_utc_ms": end_exclusive_utc_ms,
            "scope": "INDEX_METADATA_ONLY_NOT_PREFLIGHT_ADMISSION", **metadata}
    except DatasetIndexError as exc:
        code = str(exc)
        raise HTTPException(status_code=400 if code.startswith("DATASET_WINDOW") or code == "DATASET_INTERVAL_INVALID" else 503,
            detail="historical metadata query refused") from exc
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="historical metadata index is unavailable") from exc


@router.post("/preflight-snapshots")
async def create_preflight_snapshot(
    request: Request,
    body: PreflightSnapshotRequest,
) -> dict[str, object]:
    """Create or reopen one shared P08 immutable snapshot.

    The Control API owns browser authentication, token TTL, manifest custody
    and later worker handoff.  This private route deliberately returns only
    metadata and never mounts under ``/api``.
    """
    try:
        require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    try:
        service = request.app.state.research_preflight_snapshot_service
        return service.build(body.model_dump(mode="python"))
    except ResearchPreflightSnapshotError as exc:
        # Control API maps this fixed private vocabulary to its same-origin
        # typed problem codes. No raw market data, source path or stack leaks.
        # CG-P08-03 adds the failed gate, the requested-spec field path and a
        # bounded authored/engine sentence; still no data, path or stack.
        raise HTTPException(status_code=409, detail=refusal_detail(exc, body.requested_spec)) from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="invalid preflight snapshot contract") from exc


@router.post("/artifacts/observe")
async def observe_retained_artifact_bytes(
    request: Request,
    body: ArtifactByteObservationRequest,
) -> dict[str, object]:
    """A10a: re-read one sealed P05 artifact's bytes for the Control API verifier.

    Read-only: it hashes the manifest and the named parts and returns the
    observed digests. It never writes, repairs, moves or quarantines a file;
    the verdict, the receipt and any lifecycle downgrade belong to the
    Control API, which compares against the digests it stored at seal time.
    """
    try:
        principal = require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    if principal.role != "ADMIN" or "research_artifact_verify" not in principal.authn_methods:
        raise HTTPException(status_code=403, detail="private artifact observation is not authorized")
    try:
        return observe_sealed_artifact_bytes(
            retained_artifact_root(),
            artifact_id=body.artifact_id,
            part_paths=body.part_paths,
        )
    except ResearchArtifactError as exc:
        raise HTTPException(status_code=400, detail="invalid artifact observation contract") from exc


@router.post("/final-audit/prepare")
async def prepare_final_audit(request: Request, body: PinnedAuditPreparation) -> dict[str, object]:
    """Read-only private target preparation; not a compute/admission endpoint."""
    try:
        principal = require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    if principal.role != "ADMIN" or "research_final_audit" not in principal.authn_methods:
        raise HTTPException(status_code=403, detail="private audit preparation is not authorized")
    from portal_api.services.research_final_audit import prepare_pinned_audit_target
    try:
        target = prepare_pinned_audit_target(retained_artifact_root(), body)
        return {"schema_version": "research.pinned-audit-preparation.v1", "target_digest": target.target_digest(),
            "target": target.model_dump(mode="json")}
    except (OSError, ValueError, TypeError, KeyError) as exc:
        # Bounded vocabulary only; no original config, private path or arbitrary
        # exception/engine string crosses the private diagnostic boundary.
        code = str(exc)
        if not code.startswith("AUDIT_") or len(code) > 100 or not all(c.isupper() or c == "_" for c in code):
            code = "AUDIT_ORIGINAL_SOURCE_UNAVAILABLE"
        raise HTTPException(status_code=409, detail={"reason_code": code}) from exc


@router.post("/progress/{run_id}/cancel")
async def request_progress_cancellation(
    run_id: str,
    request: Request,
    body: ProgressCancellationRequest,
) -> dict[str, object]:
    """Persist a bounded P11 cancel marker beside the durable worker ledger.

    Control API already performed the user/session/CSRF authorization and
    durable-job CAS before calling here. This route only accepts its signed
    private principal and cannot inspect data, invoke CLI, or mutate an
    artifact bundle.
    """

    try:
        principal = require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    if principal.role != "ADMIN" or "research_progress_cancel" not in principal.authn_methods:
        raise HTTPException(status_code=403, detail="private research cancellation is not authorized")
    if not run_id or len(run_id) > 160:
        raise HTTPException(status_code=400, detail="invalid durable run identity")
    root = Path(os.getenv("PORTAL_ARTIFACT_ROOT", "artifacts/runs")) / "durable"
    try:
        status = AttemptRegistry(root).request_cancellation(
            run_id,
            body.worker_attempt_id,
            lease_epoch=body.lease_epoch,
        )
    except DurableRunError as exc:
        # The Control API treats a source side terminal/missing marker as a
        # bounded operational outcome, never as a reason to mutate DB state
        # back or disclose a local path.
        detail = "durable cancellation marker was not accepted"
        code = 404 if "not found" in str(exc) else 409
        raise HTTPException(status_code=code, detail=detail) from exc
    return {
        "schema_version": "research.p11.cancel-marker.v1",
        "run_id": run_id,
        "worker_attempt_id": body.worker_attempt_id,
        "status": status,
    }


__all__ = ["router"]
