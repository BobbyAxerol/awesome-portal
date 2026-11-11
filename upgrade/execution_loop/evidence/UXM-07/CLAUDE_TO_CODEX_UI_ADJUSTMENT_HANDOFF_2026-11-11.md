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

## 4. Wiring state (Codex's uncommitted `app.module.ts` / `main.ts` in the main checkout will conflict by a few lines)

Applied by Claude on `claude/slice-followthrough` (the committed copies of the two files, not Codex's working copies):

- `app.module.ts`: `import { TypedAbsenceController }`, `typedAbsence?: "SOURCE_DARK"` in `ControlApiDependencies`, and `...(dependencies.typedAbsence === "SOURCE_DARK" ? [TypedAbsenceController] : [])` in `controllers`. `main.ts`: `typedAbsenceDependency(config)` in the dependencies spread (mounts only on `EXECUTION_READ_PROFILE=retained_review_v1`). The full `AppModule` boot test (`elp204-positive-parent.spec.ts`, PG cell, 357 of 357) covers all three dark sets (approval evidence, equity-projection source, typed absence): 401 without a session when the key is passed, 404 on a plain boot.
- Typed absence now serves ten contract-only reads: `/controls`, `/alphas/:id/lifecycle`, `/operations/incidents/:id/children`, `/portfolios/:id/members` (B3) and `/blotter/summary`, `/cost-events`, `/grants`, `/limits`, `/recovery-events`, `/reports` (BK1: the contract's own no-source body, nothing invented). Three stay unserved because every shape of their contract asserts a value; exact requests in [BACKEND_CONTRACT_ONLY_READS_2026-11-11.md](BACKEND_CONTRACT_ONLY_READS_2026-11-11.md): `/readiness` (make `items` optional or nullable and give it a producer), `/commands/{operation_id}/receipt` (source is in Codex's command-status work), `/search` (a per-group NOT_COMMISSIONED state or a published 404).
- Not applied, on purpose: the Edge Manager read port (`EDGE_MANAGER_READ_PORT`): nothing consumes it and it needs an owner-prepared private reference; the provider text is in section 7 of the Edge gap analysis.
- The running Research `control-api` image (`a5e3968c…`, from `2faa8968f`) has the evidence and equity-source dark routes only. A labelled image from the final tip is prepared for the swap (see the receipt note below when it exists).

## 5. Verification state (31 Oct to 11 Nov)

Frontend unit suite 799 files, 88,094 tests (one load flake); Fleet area 2,404 of 2,404 after the disclosure change; `tsc` clean in frontend and control-api; contracts 113 files, 1,943 tests, snapshot 719 files; control-api typed-absence, Edge client and manager-model specs 170 of 170; Playwright V2 non-visual lane 346 passed, 0 failed (21.7 min). Pixel baselines: see the P1 result. Not run: the full pre-commit hook on the final tip; no Docker cell for the new control-api specs that need the Manager-v2 pack mounts (`scripts/control-api-test.sh` carries 8 additive lines for them).

## 6. Image prepared for the Research `control-api` swap (11 Nov, NOT swapped by Claude)

- Tag `local/portal-research-preview-control-api:20261111-2e31b74da`, ID `sha256:d15e8e21bdebacd9c972b9350ef38a7a07509c61a9231f157b898b3c2c78410a`, label `org.opencontainers.image.revision=2e31b74daec809833339a5569f892775b113c5b0`, built from a clean detached worktree of that commit (not the shared checkout). `dist/main.js` carries all three dark bootstraps (approval evidence, equity-projection source, typed absence); `dist/execution-v2/edge-manager-read-*.js` is present but unwired. Entry point and command as before (`docker-entrypoint.sh`, `node dist/main.js`, user `node`); migrations folder has 152 files (last `…158`, still not applied to the preview DB: the swap does not run them).
- Full pre-commit hook on that commit: exit 0 (11 Nov, 04:04 to 05:04 UTC). Playwright V2 non-visual 346 of 346; pixel V2 196 of 196.
- Running container unchanged: image `sha256:a5e3968c…` (built from `2faa8968f`, started 10 Nov 14:12Z): it remains the rollback.
- Not done by Claude: the swap (custody runbook, Codex), applying the migrations, and any landing into `docs/research-loop-plan`: that checkout has uncommitted Codex changes in `app.module.ts` and `main.ts`, which this branch also edits (typed-absence lines), so Codex should land with `git merge --ff-only` only after reconciling those two files.
- Lane: `portal-web` and `portal-fixture-bff` on research-portal are at the same commit. Measured there: Alpha Fleet table 1128/1128 at 1440 on all four tabs, 326/326 at 390; Overview read time 10 Nov 13:00Z.
