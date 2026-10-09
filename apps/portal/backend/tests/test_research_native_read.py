"""P05 bytes, not an engine/stub: bounded preparation and tamper rejection."""
from pathlib import Path
from types import SimpleNamespace
import json
import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from portal_api.services.research_artifacts import (
    ArtifactFence, ArtifactIdentity, ArtifactSchemaRegistry, ArtifactTableSchema, ResearchArtifactStore,
)
from portal_api.services.research_native_optimization import capture, TABLE, VERSION, ROW_SCHEMA
from portal_api.services.research_native_read import prepare_native_read


def retained(tmp_path):
    trial = lambda i: SimpleNamespace(number=i, state="COMPLETE", params={"x": i+1}, values=(float(i+1),), metrics={"sharpe":float(i+1)}, metadata={})
    summary = capture(SimpleNamespace(trials=[trial(i) for i in range(3)], selected_params={"x":2},
        selection_metadata={"medoid_trial_number":1}), output_directory=tmp_path, requested_trials=3,
        is_end_utc_ms=200, train_start_utc_ms=100)
    root = tmp_path / "retained"
    store = ResearchArtifactStore(root)
    writer = store.begin_write(identity=ArtifactIdentity("art_native",1,"ws_native","rrun_native",
        "quantbt-engine-1.1.1","pinned-build","a"*64,"b"*64,"c"*64),
        fence=ArtifactFence("ws_native","rrun_native","worker_native",1),
        schema_registry=ArtifactSchemaRegistry([ArtifactTableSchema(TABLE,VERSION,ROW_SCHEMA,"source_ordinal","trial_number",{})]),
        fence_validator=lambda _:True)
    writer.append_batch(TABLE,pa.RecordBatch.from_pylist(pq.read_table(tmp_path / "native-optimizer-trials.parquet").to_pylist(),schema=ROW_SCHEMA))
    writer.write_small_document("native_optimization",summary)
    writer.write_small_document("run_receipt",{"native_execution":{"optimization":summary}})
    candidate=writer.seal()
    binding=dict(workspace_id="ws_native",run_id="rrun_native",artifact_id="art_native",artifact_revision=1,
        manifest_digest=candidate.manifest_digest,requested_spec_digest="a"*64,effective_spec_digest="b"*64,
        dataset_binding_digest="c"*64,execution_profile_id="p10.native-test.v1",execution_profile_digest="d"*64)
    return root,binding


def test_real_sealed_parquet_selected_identity_and_decimal_strings(tmp_path):
    root,binding=retained(tmp_path)
    before=sorted(str(p.relative_to(root)) for p in root.rglob("*"))
    value=prepare_native_read(root,binding)
    assert value["engine_version"]=="1.1.1"
    assert len(value["trials"])==3
    assert value["trials"][1]["selected"] and value["trials"][1]["trial_ordinal"]==2
    assert value["trials"][1]["parameters"]=={"x":"2"}
    assert value["trials"][1]["objective"]["value"]=="2.0"
    assert value==prepare_native_read(root,binding)
    assert sorted(str(p.relative_to(root)) for p in root.rglob("*"))==before


@pytest.mark.parametrize("field",["workspace_id","run_id","manifest_digest","requested_spec_digest"])
def test_foreign_or_changed_binding_is_rejected(tmp_path,field):
    root,binding=retained(tmp_path)
    binding[field]="e"*64
    with pytest.raises(ValueError,match="BINDING_MISMATCH"):
        prepare_native_read(root,binding)


def test_corrupt_part_never_acknowledges_projection(tmp_path):
    root,binding=retained(tmp_path)
    part=next((root / "artifacts").rglob("*.parquet"))
    part.chmod(0o600)
    with part.open("ab") as out:out.write(b"changed")
    with pytest.raises(Exception):prepare_native_read(root,binding)


def test_missing_store_does_not_create_dirs(tmp_path):
    root=tmp_path / "absent"
    with pytest.raises(ValueError,match="STORE_MISSING"):prepare_native_read(root,{})
    assert not root.exists()


def test_private_route_requires_dedicated_signed_operation(monkeypatch):
    import base64,hashlib,hmac,time
    from fastapi import HTTPException
    from starlette.requests import Request
    from portal_api.api.routes_research_internal import prepare_native_read_models, NativeReadPreparationRequest
    from pydantic import ValidationError
    secret="native-read-test-private-secret-not-production"
    monkeypatch.setenv("INTERNAL_PRINCIPAL_SECRET",secret)
    body=dict(workspace_id="ws_native",run_id="rrun_native",artifact_id="art_native",artifact_revision=1,
        manifest_digest="a"*64,requested_spec_digest="b"*64,effective_spec_digest="c"*64,
        dataset_binding_digest="d"*64,execution_profile_id="p10.native-test.v1",execution_profile_digest="e"*64)
    def signed(role,methods):
        payload=dict(principalId="usr_native",username="native",role=role,exp=int(time.time())+30,
            policyVersion="auth-policy-v1",authnMethods=methods)
        encoded=base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
        mac=base64.urlsafe_b64encode(hmac.new(secret.encode(),encoded.encode(),hashlib.sha256).digest()).decode().rstrip("=")
        return (encoded+"."+mac).encode()
    for token,status in [(b"",401),(signed("USER",["research_native_read_prepare"]),403),(signed("ADMIN",["portal_session"]),403)]:
        request=Request({"type":"http","headers":[(b"x-portal-principal",token)]})
        with pytest.raises(HTTPException) as exc:prepare_native_read_models(request,NativeReadPreparationRequest(**body))
        assert exc.value.status_code==status
    with pytest.raises(ValidationError):NativeReadPreparationRequest(**body,source_path="/untrusted")
