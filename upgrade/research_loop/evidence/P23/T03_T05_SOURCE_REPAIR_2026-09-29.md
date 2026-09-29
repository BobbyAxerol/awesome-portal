# P23 T03/T05 shared-backend repair checkpoint

2026-09-29 · Codex · `docs/research-loop-plan` · **SOURCE_REPAIR_TESTED / RUNTIME_RETAKE_PENDING**.

Bobby approved edits to precisely the shared Research backend logic for P23-T03
and P23-T05. No UI, DTO, migration, runtime flag, source data, dev/main or
production service was changed by this checkpoint.

## T03 — artifact storage exhaustion

- The P05 writer now maps actual `ENOSPC`/`EDQUOT` from staging directory,
  fence, Parquet-part directory/write, small document, manifest write/fsync and
  final rename to `RESEARCH_ARTIFACT_DISK_FULL`. Other I/O errors retain their
  original type. A failed initial fence removes only its own random staging
  directory; an existing sealed artifact is not touched.
- The durable worker maps the typed error or raw storage-full `OSError` to its
  existing `RESOURCE_EXCEEDED` terminal code and a bounded message without the
  private filesystem path. It does not add a public failure enum or mark an
  unregistered candidate sealed.
- Focused tests: `-k p23_t03` **3 passed**; full changed Python modules
  `test_research_artifacts.py` and `test_durable_worker.py` **25 passed**.
  These are source tests, not a filesystem-pressure or P06/API receipt.

## T05 — personalized read cache semantics

- Run Library list and sparkline are `private, no-store`. Freeze and Report
  use the established Research `sendRevalidatable` helper: workspace/run
  authority is checked before conditional response, weak `If-None-Match`
  comparison follows HTTP semantics, and successful revalidation carries
  `private, no-cache`. No response body/contract is changed.
- Focused Control API controller tests: **9 passed**; `npm run build` **PASS**.
  The named-read/tenant receipt still needs a clean image retake in the owned
  P23 cell. Other T05 file/export boundaries remain separate.

## Broader regression observed, not caused or hidden by this patch

The full Portal Python suite ran once: **711 passed, 8 skipped, 3 failed**.
The failures are outside the ten changed files: M0 freeze manifest's recorded
Control API package/lock digest differs from the current tree;
`test_research_delta_wfo.py` expects a three-task child allowlist while source
has the fourth P17 imported task; and `test_research_run_producer.py` expects
at most 12 candle overview buckets while the current engine emitted 42. The
two directly affected Python modules pass. These three baseline failures need
their owning contract/source review, not an unexamined test expectation change
inside the T03/T05 repair.

## Remaining acceptance

Rebuild/pin only the owned P23 candidate, rerun the actual 64-MiB isolated
ext4 ENOSPC probe, a complete durable-run/API negative and the ten-read
tenant/cache probe. Until those receipts pass, T03/T05 and P23 stay OPEN.
W06 Run Library warm p95 remains an independent FAIL, and no product-active
claim follows from these source tests.
