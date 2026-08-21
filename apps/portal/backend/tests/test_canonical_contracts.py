from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker
from pydantic import ValidationError
from referencing import Registry, Resource

from portal_api.domain.canonical import (
    CommandEnvelope,
    EventEnvelope,
    ProblemDocument,
)


REPO_ROOT = Path(__file__).resolve().parents[4]
CONTRACTS_ROOT = REPO_ROOT / "packages" / "contracts"
SCHEMAS_ROOT = CONTRACTS_ROOT / "schemas"
FIXTURES_ROOT = CONTRACTS_ROOT / "fixtures"


def _load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _schema_registry() -> Registry:
    schemas = [
        _load_json(SCHEMAS_ROOT / name)
        for name in (
            "common.v1.schema.json",
            "problem.v1.schema.json",
            "command-envelope.v1.schema.json",
            "event-envelope.v1.schema.json",
            "keyset-page.v1.schema.json",
        )
    ]
    return Registry().with_resources(
        (schema["$id"], Resource.from_contents(schema)) for schema in schemas
    )


def _validate(schema_id: str, document: dict[str, object]) -> None:
    validator = Draft202012Validator(
        {"$schema": "https://json-schema.org/draft/2020-12/schema", "$ref": schema_id},
        registry=_schema_registry(),
        format_checker=FormatChecker(),
    )
    errors = list(validator.iter_errors(document))
    assert not errors, "\n".join(error.message for error in errors)


def test_every_canonical_fixture_is_schema_valid() -> None:
    mapping = {
        "problem.valid.json": (
            "https://schemas.primusspark.com/portal/problem.v1.schema.json"
        ),
        "command.valid.json": (
            "https://schemas.primusspark.com/portal/command-envelope.v1.schema.json"
        ),
        "event.valid.json": (
            "https://schemas.primusspark.com/portal/event-envelope.v1.schema.json"
        ),
        "keyset-page.valid.json": (
            "https://schemas.primusspark.com/portal/keyset-page.v1.schema.json"
        ),
    }
    for name, schema_id in mapping.items():
        _validate(schema_id, _load_json(FIXTURES_ROOT / name))


def test_problem_document_round_trips_and_rejects_secrets() -> None:
    payload = _load_json(FIXTURES_ROOT / "problem.valid.json")
    model = ProblemDocument.model_validate(payload)

    assert model.code == "AGGREGATE_VERSION_CONFLICT"
    assert model.status == 409
    assert model.model_dump(mode="json") == payload

    with pytest.raises(ValidationError):
        ProblemDocument.model_validate({**payload, "code": "bad code!"})
    with pytest.raises(ValidationError):
        ProblemDocument.model_validate({**payload, "status": 200})
    with pytest.raises(ValidationError):
        ProblemDocument.model_validate({**payload, "detail": "x" * 501})


def test_command_envelope_enforces_idempotency_and_concurrency_fields() -> None:
    payload = _load_json(FIXTURES_ROOT / "command.valid.json")
    model = CommandEnvelope.model_validate(payload)

    assert model.idempotency_key.startswith("run_create:")
    assert model.expected_aggregate_version == 3
    assert model.payload_schema_version == "quant.run.create.v1"

    with pytest.raises(ValidationError):
        CommandEnvelope.model_validate({**payload, "idempotency_key": "bad key!"})
    with pytest.raises(ValidationError):
        CommandEnvelope.model_validate({**payload, "expected_aggregate_version": 0})
    with pytest.raises(ValidationError):
        CommandEnvelope.model_validate({**payload, "unknown_field": True})


def test_event_envelope_matches_guide_section_67() -> None:
    payload = _load_json(FIXTURES_ROOT / "event.valid.json")
    model = EventEnvelope.model_validate(payload)

    assert model.event_type == "quant.run.progressed.v1"
    assert model.aggregate_type == "run_attempt"
    assert model.aggregate_version == 12
    assert model.producer == "quant-worker-py@0.1.0"
    assert model.model_dump(mode="json") == payload

    with pytest.raises(ValidationError):
        EventEnvelope.model_validate({**payload, "aggregate_version": 0})
    with pytest.raises(ValidationError):
        EventEnvelope.model_validate(
            {**payload, "occurred_at": "2026-08-15T12:00:00"}
        )
    with pytest.raises(ValidationError):
        EventEnvelope.model_validate({**payload, "producer": "untrusted producer"})


def test_opaque_ids_accept_both_ulid_and_uuid_hex_shapes() -> None:
    command = _load_json(FIXTURES_ROOT / "command.valid.json")
    CommandEnvelope.model_validate(command)

    legacy = {
        **command,
        "request_id": "req_0123456789abcdef0123456789abcdef",
    }
    CommandEnvelope.model_validate(legacy)

    with pytest.raises(ValidationError):
        CommandEnvelope.model_validate(
            {**command, "request_id": "UPPER_01J2K3M4N5P6Q7R8S9T0A1B2C3"}
        )


def test_canonical_models_never_leak_raw_secrets_in_dumps() -> None:
    for name in (
        "problem.valid.json",
        "command.valid.json",
        "event.valid.json",
        "keyset-page.valid.json",
    ):
        payload = _load_json(FIXTURES_ROOT / name)
        encoded = json.dumps(payload)
        for marker in ("token=", "secret=", "/srv/", "/home/"):
            assert marker not in encoded


def test_contracts_snapshot_digests_verify_every_tracked_file() -> None:
    import hashlib

    snapshot = _load_json(CONTRACTS_ROOT / "contracts-snapshot.json")
    assert snapshot["schema_version"] == "contracts.snapshot.v1"
    digests = snapshot["file_digests"]
    assert len(digests) >= 10
    for relative, digest in digests.items():
        path = CONTRACTS_ROOT / relative
        assert path.is_file(), f"snapshot references missing file {relative}"
        actual = f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"
        assert actual == digest, f"{relative} drifted from the snapshot"
