"""P23-T03: real ENOSPC on an isolated, tiny disk, never a shared volume.

Run this only in the pinned portal-api image, with a private ext4 loop
filesystem bind-mounted at /mnt/t03. The caller owns mount/teardown. This
probe writes no DB row and opens no network connection.
"""

from __future__ import annotations

import errno
import json
import os
import shutil
import sys
from pathlib import Path

import pyarrow as pa

from portal_api.services.research_artifacts import (
    ArtifactFence,
    ArtifactIdentity,
    ArtifactSchemaRegistry,
    ArtifactTableSchema,
    ResearchArtifactError,
    ResearchArtifactStore,
)


ROOT = Path("/mnt/t03")
MAX_FILESYSTEM_BYTES = 128 * 1024 * 1024
HIGH_WATER_FREE_BYTES = 4 * 1024 * 1024
FILLER = ROOT / "p23-t03-filler.bin"
SCHEMA = pa.schema([pa.field("seq", pa.int64(), nullable=False)])
REGISTRY = ArtifactSchemaRegistry(
    [ArtifactTableSchema("trial_index", "research.t03-trial-index.v1", SCHEMA, sequence_column="seq")]
)


def free_bytes() -> int:
    stat = os.statvfs(ROOT)
    return stat.f_bavail * stat.f_frsize


def new_writer(store: ResearchArtifactStore, artifact_id: str):
    identity = ArtifactIdentity(
        artifact_id=artifact_id,
        artifact_revision=1,
        workspace_id="ws_p23_t03",
        run_id="run_p23_t03",
        engine_release_id="quantbt_1_1_1",
        engine_build_ref="p23-pinned-runtime",
        request_spec_digest="a" * 64,
        effective_spec_digest="b" * 64,
        dataset_binding_digest="c" * 64,
    )
    fence = ArtifactFence("ws_p23_t03", "run_p23_t03", "worker_p23_t03", 1)
    return store.begin_write(
        identity=identity,
        fence=fence,
        schema_registry=REGISTRY,
        fence_validator=lambda given: given == fence,
    )


def batch(start: int) -> pa.RecordBatch:
    return pa.record_batch([pa.array(range(start, start + 128), type=pa.int64())], schema=SCHEMA)


def fill_disk(target_free: int) -> tuple[int, bool]:
    written = 0
    hit_enospc = False
    with FILLER.open("ab", buffering=0) as handle:
        for _ in range(16_384):
            available = free_bytes()
            if available <= target_free:
                break
            amount = min(256 * 1024, available - target_free)
            try:
                written += os.write(handle.fileno(), b"\0" * amount)
                os.fsync(handle.fileno())
            except OSError as exc:
                if exc.errno != errno.ENOSPC:
                    raise
                hit_enospc = True
                break
        else:
            raise AssertionError("T03_FILL_LOOP_BOUND_EXCEEDED")
    return written, hit_enospc


def seal_full_probe() -> int:
    """Probe the manifest/rename path separately from Parquet append."""
    if not ROOT.is_dir() or ROOT.stat().st_dev == Path("/").stat().st_dev:
        raise AssertionError("T03_DEDICATED_MOUNT_REQUIRED")
    usage = shutil.disk_usage(ROOT)
    if not 16 * 1024 * 1024 <= usage.total <= MAX_FILESYSTEM_BYTES or FILLER.exists():
        raise AssertionError("T03_TINY_FRESH_FILESYSTEM_REQUIRED")
    existing = ResearchArtifactStore(ROOT / "research-store")
    baseline_digest = existing.reader(cursor_secret=b"p23-t03-reader-cursor-secret-32bytes").inspect(
        "art_p23_t03_baseline"
    ).manifest_digest
    store = ResearchArtifactStore(ROOT / "seal-store")
    writer = new_writer(store, "art_p23_t03_manifest_pressure_v2")
    writer.append_batch("trial_index", batch(1))
    # Seal removes its lease marker before writing the manifest, releasing a
    # filesystem block. A tiny manifest can use that block even at 0 free.
    # Keep this bounded manifest > one block so the test truly pressures seal.
    for index in range(128):
        writer.write_small_document(f"note_{index:03d}", {"index": index, "note": "x" * 64})
    result: dict[str, object] = {
        "schema_version": "research.p23-t03-manifest-pressure.v1",
        "filesystem_bytes": usage.total,
        "baseline_manifest_sha256": baseline_digest,
    }
    try:
        filled, _ = fill_disk(0)
        result["full_fill_bytes"] = filled
        result["full_free_bytes"] = free_bytes()
        try:
            writer.seal()
            result["seal_result"] = "UNEXPECTED_ACCEPT"
        except ResearchArtifactError as exc:
            result["seal_result"] = exc.reason
        except OSError as exc:
            result["seal_result"] = f"UNTYPED_OSError_{exc.errno}"
        except Exception as exc:
            result["seal_result"] = f"UNTYPED_{type(exc).__name__}"
        result["original_read_during_full"] = (
            existing.reader(cursor_secret=b"p23-t03-reader-cursor-secret-32bytes")
            .inspect("art_p23_t03_baseline").manifest_digest == baseline_digest
        )
    finally:
        FILLER.unlink(missing_ok=True)
        writer.abort()
    result["staging_after_abort"] = len(store.reconcile()["staging"])
    recovered = new_writer(store, "art_p23_t03_manifest_recovered_v2")
    recovered.append_batch("trial_index", batch(129))
    result["recovery_manifest_sha256"] = recovered.seal().manifest_digest
    result["passed_manifest_scope"] = (
        result["seal_result"] == "RESEARCH_ARTIFACT_DISK_FULL"
        and result["full_free_bytes"] == 0
        and result["original_read_during_full"]
        and result["staging_after_abort"] == 0
    )
    print(json.dumps(result, sort_keys=True))
    return 0 if result["passed_manifest_scope"] else 1


def main() -> int:
    if ROOT != Path("/mnt/t03") or not ROOT.is_dir() or ROOT.stat().st_dev == Path("/").stat().st_dev:
        raise AssertionError("T03_DEDICATED_MOUNT_REQUIRED")
    usage = shutil.disk_usage(ROOT)
    if not 16 * 1024 * 1024 <= usage.total <= MAX_FILESYSTEM_BYTES:
        raise AssertionError("T03_TINY_FILESYSTEM_REQUIRED")
    if FILLER.exists():
        raise AssertionError("T03_FRESH_FILLER_REQUIRED")

    store = ResearchArtifactStore(ROOT / "research-store")
    baseline = new_writer(store, "art_p23_t03_baseline")
    baseline.append_batch("trial_index", batch(1))
    before = baseline.seal()
    high_water = None
    pressure = new_writer(store, "art_p23_t03_pressure")
    pressure.append_batch("trial_index", batch(257))
    result: dict[str, object] = {
        "schema_version": "research.p23-t03-disk-pressure.v1",
        "filesystem_bytes": usage.total,
        "separate_filesystem": True,
        "baseline_manifest_sha256": before.manifest_digest,
    }
    try:
        high_written, _ = fill_disk(HIGH_WATER_FREE_BYTES)
        result["high_water_fill_bytes"] = high_written
        result["high_water_free_bytes"] = free_bytes()
        high_writer = new_writer(store, "art_p23_t03_high_water")
        high_writer.append_batch("trial_index", batch(513))
        high_water = high_writer.seal()
        result["high_water_seal_sha256"] = high_water.manifest_digest

        full_written, filler_enospc = fill_disk(0)
        result["full_fill_bytes"] = full_written
        result["filler_hit_enospc"] = filler_enospc
        result["full_free_bytes"] = free_bytes()
        try:
            pressure.append_batch("trial_index", batch(641))
            result["pressure_result"] = "UNEXPECTED_ACCEPT"
        except ResearchArtifactError as exc:
            result["pressure_result"] = exc.reason
        except Exception as exc:  # Capture a real untyped storage failure, never relabel it PASS.
            result["pressure_result"] = f"UNTYPED_{type(exc).__name__}"
        result["sealed_read_during_full"] = (
            store.reader(cursor_secret=b"p23-t03-reader-cursor-secret-32bytes")
            .inspect(before.artifact_id).manifest_digest == before.manifest_digest
        )
    finally:
        # Only this test filler is removed; neither the sealed originals nor
        # the wider P23 artifact volume is ever a deletion target.
        FILLER.unlink(missing_ok=True)
        pressure.abort()

    result["staging_after_abort"] = len(store.reconcile()["staging"])
    result["baseline_unchanged"] = (
        store.reader(cursor_secret=b"p23-t03-reader-cursor-secret-32bytes")
        .inspect(before.artifact_id).manifest_digest == before.manifest_digest
    )
    result["high_water_unchanged"] = bool(high_water) and (
        store.reader(cursor_secret=b"p23-t03-reader-cursor-secret-32bytes")
        .inspect(high_water.artifact_id).manifest_digest == high_water.manifest_digest
    )
    recovered = new_writer(store, "art_p23_t03_recovered")
    recovered.append_batch("trial_index", batch(769))
    result["recovery_manifest_sha256"] = recovered.seal().manifest_digest
    result["passed_writer_scope"] = (
        result["pressure_result"] == "RESEARCH_ARTIFACT_DISK_FULL"
        and result["sealed_read_during_full"]
        and result["baseline_unchanged"]
        and result["high_water_unchanged"]
        and result["staging_after_abort"] == 0
        and result["full_free_bytes"] == 0
    )
    print(json.dumps(result, sort_keys=True))
    return 0 if result["passed_writer_scope"] else 1


if __name__ == "__main__":
    try:
        if len(sys.argv) > 2 or (len(sys.argv) == 2 and sys.argv[1] != "--seal-full"):
            raise AssertionError("T03_UNSUPPORTED_ARGUMENT")
        raise SystemExit(seal_full_probe() if len(sys.argv) == 2 else main())
    except Exception as error:
        print(json.dumps({"schema_version": "research.p23-t03-disk-pressure.v1",
                          "passed_writer_scope": False, "error": type(error).__name__,
                          "reason": str(error)[:160]}, sort_keys=True), file=sys.stderr)
        raise SystemExit(1) from None
