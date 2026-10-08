# Shared-preview Limit/OCO: 90-day product receipt

Date: 2026-10-08 UTC. Scope: Bobby's authorization for the **shared Research
preview only**, project `portal-research-preview`, port 8095.

Verdict: **BACKEND_SHARED_PREVIEW_READY**. The real producer/child/retention
and named reads pass. **S08_FULL_PRODUCT_ACCEPTANCE_PENDING_FRONTEND_REBUILD**:
the served frontend image predates Claude's new journal consumer.
No P24/owner/release acceptance is claimed.

## 1. Safe deployment and binding

- Runtime/backend source identity: `6441e93cba9804d93d92e09922de8ba272dc6669`.
  Control image `sha256:d9c070c9cc5b0b9c10199d85dfa1719b988c1383109b7a63a8bc4dd4184162ec`;
  API/worker image `sha256:5765fe41c2c6ae2a97ae3a55a7f0c165bcbece4ae00ade53ff29c294e975bd29`.
  Actual running image IDs match the private preview identity. No redundant
  backend build or restart was needed.
- Standard `control-api-migrate` CLI, exact preview Compose project:
  **`No migrations to run!`**; migration 124 already applied. Forward-only
  checks; no hand-written SQL mutations or alternate DB access.
- Initial `setup-options` returned 404 because the authenticated preview
  workspace lacked `av_delta_rsi_polynomial_alpha_1_0_12`. The existing
  authenticated admin `POST /api/v1/research/run-producer/p04-delta/install`
  added that immutable binding. All twelve existing Delta versions/bindings
  compare equal before/after; thirteen now exist. No active-version replacement.
- Setup now returns the exact Limit/OCO profile `ENABLED`, qualification
  `PRODUCT_RUN_QUALIFIED`, with recipe digest
  `99b29e57151d36005921ae4fa4af65dd1289d458fcdca25815ef529079f82d58`.
  Qualification is the effective receipt-bound authority, **not** the original
  candidate-history row in isolation. No candidate selector, flag change,
  new product receipt, or other candidate activation was used.
- Two Portal accounts remain unchanged; no password/role reset. Existing
  seals/business data/HMD are untouched. SQL checks were read-only.

## 2. New ordinary product run

- Run: `rrun_7c6aff8dc45f1781887527c2bf970f2c`.
- Alpha: protected Delta RSI `av_delta_rsi_polynomial_alpha_1_0_12`.
- Profile: `p10.delta-event-driven-limit-oco-fixed-1h.v1`.
- Dataset/symbol/timeframe: `crypto-binance-1m` / `BTCUSDT` / `1h`.
- Engine: `er_quantbt_111`, QuantBT 1.1.1; defaults/pinned native input,
  target notional `2000`, starting capital `20000`, leverage `3`, one-way fee
  `0.0005`, funding disabled. No seed/override/early stopping.
- Fresh preflight admitted creation. One persisted intent; one real child,
  `RUNNING → FINISHING/PENDING → COMPLETED/READY`. Verification retries reused
  the same run; no engine rerun or duplicate child.

| Window | UTC start | UTC end-exclusive | Retained bars | Full observation pages | Journal |
| --- | --- | --- | ---: | ---: | --- |
| IS | 2026-06-01 | 2026-08-03 | 1,512 | 8 | 19 source records |
| OOS | 2026-08-03 | 2026-08-21 | 432 | 3 | AVAILABLE, zero records |
| Holdout | 2026-08-21 | 2026-08-30 | not executed | 1 absence response | NOT_PUBLISHED |

All 1,944 executed-window bars were read once per cursor sweep, without
duplicates or missing rows, at ≤200 rows/page. Maximum observation response
158,437 bytes, below 1 MiB. Holdout reason is explicitly
`FIXED_NATIVE_PROFILE_DID_NOT_EXECUTE_HOLDOUT`; do not label it available or
an authorization denial.

IS journal: **3 orders, 3 commands, 2 fills, 8 lifecycle events** (19 records
including the engine's other retained relations). Real LIMIT entry price
`63557.0`, real exit fill `65209.482`; full-child fees
`2.0260000000000007`. Real parent IDs, shared OCO ID, reduce-only exits,
`on_parent_full_fill` activation, parent-fill-before-activation, exactly one
exit fill and sibling cancel were checked from actual command/event reports.
No invented parent relationship on `result.orders`, broker ACK, synthetic fill
or replay authority. Progress and Evidence native result facts match exactly.

Evidence/Split/Search/Freeze/Replay/Report/RC named reads pass. Search truth is
`FIXED_PARAMETER_PROFILE`; its selection trace is NOT_APPLICABLE, not a fake
optimizer study. Invalid opaque journal cursor returns 400. Two harness-only
assumptions were corrected (Search top-level availability and observations
route spelling); these were not product defects or extra engine runs.

**Requested many-trial/many-order coverage is not met by this fixed recipe.**
It emits one entry cycle and admits exactly one trial. Ninety days does not
multiply its orders. The separate 16×400 WFO receipt is not a Limit/OCO stress
receipt. Multi-cycle/optimizer Limit/OCO requires an additive qualified
recipe; existing immutable recipe/budgets were not widened silently.

## 3. Browser result and exact Claude handoff

Chromium, real preview API, 1280 and 660 px, no stubs:

- S08 loads; IS/OOS/Holdout switching and opaque earlier/later paging work.
- IS page 2 draws 200 retained candles with **two real fill markers**.
  OOS has a published empty fill journal; Holdout shows the exact typed reason.
- Both widths: zero console errors/warnings, zero API failures, no unexpected
  product writes or page horizontal overflow. Visual screenshots inspected.
- **Consumer acceptance remains pending:** served web image
  `sha256:2108e2498122539f533c68c04daa8103380f9609394b25bfb81e0c93949b2944`
  has the old eight-column journal: no order-ID column, parent/OCO/activation,
  trigger-price rendering or named lifecycle events. Claude's commit
  `1ab33e3f096d7738d59823bc94d254e1ac78d09a` is already on the shared Research
  branch and contains those consumers, but is not this served bundle.
  Codex did not modify frontend or rebuild it under the backend-only approval.

**Claude:** rebuild only `portal-web` from shared Research with `1ab33e3f`
(preserve API/worker/DB/images/flags), then retake affected S08 journal checks
on the **same existing run**, not another child. Open:

`/research/quantbt/runs/rrun_7c6aff8dc45f1781887527c2bf970f2c/execute?workspace_id=ws_06GCVTHWC9WVPGEPR85AB15K82`

Expand **Complete window · retained bars and engine journal**, choose **IS**;
order/command/lifecycle tabs must show the source IDs, parent/OCO/activation,
SL trigger, LIMIT price and actual activate/fill/cancel events. Page 2 contains
both fill bars. OOS is correctly empty; Holdout was not executed. Repeat at
1280/660 px. No baseline re-record, SQL insertion or candidate activation.

## 4. Custody, hashes and cleanup

Private evidence store:
`/home/bobby/.local/state/portal-research-p23/20261008/shared-limit-oco/`.
Raw API responses include private preflight material: mode 0600 under a 0700
directory; do not commit or forward them to a browser. Version only this
authored redacted receipt. Preserve evidence for this candidate's owner review;
no new retention-policy or artifact-compaction action is authorized.

- `product.json`: SHA-256
  `7f8d97d55ec9c32c42fe91a86e738fd99956be72749483b13c0003727d1815e8`.
- `browser.json`: SHA-256
  `7000ac77bf43da7747afaa0ba9ff1f73796117ed43652a430f9df7a230032d51`.
- `s08-is-1280.png`: `19725b24c892d1fad45af90a1ddedfe95dc3e6f2a09cc97774debf86fc3b06c5`.
- `s08-is-660.png`: `94d00cc5185775b5c572709262ede6e2ee4b1863924be9e0a730559ae5a26514`.

Every harness-created auth session was logged out, both browser contexts
closed, child completed, zero active preview jobs. No account disabled and no
shared service stopped; preview/run retained for review. One-off migration
container auto-removed. Root free 99,762,388,992 bytes, within the prior
capacity bound; no build cache, image or volume deletion needed
(`NO_ACTION_NEEDED`). No production/dev/main/remote/release action.
