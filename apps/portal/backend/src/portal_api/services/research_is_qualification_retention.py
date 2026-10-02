"""Operator-only IS qualification custody outside every public artifact bundle."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Callable

from portal_api.services.research_enrich_analysis import declared_source_windows
from portal_api.services.research_is_qualification import (
    FILE_NAME, copy_is_qualification_file, validate_is_qualification_metadata,
)

METADATA_NAME = "qualification-metadata.json"
DIRECTORY_NAME = "research-is-qualification"


def retain_is_qualification(*, request: Any, source: dict[str, Any], source_path: Path | None,
                            private_root: Path, evidence: dict[str, Any],
                            fence_validator: Callable[[Any], bool]) -> None:
    """One bounded source copy under the live lease, never a public ingress."""
    validate_is_qualification_metadata(source)
    binding = {key: getattr(request, key) for key in ("run_id", "job_id", "worker_attempt_id", "lease_epoch")}
    for key in ("run_id", "job_id", "worker_attempt_id"):
        if not isinstance(binding[key], str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,96}", binding[key]):
            raise ValueError("IS qualification private identity is invalid")
    if type(binding["lease_epoch"]) is not int or binding["lease_epoch"] < 1:
        raise ValueError("IS qualification private lease is invalid")
    if source["state"] != "AVAILABLE":
        # Absence is not a successful qualification or a reason to invent
        # retained rows. The owned receipt must report it, never mark PASS.
        return
    if source_path is None or not fence_validator(binding):
        raise ValueError("IS qualification source or live lease is unavailable")
    windows = declared_source_windows(request.research.requested_spec["windows"])
    enriched = evidence["enriched_analysis"]
    observation = [row for row in enriched["source_tables"] if row["name"] == "OBSERVATION_IS"]
    if len(observation) != 1 or observation[0]["digest"] != source["observation_is_digest"] \
            or observation[0]["row_count"] != source["row_count"]:
        raise ValueError("IS qualification does not match the exact public source identity")
    # The directory is derived from server-owned IDs, not a child path or
    # browser value. Verify all ancestors before creating the bounded subtree.
    root = private_root / DIRECTORY_NAME
    directory = root / binding["run_id"] / binding["worker_attempt_id"] / str(binding["lease_epoch"])
    for path in (private_root, root, root / binding["run_id"], directory.parent, directory):
        if path.is_symlink() or (path.exists() and not path.is_dir()):
            raise ValueError("IS qualification requires regular private directories")
    directory.mkdir(mode=0o700, parents=True, exist_ok=False)
    os.chmod(directory, 0o700)
    destination = directory / FILE_NAME
    metadata_path = directory / METADATA_NAME
    try:
        copy_is_qualification_file(source_path, destination, source, binding=binding, source_windows=windows)
        if not fence_validator(binding):
            raise ValueError("IS qualification lease expired during custody")
        metadata = {"schema_version": "research.is-qualification-private-custody.v1",
            "binding": binding, "workspace_id": request.workspace_id,
            "source_windows": windows, "source": source,
            "requested_spec_digest": request.research.requested_spec_digest,
            "effective_spec_digest": request.research.effective_spec_digest,
            "dataset_binding_digest": request.research.dataset_binding_digest,
            "enrichment_input_digest": enriched["input_digest"],
            "benchmark_locator": evidence["summary_analytics_v2"]["benchmark_locator"],
            "authority": "PRIVATE_NUMERICAL_QUALIFICATION_NOT_PUBLIC_RETENTION"}
        raw = json.dumps(metadata, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
        if len(raw) > 8192:
            raise ValueError("IS qualification custody metadata exceeds its private cap")
        descriptor = os.open(metadata_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        if not fence_validator(binding):
            raise ValueError("IS qualification lease expired before private publication")
    except BaseException:
        # Exact files created in this call only; never remove old evidence.
        destination.unlink(missing_ok=True)
        metadata_path.unlink(missing_ok=True)
        directory.rmdir()
        raise
