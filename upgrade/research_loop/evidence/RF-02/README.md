# RF-02 — Foundation consumer completeness, Atlas and the real-API lane

**Status:** `RF02_COMPLETE · APPROVED_BY_BOBBY_2026-09-23 · REAL_API_E2E_RECEIPT 16/16`
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

## Approval

Bobby approved RF-02 on 2026-09-23 ("Duyệt"). The HiFi deviation list below is
the checklist for the next round of fixes, which he expects.

The preview is published at `research-portal.primusspark.com` on the same
pattern as `dev-portal` (runbook: research-preview.md): origin set, images
rebuilt from `e39bacfa`, loopback nginx vhost installed; the Cloudflare Tunnel
rule is Bobby's step.

### Receipt re-run on the published build (2026-09-23)

After the public hostname went live and the worker fix `5b2cf660` landed,
the real-API lane ran again on images built from `5b2cf660`: **16/16 PASS**
(S01–S07, S02, S12 at 1280/660), browser on loopback with the public Origin
(`RESEARCH_PREVIEW_BASE_URL` + `RESEARCH_PREVIEW_ORIGIN`). Evidence in
`~/.config/portal-research-preview/receipts/5b2cf660/`. Bobby's workspace has
its own real run, `rrun_80d3c2f4cd15e8a3b04c7f8e2adee9ed`, COMPLETED after an
idle worker — the case `5b2cf660` fixes; four runs stranded by that bug were
cancelled through the published cancel route.

## Decisions — taken by Claude on Bobby's delegation (2026-09-23)

Bobby: "Duyệt bạn cứ chốt đi, rồi tôi xem sau, kiểu gì cũng sửa tiếp." Each
decision below is the recommendation made before the delegation, now applied.
Bobby reviews the screens later; anything he changes is a follow-up, not a
reopening of RF-02.

| # | Decision | Applied |
|---|---|---|
| D-B1 | `--ink-faint` (#939db0, 2.6–2.7:1) is darkened to ≥4.5:1 — **as its own design-system step DS-01**, with one visual-baseline refresh across the Portal, not inside RF-02 (the token is on every Execution screen too) | Scheduled (RF02-DG-03). Until then the S12 axe gate excludes exactly this colour |
| D-B2 | Rule One keeps its gold frame and background; its words are `--ink` | Done (commit with this packet); the axe exception for the gold pair is removed |
| D-B3 | S12 keeps the P04 manifest's SUSPECT / never-claims text; spec 12 §8's lines are HiFi sample copy with no engine locator. Spec 12 §8 is read as "render the manifest's text verbatim" | Recorded here and in the Unified RF-02 note |
| D-B4 | Spec 12 §2's data-usage pulse is not built: no published per-mode data-usage fact beyond `reads`, which is shown as text. Accepted as deviation D-5 | Recorded |
| D-B5 | The preview stack stays up for Bobby's review; no Access hostname for now (the runbook has the recipe) | Running at loopback :8095 |
| D-B6 | RF-02 closes on the automated evidence; Bobby's visual review follows and is tracked below | Closed |

### Where the build differs from the HiFi — for Bobby's later review

1. **S12 routes**: four axis chips + reason instead of one status word; no declare/replay per route; no per-mode demo (D-1…D-3, approved).
2. **Rule One**: gold frame, ink words (D-B2) instead of gold words.
3. **Cert cap**: the HiFi's letters (B, ≤ C) are not shown; the claim block says "not published" with the source's reason.
4. **SUSPECT / never-claims**: the manifest's sentences, not the HiFi's (D-B3).
5. **Objective**: the engine's own formula text per stage, typeset with identifiers in `\texttt`, instead of the HiFi's hand-written math (e.g. mode 3's `P_C = Q_C + …` is not in the engine's objective contract, so it is not drawn).
6. **No data-usage animation** (D-5).
7. **Breadcrumb / deep link**: "Evidence Flow" links back only when the Atlas was opened from a run. Each mode card links "open search & selection →" to that run, otherwise "find runs in this mode →". *(Corrected 2026-09-23, RF-04 FE-S12-09: there is no header "open search & selection →" at all — the HiFi has one; the build only has the per-card link.)*
8. **Additions not in the HiFi**: release-facts panel (collapsed), struck-through invalid schedule chips, "avoid when" column showing "not published", cited source locators under each fact.
9. **S02**: walk-forward frequency/window-mode are selects from the contract (rolling disabled with its reason) and a "First OOS instant" field; mode/schedule are selects.
10. **S04–S07 on a real run**: retained-source panels read "pending retention" (CG-RF02-03), histogram ticks are 3 significant digits, long exact values wrap.
11. `--ink-faint` contrast is unchanged until DS-01.

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

## Codex backend review — RF-03, 2026-09-23

Accepted by code/source review: RF-01/RF-02 route gate, removal of the public Python Atlas route, cursor v2, bounded retained-artifact read, sourced Atlas facts, walk-forward options and config digest (`CG-RF02-06`). Three pinned QuantBT locator tests passed against the 1.1.1 wheel RECORD. The idle NATS timeout recovery (`5b2cf660`, `CG-RF02-02`) and warmup-inclusive timeline (`12750366`, `CG-RF02-04`) are accepted; the local venv lacks `nats-py`, so the idle-consumer runtime proof remains the preview-image receipt, not a claimed local test.

Bobby accepts a public research preview for now. Preview auto-login is **not production authentication** and must not be promoted to dev/main/stable. The worker's narrow seccomp/AppArmor profile (`CG-RF02-01`) and artifact/retention materializer (`CG-RF02-03`/`CG-P05-01`) are still OPEN. Full findings and delivered backend commits: [RF-03 packet](../RF-03/README.md).
