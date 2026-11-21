# E6 — Screen 14 Alpha Import rebuilt to its HiFi (Claude, 2026-09-26)

**Package:** Unified plan §13.4.1 **E6** (S14 theo HiFi) · closes audit rows **14-1 … 14-6**; **14-7** stays open under OL-01/E17.
**Branch:** `feat/research-e6-s14-hifi`, cut from `origin/docs/research-loop-plan` at `ae62e12f` (contains the E1 helpers). Not pushed.
**Route:** `/research/quantbt/alpha-import` (canonical, `FD-P09-02`).

## Sources read

| Source | Version |
|---|---|
| HiFi `release-v1.1/QuantBT 14 Alpha Import.dc.html` | `ae62e12f` — measured block by block (below) |
| Gap list `evidence/HIFI_AUDIT_S00_S14_CLAUDE_2026-09-26.md` rows 14-1…14-7, X-2, X-3 | `ae62e12f` |
| Decisions: `P09/frontend-composition-claude.md` (`S14-VIS-01`), `P10/frontend-composition-claude.md` (route + three states), `AUDIT_P01_P10` DQ-05/DQ-06/DQ-07, `RF-03/W4` CG-P07-03 (16-row mirror), `RF-04/README.md` (S14 wave B) | `ae62e12f` |
| Contract `packages/contracts/schemas/research-alpha-import.v1.schema.json`, `openapi/research-alpha-import.openapi.json`, fixtures `research-alpha-import.{source,gates,registration,activation,registry}.valid.json` | `ae62e12f` |
| Backend facts: `apps/control-api/src/research/alpha-import.controller.ts:147` (membership), `alpha-import.service.ts:43` (activate = ADMIN), `run-admission.service.ts:153,160` (OL-01) | `ae62e12f` |

## HiFi measurements → implementation

Every value below was read from the `.dc.html` markup; the screen draws its own frame (`OWN_FRAME_SCREEN` now includes `alpha-import`), so the shell's padding no longer sits around it (X-2: title now at x = 272, as in the HiFi). Styles are a screen-local CSS block (`AI_CSS`), because `ResearchPanel`'s framed header (mono, 6 px radius, 12/8 padding) would override the HiFi card header; panels are used in `variant="plain"` for their state boundary only.

| Block | HiFi | Built |
|---|---|---|
| Page | max-width 1240, padding 16/24/56, gap 12, 13 px Inter | same; ≤720 px: padding 12/16/40 |
| Header | flex wrap, space-between, align-end, gap 10×16, border-bottom, pb 10 | same (`.ai-head`) |
| Crumb | 12 px ink-soft, gap 6, next link mono 10 | same, `aria-current="page"` on "Alpha Import" |
| Title | Newsreader 22/300/−.01em + chip mono 10/700, radius 999, 2×10, dashed for QUARANTINE | same; chip bg paper-raised (amber on #faf9f5 is 4.47:1, fails AA; on white 4.71:1) |
| Subtitle / meta | Newsreader italic 13.5 ink-faint / mono 10 ink-faint | same |
| Stepper | card: border line, radius 6, white, shadow .05, padding 5, gap 4; step 5×12, radius 5, gap 8, active bg accent-soft; circle 20, 1.5 border, mono 10/700; label 11.5/500; sub 9 ink-faint | same; 3 steps, not 4 (DQ-06) |
| Step 1 | two columns gap 12: mirror flex 1.4 min 460; side flex 1 min 320 gap 12 | same; both columns go full width ≤720 |
| Mirror | header 8×14 + border line-soft; col header 9.5 upper .06em 5×14; rows 5×14, border #f4f2ec; key 180 mono 10.5 ink-soft; value mono 10.5; check 90 right mono 9/700; foot 7×14, 10 px ink-faint lh 1.5 | same; key 156 / check 84 ≤720; values wrap instead of the HiFi's ellipsis (no cut values) |
| Drop card | padding 12×14 gap 5; zone dashed 1.5 #c9c5ba radius 6, 16×14, gap 3; file mono 11; custody mono 9.5; quarantine 10 amber; explanation 10 ink-soft lh 1.5 | same; zone bg white (amber contrast); paste textarea + Parse added inside the card |
| Entrypoint card | padding 12×14 gap 4; mono 10.5 lh 1.7; note 10 ink-faint | same, v1 content (DQ-05) |
| Step 2 | card 12×14 gap 8; rows: dot 9 (filled = PASS), name 210 mono 11/600, state 76 mono 9/700, detail 10.5 ink-soft lh 1.5 min 240; amber foot 10 | same; Run gates control + timing appended to detail |
| Step 3 | two columns stretch: rows card flex 1.2 min 400 (key 190 mono 10 ink-faint, value mono 10.5); next card flex 1 min 320, amber border, label 700 amber, text 11 lh 1.6, links 6×14 mono 10 | same; the amber primary link is a typed absence (OL-01) |
| Footer | border-top, pt 8, gap 3; title 9.5 .1em upper; text 11 ink-soft lh 1.6 | same (`.ai-foot`, the `.ln-foot` pattern of S10) |

## HiFi block → component → field → state → test

| HiFi block | Component (in `AlphaImport.tsx`) | Field / source | States | Test |
|---|---|---|---|---|
| Crumb (14-2) | `nav.ai-crumb` | static routes | — | `e6` "prints the HiFi title, the shared crumb…" |
| Title + chip (14-1) | `IMPORT_TITLE`, `importChip()` | `parse`, `registration.lifecycle_state` + `version_label`, `activation.lifecycle_state` | none / QUARANTINE / DRAFT · av_ / ACTIVE · av_ | `e6` 14-1/14-2 ×4 |
| Subtitle, meta (14-1) | `IMPORT_SUBTITLE`, `IMPORT_META` | v1 contract, openapi paths, controller/service permissions | — | `e6` header test |
| Stepper (14-3) | `IMPORT_STEPS`, `stepForReceipts()` | receipts (`gates`, `registration`) | open / done / failed per step; selected view | `e6` 14-3 ×6; S14-VIS-01 ×6 (three markers) |
| Mirror table (14-5) | `MirrorTable`, `MirrorValue`, `Digest` | `SourceResponse.mirror[]` (`field`, `state`, `value`, `check`, `gate`, `note`) | parsed / server_computed value; missing / at register / not in v1 typed absence; PASS / FAIL / VERIFY / GATED / NOT_APPLICABLE | `e6` 14-4/14-5 ×6; T01, T02; w4 CG-P07-03 |
| Rules foot (14-5) | `RULE_PATTERNS` | schema `AlphaId`, `version_label`, `timeframes` patterns | — | `e6` "states the field rules with the contract's own patterns" (reads the schema) |
| Drop zone (14-4) | `.ai-drop` | local bytes (`TextEncoder`), `parse.source_digest` | no source / source / parsed; multi-file refused | `e6` custody test; T08 ×2 |
| Explanation sentence (14-4) | `.ai-explain` | `RESEARCH_ALPHA_IMPORT_DIGEST_MISMATCH` (contract code) | — | `e6` layout test |
| Entrypoint card (14-4) | `[data-entrypoint-card]` | v1 contract (DQ-05) | — | `e6` layout test |
| Code anatomy step | `CodeAnatomy` (collapsed substage, S14-VIS-01) | `codeAnatomy.ts` | — | S14-VIS-01 ×6 |
| Pipeline card | `GateList`, `RunningGates`, `gateTiming` | `GatesResponse.gates[]`, `gate_receipt_id`, `expires_at_utc_ms`, `static_scan_disclosure` | RUNNING (in flight) / PASS / FAIL / SKIPPED; panel empty/loading/refused | `e6` step 2; T02–T04, T09, T12; w4 ×2 |
| Registration rows | `RegistrationRows` | `RegistrationResponse` + matching `RegistryEntry` (`display_name`, `entrypoint`, `registered_at_utc_ms`) | DRAFT / ACTIVE; entrypoint `REGISTRY_NOT_READ` absence | `e6` step 3 ×3; T05, T06 |
| Capability registration, signed publication | `REGISTRATION_ABSENT` | not served (see requests) | typed absence `NOT_IN_V1_CONTRACT` / `NOT_PUBLISHED` | `e6` "renders the rows no v1 response carries…" |
| Where it goes next | `[data-where-next]` | `registration.version_label`, `alpha_id`, `source_digest` | before / after registration | `e6` links test |
| "new run with this av_ →" (14-7) | `RUN_NOT_ADMITTED` | OL-01: `run-admission.service.ts:153,160` | typed absence, `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE` | `e6` OL-01 test (span, no href, no tabindex, no pre-filled New Run anchor) |
| Activation | `StepButton activate`, `RegistryChip` | `may_activate`, `alpha_revision` (CAS) | admitted / not admitted / in flight / refused | T06 ×3, RF-04 FE-S14-07 ×5 |
| Registry strip | `RegistryChip` | `RegistryListResponse.entries[]` | loading / available / empty / refused | T05 |
| Footer (14-6) | `SCREEN_RULES` | — | — | `e6` 14-6 |
| E1 display rules | `ShortId`, `formatUtc`, `groupDecimalString`, `REFUSAL_COPY.denied` | digests, receipt, version ids, expiries, registration time, integers, 403/404 | — | `e6` E1 ×2 (no ISO-ms, no 64-hex on screen; one F-04 sentence) |

## What changed from the HiFi, and why

| # | HiFi | Built | Why |
|---|---|---|---|
| 1 | Four stepper entries (Manifest, Code anatomy, Pipeline, Register) | Three; Code anatomy is a collapsed `<details>` under step 1 | DQ-06, `S14-VIS-01` — three authority states |
| 2 | Subtitle "mirrored from the built-in delta-rsi… signed into the registry" | "One .py module with one literal ALPHA_CONTRACT…" | DQ-05: v1 is a literal + one function; nothing is signed |
| 3 | Meta `POST /api/v1/alphas/import · owner-only` | `POST /api/v1/research/alphas/import/* · workspace members · activation ADMIN-only` | real endpoints and permission split |
| 4 | Mirror of a class module (14 rows, all filled) | the server's 16 rows; empty ones carry their typed absence | CG-P07-03 / DQ-05 / DQ-07 — nothing inferred |
| 5 | Values cut with ellipsis | values wrap | no cut value; row title holds gate · note |
| 6 | Rules foot `strategy_id` regex, SemVer | `alpha_id` regex (assigned at registration), `av_X_Y_Z`, timeframe regex — all read from the schema by test | DQ-07; patterns are the validator's |
| 7 | Entrypoint card `class Alpha` + "SAME StrategyRegistry gate" | `ALPHA_CONTRACT = {…}` + `def generate_signals(context)` | DQ-05; the adapter claim is false for v1 |
| 8 | Pipeline gates (hermetic build, SBOM, perf floor…) | the contract's seven gates, timing per gate | CG-P07-04 |
| 9 | "new run with this av_ →" primary link | dashed typed absence + sentence | OL-01 |
| 10 | Registry rows "capability registration", "signed publication" filled | typed absences | not served (requests below) |
| 11 | No paste area, no Parse/Run/Register buttons (static demo) | paste textarea, Parse, Run gates, Register, Activate, Continue | the screen is a working wizard |
| 12 | Registry strip absent | kept in step 3 | activation after reload (RF-04) needs it |

## Tests

Commands run from `apps/portal/frontend` on the working tree committed as `4550f4ba`:

| Gate | Result |
|---|---|
| `npx tsc -b` | exit 0 |
| `npx vitest run src/research/alphaImport.test.tsx src/research/alphaImport.e6.test.tsx src/research/useAlphaImport.test.tsx src/research/w4.test.tsx src/research/researchBoundary.test.ts` | **5 files, 105/105 pass** (alphaImport.e6 25 · alphaImport 44 · w4 16 · researchBoundary 14 · useAlphaImport 6) |
| Fixture lane `playwright -c playwright.research-probe.config.ts e2e/_probe-research-fixtures.spec.ts -g 14` (base `http://localhost:5203`) | **2/2 pass** ("Screen 14 holds its fail-closed composition", "does not overflow a 660px viewport") |
| Browser, product route, preview `:8095` read-only, writes stubbed (`scratchpad/e6/shoot.mjs`) | 1440 and 660 × 5 states (empty, parsed, gates, registered, activated): **overflow 0** in all 10; console/page errors 0; 4 writes, all stubbed with the canonical fixtures, 0 aborted, 0 reached the preview |
| axe (`@axe-core/playwright`, include `[data-screen='alpha-import']`), same 10 states | only `color-contrast` on `#939db0` (`--ink-faint`, the shared D-B1 token the RF-04 probe discounts); **no other violation**. Amber `#9a6a1f` was 4.47:1 on `#faf9f5` in the first run — fixed by putting amber text on `--paper-raised` (4.71:1) |
| Pre-commit hook (`scripts/verify-workspace.sh`) on `4550f4ba` | exit 0 — contracts 16/16 files; control-api 154 files pass, 1 skipped (1191 tests pass, 1 skip); N29/phase/tracking gates pass. The hook does **not** run the portal frontend vitest suite, so the S14 counts above are the frontend evidence |
| `e2e/_probe-research-rf04-a11y.spec.ts`, `_probe-research-product.spec.ts` | **not run green here.** The a11y probe renders no `[data-screen]` on this dev server for any screen (S00/S02/S03/S12 fail the same way — harness, not S14); the product probe does not compile on the base commit (`readFileSync` declared twice, `_probe-research-product.spec.ts:16`). Neither is in the hook |

The full portal-frontend vitest suite was not run (brief: S14 files + tsc while iterating; the hook does not run it either).

## Screenshots (not committed; `scratchpad/e6/shots/`, sha256 first 16)

| File | sha256 |
|---|---|
| hifi14-manifest-1440.png | `8ea874d2dc46a3e5` |
| hifi14-manifest-660.png | `e4d6cbc97c27fd5b` (HiFi itself overflows to 732 px) |
| hifi14-quarantine-1440.png | `937192c312869571` |
| hifi14-quarantine-660.png | `c077ed2068355b97` |
| hifi14-register-1440.png | `1395210d0c587e60` |
| hifi14-register-660.png | `3c41de4819c73d0e` |
| real14-empty-1440.png | `19c97f565285ebff` |
| real14-empty-660.png | `19eb644a97ef68ff` |
| real14-parsed-1440.png | `c122eafe6508f454` |
| real14-parsed-660.png | `f2b619da90bc07f6` |
| real14-gates-1440.png | `7e9a58b1a9092804` |
| real14-gates-660.png | `378dfc4c853c85b0` |
| real14-registered-1440.png | `73bbf64c0d84a522` |
| real14-registered-660.png | `6064d697d3ac1c92` |
| real14-activated-1440.png | `da3ce3f045de5846` |
| real14-activated-660.png | `7b453f5f6a619ca9` |

Read by eye: title at x = 272 as in the HiFi; header, stepper, two-column step 1, pipeline rows and the two-column register step line up with the HiFi at 1440. At 660 the columns stack and nothing leaves the viewport (the HiFi does, by 72 px). One defect caught by looking, not by a test: Tailwind's `flex` beat the `hidden` attribute, so all three steps showed at once — fixed with `.ai-page [hidden] { display: none !important }`.

## Backend requests

| ID | Field | ≤P21? | Decision | Rendered as |
|---|---|---|---|---|
| E6-BR-01 | "signed publication — registry signature + SBOM attached" on a registration | No: publication/signing is P22+ (Codex); no signing exists in the import path | Request to Codex: decide whether an import registration ever carries a signature/SBOM; until then the row is an absence, not a promise | `NOT_PUBLISHED` typed absence |
| E6-BR-02 | "capability registration — walk_forward STABLE …" per imported version | Decided out of v1 (DQ-05: routes come from the installed release + run preflight, `codeAnatomy.ts` UNLOCK_MAP) | No request; recorded so the row is not mistaken for a missing field | `NOT_IN_V1_CONTRACT` typed absence |
| OL-01 / E17 | Run an imported / DRAFT version (`run-admission.service.ts:153,160`) | ≤P21 and Claude's, but blocked on ops: the production host must load the narrow seccomp/AppArmor profile first (Unified OL-01) — not small, not safe to widen admission before that | Stays in OL-01 | `RUN_NOT_ADMITTED` typed absence with `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE` |

No contract, generated artifact or fixture changed in this package: every other HiFi block maps to a field already served.

## Commits

| Commit | Scope | numstat |
|---|---|---|
| `4550f4ba` | S14 rebuild + tests + probe + own frame | 7 files +1364/−536: AlphaImport.tsx +948/−520 · alphaImport.e6.test.tsx +391 · alphaImport.test.tsx +11/−9 · alphaImportClient.ts +4/−3 · w4.test.tsx +3/−1 · QuantBTModule.tsx +2/−2 · _probe-research-fixtures.spec.ts +5/−1 |
| (this commit) | this record | +1 file |

## Left open

1. **14-7 / OL-01 / E17** — end-to-end parse → gates → register → activate → run on real data. Parse/gates/register were exercised in the browser only against stubbed writes (the preview is read-only for this package). Running an imported version needs admission, after ops loads the production host profile.
2. **E6-BR-01** — Codex decision on signing/SBOM for imports.
3. **Real-backend browser receipt** for the S14 write path on a writable stack (not the shared preview).
4. **RF-04 a11y/product probes** — fix the harness (no `[data-screen]` on the dev server for any screen) and the duplicate import in `_probe-research-product.spec.ts`; then re-run S14 at 1440/1280/660.
5. **D-B1** — `--ink-faint` (#939db0) contrast is the one remaining axe finding, shared across screens; token change is its own step.
6. **Scale** — the registry strip renders every entry the bounded list returns; if a workspace grows past a screenful of versions, it needs a cap with "top N / total" (server count) — not needed at today's cardinality (1 entry on the preview).
7. Bobby's visual approval of the S14 deviations table above.
