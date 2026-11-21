# AN-29 — analytics v2 sidecar for old immutable WFO seals (2026-10-01)

Bobby approved an additive v2 sidecar; the P05 source seal and P18 frozen Report core are not rewritten.

## What is delivered

- Migration 081 creates `research.current_source_analytics_sidecars_v2` with one row per workspace/run/artifact revision, a foreign key to the exact P05 seal, immutable UPDATE/DELETE guard, source-rows SHA-256, retained-import digest and analytics SHA-256. The runtime role may SELECT but not INSERT.
- Operator-only CLI `npm run backfill:research-analytics-v2 -- --workspace-id <id> --run-id <rrun_hex32> --dry-run` checks the old seal, exact row counts/ordinals and pinned QuantBT 1.1.1 derivation. It emits only counts and digests. Repeat with `--apply` after review. Set `RESEARCH_ANALYTICS_PYTHON` to the absolute pinned Python path. The operator DB identity needs INSERT on the sidecar; no browser endpoint is added.
- The derivation reads **Portal-local immutable P05 OBSERVATION/FOLD rows only**, uses the sealed outer-OOS windows, and reports every reconstructed fact as `PORTAL_DERIVED`. Profit factor is explicitly a return-sample metric; directional hit rates use retained positions and candle closes. Missing candles leave benchmark/directional hit rates typed absent (`AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED`), while return-only metrics remain usable. No audited trade ledger is inferred. No HMD request, strategy run, Trading System DB access or sample values.
- Current Source Evidence and Run Library read the sidecar after verifying its digest; Evidence gets a companion-specific revision. The original seal digest and Split/Search/Freeze/Replay revisions remain unchanged. A pre-v2 seal without sidecar still returns `PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL`. P18 Report core/export of an old run remains frozen; frontend may show the sidecar from the named Evidence read as supplemental truth, never relabel the old Report core.

## Evidence and remaining gate

Focused tests: pinned-Python derivation 3/3; Python→Zod cross-language schema PASS; Current Source service 8/8; Library 23/23; disposable PostgreSQL RS-02/migration 9/9 (sidecar immutable and runtime INSERT denied). Control API build passed; focused LW-03/AN-29 Python 5/5 passed. Full-hook attempt found one container fixture-path error; the affected 8 tests passed after using `PORTAL_CONTRACTS_DIR`. A rerun was interrupted before commit; no second PASS is claimed. Final grouped commit runs the required hook and captures its log.

No old production or preview seal was backfilled in the initial code-only slice. Migration 081 must be deployed before the readers, and one operator dry-run/apply on an actual eligible old seal must record its run/revision/three digests plus post-write Evidence and Library GET parity. That initial status was `CODE_READY / HISTORICAL_APPLY_PENDING`, not PRODUCT_ACCEPTED.

## Preview follow-up — 2026-10-01

The grouped code commit `999be160` passed its required full hook (Control API 1,406 pass / 1 skip). Migration 081 was applied **only** to the owned :8095 preview, then the operator dry-run/apply created an additive companion for R-WFO-020 (`rrun_3258a4c450816129d2d285f25b801061`, artifact revision 1): 9 folds and 2,184 observations. Retained-import SHA-256 `a64def18f83b06f9cc677e83497c51fcd145432dffa66d79b1b2d307a3356034`; source-rows SHA-256 `e1572eedd6831bea511700a1d86a2fc927a78d66838cb7f5e2f4541f84adbbb2`; analytics SHA-256 `45e8e85648b743b1f4abbe3d00df747ce9ad618edc447113e73bbef07b42f249`.

Evidence served v2, but the real Library read exposed an omitted join in the optimized same-snapshot page query. This follow-up repairs that path (including fixed-profile v2 projections), pins the sidecar to the seal's import digest, and keeps digest verification in the service. A read-only query against the actual preview DB with the corrected repository returned `AVAILABLE`, 19 last-30D points, input digest `85780cf6ad156b0cde08505cdd46e8cc6fd7e6a24470fc933c9a0713b406501a`. Focused Library tests: 26/26. **The corrected image still needs its API receipt**; the failed earlier receipt is not called PASS. The old Report core, Freeze and Replay source content remain unchanged; TTL cursor bytes are not immutable source facts. No production change or frontend edit.

## Corrected-image acceptance (supersedes the pending API gate above)

`78d69930` passed the mandatory full hook (Control API 1,407 pass / 1 skip) and its corrected preview image served the actual same-origin reads. `sidecar-after` passed: Evidence has the companion-specific revision and v2; Library has `AVAILABLE` last-30D with 19 points identical to Evidence; Freeze, Replay source content and frozen Report core stay unchanged. SQL verified the original seal-summary MD5 before/after as `24e6294eae902d6e29532cbffde9a83c`, exactly one sidecar. Private receipt SHA-256 `7a91ce18cf4fa75f151f26421d0cf5088fcc57e1e3d3468d8fd049de302b80ab`.

Verdict: **PREVIEW_ACCEPTED for R-WFO-020 only**, not a production backfill or all-seal certification. Control image `sha256:74246b7955b5ee9a87e0ffb86399244ed52517a82dfc9ec9845654514190baf0`; worker/API image `sha256:184221750819352ae28fc13a0d1c9ba182d0a889813e67871472f3e09330f018`; schema 081. Benchmark facts requiring unretained candle closes stay typed absent. No original seal or frozen export was rewritten.
