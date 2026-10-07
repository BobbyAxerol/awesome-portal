"""Native chronology regression only; no fixture is product qualification."""
from copy import deepcopy
import json
from pathlib import Path

import pytest

from portal_api.domain.research_native_profile import validate_native_spec
from portal_api.domain.research_execution_recipes import execution_recipe


def request_and_recipe():
    root = Path(__file__).resolve().parents[4]
    spec = json.loads((root / "packages/contracts/fixtures/research-run-create.reproduction.valid.json").read_text())["requested_spec"]
    bindings = json.loads((root / "apps/portal/registry/research-native-delta-bindings.v1.json").read_text())
    binding = bindings[0]
    spec["alpha_binding"] = {"alpha_id": binding["alpha_id"], "alpha_version_id": binding["alpha_version_id"]}
    spec["execution_route"] = binding["declared_contract"]["execution"]["execution_route"]
    spec["route_params"] = {}
    spec["client"]["engine_release_id"] = "er_quantbt_111"
    row = next(r for r in json.loads((root / "apps/portal/registry/research-execution-recipes.v1.json").read_text())["recipes"]
               if r["descriptor"].get("schema_version") == "research.native-route-profile.v1"
               and r["descriptor"]["alpha_binding_requirements"]["alpha_version_id"] == binding["alpha_version_id"])
    return spec, execution_recipe(row["profile_id"])


@pytest.mark.parametrize("suffix", ["Z", "", "+00:00"])
def test_native_normalizes_utc_without_rewriting_input(suffix):
    spec, row = request_and_recipe()
    for window in spec["windows"].values():
        for key in ("start", "end_exclusive"):
            window[key] = window[key].removesuffix("Z") + suffix
    before = deepcopy(spec)
    validate_native_spec(spec, row)
    assert spec == before


def test_native_accepts_equivalent_offset_and_refuses_subhour_or_gap():
    spec, row = request_and_recipe()
    for window in spec["windows"].values():
        for key in ("start", "end_exclusive"):
            window[key] = window[key].replace("T00:00:00Z", "T07:00:00+07:00")
    validate_native_spec(spec, row)
    for suffix in ("T07:00:00.000001+07:00", "T07:00:00.0000001+07:00", "T07:01:00+07:00"):
        bad = deepcopy(spec)
        bad["windows"]["is"]["start"] = bad["windows"]["is"]["start"].replace("T07:00:00+07:00", suffix)
        with pytest.raises(ValueError, match="UTC 1h edges"):
            validate_native_spec(bad, row)
    bad = deepcopy(spec)
    bad["windows"]["oos"]["start"] = bad["windows"]["oos"]["start"].replace("T07:00:00", "T08:00:00")
    with pytest.raises(ValueError, match="chronology"):
        validate_native_spec(bad, row)
