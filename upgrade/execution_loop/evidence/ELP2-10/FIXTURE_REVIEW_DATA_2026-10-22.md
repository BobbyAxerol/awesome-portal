# Execution V2 — explicit review data round, 22 October 2026

## Entry / scope

Bobby assigned rich, removable synthetic data beside the real Edge API for complete
UI/UX review. This is **FIXTURE_LAB**, not connected acceptance, economic authority,
or permission to enable commands. Accepted Claude components/design stay unchanged.

- Canonical: `/home/bobby/portal-research`, `docs/research-loop-plan`,
  `82848983e1c973634f4205b99947cc1bf03fdf8a`, clean at entry.
- Claude: `/home/bobby/portal-research-fe`, `claude/post-freeze-20261021`,
  `3aaf24f4e66bca6c27962ddbbc2049cfb6505421`; existing PG-test/docs WIP preserved.
- Inputs: campaign rules §§7, 9.8, 10.8–10.13; Source Truth Board; Claude F8
  digest, landing request and UXM-07 review stories. Later actual landing return
  supersedes the earlier request to land the same source again.
- Owned: standalone fixture-BFF data/config, test-only fixture composition and
  focused tests, this packet and additive Unified/sync entries. No production
  reader, schema, migration, accepted UI/CSS/baseline, identity, or HK runtime edits.
- Resources: lightweight Node/Vitest (at most three workers), host Playwright
  one worker, own loopback listener only. No Docker/DB/load gate or heavy lock.
- Validation: deterministic data, schema and real boundary-reader conformance,
  cross-links, null/zero/absence, bounded pagination, explicit synthetic marker,
  product-boundary, browser overflow/console at 1280 and 660 where runnable.
- Rollback: remove the opt-in review profile / stop its own listener. Real API
  routing is not a fallback and must not receive fixture writes.

## Initial triage

| Item | Disposition | Action |
|---|---|---|
| Claude C-1…C-6 | ALREADY_DELIVERED_WITH_LOCATOR | Read [landing ACK](CODEX_TO_CLAUDE_LANDING_ACK_2026-10-22.md); do not rerun the completed full hook/landing |
| F5–F7 fixture coverage | ACT_NOW | Audit existing L0–L3; add opt-in populated/scale/edge cases without replacing sparse-realistic defaults |
| Cross-screen fixture identities | ACT_NOW | Prevent apparent missing resources caused only by inconsistent fixture IDs; preserve negative cases explicitly |
| UXM-08 / C-7, C-8 | NEXT_GATE | Rich synthetic data does not qualify source, grant STREAM or commission commands |
| Source/provider, finance, calibration, coexistence | NEXT_GATE | Remain open with real owners; never change Source Truth Board to mounted from fixture evidence |

## Delegation

Reused `backend_cr02_b1_review`: fixture architecture/coverage audit and disjoint
review-Manager data/test module. Reused `financial_budget_readiness`: Claude
request audit and disjoint review-relations data/tests. Primary owns shared configuration, integration,
formal review and final receipt. No new agent or operational credential/window.

## Results

### Delivered source (not installed on the shared preview)

1. Existing standalone fixture BFF, **not another product API/client**: three explicit
   profiles `sparse-realistic` (unchanged default), `populated`, `layout-stress`.
   Every response carries `X-Fixture-Lane` and `X-Fixture-Profile`. No real-read
   fallback, database, credential, persisted decision or upstream command.
2. Six Manager dataset surfaces, common scaled resource universe, exact-decimal
   totals per economic partition, explicit missing metrics, text queries/groups,
   bound forward/back pages. Known account/deployment reads remain scope-specific;
   child-only PnL is not inferred from a parent's total.
3. NAV/RETURN/NET_PNL with 240/1440 points, true zero, signed exact decimals and
   a real gap in the synthetic sequence. No interpolation, cross-currency sum,
   source qualification, fake Score calibration or conversion of null to zero.
4. Three exact account aliases repaired for navigation. Unknown Bybit/other keys
   stay refused; the separate historical fixture books are **not** reconciled
   economic statements. Long UTF-8 display names only in `layout-stress`.
5. A JSON/escaped HTML review catalog with 25 routes/subtabs, negative workspaces,
   screen selectors and 1280/660 viewports. See [operator/test commands](../../../../apps/portal/fixture-bff/README.md#explicit-populatedlayout-review-22-october-2026).
   All new data modules live outside the product import graph; removing the
   profile restores sparse data. No data migration/cleanup is required.

### Actual validation

| Check | Actual result / limit |
|---|---|
| Fixture/API and product-boundary gate | `npx vitest run src/fixtureBff src/execution/productBoundary.test.ts --maxWorkers=2`: **353 PASS, 1 SKIP**, 20.26s; skip remains visible |
| Manager schema + unmodified production HTTP client | Included 16 cases: six surfaces, environment/workspace, cursor directions/binding, groups, null/0, absence and unsupported requests. This is a fixture client-boundary proof, not a real provider receipt |
| Bundle | `node apps/portal/fixture-bff/build.mjs`: EXIT0; actual bundled child servers used by Chromium, including source/dist fixture-path regression |
| Browser first matrix | **98 PASS, 2 FAIL / 100**, 195s: 25 routes/subtabs × 2 profiles × 1280/660, one worker, existing shared JS/CSS. Two blank-before-root cases: stress Account1280 and Operations660, not relabelled as PASS |
| Focused browser retake | Those two cases plus Overview1280 control, twice each: **6/6 PASS**, 17s. No UI or data fix between attempts; original blank-page cause remains unproven. Instrumentation now retains asset/page/API diagnostics even before root mount |
| Final cleanup smoke | After hardening child cleanup for both exit and signal termination, stress Account1280 **1/1 PASS**, 4s. Host process check found only the existing shared-container fixture service (running for over6hours), not this probe's disposable children; that service was left alone |
| Probe correction | The first diagnostic retake had 2 Overview failures because an intentional API AbortController cancellation was classified as a missing asset. It is now recorded separately as `apiCancellations`; failed API statuses, script errors and actual asset failures remain strict |
| Geometry/data seen | At each observation cut, first matrix's 98 completed cells measured 253 visible table/chart/panel boxes; 1,147 API replies / 13,978,800 bytes. No horizontal **page** overflow, unexpected API status, script/console error or foreign-origin request was observed in those cuts. Internal intentionally-scrollable content is measured, not automatically called a defect. Root visibility/fonts/2 animation frames are NOT proof every async panel or poll has settled |
| Pixel/HiFi | No approved baseline rewritten. Representative stress screenshots were captured/inspected. This is NOT a full HiFi visual comparison, accessibility audit, interactive-story or write acceptance |
| Typecheck | One new test-array inference error was found and fixed with `Record<string,string>[]`, no type assertion. Final `npx tsc -b --pretty false`: **EXIT0** |

Browser reports remain local/ignored under `apps/portal/frontend/test-results/`:
`fixture-review-first-report.json` retains the full initial result;
`fixture-review-report.json` is the latest one-case cleanup smoke (the six-case
retake result above was recorded before this last focused run). Attachments include raw
per-case API bytes/status, page overflow, table/canvas/SVG bounds, console,
asset failures and API cancellations. Do not add raw screenshots/reports or
claim 100/100 in one clean matrix from the combined results.

Existing preview asset identity read back after the probes:
`/assets/index-CDvLkmGU.js` (not rebuilt by this round). Browser config is opt-in
`playwright.fixture-review.config.ts`; its `_probe-*` filename avoids accidental
inclusion in the normal production/V2 visual suites. No new package/dependency.

### Fresh Claude request audit / next work

Checked Claude checkout again: still `3aaf24f4`; its PG-test/Unified/sync WIP
was not edited. Superseding [landing ACK](CODEX_TO_CLAUDE_LANDING_ACK_2026-10-22.md)
already covers C-1…C-6; the older landing request is not six new open tasks.

| Open item | What actually remains / owner |
|---|---|
| **Fixture consumer gap** | At the matrix observation cuts, current preview's browser made 16 `manager/series` reads, **zero Manager dataset reads**. This does not prove all async work has settled. Independently, Overview `UNPUBLISHED_FUND` is hard-coded in source (`src/execution/v2/screens/overview/index.tsx:90,335`). Rich fixtures cannot light those KPI placeholders without Claude wiring the existing typed port. Do not fake availability or derive PnL in the browser |
| **DEBT-UXM07-013** | Four consumer/data-boundary defects remain: numeric price stringification in `components/tradeReplayModel.ts:55`, malformed records→empty in `api/subjectActivity.ts:69`, duplicate-currency React keys in `v2/screens/portfolios/format.tsx:86`, malformed V1 roster→empty in `features/admin/accountApi.ts:163`. Claude owns deliberate fixes plus invalid-data tests; this data-only slice does not silently change accepted V1 readers |
| **DEBT-UXM07-030** | ScopedPagePort still needs HTTP wiring to the **existing** list operation/envelope; not a missing endpoint. Keep [Codex disposition](CODEX_DEBT030_042_DISPOSITION_2026-10-21.md), do not interchange ManagerDataset and scoped-page bodies |
| **DEBT-UXM07-042** | Wire published credential-rotation refusal and incident `resolution_gate`; Return/Lock/Deploy are not aliases for commissioned PM commands. Incident advisory action vocabulary may need one additive backend assignment |
| **DEBT-UXM07-016/018** | Claude: uncovered Board/Map/drawer/form/submitted-note visual states and dedicated Live V1 conformance. Existing 61 baselines are not absent; do not re-record them all |
| **Fleet cancellation** | Source fix exists; product-bundle browser receipt still owed. Native STREAM is not whole-Fleet STREAM commissioning |
| **C-7/C-8, DEBT-029 and measurement/financial debts** | Real endpoint/trust/command commissioning, financial ownership/census/cost inputs, approved budget/calibration and coexistence/G2 remain next gates. A populated synthetic panel cannot close them |

## Handoff to Claude — data first, approved components unchanged

1. Read this packet, campaign §9.8 and current debt-register/Source Truth Board.
   Use the **same `ExecutionApi` HTTP readers** for fixture and real data; no
   data-producing module in a product component, no implicit real→fixture fallback.
2. Review the rich source via `FIXTURE_REVIEW_PROFILE=populated`, then `layout-stress`,
   both at scale large. Sparse/denied/unavailable/mixed-currency cases stay required.
   Wire already-published Manager fields where the accepted component still uses
   a hard-coded gap; keep real-source absence typed. Return consumed field/type
   and exact source/query scope, not “all available” for an entire screen.
3. Check charts (NAV/PnL/Return, gap, Table/Expand), group/currency lines,
   pagination/back/reload, known Portfolio→Account links and long-name wrapping.
   Add explicit checks for the remaining Board/Map/drawer/form states; writes
   only in a separate `doubles` test process, never against real authority.
4. Fix the four DEBT-013 consumer cases intentionally, with regression/schema
   negatives; preserve accepted design, decimal precision, null/0 and accessibility.
5. Return overflow **by container** (expected table scroll vs accidental page
   overflow), screenshot/HiFi locator, fixture profile/scale, frontend bundle SHA
   and verdict. Record deviations rather than automatically blessing a baseline.
6. Report which actual API reads remain uncommissioned. When each real endpoint
   is qualified, switch its explicit upstream on a separate real-review lane;
   do not invent financial source facts or enable STREAM/commands/Live from fixtures.

### Runtime / cleanup / gate disposition

- Shared preview remains its original `FIXTURE_LAB` medium/default image;
  **new rich profiles are SOURCE_TESTED, not installed there**. Only this test
  browser redirected API reads to its own new fixture servers. Real Edge API,
  current-human grants/windows, auth, DB and provider28445 stayed untouched.
- Every own fixture listener/process was stopped by the probe; bundle/report
  artifacts are ignored. No Docker image, service restart, DB, volume or prune.
- Reused two agents, spawned zero new; focused gates only. No full monorepo
  hook, product build, release, remote push or accepted UI/baseline change.
- Independent review ACCEPT on fixture/real isolation and request triage;
  requested precision on observation-cut timing and process signal cleanup was
  incorporated. Typecheck final EXIT0 supersedes the intermediate test-only error.
- Source commit is local `ba6d565e810def05d399a574808a6b12a04a67e7`, tree
  `c939dfecb20ebd93ea01330b28bb5f3bcfbac6f4`: 11 code/config/test files,
  **+1090/−3**. Documentation is recorded separately. Not pushed, installed,
  or qualified as a delivered connected bundle. Parallel Edge PREPARED docs are preserved and are
  **not** part of this fixture code change.
- `scripts/select-gates.sh HEAD` had no built-in fixture lane, so the explicit
  fixture/API/boundary, typecheck, small bundle and host-browser lanes above were
  selected manually. Commit follows campaign §10.10c focused-development policy;
  no repeated full hook, Docker build, landing, ff-merge or frozen runtime claim.
  Reuse the focused results only for this exact code tree; the integrator owns
  the one full milestone gate when a candidate is frozen. Tracking reconciliation,
  changed Markdown link check (6 local references) and `git diff --check` passed.
- Small ignored artifacts: fixture bundle about620KiB; initial browser JSON420KiB,
  latest smoke JSON228KiB and its attachment directory12KiB. No secret/session,
  real source response, database dump or downloaded market data was retained.

## Source pins and machine-readable result

See [focused test disposition](FIXTURE_REVIEW_DATA_2026-10-22.test-results.json).
SHA256 of the actual tested bundle:
`dad129a7403e3ca6c7241d8fef8e3c9d1ac89556e44450601dc13bb9099f121e`.
Manager data source `review-manager.ts`:
`b77c93607c1427218fcb9a46f23337dec706a51d19ba0f0ea3e66f62416dcbb7`;
relation source `review-relations.ts`:
`988475f085badbbfd3c3e965886b98307a67d40713ee88c3c2e1acb6d80f740b`.
The bundle does not contain the browser probe; the final probe cleanup change
does not require a bundle rebuild or engine/provider requalification.
