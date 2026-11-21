# CG-FG-S04-02 — P13 dataset coverage

Status: backend contract and isolated PostgreSQL proof passed; exact-HEAD preview receipt pending this commit. This does not claim HMD access or a new QuantBT read.

The Evidence Hub's existing repeatable-read query now selects the admitted `research.preflight_manifests.snapshot` through the producer's workspace, actor and `preflight_token`. `core.dataset_coverage` publishes the P08 snapshot's full query range (`FULL_SNAPSHOT_QUERY`), retained row count, gaps, missing-bar count and columns. It does not expose snapshot ID, path, provenance, raw bars or holdout values. The Hub ETag already hashes the full semantic response; the immutable evidence-series revision is unchanged.

Historical P10 manifests with only identity digests remain readable: coverage is `NOT_PUBLISHED/P08_SNAPSHOT_COVERAGE_NOT_RETAINED`. Runs without a retained snapshot return `NOT_PUBLISHED/P08_SNAPSHOT_NOT_RETAINED`. A partial/corrupt current snapshot fails closed as 503; it is never guessed from requested dates.

Contract: optional `EvidenceHub.core.dataset_coverage`, generated `DatasetCoverage` in `research-evidence.d.ts`, canonical fixture `research-evidence.dataset-coverage.valid.json`. Claude may bind S04's dataset chip/panel to this one field and display typed absence; no layout change is requested.

Proof: Control API build; focused mapper and Hub-service tests 13/13; research-evidence contract 4/4; P13 disposable PostgreSQL 5/5 with the historical minimal manifest; contract snapshot parity 221/221. The canonical fixture gives `range=[1767484800000,1768003200000)`, `rows=336`, `gaps=0`, `missing_bar_count=0`, `columns=[open,high,low,close,volume]`. Those are **fixture bytes**, not a real-run measurement. Real-run preview values must be recorded separately before claiming screen acceptance.

Exact-HEAD isolated-preview acceptance: source commit `acd34065379b221c766c278c98aaf945d0d77b98`, Control API image `sha256:b7e2913ad6ddefbfa664d086999d2f4196afa6fef0dcb691d38715ab317f3c96`. GET `/api/v1/quantbt/runs/rrun_3258a4c450816129d2d285f25b801061/evidence` returned HTTP 200. For R-WFO-020, `core.dataset_coverage` is `AVAILABLE`, `range_scope=FULL_SNAPSHOT_QUERY`, range `[1776513600000,1785456000000)`, `rows=2484`, `gaps=0`, `missing_bar_count=0`, columns `[open,high,low,close,volume]`. This is a real retained P08 manifest read, not fixture bytes or an HMD scan.

Important panel-level truth: the same WFO run's **whole P13 source-evidence Hub** has `availability=NOT_PUBLISHED/P13_SOURCE_EVIDENCE_NOT_PUBLISHED`, while the joined dataset coverage fact is available. S04 must render the coverage panel from its own typed state and must not use the Hub-wide source-evidence state to blank this independent fact. This receipt accepts backend coverage, not the complete S04 browser/HiFi screen.
