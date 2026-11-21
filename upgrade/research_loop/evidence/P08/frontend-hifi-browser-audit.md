# P03–P08 frontend HiFi browser audit

**Date:** 2026-09-20  
**Auditor:** Codex, browser-only reconciliation; no visual TSX/CSS was edited.  
**Implementation head:** `docs/research-loop-plan` working tree, after the P08
contract/ledger closeout.  
**Verdict:** `COMPONENT_FIXTURE_BROWSER_RECEIPT_VERIFIED / PRODUCT_ROUTE_RECEIPT_PENDING_P09`.

This is a truthful scope audit, not a claim that every future Research screen
already exists. It reconciles what Claude delivered in P03–P08 with the exact
HTML/spec authority and records the work that later screen-owning phases still
own.

## Method and private receipt

1. Built the Portal frontend with `npm run build`.
2. Started a local-only production preview at `127.0.0.1:4317` and ran
   `npx playwright test --config=playwright.research-probe.config.ts`.
3. The probe used its explicitly labelled Portal API stub lane; therefore its
   result is a component/typed-consumer receipt, never a real API or product
   route receipt.
4. Independently opened the four source HiFi HTML pages in Chromium and
   inspected implementation and source at 1280px/660px. The captures contain
   no customer or market data and are retained only in session scratch;
   screenshots/traces are not committed.

| lane | result |
|---|---|
| Production frontend build | PASS |
| Research fixture Playwright probe | **8 passed**, 0 console errors/warnings |
| horizontal page overflow | **0 px** at 1280px and 660px |
| direct HiFi HTML browser inspection | completed for S02, S05, S12 and S14 |

Private capture digest record (not a Git artifact):

| capture | dimensions | SHA-256 |
|---|---:|---|
| HIFI S02 | 1280x900 | `3fa50b40f1e0d4f92945daf8ccd5906e74ec1bb905f59647de80965606103372` |
| HIFI S05 | 1280x1541 | `7b509dc411bf0d407c9668124a77b0922a78cb7c20035088040ebbd7103803ad` |
| HIFI S12 | 1280x2654 | `571185f5aafb09329f6575c4d450aca7d1520c79b64d2096a3616bcf7b7b78a7` |
| HIFI S14 | 1280x900 | `94458b944b907b580de56169128831d8fd22da942693303f2c1be581e3227e34` |
| current S02 preflight | 936x1352 | `7a644c4e8539dc204884e064afab36691b9ee296ff1fea8fff61f7bcb376fb51` |
| current S05 boundary | 936x466 | `4e737d6ba9cdb367eba0a8156f36315695ba7ceb8f360d34ab92b7f2a3b568cf` |
| current S14 clean | 936x1371 | `a920d6740739aec584b5f6213096781cf73b0c1b1998a674cbe8e4e3706838a2` |

## Reconciliation matrix

| screen/slice | HTML + specification truth | current implementation and browser evidence | exact status / next owner |
|---|---|---|---|
| **S12 Engine Atlas / P04** | Full Atlas shell, descriptor cards/table, axes and mode detail. | `EngineAtlas` is a manifest-driven component in the labelled fixture lane; existing P04 tests/probe cover the contract-driven tabs and no console/overflow regression. It is not yet a mounted product route. | `COMPONENT_FIXTURE_BROWSER_RECEIPT`; **P09** must mount and produce product-route/deep-link receipt. |
| **S14 Alpha Import / P07** | HiFi shows visual groups `Manifest & package`, `Code anatomy`, `Quarantine pipeline`, `Register av_`; screen spec defines functional upload/parse → seven gates → register lifecycle. | Typed presentation has one-Python-file source facts, read-only mirror, ordered seven-gate cascade (`PASS`/`FAIL`/`SKIPPED`), DRAFT/ACTIVE and server `may_activate`; browser probe verifies clean/failing and 660px variants without overflow/console errors. | Functional P07 composition verified. **P09** owns route mount. `VISUAL_DECISION_REQUIRED`: reconcile HiFi's four visual groups with three functional server stages before claiming full product screen. Recommended non-authority solution: show `Code anatomy` as a presentational substage under source/parse, without inventing an endpoint/lifecycle state. |
| **S02 New Run / P08** | HiFi is the full eight-step declaration wizard: context, strategy, route, data, walk-forward, parameters, optimization, review/run. | P08 correctly implements only the typed preflight panel: quality, exact UTC `[start,end)`, effective topology, sealing and resource facts. Browser proves refusal/expired/success variants and responsive layout. `may_create_run=false` is now server-published, and no create button exists. | `COMPONENT_FIXTURE_BROWSER_RECEIPT` for preflight only. **P10** owns the eight-step producer, release manifest/registry inputs, create predicate and real product route receipt. Do not call current component a complete S02. |
| **S05 S1 Split / P08** | HiFi includes fold plan, purge/embargo, nested inner folds, holdout, gap scan, navigation and detailed evidence. | P08 correctly renders only server-published structural topology and sealed-holdout boundary; browser verifies literal half-open intervals, four axes, seal treatment, refusal state and no unlock control. | `COMPONENT_FIXTURE_BROWSER_RECEIPT` for boundary only. **P14** owns full split plan/purge/embargo/inner-fold/gap-scan screen and its product-route receipt. |
| **P03/P05/P06 shared panels** | Their future owning screens contain richer panels/actions than the shared state primitives. | Current work is reusable typed state/panel composition, not a substitute for each owning HiFi screen. | Do not claim a full HiFi screen from these primitives. Owning screen phase must consume and browser-verify them. |

## Findings and required working rule

1. **No visual implementation regression was found inside the current P07/P08
   component scope.** Current limitations are deliberately phase-owned, not
   an excuse to replace rich future layouts with generic unavailable envelopes.
2. **Product-route acceptance must not be inflated.** `/research/_fixtures` is
   explicitly an isolated fixture route. It is valid composition proof but
   cannot prove login, real same-origin API, deep links or a production screen.
3. **S14 stage grouping needs an explicit decision.** The visual four-group
   HiFi and three-stage functional specification are both valid source input;
   neither agent may silently discard one. The recommended presentation-only
   substage keeps backend authority unchanged.
4. Future UI owner must follow [A13.4](../../CLAUDE-FOR-thanhvuong.md#a134-browser-first-hifi-reconciliation-và-visual-receipt-bắt-buộc): browser
   compare source and current work, record a mapping matrix, test state/action
   variants and distinguish fixture/product/real lanes.

## Claude handoff

- **P09:** mount the real Research route foundation and turn S12/S14 receipts
  into `PRODUCT_ROUTE_BROWSER_RECEIPT`; retain typed denied/unavailable state
  inside the rich layout.
- **P10:** build the complete S02 wizard only from published manifest/registry
  and generated types. Render the typed `may_create_run` state; never infer it
  from preflight success or a browser role.
- **P14:** expand S05 only when the named fold/purge/embargo/gap data contract
  exists. Keep P08's sealed boundary authoritative until then.

No production, dev deployment, execution boundary, or raw data source was
touched by this audit.
