# CG-FG-S04-02 — P13 dataset coverage

Status: backend contract and isolated PostgreSQL proof passed; exact-HEAD preview receipt pending this commit. This does not claim HMD access or a new QuantBT read.

The Evidence Hub's existing repeatable-read query now selects the admitted `research.preflight_manifests.snapshot` through the producer's workspace, actor and `preflight_token`. `core.dataset_coverage` publishes the P08 snapshot's full query range (`FULL_SNAPSHOT_QUERY`), retained row count, gaps, missing-bar count and columns. It does not expose snapshot ID, path, provenance, raw bars or holdout values. The Hub ETag already hashes the full semantic response; the immutable evidence-series revision is unchanged.

Historical P10 manifests with only identity digests remain readable: coverage is `NOT_PUBLISHED/P08_SNAPSHOT_COVERAGE_NOT_RETAINED`. Runs without a retained snapshot return `NOT_PUBLISHED/P08_SNAPSHOT_NOT_RETAINED`. A partial/corrupt current snapshot fails closed as 503; it is never guessed from requested dates.

Contract: optional `EvidenceHub.core.dataset_coverage`, generated `DatasetCoverage` in `research-evidence.d.ts`, canonical fixture `research-evidence.dataset-coverage.valid.json`. Claude may bind S04's dataset chip/panel to this one field and display typed absence; no layout change is requested.

Proof: Control API build; focused mapper and Hub-service tests 13/13; research-evidence contract 4/4; P13 disposable PostgreSQL 5/5 with the historical minimal manifest; contract snapshot parity 221/221. The canonical fixture gives `range=[1767484800000,1768003200000)`, `rows=336`, `gaps=0`, `missing_bar_count=0`, `columns=[open,high,low,close,volume]`. Those are **fixture bytes**, not a real-run measurement. Real-run preview values must be recorded separately before claiming screen acceptance.
