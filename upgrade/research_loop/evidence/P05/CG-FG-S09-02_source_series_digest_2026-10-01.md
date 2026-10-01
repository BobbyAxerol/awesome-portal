# CG-FG-S09-02 — source equity byte digest

Status: code and contract ready in the backend-gap batch; a new isolated WFO seal/live preview receipt is still required before product acceptance. No old seal or frozen report is rewritten.

P05 now computes SHA-256 over the actual completed QuantBT `series/stitched.parquet` bytes at import. The digest, byte count and logical name are held in the compact `current_source_summary` document that the P05 manifest seals. The logical name is fixed; no filesystem locator, download URL or source cursor enters the browser contract.

The Control API validates the sealed summary and exposes `Evidence.source_series_artifact`. P18 freezes `EquityV2.digest`, `digest_scope=FULL_STITCHED_SOURCE_SERIES`, `logical_name=series/stitched.parquet` and a typed `digest_availability`. This digest identifies the **full source Parquet file**, not the sampled/filtered OOS points drawn by S09. An older seal yields `digest:null` with `NOT_PUBLISHED/P05_SEAL_PREDATES_SOURCE_SERIES_BYTE_DIGEST`; a previously frozen P18 report is immutable and does not gain the field retroactively. Claude should show the digest only with that exact scope caption and leave old reports without a fake hash.

Verification: real QuantBT 1.1.1 golden-tape WFO/P05 adapter test recomputes SHA-256 independently from the source bytes; focused P18 Control API contract test covers both old-seal typed absence and a new sealed digest through Evidence and Report, and validates both published OpenAPI responses. Focused tests and Control API typecheck passed. Generated `research-current-source.d.ts` and `research-report.d.ts` were refreshed. These are code/contract tests, **not** a fresh HMD-backed production or preview WFO seal.

No HMD write, source rerun on GET, direct database access, frontend edit, production rollout or remote push.
