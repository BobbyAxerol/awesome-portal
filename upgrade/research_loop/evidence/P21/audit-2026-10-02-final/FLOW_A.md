# FLOW_A audit — entry, Journey Map, Run Library, New Run, Alpha Import (base b965741e, live preview :8095)

Screenshots: /home/bobby/portal-research-qa-2026-10-02/audit-final/FLOW_A/ (NN-name-{desktop|mobile}.png). Only audit-side state changed: none. Non-GET requests sent: declaration-estimates (estimate, refused 403), preflights (refused 403), alphas/import/parse (refused 403). No create/seal/import/register.

## 1) Coverage
Reached: shell entry, Command Center, Journey Map (all 35 links clicked + Back), Run Library (all filters, search, group, select-two to compare, card actions S1-S5, failed/cancelled/queued/empty/no-match, chart hover, Back/Forward), New Run (all 8 steps, both protocols, causal schedule, validation, dataset prefill, reload draft, leave mid-draft, Back/Forward), Alpha Import (idle, paste invalid, non-.py file, step 2/3, registry hand-offs). Desktop 1440x900 and mobile 390x844 (mobile: overflow + key screens + touch targets, not every click).
NOT reached (blocked): every server POST from this browser session returns 403. Run preflight -> "RESEARCH_PREFLIGHT_INVALID — You don't have access to this in your current workspace, or it doesn't exist."; Parse -> "Request refused — reload the page and try again."; declaration-estimates -> 403 "Declaration request security refused." CSRF cookie is present, so the session is probably read-only / wrong workspace for writes. Therefore NOT seen: preflight result panel (6 panels), parse results (valid / partial / gate states), Run gates, Create, Progress hand-off. Drag-over highlight (`data-over`) not verifiable with synthetic events.

## 2) Flow tables
Legend: fwd = forward link, back = way back, cursor = state kept on browser Back.

### A. Entry / Journey
| step | action | result | fwd | back | cursor | verdict | shot |
|---|---|---|---|---|---|---|---|
| 1 | open / | Command Center; title "QuantBT Backtest Portal" | New run, Import alpha | - | - | ISSUE (links go to legacy /new and /imports) | 01-root |
| 2 | sidebar QuantBT Backtest | /research/quantbt = Journey Map but title stays "QuantBT Backtest Portal" (only /journey gets "QuantBT — Journey Map") | Runs(1) / Imports / New run | sidebar | - | ISSUE | 02-journey-landing |
| 3 | Journey: 31 of 35 links | redesign nodes -> Run Library picker (?to=…, banner "Pick a run to open X · back to the journey map") or real screens; Back returns to /journey every time | yes | yes | n/a | OK | 04-journey-node-* |
| 4 | Journey shipped nodes 05 New Run, 12 Alpha imports, 04 Run Library | go to LEGACY screens /new, /imports, /runs/legacy (generic title, legacy header, no preflight) | - | shell only | - | ISSUE | 04-journey-node-10/05/08 |
| 5 | mobile /research/quantbt | page 412px wide (horizontal scroll); /journey itself 390 OK | - | - | - | BUG | 110-mobile-journey |

### B. Run Library (49 runs)
| step | action | result | fwd | back | cursor | verdict | shot |
|---|---|---|---|---|---|---|---|
| status/mode/alpha chips | URL-driven (?status=…), multi-status = OR, reload keeps | OK | | | yes | OK | 20-25 |
| search | matches rrun id, alpha, symbol; "R-P04-022" (the label on the card) -> 0 results | | | | | ISSUE | |
| no-match / running(0) | "0 of 49 runs match — loosen a filter." + CLEAR FILTERS | | exit | | | OK | 21 |
| group by alpha | ?group=1 | OK | | | | OK | 38 |
| completed card | open evidence -> /evidence#stage=summary&fold=1; S1..S5 chips each correct stage with correct title; Back -> /runs | | | yes | list resets to top | OK | 42-47 |
| queued card | WATCH PROGRESS, S chips disabled, "claim pending" | | | | | OK | 10 |
| failed card | OPEN PROGRESS, red failed-at stage chip, reason, runtime | | | | | OK | 30 |
| cancelled card | OPEN PROGRESS, "no claim — cancelled before Stage 5" | | | | | OK | 31 |
| select 2 -> compare | sticky bar "COMPARE · 2 SELECTED · same alpha · same contract key" -> /alphas/:a/compare?mode=pair&runs=…; Back restores selection (?sel=) and Forward works | | | yes | yes | OK | 33,35,36 |
| select 3rd | silently drops the oldest | | | | | UX | 34 |
| chart hover | tooltip "2026-07-14 13:00 UTC / 19,912.68" appears only near the right end; value has no unit/label; none at 50% | | | | | ISSUE | 40,41 |
| new run / journey / lineage | all go and come back | OK | | | | OK | |

### C. New Run (/runs/new?step=…)
| step | observation | verdict | shot |
|---|---|---|---|
| 1 Context | alpha select lists s14-ui-receipt / s14-api-receipt ("cannot create runs"); version not auto-picked though only one; NO Next button anywhere, step 1 body is empty below the card | ISSUE | 52 |
| 2 Strategy | read-only strategy_id + protocol toggle; "valid" without user input | redundant step | 62 |
| 3 Route | 2 of 14 routes admitted, 12 collapsed, extra row "signal_notional close_target_v2 native_vectorized Walk-forward searches strategy parameters." | OK/TEXT | 63 |
| 4 Market data | dataset catalogue select; choosing it instantly shows red "A symbol is required." and pill "needs attention" before the user could type; symbol combobox lists 25 rows for "BTCUSDT" (substring); typing "ZZZ"+Enter with "no listed symbol matches" is ACCEPTED, pill = valid, rail shows ZZZ | BUG | 70,71,95 |
| 5 Walk-forward (Three-Window) | prefills only IS start + Holdout end; 4 datetime-local boundaries must be typed by hand; error for any bad window is the single sentence "Every window must have a positive length." (no window named, overlap IS/OOS unflagged) | UX | 74,96-98 |
| 5 Walk-forward (Advanced) | analysis start/end prefilled; First OOS, label/purge/embargo empty yet pill says "valid" and Review has NO errors and Run preflight ENABLED; versus Three-Window where Review lists errors and preflight is disabled | BUG | 81,82 |
| 5 causal schedule | inner-fold block appears in step 5 (not in Optimization); error "mode_1_decay with per_fold_causal needs inner folds: a frequency, a window mode and a train width." (raw ids); train-width field shows regex "pattern ^[1-9][0-9]{0,4}(D|h)$" as helper text; "Inner folds: preflight only for now." | TEXT/UX | 84 |
| 6 Parameters | sweep/pin table, OK | OK | 85 |
| 7 Optimization | almost entirely pinned/read-only ("not admitted · p10…"), profile text repeated twice | redundant step / TEXT | 86 |
| 8 Review & run | 3-W with only two errors shown ("A symbol is required. Holdout end is required.") although mode, schedule, IS end, OOS were also missing; errors give no link to the owning step | ISSUE | 68,87 |
| right rail | "REVIEW" rail repeats on every step and again duplicates Review step content (≈10 rows of "not declared") | TEXT | 52 |
| estimate | every mode/schedule change fires POST declaration-estimates -> 403; rail shows "estimate — request refused · 403 · RESEARCH_PREFLIGHT_INVALID Retry" | BUG (env) | 83 |
| preflight | click -> red "RESEARCH_PREFLIGHT_INVALID You don't have access…" + request id, panel "refused", Create run disabled "Run preflight first." (honest, but no way forward) | BLOCKED | 88 |
| Back/Forward | step changes use replace: ONE browser Back from any step leaves the wizard for the Library; Forward returns to ?step=… | UX | |
| reload | draft restored from sessionStorage (alpha, version, dataset, symbol, windows) | OK | 90 |
| leave mid-draft | Run Library link or Back then return: draft silently discarded; URL still ?step=review but form empty "NO VERSION CHOSEN"; no warning | BUG/UX | 91 |
| prefill from Import "run →" | /runs/new?alpha=…&av=… preselects version, Context valid | OK | 107 |
| mobile | no overflow; pills collapse to numbers with aria-labels (OK); pills 32x37, hamburger 28x28 | A11Y minor | 84-mobile |

### D. Alpha Import (/alpha-import)
| state | result | verdict | shot |
|---|---|---|---|
| idle | stepper 1-3, contract mirror EMPTY, drop zone, paste, Parse disabled "Add a .py file or module first." | OK | 100 |
| paste garbage + Parse | request 403 -> banner "Request refused — reload the page and try again." AND the same sentence again in the mirror as "TERMINAL" (duplicate); no distinction permission/CSRF/invalid | UX | 102 |
| non-.py file (x.txt) | accepted into drop zone with "digest computed at parse · 6 B", no client rejection; textarea content and file both present, unclear which is parsed | UX | 103 |
| step 2 / 3 | step 3: Alpha ID input before gates passed, Register disabled "Run the gates first."; registry list incl. test alphas s14-*; links lineage / run -> | OK, data hygiene | 106b |
| links | Journey crumb, "next: New Run →" (goes to empty New Run, not preselected), run library, lineage, run -> all work; step selection not kept on Back | OK | |
| mobile | no overflow | OK | 110-mobile-import |

## 3) Findings (severity)
P1
1. BUG/DATA (env) All writes from this session 403 (estimate, preflight, parse). Lifecycle past preflight unreviewable; messages do not say why or what to do (3 different wordings). Backend/session: grant write role or fix workspace binding; FE: one honest "read-only session" state instead of "reload and try again".
2. BUG NewRun.tsx market-data step: unlisted symbol ("ZZZ") accepted, step "valid", flows to review. Must stay invalid with the "is not a listed symbol" message.
3. BUG Advanced walk-forward: required fields (first OOS, label/purge/embargo, mode) empty but step "valid", no errors, Run preflight enabled. Inconsistent with Three-Window.
4. BUG/UX Leaving New Run mid-draft (Back or Run Library link) discards the declaration silently (runDraftStore comment says by design) and Back lands on ?step=review with an empty form. One Back from any step leaves the wizard. Needs push-per-step or a "discard draft?" and never an empty review URL.
P2
5. BUG Mobile horizontal scroll: Command Center 506px, /research/quantbt landing 412px (journey cards min-w 180/200px); /journey is fine.
6. UX No Next/Previous buttons in the 8-step wizard; step 1 empty below the card; user must find pills. Steps 2 and 7 are read-only/pinned and add 2 clicks; version not auto-chosen when single.
7. BUG Review errors are incomplete (3-W lists symbol + holdout end only) and unlinked to the step; "Every window must have a positive length." is one sentence for every window error; IS/OOS overlap unflagged.
8. UX Instant red "A symbol is required." + "needs attention" right after choosing a dataset.
9. UX Run Library search does not match the visible label (R-P04-022); card says LAST 30D RETURN/SHARPE next to an ALL TIME chart (rubric: all-time) and the 30D return equals chart first→last on R-WFO-027, suspicious; equity tooltip has no unit.
10. UX Legacy surfaces still reachable and mislabelled "shipped": Command Center New run -> /research/quantbt/new (old 6-step form, no preflight), Import alpha -> /imports (inbox), Journey shipped nodes 04/05/12 -> legacy; generic title. Two "New run" experiences.
11. UX Header duplication on landing: shell header "QuantBT Backtest REAL + description + Runs(1)/Imports/New run" then Journey crumb and title again; "Runs (1)" while library has 49 runs (DATA, FE or backend count).
12. UX Alpha Import parse error duplicated (banner + mirror); non-.py file accepted; file vs paste precedence unclear.
13. A11Y Touch targets on mobile: S1-S5 chips 34x20, "open evidence" link 98x13, compare checkbox 24x24, hamburger 28x28, wizard pills 32x37. Fixed shell header takes ~150px of 844 on mobile.
P3
14. TEXT Raw ids in user-facing copy: "mode_1_decay × per_fold_causal", error strings with mode ids, claim code NOT_CAUSAL_MULTI_FOLD_GLOBAL_CALIBRATION, regex pattern as helper text, "Label/purge/embargo: preflight only for now.", "TRONG INBOX" (looks like a typo in /imports).
15. TEXT Right "REVIEW" rail repeated every step with many "not declared" rows; "12 routes not admitted" row + extra route line; "p04.fixed-qualification.v1 pins 1h" repeated; library header shows "49 of 49 runs" and "49 runs · 25 completed…" and claim ledger repeats counts; mode/alpha filter chips with a single option.
16. UX Document titles: /research/quantbt (journey index), /imports, /new, /runs/legacy keep "QuantBT Backtest Portal".
17. UX Selecting a 3rd run silently evicts the oldest.
18. DATA Alpha dropdown/registry show test receipts s14-ui-receipt / s14-api-receipt.

## 4) Genuinely good
Journey Map: every link works, picker banner names the target stage and offers "back to the journey map". Library: URL-driven filters, selection and compare survive Back/Forward; failed/cancelled/queued cards are distinct and honest ("not reported", "no claim — cancelled before Stage 5"). Library S1-S5 chips deep-link with correct titles. New Run: draft survives reload, disabled timeframe chips explain themselves, honest "refused" panel with request id, Create stays disabled until preflight.

## 5) Top-10 fixes
1. Fix write permission/workspace for the preview session and replace the three generic 403 messages with one honest state (then re-audit preflight result, parse, gates, create->progress).
2. Reject unlisted symbols in Market data.
3. Make Advanced walk-forward validation match Three-Window (required fields, errors, disable preflight).
4. Persist the draft across in-app leave (or confirm) and push a history entry per step; never render ?step=review with an empty draft.
5. Add Back/Next buttons; skip/merge read-only Strategy and Optimization steps; auto-pick the only version.
6. Complete Review error list with per-error link to the owning step and specific window messages.
7. Remove horizontal overflow on Command Center and /research/quantbt at 390.
8. Point Command Center / Journey shipped nodes to the redesigned screens (or hide legacy), fix titles, drop the duplicate header and the Runs(1) count.
9. Library: search by visible label, relabel/replace "LAST 30D" with all-time, unit on tooltip.
10. Trim copy: right rail, raw ids, regex helper, duplicated error text; enlarge mobile touch targets.
