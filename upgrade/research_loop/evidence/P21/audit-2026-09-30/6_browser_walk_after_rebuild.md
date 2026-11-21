# Research preview browser walk — 2026-09-30

Stack http://localhost:8095 · branch integrate/research-loop-2026-09-30 @ 77714769 · user claude-preview · read-only (non-GET aborted: **0 attempted** across all pages).
Runs: WFO R-WFO-017 (rrun_17f76212…), P04 R-P04-018 (rrun_464bf9c3…), clone R-P04-019 (rrun_6d431f0d…).
Method: fresh page per screen, wait `[data-screen]` (found on all 56 loads), networkidle+1.5s, full-page screenshot. Text scan over innerText.

## Screen × width

| screen | width | status | metrics | notes |
|---|---|---|---|---|
| S00-journey | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK |
| S01-runs | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK |
| S02-new | 1440 | DEFECT | ov 0 · tb 56px · 4xx 0 · cons 0 | DEFECT: Review shows TF 4h while Data-step select renders 1h (single option) |
| S02-from | 1440 | DEFECT | ov 0 · tb 56px · 4xx 0 · cons 0 | DEFECT: "COPIED FROM rrun_464bf9c3" (not R-P04-018); prefill OK |
| wfo-progress | 1440 | DEFECT | ov 0 · tb 56px · 4xx 0 · cons 0 | DEFECT: h1 "Run completed — rrun_17f76212"; topbar flashes rrun_ ~150ms |
| wfo-evidence | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK |
| wfo-split | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK |
| wfo-search | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK — fold glyph strip drawn (fold_01, fold_02, RETROSPECTIVE) |
| wfo-freeze | 1440 | DEFECT | ov 0 · tb 56px · 4xx 0 · cons 0 | DEFECT: what-if "J₁ -1.4435308120735202 · base -1.4435308120735202" raw float; slider ends labelled 1/1.6 but thumb at track middle |
| wfo-execute | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK — play across folds switch present (role=switch, off) |
| wfo-report | 1440 | DEFECT | ov 0 · tb 56px · 4xx 0 · cons 0 | DEFECT: printed "evidence link" uses short id rrun_17f76212 → 404; IS-account legend vs "in sample account — not published" |
| wfo-release-candidate | 1440 | DEFECT | ov 0 · tb 56px · 4xx 0 · cons 0 | DEFECT: topbar wraps to 2 rows at 1440 |
| p04-progress | 1440 | DEFECT | ov 0 · tb 56px · 4xx 0 · cons 0 | DEFECT: h1 "Run completed — rrun_464bf9c3" |
| p04-evidence | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK |
| p04-split | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK |
| p04-search | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK — strip "absent", typed "not applicable" |
| p04-freeze | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK |
| p04-execute | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK — no play-across-folds (correct); typed absences |
| p04-report | 1440 | DEFECT | ov 0 · tb 56px · 4xx 0 · cons 0 | DEFECT: printed evidence link rrun_464bf9c3 (short id → 404) |
| p04-release-candidate | 1440 | DEFECT | ov 0 · tb 56px · 4xx 0 · cons 0 | DEFECT: topbar wraps to 2 rows at 1440 |
| clone-evidence | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK |
| clone-report | 1440 | DEFECT | ov 0 · tb 56px · 4xx 0 · cons 0 | DEFECT: printed evidence link rrun_6d431f0d (short id → 404) |
| S10-lineage | 1440 | DEFECT | ov 0 · tb 56px · 4xx 0 · cons 0 | DEFECT: nodes labelled ratt_/rrun_ short ids, never R-…; clone only visible after "show 35 probe attempts" (then nested OK) |
| S12-atlas | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK |
| S13-compare | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK |
| S13-compare-resolver | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK — typed empty "Nothing was requested" |
| S14-import | 1440 | OK | ov 0 · tb 56px · 4xx 0 · cons 0 | OK — loads, empty state typed |
| S00-journey | 660 | OK | ov 0 · tb 90px · 4xx 0 · cons 0 | OK |
| S01-runs | 660 | OK | ov 0 · tb 90px · 4xx 0 · cons 0 | OK |
| S02-new | 660 | DEFECT | ov 0 · tb 90px · 4xx 0 · cons 0 | DEFECT: Review shows TF 4h while Data-step select renders 1h (single option) |
| S02-from | 660 | DEFECT | ov 0 · tb 90px · 4xx 0 · cons 0 | DEFECT: "COPIED FROM rrun_464bf9c3" (not R-P04-018); prefill OK |
| wfo-progress | 660 | DEFECT | ov 0 · tb 65px · 4xx 0 · cons 0 | DEFECT: h1 "Run completed — rrun_17f76212"; topbar flashes rrun_ ~150ms |
| wfo-evidence | 660 | OK | ov 0 · tb 65px · 4xx 0 · cons 0 | OK |
| wfo-split | 660 | OK | ov 0 · tb 65px · 4xx 0 · cons 0 | OK |
| wfo-search | 660 | OK | ov 0 · tb 65px · 4xx 0 · cons 0 | OK — fold glyph strip drawn (fold_01, fold_02, RETROSPECTIVE) |
| wfo-freeze | 660 | DEFECT | ov 0 · tb 65px · 4xx 0 · cons 0 | DEFECT: what-if "J₁ -1.4435308120735202 · base -1.4435308120735202" raw float; slider ends labelled 1/1.6 but thumb at track middle |
| wfo-execute | 660 | LOW | ov 0 · tb 65px · 4xx 0 · cons 0 | LOW: candle chart price label/x-axis labels clipped |
| wfo-report | 660 | DEFECT | ov 0 · tb 65px · 4xx 0 · cons 0 | DEFECT: printed "evidence link" uses short id rrun_17f76212 → 404; IS-account legend vs "in sample account — not published" |
| wfo-release-candidate | 660 | LOW | ov 0 · tb 65px · 4xx 0 · cons 0 | LOW: evidence-pack table clipped at right; rows tall/empty |
| p04-progress | 660 | DEFECT | ov 0 · tb 65px · 4xx 0 · cons 0 | DEFECT: h1 "Run completed — rrun_464bf9c3" |
| p04-evidence | 660 | OK | ov 0 · tb 65px · 4xx 0 · cons 0 | OK |
| p04-split | 660 | OK | ov 0 · tb 65px · 4xx 0 · cons 0 | OK |
| p04-search | 660 | OK | ov 0 · tb 65px · 4xx 0 · cons 0 | OK — strip "absent", typed "not applicable" |
| p04-freeze | 660 | OK | ov 0 · tb 65px · 4xx 0 · cons 0 | OK |
| p04-execute | 660 | OK | ov 0 · tb 65px · 4xx 0 · cons 0 | OK — no play-across-folds (correct); typed absences |
| p04-report | 660 | DEFECT | ov 0 · tb 65px · 4xx 0 · cons 0 | DEFECT: printed evidence link rrun_464bf9c3 (short id → 404) |
| p04-release-candidate | 660 | LOW | ov 0 · tb 65px · 4xx 0 · cons 0 | LOW: evidence-pack table clipped at right; rows tall/empty |
| clone-evidence | 660 | OK | ov 0 · tb 65px · 4xx 0 · cons 0 | OK |
| clone-report | 660 | DEFECT | ov 0 · tb 65px · 4xx 0 · cons 0 | DEFECT: printed evidence link rrun_6d431f0d (short id → 404) |
| S10-lineage | 660 | DEFECT | ov 0 · tb 90px · 4xx 0 · cons 0 | DEFECT: nodes labelled ratt_/rrun_ short ids, never R-…; clone only visible after "show 35 probe attempts" (then nested OK) |
| S12-atlas | 660 | OK | ov 0 · tb 90px · 4xx 0 · cons 0 | OK |
| S13-compare | 660 | OK | ov 0 · tb 90px · 4xx 0 · cons 0 | OK |
| S13-compare-resolver | 660 | OK | ov 0 · tb 90px · 4xx 0 · cons 0 | OK — typed empty "Nothing was requested" |
| S14-import | 660 | OK | ov 0 · tb 90px · 4xx 0 · cons 0 | OK — loads, empty state typed |

Text-scan notes (not defects): ISO `…T00:00:00.000Z` + 15-digit floats appear only in the visually-hidden "exact values" accessible tables on evidence/execute (verified clipped/hidden); `null # P21_ASSIGNED_ON_LOCAL_SEAL` in the RC YAML preview is a typed null; `fees to here 0.00` on S08 is a real zero. No NaN / undefined / [object / ".." found anywhere.

## HTTP responses ≥ 400

- During the 56-load walk and all feature checks: **none**. Console errors: **none**. Page errors: none.
- Only 4xx observed: `404 /api/v1/quantbt/runs/rrun_17f76212/report` — produced by following the report's printed "evidence link" (defect D2).

## Feature verification (merged today)

| feature | result |
|---|---|
| S08 play across folds on WFO execute | PRESENT — `button[role=switch][aria-checked=false]` "play across folds · reads the next window at each boundary · off" |
| S08 absent on P04 | ABSENT (correct) |
| S06 per-fold glyph strip, WFO search | DRAWN — `data-fold-strip=drawn`, fold 0/1 train+test published, OOS reading RETROSPECTIVE; P04 = `absent` with typed sentence |
| S02 `?from=` prefill | Values copied (alpha, av, dataset/symbol/TF, IS/OOS/holdout, mode/schedule, 8 param ranges, trials=1); clone banner state=available — but shows `rrun_464bf9c3`, not R-P04-018 |
| S02 coverage captions (fresh /runs/new) | Work: after dataset+symbol, "IS start prefilled from BTCUSDT coverage · first day of 2020-01", "Holdout end prefilled … end of 2026-09" (2026-10-01T00:00). None on ?from= (values are from the run, as designed) |
| Topbar 1280 | One row, 56px, "Research / R-WFO-017" on progress/evidence/execute/report/RC |
| Topbar 1440 | One row on all screens EXCEPT release-candidate (WFO and P04): wraps, "Planned modules" on 2nd line (D1) |
| Cold-link label S05–S08 (P04) | Final crumb "R-P04-018" on split/search/freeze/execute; first ~150ms shows `rrun_464bf9c3` then swaps (same on WFO) |
| S10 clone under parent | Nested correctly (indented under ratt_464bf9c3) once "show 35 probe attempts" is clicked; hidden by default. API has parent_attempt_id + display_label R-P04-019, UI shows `ratt_6d431f0d · rrun_6d431f0d` |
| S11 P22 publication | Section `data-panel=publish` renders: "publish blocked · seal the evidence pack first · P22_LOCAL_SEAL_REQUIRED"; mirror-ghost "R1 · RESEARCH EVIDENCE — not yet published"; publication-requests=0 (no seal, typed absence) |
| S14 import | Loads, typed empty state, no errors |
| S07 what-if (WFO) | AVAILABLE: 9×9 grid "1 / 81 cells evaluated", entry_z→rvol 1.2, atr_mult→slpercent 2.3, ΔJ₁ 0, "evaluate grid · 48 missing" (=7×7 in-range −1), "create sibling attempt →" |
| S07 what-if (P04) | NOT_APPLICABLE: P04_FIXED_PROFILE_DOES_NOT_PUBLISH_EVALUATED_WHAT_IF_GRID |
| S07 byte-verify | Both runs: "ARTIFACT BYTES · not verified yet — No verification has been requested… verify now does." (not clicked — POST). P04 also "SOURCE ARTIFACT BYTES not attested"; WFO retained custody manifest+import digests "match" |

## Prioritized defects

| # | sev | defect | screenshot | sha256[0:16] |
|---|---|---|---|---|
| D1 | High | Topbar wraps to two rows at 1440 on Release Candidate (WFO + P04): long crumb "…/ Release Candidate & Publish" pushes "Planned modules" to a 2nd line, controls jump to y≈14. Violates "one row at 1280/1440" (1280 is fine because the crumb collapses below 1440 only). | topbar-rc@1440.png / wfo-release-candidate@1440.png / p04-release-candidate@1440.png | ff9c327d875f9042 / 57bd549edc8cc35c / fe1bd147cb89f4f9 |
| D2 | High | Run Report prints "evidence link /research/quantbt/runs/rrun_17f76212/report?…" with a short id; the URL 404s (`/api/v1/quantbt/runs/rrun_17f76212/report`) and renders DENIED. Same on P04 (rrun_464bf9c3) and clone (rrun_6d431f0d). It is on the printable sheet. | wfo-report@1440.png, report-shortlink@1440.png | 9748dfaaadec7cdd, 91731b782073d517 |
| D3 | Med | S10 lineage never uses display_label: every node "ratt_xxxx · rrun_xxxx"; clone R-P04-019 hidden behind "show 35 probe attempts" (all 36 attempts except root are classed as probes); every node chip ACTIVE incl. 19 failed runs (derived from version lifecycle — reads as run state). | S10-lineage@1440.png, S10-lineage-probes@1440.png | 630b73612ee2a69e, 28b41dee5d739222 |
| D4 | Med | S02 `?from=` banner "COPIED FROM rrun_464bf9c3" instead of R-P04-018. | S02-from@1440.png | f0ecee2b9850843c |
| D5 | Med | S03 Progress h1 "Run completed — rrun_17f76212" / "— rrun_464bf9c3" while crumb/meta say R-WFO-017 / R-P04-018. | wfo-progress@1440.png, p04-progress@1440.png | 797060bdfb0a92eb, 532c24ccdb672fd1 |
| D6 | Med | S02 Review shows timeframe **4h** (default draft) while the Data-step Timeframe select displays "1h" (its only option) — the control shows a value the draft doesn't hold; error "The strategy declares only 1h" appears with no visible cause. | S02-new@1440.png, S02-new-Walk-forward@1440.png | 3c1c3f9d47e2e9c8, e3add46fb9c20249 |
| D7 | Low-Med | S07 what-if prints raw floats "J₁ -1.4435308120735202 · base -1.4435308120735202"; slider end labels 1 / 1.6 (clipped to declared range) but θ* 1.2 thumb sits mid-track (track = unclipped θ*±4 steps) — position disagrees with labels. | wfo-freeze@1440.png | cbfc227294fe0d25 |
| D8 | Low-Med | Run Report equity chart legend "IS account" + "IS emitted 300 of 720 source observations" while Source absences say "in sample account — not published" and Evidence Flow says no IS curve exists. One of the two is wrong. | wfo-report@1440.png | 9748dfaaadec7cdd |
| D9 | Low | Topbar cold-load flash: first ~150–300ms render `rrun_17f76212` / `rrun_464bf9c3` before the label read lands (all run screens, 1280+1440). | (timed probe, checks.out) | — |
| D10 | Low | 660: S08 candle chart top price label and x-axis end labels clipped ("ul", "23:("); RC evidence-pack table clipped at right with very tall empty-looking rows. | wfo-execute@660.png, wfo-release-candidate@660.png | d4ae07c2ccb5e763, 1ff53863dbeeeaf6 |
| D11 | Low | S08 WFO: fold named "fold_01" in chips but "fold 0" in checkpoint/child-audit text; "FOLD CAPITAL carry_position" raw enum as the headline value; price axis "66000.00" unformatted vs "58,744.40" elsewhere. | wfo-execute@1440.png | d13940f674040843 |

Scripts: login.mjs, walk.mjs, checks.mjs (+checks.out), s02.mjs, s02b.mjs, lin.mjs, link.mjs, s01.mjs. Raw results: results-1440_660.json; per-page text dumps *.txt; tiles/ for tall shots.
