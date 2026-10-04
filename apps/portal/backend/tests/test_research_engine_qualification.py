from __future__ import annotations

import pytest

from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.domain.research_engine_qualification import (
    ENGINE_110_QUALIFICATION_BINDING, ENGINE_110_QUALIFICATION_BINDING_DIGEST,
    validate_engine_qualification_binding,
)


def test_old_qualification_is_never_implicit_or_production(monkeypatch):
    binding = {**ENGINE_110_QUALIFICATION_BINDING, "binding_digest": ENGINE_110_QUALIFICATION_BINDING_DIGEST}
    kwargs = dict(release_id="er_quantbt_110", profile_id="p04.fixed-qualification.v1",
        adapter_contract_digest=binding["adapter_contract_digest"])
    monkeypatch.delenv("PORTAL_RESEARCH_ENGINE_QUALIFICATION_VERSION", raising=False)
    with pytest.raises(ValueError, match="EXACT_LOCAL"):
        validate_engine_qualification_binding(binding, **kwargs)
    with pytest.raises(RuntimeError, match="isolated-only"):
        QuantBTGateway(expected_version="1.1.0")
    monkeypatch.setenv("PORTAL_ENV", "local")
    monkeypatch.setenv("PORTAL_RESEARCH_ENGINE_QUALIFICATION_VERSION", "1.1.0")
    assert validate_engine_qualification_binding(binding, **kwargs) == "1.1.0"
    assert QuantBTGateway()._expected_version == "1.1.1"
    assert QuantBTGateway(expected_version="1.1.0")._expected_version == "1.1.0"
    with pytest.raises(ValueError, match="EXACT_LOCAL"):
        validate_engine_qualification_binding({**binding, "native_version": "0.4.2"}, **kwargs)
    with pytest.raises(ValueError, match="EXACT_LOCAL"):
        validate_engine_qualification_binding({**binding, "binding_digest": "0" * 64}, **kwargs)
    with pytest.raises(ValueError, match="EXACT_LOCAL"):
        validate_engine_qualification_binding({**binding, "engine_wheel_sha256": "0" * 64}, **kwargs)
    with pytest.raises(ValueError, match="EXACT_LOCAL"):
        validate_engine_qualification_binding(None, **kwargs)
    monkeypatch.setenv("PORTAL_ENV", "live")
    with pytest.raises(ValueError, match="EXACT_LOCAL"):
        validate_engine_qualification_binding(binding, **kwargs)


def test_current_release_does_not_accept_a_qualification_binding():
    assert validate_engine_qualification_binding(None, release_id="er_quantbt_111", profile_id="p04.fixed-qualification.v1",
        adapter_contract_digest="x") == "1.1.1"
    with pytest.raises(ValueError, match="CANNOT_ENTER_CURRENT"):
        validate_engine_qualification_binding({}, release_id="er_quantbt_111", profile_id="p04.fixed-qualification.v1",
            adapter_contract_digest="x")


def test_confined_old_child_requires_the_supervisor_exact_binding_hash(monkeypatch):
    binding = {**ENGINE_110_QUALIFICATION_BINDING, "binding_digest": ENGINE_110_QUALIFICATION_BINDING_DIGEST}
    kwargs = dict(release_id="er_quantbt_110", profile_id="p04.fixed-qualification.v1",
        adapter_contract_digest=binding["adapter_contract_digest"], confined_child=True)
    monkeypatch.delenv("PORTAL_ENV", raising=False)
    monkeypatch.delenv("PORTAL_RESEARCH_ENGINE_QUALIFICATION_VERSION", raising=False)
    monkeypatch.delenv("RESEARCH_ENGINE_QUALIFICATION_CHILD_BINDING_SHA256", raising=False)
    with pytest.raises(ValueError, match="EXACT_LOCAL"):
        validate_engine_qualification_binding(binding, **kwargs)
    monkeypatch.setenv("RESEARCH_ENGINE_QUALIFICATION_CHILD_BINDING_SHA256", "0" * 64)
    with pytest.raises(ValueError, match="EXACT_LOCAL"):
        validate_engine_qualification_binding(binding, **kwargs)
    monkeypatch.setenv("RESEARCH_ENGINE_QUALIFICATION_CHILD_BINDING_SHA256", ENGINE_110_QUALIFICATION_BINDING_DIGEST)
    assert validate_engine_qualification_binding(binding, **kwargs) == "1.1.0"
    assert QuantBTGateway(expected_version="1.1.0", confined_qualification_child=True)._expected_version == "1.1.0"
    assert QuantBTGateway()._expected_version == "1.1.1"
