"""E17 exact-digest imported Alpha child tests.

These tests exercise the real child evaluator with the pinned QuantBT adapter.
They do not grant the imported source ambient Python authority and do not
weaken the supervisor/AppArmor gate exercised by the P06 runtime tests.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

import pytest

from portal_api.domain.research_imported_alpha_profile import (
    IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
    IMPORTED_ALPHA_ADAPTER_ID,
    IMPORTED_ALPHA_PROFILE_DIGEST,
    IMPORTED_ALPHA_PROFILE_ID,
)
from portal_api.workers.research_child import execute_receipt


BACKEND_ROOT = Path(__file__).parents[1]
MARKET_PATH = BACKEND_ROOT / "tests" / "fixtures" / "golden_market.parquet"

VALID_SOURCE = b'''ALPHA_CONTRACT = {
    "schema_version": "research.alpha-source.v1",
    "version": "0.3.0",
    "entrypoint": "generate_signals",
    "timeframes": ["1h"],
    "required_columns": ["open", "high", "low", "close", "volume"],
    "warmup_bars": 2,
    "determinism": {"seed_required": True},
    "parameter_space": {"scale": {"kind": "fixed", "value": 1000}},
}
def generate_signals(context):
    history = context["history"]["close"]
    direction = 1 if history[-1] >= history[-2] else -1
    return {
        "schema_version": "research.imported-signal-notional-output.v1",
        "signal_notional": direction * context["parameters"]["scale"],
    }
'''


def _receipt(source_path: Path, source_bytes: bytes = VALID_SOURCE) -> dict[str, object]:
    return {
        "schema_version": "research.p06.child-receipt.v1",
        "task": "P17_IMPORTED_SIGNAL_NOTIONAL",
        "job_id": "rjob_e17_child",
        "run_id": "rrun_e17_child",
        "worker_attempt_id": "rwa_e17_child",
        "lease_epoch": 1,
        "market_path": str(MARKET_PATH),
        "source_path": str(source_path),
        "source_digest": hashlib.sha256(source_bytes).hexdigest(),
        "entrypoint": "generate_signals",
        "parameters": {"scale": 1000},
        "random_seed": 7,
        "artifact_root": str(source_path.parent / "artifacts"),
        "oos_start_utc_ms": 0,
        "execution_adapter_id": IMPORTED_ALPHA_ADAPTER_ID,
        "adapter_contract_digest": IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
        "execution_profile_id": IMPORTED_ALPHA_PROFILE_ID,
        "execution_profile_digest": IMPORTED_ALPHA_PROFILE_DIGEST,
    }


def test_e17_child_executes_exact_source_against_past_only_context(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "alpha.py"
    source.write_bytes(VALID_SOURCE)
    os.chmod(source, 0o600)
    monkeypatch.setenv("TMPDIR", str(tmp_path))

    result = execute_receipt(_receipt(source))

    assert result["task"] == "P17_IMPORTED_SIGNAL_NOTIONAL"
    assert result["engine_version"] == "1.1.1"
    assert result["bars"] == 500
    assert result["source_digest"] == hashlib.sha256(VALID_SOURCE).hexdigest()
    assert result["execution_profile_digest"] == IMPORTED_ALPHA_PROFILE_DIGEST
    assert result["num_trades"] >= 0
    assert isinstance(result["final_equity"], float)
    assert result["evidence_source"]["source"]["execution_adapter_id"] == IMPORTED_ALPHA_ADAPTER_ID


@pytest.mark.parametrize(
    "source_bytes, error",
    [
        (VALID_SOURCE.replace(b"def generate_signals", b"import os\ndef generate_signals"), "Import"),
        (VALID_SOURCE.replace(b'history = context["history"]["close"]', b'history = context.__class__'), "Attribute"),
        (VALID_SOURCE.replace(b'"signal_notional": direction * context["parameters"]["scale"]', b'"signal_notional": open("/etc/passwd").read()'), "bounded safe"),
    ],
)
def test_e17_child_rejects_ambient_authority(
    tmp_path: Path,
    source_bytes: bytes,
    error: str,
) -> None:
    source = tmp_path / "alpha.py"
    source.write_bytes(source_bytes)
    os.chmod(source, 0o600)
    with pytest.raises(ValueError, match=error):
        execute_receipt(_receipt(source, source_bytes))


def test_e17_child_rejects_source_digest_drift(tmp_path: Path) -> None:
    source = tmp_path / "alpha.py"
    source.write_bytes(VALID_SOURCE + b"\n# altered")
    os.chmod(source, 0o600)
    with pytest.raises(ValueError, match="immutable digest"):
        execute_receipt(_receipt(source))
