# AN-29 — analytics v2 sidecar for old immutable WFO seals (2026-10-01)

Bobby approved an additive v2 sidecar; the P05 source seal and P18 frozen Report core are not rewritten.

## What is delivered

- Migration 081 creates `research.current_source_analytics_sidecars_v2` with one row per workspace/run/artifact revision, a foreign key to the exact P05 seal, immutable UPDATE/DELETE guard, source-rows SHA-256, retained-import digest and analytics SHA-256. The runtime role may SELECT but not INSERT.
- Operator-only CLI `npm run backfill:research-analytics-v2 -- --workspace-id <id> --run-id <rrun_hex32> --dry-run` checks the old seal, exact row counts/ordinals and pinned QuantBT 1.1.1 derivation. It emits only counts and digests. Repeat with `--apply` after review. Set `RESEARCH_ANALYTICS_PYTHON` to the absolute pinned Python path. The operator DB identity needs INSERT on the sidecar; no browser endpoint is added.
- The derivation reads **Portal-local immutable P05 OBSERVATION/FOLD rows only**, uses the sealed outer-OOS windows, and reports every reconstructed fact as `PORTAL_DERIVED`. Profit factor is explicitly a return-sample metric; directional hit rates use retained positions and candle closes. Missing candles leave benchmark/directional hit rates typed absent (`AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED`), while return-only metrics remain usable. No audited trade ledger is inferred. No HMD request, strategy run, Trading System DB access or sample values.
- Current Source Evidence and Run Library read the sidecar after verifying its digest; Evidence gets a companion-specific revision. The original seal digest and Split/Search/Freeze/Replay revisions remain unchanged. A pre-v2 seal without sidecar still returns `PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL`. P18 Report core/export of an old run remains frozen; frontend may show the sidecar from the named Evidence read as supplemental truth, never relabel the old Report core.

## Evidence and remaining gate

Focused tests: pinned-Python derivation 3/3; Python→Zod cross-language schema PASS; Current Source service 8/8; Library 23/23; disposable PostgreSQL RS-02/migration 9/9 (sidecar immutable and runtime INSERT denied). Control API build passed; focused LW-03/AN-29 Python 5/5 passed. Full-hook attempt found one container fixture-path error; the affected 8 tests passed after using `PORTAL_CONTRACTS_DIR`. A rerun was interrupted before commit; no second PASS is claimed. Final grouped commit runs the required hook and captures its log.

No old production or preview seal was backfilled in this code-only slice. Migration 081 must be deployed before the readers, and one operator dry-run/apply on an actual eligible old seal must record its run/revision/three digests plus post-write Evidence and Library GET parity. Until that receipt, status is `CODE_READY / HISTORICAL_APPLY_PENDING`, not PRODUCT_ACCEPTED. No runtime flag, database row, container or frontend code was changed here.
