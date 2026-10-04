# P24 — real product journey receipt (frontend, research-portal preview)

2026-10-04 · Claude (frontend/consumer) · stack = `research-portal.primusspark.com` (:8095), bundle `index-Dim4AT4Z.js`,
git `f79b3875` (+ Codex `7d18fe4e`), migration `1723680000094`, images in `~/.config/portal-research-preview/identity.json`.
Status: `READY_FOR_BOBBY_REVIEW` for what ran; **not** `OWNER_ACCEPTED`. Screenshots (private, not committed):
`/home/bobby/portal-research-qa-2026-10-03/p24/`. Driver: `scripts/research-preview/p24-journey.mjs` (+ the existing `seed-run.mjs`).
Writes went through the product's own same-origin routes with the stack's Origin header and CSRF; each is listed.

| Step | Screen / route | What ran | Result | Evidence |
| --- | --- | --- | --- | --- |
| J1a | S14 import, **failure case** | pasted a source whose `ALPHA_CONTRACT` used JSON `true` → Parse 201 → Run gates 200 | gate `contract-complete` FAIL "ALPHA_CONTRACT must be a literal object", the other 6 SKIPPED, "fail-closed: a red gate stops the import", Register disabled | `journey-import/explore-gates.png` |
| J1b | S14 import | Python-literal source → Parse 201 → Gates 200 (all green) → Alpha id `p24-journey-alpha` → Register draft 201 | `av_p24_journey_alpha_0_1_0` registered, **DRAFT rev 1**, digest `3f5a4e14…`; "a DRAFT can run, not seal a candidate"; signature/SBOM typed `not published` | `journey-import/import-3…5*.png` |
| J2 | S02 New Run on the imported DRAFT | wizard steps 1–8, `POST /datasets/declaration-estimates` 200, `POST /research/preflights` 201 | preflight issued, 15 gates passed, route `signal_notional`, admission `PREFLIGHT_ONLY` | `journey-create-imported/create-6-preflight.png` |
| J2b | S02 create (imported) | `POST /research/runs` → **409** (tried: 12 trials+seed; 1 trial+seed; pinned parameter) | typed refusal `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE` "no installed executor runs these parameters yet. The declaration is kept as written." — the screen shows it in place, nothing is lost | `journey-create-imported/create-6b-after-click.png` |
| J3 | create + progress, built-in alpha WFO | `seed-run.mjs` (SEED_PROFILE=wfo, 3 trials, published routes preflight+create) | `rrun_73bc3a98cb77edfbe2c0cb9597254d93` RUNNING → COMPLETED/READY (≈15 s, seq 33) | `p24-wfo-run` via seed output |
| J3b | create + progress, fixed three-window | `seed-run.mjs` default profile | `rrun_99dad92d52e6b3b5114156fd88f75976` COMPLETED/READY | |
| J4 | evidence / replay / report screens | S03–S09, S11 for both new runs | no page error; the P04 run logs 2 typed 409 `RESEARCH_FINAL_AUDIT_NOT_APPLICABLE` from the linked-audit panel (see F-07, fix in progress) | `journey-evidence-73bc3a98/`, `journey-evidence-99dad92d/` |
| J5 | S11 RC declare → seal → publish (WFO run) | PATCH draft ×2 200 → `POST /release-candidate/seal` 201 → `POST /release-candidates/{rc}/publish` 200 | `rc_06GGABY3ZPCK8HWMA762Z327M1` SEALED_LOCAL then **PUBLISHED**; approval `apr_06GGAC00VHRN2Y9C34S55HEDC2` (R1, pending); publication read `DELIVERED / P22_ALREADY_DELIVERED / blocked_action NONE`; mirror `approval read DENIED` for this account, screen words it as "Published. You can't view the Gate R1 review with this account." | `journey-rc/*.png` |
| J6 | scratch | `preflight` of a spec with `alpha_binding: null, not_publishable: true` | preflight 201; gate `alpha_declaration` NOT_APPLICABLE "Scratch request: no AlphaVersion declaration binds it."; `run_admission` **refused** `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE` "Scratch specifications have no installed execution adapter." — creation is refused by the server, never faked | seed-scratch output |
| J7 | failure / historical | existing FAILED run R-P04-020, CANCELLED R-WFO-019, QUEUED R-WFO-025; no legacy/unbound run exists on this stack (`counters.legacy_metadata_rows=0`) | faces + exits verified by the matrix and the W1 lane; legacy case NOT_COVERED on this stack | `FE_SCREEN_ACTION_MATRIX_2026-10-04.md` |

## What this does and does not prove

- Proven on the current candidate: import UI → gates (fail-closed and pass) → register DRAFT → preflight → typed create refusals (imported, scratch)
  → built-in run create → progress → evidence/report → RC declare/seal/publish → R1 approval created.
- **Not proven (honest):** an *imported* alpha run executing end to end on this stack (admission is `PREFLIGHT_ONLY`; execution exists only on the
  E17 disposable cell per the P10 receipts) — asked of Codex in §32; the Execution-side R1 decision (Approval Inbox belongs to the Execution cell,
  not read by this account); second-engine / default-pin cases (T05, BLOCKED_EXTERNAL).
- Left on the preview by this journey (disclosed): alpha `p24-journey-alpha` / `av_p24_journey_alpha_0_1_0` (DRAFT), runs `rrun_73bc3a98…`,
  `rrun_99dad92d…`, RC `rc_06GGABY3ZPCK8HWMA762Z327M1` (published). Nothing outside the preview stack was touched; no Execution mutation was issued.
