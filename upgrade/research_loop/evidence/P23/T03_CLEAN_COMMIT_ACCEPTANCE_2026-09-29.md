# P23-T03 — clean-commit durable-run acceptance, 2026-09-29

Verdict: **T03 scoped PASS on committed source `761bc243`; P23 OPEN**.
The earlier uncommitted-image full-run receipt and clean-image isolated
append/manifest 0-free receipt are retained, not replaced. This retake
certifies the real P06/API path and recovery after an ENOSPC failure.

Only cell `portal-research-p23-ol12` on loopback `:8096` was used. Clean
Portal API/worker image `sha256:187d328fe0ff8958cc319aff453d34cfe36cb9876b35c8df450fdf180595bad4`
contained the committed repair, QuantBT 1.1.1 and approved pinned HMD wheel.
Its two services alone were rebound to a separate 128-MiB ext4 image
(`nosuid,nodev,noexec`), cloned from only the cell's named artifact volume.
Rendered and actual mounts matched; PostgreSQL, NATS, market-data `/data`,
original artifact volume, shared preview, Execution, dev and production did
not change. The cloned volume was 20 MiB before pressure.

At **405,504 bytes available** on the disposable filesystem, real authenticated
WFO `rrun_44a7bc7bf586b146adf96906d3f65d61` reached `FAILED/READY`,
source sequence 12, `terminal_reason.code=RESOURCE_EXCEEDED`, generic public
message without a private path. Portal API and worker stayed running with
restart count 0. After unlinking only the synthetic pressure file, available
space recovered to 79,425,536 bytes; new WFO
`rrun_c93896666b0f3f1647aaa4967ce8c792` reached `COMPLETED/READY`,
source sequence 33. No failed run changed into a false success. NATS reported
one stream, one consumer and zero messages after recovery.

Private 0600 product-path receipts were retained:

- `.../runtime/run-t03-clean-highwater-20260929.json` — SHA-256
  `cdb7caa16b5f7761eaf1c7e121c64ffd7671895d770043726663f04332d404a5`
- `.../runtime/run-t03-clean-recovered-20260929.json` — SHA-256
  `9c1e370e3368298ca118816f59056a26fd9c19be499cf9feab2be6db60a751a0`

Both services were restored to image tag `qualification` and original Docker
volume `portal-research-p23-ol12_portal-artifacts`; Portal API was healthy.
The exact ext4 mount was unmounted, loop detached, and only the disposable
128-MiB image, synthetic pressure file, empty test directories and unused
clean-build image tag were deleted. They are not recoverable; no original
artifact, source data or business volume was deleted. T03 has no remaining
backend source/test gap. W06 still exceeds warm 500-ms p95, and other P23
matrix/browser/upgrade gates remain OPEN; this receipt is not P23/P24 GO.
