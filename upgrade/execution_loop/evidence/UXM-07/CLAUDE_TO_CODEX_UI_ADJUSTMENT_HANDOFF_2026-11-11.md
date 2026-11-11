# Claude → Codex: UI/UX adjustment, backend contract and wiring handoff

2026-11-11. Source: Bobby's review of 10 Nov and his hand-over of the Execution backend role. Plan: [UI_ADJUSTMENT_PLAN_2026-11-10.md](UI_ADJUSTMENT_PLAN_2026-11-10.md). Everything below is on branch `claude/slice-followthrough` (not pushed). Fixture lane only: every figure named here is a declared simulation (SIMULATED_DATA_REGISTER); real-source values stay `Not published`.

## 1. What changed for the owner's four points

| Ask | Result |
| --- | --- |
| Alpha Fleet: MDD and Winrate instead of Account balance and Unrealized PNL, no sideways scroll | Default columns Alpha, Portfolio, Current stage, In stage, QBTS, Alloc, PNL Amount, MDD, Winrate, Equity 30D, Health. Balance and Unrealized stay in the Columns menu. Measured on the populated fixture BFF: table wrap 1128/1128 at 1440 on ALL, REAL-FUNDED, SANDBOX and PAPER; header at y 491 to 527 with 4 to 5 rows visible. |
| Capital flow: incoherent fixture, time per flow | Scale world rule: allocated ≤ approved budget ≤ funds in; allocated + headroom = budget; NAV = initial + added − returned + PnL. `pf_scale_006` live: initial 60,000.00, returned 17,499.25, NAV 42,659.41, budget 60,000.00, allocated 42,500.75. Optional `effective_at_ms` per statement line, rendered as dates on the diagram and a Time column. |
| Alpha lists in Portfolio 360 and Account 360 | Same Fleet table (`ScopedFleetTable` over the PORTFOLIO and ACCOUNT dataset surfaces). |
| Overview currency | The scale world publishes USDT only. |

## 2. Contract changes (additive, backward compatible)

1. `ManagerMetric.effective_at_ms` (optional integer, 0..2^53-1): present only when every contributing fact states one time (`sumMetric` in `manager-model.ts`); a sum of receipts at different times has none. One line in Codex's `apps/control-api/src/execution-v2/manager-model.contract.ts` (`effective_at_ms: utcMilliseconds.optional()` on `managerResponseMetric`), regenerated with the repo generator. Fixture `execution-manager-dataset.statement-times.synthetic.valid.json`.
2. `children[].allocation_effective_at_ms` (optional), published only when the allocation facts of exactly that tuple state one time.
3. Partition keys `win_rate_pct` and `max_drawdown_pct` (PERCENT, no currency; win rate within 0..100, never in a group or capital statement, methodology required: invariants MD-9). They are open partition keys, NOT added to `managerMoneyFields`, `metric_keys` or sort fields. Absent means Not published, never 0.

## 3. Requests that need a real source (owner named)

- R-WIN (PM/Edge): Manager fact `kind: "win_rate_pct"`: percent, denominator = closed-trade count, stated window, `methodology_ref` defining a win; `effective_at_ms` = last counted close; no closed trade means `UNAVAILABLE` with reason `NO_CLOSED_TRADES`, never 0.
- R-MDD (TS/Edge): fact `kind: "max_drawdown_pct"`: percent ≤ 0, stated window, `methodology_ref` naming the equity basis.
- R-MAN (Codex decision): does the V1 `runtime-manifest` stay source-workspace bound, or is its static catalogue part answered for any authenticated caller? On retained review it answers a typed 404 for a caller with no source-workspace grant.
- R-EVD and R-EQS: real sources and field authority for the dark approval-evidence and equity-projection routes.
- Edge wire drift (owner of the Edge): contract_version `…manager-v2.runtime.v1` vs openapi `…manager-v2.v1`; `record_key` required at runtime and absent from the openapi; key statuses `EXPRESSION_UNIQUE_INDEX` and `VIEW_SOURCE_COMPOSITE`; free-pattern `reason_code`; `profile_id` follows the deployment profile; the Edge's `{"error":{"code","message"}}` body is documented nowhere. Request: a runtime schema generated from the Rust DTOs and a projection golden fixture. Details with Rust line numbers: [EDGE_CONSUMER_GAP_ANALYSIS_2026-11-10.md](EDGE_CONSUMER_GAP_ANALYSIS_2026-11-10.md).
- Contract nit: `AlphaLifecycleProblem` allows only EXECUTION_READ_NOT_AVAILABLE and EXECUTION_READ_CURRENT_ONLY but its 400 response references it; add EXECUTION_READ_QUERY_INVALID.
- Two Research fixtures are rejected by their own contract: `research-preflight.response` (additional property under `/effective_spec/topology/sealed_holdout`) and `research-run-create.reproduction` (missing `run_id`).
- Nine contract-only reads have no producer: `blotter/summary`, `commands/{id}/receipt`, `cost-events`, `grants`, `limits`, `readiness`, `recovery-events`, `reports`, `search`.

## 4. Lines for the files Codex is editing (not applied by Claude)

`app.module.ts` and `main.ts` have uncommitted Codex changes, so the following are text for Codex to add when integrating (full detail in the two analysis files):

- Typed absence (four reads: `/controls`, `/alphas/:alpha_id/lifecycle`, `/operations/incidents/:incident_id/children`, `/portfolios/:portfolio_id/members`): `app.module.ts`: `import { TypedAbsenceController } from "./typed-absence/typed-absence.controller";`, add `typedAbsence?: "SOURCE_DARK";` next to `approvalEvidence` in `ControlApiDependencies`, and `...(dependencies.typedAbsence === "SOURCE_DARK" ? [TypedAbsenceController] : []),` after the approvalEvidence line in `controllers`. `main.ts`: `import { typedAbsenceDependency } from "./typed-absence/typed-absence.bootstrap";` and `...typedAbsenceDependency(config)` after `...equityProjectionSourceDependency(config)`. It mounts only on `EXECUTION_READ_PROFILE=retained_review_v1`.
- Edge Manager read port (nothing consumes it yet): `EDGE_CONSUMER_GAP_ANALYSIS` section 7: `EDGE_MANAGER_READ_PORT` provider from `createEdgeManagerReadPort(options.edgeManagerRead)` and a private `edgeManagerRead` bootstrap object built only from an owner-prepared reference; no flag may select it.
- The running Research `control-api` (image `a5e3968c…`, built from `2faa8968f`) mounts the evidence and equity-source dark routes but not the typed-absence reads or the Edge client: they need a new image.

## 5. Verification state (31 Oct to 11 Nov)

Frontend unit suite 799 files, 88,094 tests (one load flake); Fleet area 2,404 of 2,404 after the disclosure change; `tsc` clean in frontend and control-api; contracts 113 files, 1,943 tests, snapshot 719 files; control-api typed-absence, Edge client and manager-model specs 170 of 170; Playwright V2 non-visual lane 346 passed, 0 failed (21.7 min). Pixel baselines: see the P1 result. Not run: the full pre-commit hook on the final tip; no Docker cell for the new control-api specs that need the Manager-v2 pack mounts (`scripts/control-api-test.sh` carries 8 additive lines for them).
