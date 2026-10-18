from __future__ import annotations

import copy
import json
import shutil
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from portal_api.domain.portal_registry import PortalRegistryDocument, PortalRegistrySource
from portal_api.main import create_app
from portal_api.repositories.portal_registry import (
    PortalRegistryRepository,
    canonical_digest,
    registry_invariant_errors,
)

REGISTRY_ROOT = Path(__file__).resolve().parents[2] / "registry"
REPLACEMENT = {"read_mode": "SCOPED_V2", "feature_id": "EXECUTION_APPROVALS"}


def _source() -> dict:
    return json.loads((REGISTRY_ROOT / "registry.json").read_text(encoding="utf-8"))


def _features(source: dict) -> dict:
    return {feature["id"]: feature for feature in source["features"]}


def test_revision7_is_metadata_only_and_preserves_both_approval_routes() -> None:
    source = _source()
    features = _features(source)
    assert source["revision"] == 7
    assert features["APPROVALS"]["canonical_route"] == "/backtests/approvals"
    assert features["EXECUTION_APPROVALS"]["canonical_route"] == "/governance/approvals"
    assert features["APPROVALS"]["screen_ids"] == ["APPROVAL_INBOX_SCREEN"]
    assert features["APPROVALS"]["navigation"]["scoped_v2_replacement"] == REPLACEMENT
    for feature_id in ("APPROVALS", "EXECUTION_APPROVALS"):
        feature = features[feature_id]
        assert feature["maturity"] == "COMMISSIONED"
        assert feature["data_mode"] == "NONE"
        assert feature["permissions"] == ["approval.read"]
        assert feature["navigation"]["show_in_sidebar"] is True
        assert feature["navigation"]["show_in_command_palette"] is True
    assert [feature["id"] for feature in source["features"]
            if feature["navigation"].get("scoped_v2_replacement") is not None] == ["APPROVALS"]
    assert not registry_invariant_errors(PortalRegistrySource.model_validate(source))


def test_navigation_openapi_retains_closed_typed_properties() -> None:
    # Presence-preserving serialization must not turn the generated client
    # into an untyped dictionary or erase the pre-existing navigation fields.
    schemas = create_app().openapi()["components"]["schemas"]
    navigation = schemas["NavigationDefinition"]
    assert navigation["additionalProperties"] is False
    assert set(navigation["required"]) == {
        "order", "icon_key", "show_in_sidebar", "show_in_command_palette"
    }
    assert navigation["properties"]["scoped_v2_replacement"]["anyOf"] == [
        {"$ref": "#/components/schemas/ScopedV2NavigationReplacement"}, {"type": "null"}
    ]
    replacement = schemas["ScopedV2NavigationReplacement"]
    assert replacement["additionalProperties"] is False
    assert replacement["properties"]["read_mode"]["const"] == "SCOPED_V2"
    assert replacement["properties"]["feature_id"]["const"] == "EXECUTION_APPROVALS"


@pytest.mark.parametrize("presence", ["absent", "null", "replacement"])
def test_navigation_preserves_presence_digest_and_old_registry_validity(
    tmp_path: Path, presence: str
) -> None:
    source = _source()
    navigation = _features(source)["APPROVALS"]["navigation"]
    if presence == "absent":
        source["revision"] = 6
        navigation.pop("scoped_v2_replacement")
    elif presence == "null":
        navigation["scoped_v2_replacement"] = None
    root = tmp_path / "registry"
    shutil.copytree(REGISTRY_ROOT, root)
    (root / "registry.json").write_text(json.dumps(source), encoding="utf-8")
    document = PortalRegistryRepository(root).load().document.model_dump(mode="json")
    projected_navigation = _features(document)["APPROVALS"]["navigation"]
    assert ("scoped_v2_replacement" in projected_navigation) == (presence != "absent")
    assert projected_navigation.get("scoped_v2_replacement") == navigation.get("scoped_v2_replacement")
    assert all("scoped_v2_replacement" not in feature["navigation"]
               for feature in document["features"] if feature["id"] != "APPROVALS")
    digest = document["content_digest"]
    assert digest == canonical_digest({key: value for key, value in document.items()
                                       if key != "content_digest"})
    assert PortalRegistryDocument.model_validate(document).model_dump(mode="json") == document


@pytest.mark.parametrize("bad", [
    {"read_mode": "SCOPED_CURRENT", "feature_id": "EXECUTION_APPROVALS"},
    {"read_mode": "SCOPED_V2", "feature_id": "PROFILE_ACCESS"},
    {**REPLACEMENT, "grant": True},
    {"read_mode": "SCOPED_V2"},
])
def test_navigation_replacement_rejects_unknown_modes_targets_and_authority(bad: dict) -> None:
    source = _source()
    _features(source)["APPROVALS"]["navigation"]["scoped_v2_replacement"] = bad
    schema = json.loads((REGISTRY_ROOT / "schemas" / "portal-registry-source.v1.schema.json").read_text())
    assert list(Draft202012Validator(schema).iter_errors(source))
    with pytest.raises(ValidationError):
        PortalRegistrySource.model_validate(source)


@pytest.mark.parametrize("mutation,reason", [
    ("old_revision", "requires registry revision 7"),
    ("wrong_feature", "limited to APPROVALS"),
    ("missing_target", "target is unavailable"),
    ("hidden_target", "target is unavailable"),
])
def test_navigation_replacement_rejects_wrong_scope_or_unavailable_target(
    mutation: str, reason: str
) -> None:
    source = copy.deepcopy(_source())
    features = _features(source)
    if mutation == "old_revision":
        source["revision"] = 6
    elif mutation == "wrong_feature":
        features["PLANNING"]["navigation"]["scoped_v2_replacement"] = REPLACEMENT
    elif mutation == "missing_target":
        source["features"] = [feature for feature in source["features"]
                              if feature["id"] != "EXECUTION_APPROVALS"]
    else:
        features["EXECUTION_APPROVALS"]["maturity"] = "HIDDEN"
    errors = registry_invariant_errors(PortalRegistrySource.model_validate(source))
    assert any(reason in error for error in errors)
