# P23-T03 full durable-run disk-pressure retake — 2026-09-29

Status: **SCOPED REAL API PASS; final clean-candidate P23 qualification remains open**. This is an isolated Research P23 cell, not production, dev or shared preview. Source was tested from an uncommitted local repair image; it must be rebuilt from a clean commit for final release evidence.

## Isolation and source

- Cell `portal-research-p23-ol12`, loopback `:8096`; Portal API and worker only were swapped to a disposable 128-MiB ext4 bind mount. The original named artifact volume, PostgreSQL, NATS, market-data `/data`, Execution and Trading System were not replaced or written by the pressure harness.
- The test-only Compose overlay is `deploy/research-preview/compose.research-p23-disk-fault.yaml`. Rendered configuration showed only two artifact mounts changed. The ext4 mount was `nosuid,nodev,noexec`; host root retained >250 GiB free.
- Local repair image `sha256:22f8d6e673ca34c0f8d3a09429aae8eb9b94392c77569c87d715ff862f8f8e0b` mapped PyArrow tape ENOSPC and wrapped child ENOSPC/EDQUOT to the existing `RESOURCE_EXCEEDED` failure code without surfacing private paths.
- Focused Python tests ran in one disposable Portal API container with repository source/tests mounted read-only: `3 passed` (`-k p23_t03`); the container was removed by `--rm`.
- The earlier baseline image returned `ENGINE_ERROR` for the real high-water child ENOSPC. A first repaired-image attempt at zero available bytes could not persist its progress journal, moved back to QUEUED, and was cancelled as exact owned run `rrun_1bdbde613452a61b5e58d3d7a7b91b58`; it is **not** counted as a pass. This bounds the test to a small metadata reserve rather than pretending zero free bytes can persist a failure receipt.

## Real product-path receipts

With 405,504 bytes initially available on the disposable artifact filesystem, a real authenticated WFO run used the installed QuantBT 1.1.1 child and read-only historical market source. Run `rrun_8747cfc9f4c314519d6ccb402b0feb93` reached `FAILED/READY`, `source_latest_sequence=12`; both `terminal_reason.code` and progress `failure.code` were `RESOURCE_EXCEEDED`. The API message was generic (`P10 isolated Delta WFO exceeded its resource budget`) and contained no path or traceback. API and worker stayed running/healthy with restart count 0. NATS showed zero pending/ack-pending messages.

After removing only the synthetic pressure file, new WFO run `rrun_1690a9830787332de93d93d457c8aa0e` reached `COMPLETED/READY`, sequence 34. No failed run became a false success. Private 0600 receipts and their SHA-256:

- `/home/bobby/.local/state/portal-research-p23/20260927/runtime/run-t03-wfo-reserve-20260929.json` — `8e94ea72246265366ec8027e5cc99463a71981e614b5cc72f2cafc89f86a19e6`
- `/home/bobby/.local/state/portal-research-p23/20260927/runtime/run-t03-wfo-recovered-20260929.json` — `5e682cd671d452047d805d38388a90897977ad93326d3b2ec8ec5f9e3f44f0f2`

After the drill, both P23 services were restored to image `qualification` and named artifact volume `portal-research-p23-ol12_portal-artifacts`; API healthy, NATS stream/pending/ack-pending all zero. The disposable ext4 mount was unmounted, its loop device detached, and only the test image (134,217,728 bytes) and empty test directories were deleted. This synthetic image is not recoverable; no business data, original P23 artifact or backup was deleted.
The two trial-only local Docker image tags were also removed after no container referenced them; the pinned qualification image was retained.

## Remaining gate

The product-path disk-full classification and recovery subset passes. Full P23 remains **OPEN**: W06 Run Library p95 >500 ms under one WFO/four queued/twenty readers, plus the remaining P23 matrix and clean committed-image acceptance. No production, stable or dev rollout was performed.
