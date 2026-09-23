# RF-02 — Foundation consumer completeness, Atlas and the real-API lane

**Status:** `RF02_IMPLEMENTED · REAL_API_E2E_RECEIPT 16/16 · BOBBY_REVIEW_PENDING`
**Date:** 2026-09-23 · **Owner:** Claude (backend + frontend; Q4–Q6 approved 2026-09-23)
**Branch:** `docs/research-loop-plan` — pushed to `origin` and `primus-origin`; not merged into `dev`/`main`.
**Plan:** [Unified §13 RF-02](../../../UNIFIED_IMPLEMENTATION_PLAN.md#rl-rf-02) · [P01–P05 audit](../AUDIT_P01_P05_CLAUDE_2026-09-23.md)

## Commits

| Step | Commit | What |
|---|---|---|
| RF02-B1 | `d67a0fb4` | Atlas `facts` per mode × schedule (claims, schedule v2, OOS use, params) and per mode (objective stages/formulas/coefficients, reads); every fact carries a QuantBT 1.1.1 locator (path, lines, RECORD sha256, anchor); cert cap and avoid-when are NOT_PUBLISHED with reasons |
| RF02-B2 | `99d5b2a5` | `walk_forward_options` published; preflight admits exactly the published values (one list, read from the manifest) |
| RF02-B3 | `cb6d2c41`, `3a8f9a6a`, `306ff249` | isolated preview stack `portal-research-preview` on loopback :8095 — recipe, script, runbook, seed script, and the three bring-up fixes |
| RF02-F2 + CG-P10-01 | `996eef6c` | S02 walk-forward controls from the contract, mode/schedule selects; Atlas publishes `config_digest`, S02 sends it (S02 could not create a run on the real API before this) |
| RF02-F1 | `5d04e85a`, `ae5638b7` | S12 to spec 12 (verbatim tabs, breadcrumb, full hash, schedule chips change the claim, KaTeX objective, mode table, release facts, gold Rule One, deep links); browser T06–T09 with axe |
| RF02-F3 | `78e01f32` | Q3 query-key deferral with a live trigger test |
| real-lane fixes | `12750366`, `53bc7344`, `7de4c68f` | four defects only real data showed (below) |
| RF02-F4 | `770dfbcd` | the real-API lane (`playwright.research-preview.config.ts`) |

## The real-API receipt — `REAL_API_E2E_RECEIPT`

| Fact | Value |
|---|---|
| Stack | `portal-research-preview`, images built from `ae5638b7` (identity: portal-api/worker `sha256:e149a6d0…`, control-api `sha256:de59d1c3…`, portal-web `sha256:eafe1a7a…`; last migration `…055`) |
| Seeded run | `rrun_8d756a959ee6ed7c0c408bcf2613aead` — P04 Delta, BTCUSDT 1h, IS 2026-05-01→07-01, OOS →08-01, holdout →08-15, 300 warmup bars; through P10 → P06 child → P11 → P13/P14; **COMPLETED / terminal READY** |
| Browser | real BFF sign-in as `claude-preview`; no stub; S01, S03, S04, S05, S06, S07, S02, S12 at 1280 and 660 |
| Result | **16/16 PASS** — no request to `/internal/`, no horizontal overflow, console clean except the browser's resource line for the typed `409 RESEARCH_CURRENT_SOURCE_CONFLICT` (pending retention), which each screen states in words |
| Evidence | screenshots + per-screen request/refusal/console logs in `~/.config/portal-research-preview/receipts/ae5638b7/` (0700, outside the repo); the preview is left running for Bobby |

Fixture lanes on the same commit: frontend vitest 2975 passed / 1 skipped; research browser probes 95/95; Python suite green; contracts 175/175; P09 and P11 disposable-PostgreSQL proofs PASS.

## What the real lane found that no fixture could

1. **P14 terminal receipts refused for every real run** (`12750366`). RS-01 (`31f7fba8`) made the ingress require the split timeline to start at the warmup; the producer still started it at IS. The Delta adapter always has warmup, so every real run's `run_completed` was refused with `RESEARCH_PROGRESS_INVALID` and the run stayed RUNNING, silently. Codex-owned code, fixed with a test that fails on the old line — **Codex: please review.**
2. **A false sentence** (`53bc7344`): my RF01-F4 mapper said "This changed since it was read" for `RESEARCH_CURRENT_SOURCE_CONFLICT`, which on current-source reads means pending retention. The six current-source codes now have their own meaning.
3. **Exact decimals** of 47 digits overflowed a metric tile (now wraps, never rounded) and overprinted histogram ticks (ticks now 3 significant digits; exact edges in tooltip/table).
4. **`sr-only` on a `<table>`** does not clip; the chart companion tables pushed S04 219px wide at 660 (`7de4c68f`).

## Decisions for Bobby (not taken here)

| # | Decision | Recommendation |
|---|---|---|
| D-B1 | `--ink-faint` (#939db0) is 2.6–2.7:1 on paper — fails WCAG AA for the small text it is used for on every Portal screen (axe: 232 nodes on S12 alone). Changing the token moves visual baselines everywhere | Darken to ≥4.5:1 in one design-system change with a baseline refresh, not per screen |
| D-B2 | Q4/D-4 gold Rule One is 4.0:1 (#9a6a1f on #f4ecdb) | Keep the gold border/background, set the sentence in `--ink` |
| D-B3 | Spec 12 §8 "verbatim" SUSPECT (5) and never-claims (7) lines differ from the P04 manifest text S12 renders; neither set has a locator in the pinned engine | Keep the manifest (reviewed P04 content) and amend spec 12 §8, or have Codex source the spec text and update the manifest |
| D-B4 | Spec 12 §2 data-usage pulse animation is not built: no published per-mode data-usage fact beyond `reads`, which is shown as text | Accept as deviation D-5 |
| D-B5 | Preview host: keep `portal-research-preview` running for review; optional one-label hostname behind Access (runbook) | Bobby creates the hostname if wanted; teardown with `preview.sh teardown` after review |
| D-B6 | Look at S01–S07, S02, S12 on the preview and record approve/deviations | — |

## Requests for Codex

| ID | Request |
|---|---|
| CG-RF02-01 | P06's child needs a user/mount/pid namespace. Inside Docker that fails under the default seccomp, the docker-default AppArmor profile and masked /proc. The preview runs its worker unconfined (preview only). Any containerised P10 activation needs a reviewed narrow profile |
| CG-RF02-02 | On first bring-up the worker's pull consumer stayed idle with one pending message until the worker restarted (no error logged) |
| CG-RF02-03 | No retention materializer runs in this topology, so completed runs stay `PENDING_RETENTION` for S04–S07 retained lanes. Name the service and flag that seals current source, or confirm it is not part of this deployment |
| CG-RF02-04 | Review `12750366` (P14 timeline), found and fixed here |
| CG-RF02-05 | Carried from RF-01: `test-p02-python-pin.sh` runs against the dev image (quantbt 1.0.8); the preview image (1.1.1 + HMD reader) is a candidate `P02_PINNED_RUNTIME_IMAGE` |

## Not claimed

No dev/stable deployment, no runtime flag outside the preview, no merge. Visual approval is Bobby's (D-B6).
