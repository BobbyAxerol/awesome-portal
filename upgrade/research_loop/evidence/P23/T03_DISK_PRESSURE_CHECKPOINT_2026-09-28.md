# P23-T03 — isolated real ENOSPC, typed append and untyped seal gap

2026-09-28 · Codex · docs/research-loop-plan · **T03 PARTIAL / NOT_QUALIFIED**.
This is an actual filesystem test of the installed Portal API image, not a
synthetic exception or a claim about the whole P06 durable run. P23/P24 remain
open. No Production, dev, shared preview :8095, Execution, Trading System,
source market data, existing P23 volumes, DB row or runtime flag was changed.

## Exact isolation and reproducibility

- Source at start: 87e04424e3a2fd5addf1c3111bae15a2f2b9969c; pinned image
  sha256:c0abbcd95092bbf8e52db5e9fb33d8ec54c4eee430662e45a27b3abb65674f8b,
  already used by the owned P23 Portal API/worker. Test source:
  [disk-pressure-probe.py](../../../../scripts/research-p23/disk-pressure-probe.py).
- Created one **new 64-MiB ext4 loop image** under private
  /home/bobby/.local/state/portal-research-p23/20260928/t03-disk/.
  findmnt identified /dev/loop4, ext4, rw,nosuid,nodev,noexec;
  total filesystem capacity read by the non-root container: **58,675,200**
  bytes (not its initial free-space measurement).
  Host root had **260 GB available** before the drill; no host/shared volume
  was filled. The image contains only synthetic P23 trial rows.
- Each mounted one-off container used UID/GID 10001, no network, read-only root,
  no Linux capabilities, no-new-privileges, 600-MB memory/swap cgroup,
  64-PID cap and a 16-MiB private /tmp. Only this test mount was writable;
  the script was mounted read-only. All three mounted one-off containers exited and
  Docker ps -a showed none remaining. This proves a bounded one-off setup,
  **not** an overlapping 5-GB time-series receipt.

## Actual observations

| Lane | Observation |
|---|---|
| Append/high-water | With **4,194,304 bytes free**, a new part sealed successfully; manifest SHA-256 f7870575a187cebae98443ed3cb6d71f727559236f1242998e3c0f74b4dd2c7b. |
| Append/full | With **0 bytes available**, another append returned typed RESEARCH_ARTIFACT_DISK_FULL. The original sealed artifact remained readable with unchanged manifest SHA-256 359331e67e7a3b83e664097ef13d19d60c3e0a7e5aafa1b516d6ed575bce914b; after deleting only the synthetic filler, abort left **0 staging directories**, and a new seal succeeded. Probe exit **0**; passed_writer_scope:true. |
| First seal attempt | A tiny manifest could still seal at zero reported free because seal() removed its lease-marker file first, freeing one block. This was an invalid pressure test, not a product PASS; the failed intermediate is preserved. |
| Corrected seal/full | A bounded **128-document** manifest exceeded the freed block. With **0 bytes available**, writer.seal() raised **raw OSError errno 28**, not a typed ResearchArtifactError. Original sealed read remained valid; abort cleared staging; after removing the test filler, a new seal succeeded (SHA-256 69ec1046caadd99354552348f98a3a8a7aea963b5d607423ae2091158b285e84). Probe exit **1** by design; passed_manifest_scope:false. |

The actual pinned Python writer performed fsync/Parquet/manifest operations
inside the separate ext4 filesystem. Source inspection explains the gap:
research_artifacts.py:636 creates the part directory *outside* its ENOSPC
handler; :644–646 maps Parquet OSError to RESEARCH_ARTIFACT_DISK_FULL;
:688–689 creates/writes a small document without that mapping; :702–710
removes the lease marker then calls _write_durable() for the manifest;
_write_durable() at :1322–1334 can propagate raw ENOSPC. Durable worker
_classify() at durable_worker.py:838–865 falls through to generic ENGINE_ERROR
for raw OSError; this last point is a **code inference**, not a public-API
runtime receipt.

A separate no-mount, no-network, 300-MB-capped guard run exited **1** with
T03_DEDICATED_MOUNT_REQUIRED before any write; its --rm container also exited.

## Required source repair — CG-P23-T03-01

Shared <=P21 source owner Claude: normalize genuine ENOSPC/EDQUOT from
part-directory creation, small-document write and manifest seal/fsync/rename
to one typed, bounded disk-full refusal. Preserve random staging/fence,
immutable prior seal, atomic rename and exact abort/retry behavior; do not
translate unrelated I/O errors or mark an unregistered candidate SEALED.
The durable worker must publish a stable disk/storage failure code, never a
raw errno/path or false completion. Add tests for each write transition and
a negative no-space receipt. Codex will retake this exact filesystem probe
**and** a full isolated P06 durable-run/API case on the new clean image;
the present one-off writer result alone cannot close T03.

Cleanup C4: the exact test mount was unmounted, loop association gone,
all four one-off containers were removed by --rm, and only the synthetic
64-MiB image plus its two empty test directories were deleted. This test
image was not a Portal backup or business artifact and is not recoverable;
the source script and measured result above remain. No broad Docker/image/
volume prune and no artifact/reference deletion in the owned P23 cell.
