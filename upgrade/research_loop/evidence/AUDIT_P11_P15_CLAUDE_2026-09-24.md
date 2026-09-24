# Audit P11–P15 — browser, HiFi ↔ build ↔ backend, 2026-09-24 (round 3)

**Auditor:** Claude (frontend lead) · **Branch:** `docs/research-loop-plan` @ `62d7d864`
**Asked by Bobby (2026-09-24):** check the screens of P11–P15 thoroughly, in the
browser only, against the HiFi and docs; same rules as round 2
([AUDIT_P01_P10](./AUDIT_P01_P10_CLAUDE_2026-09-23.md)).
**Plan:** Unified §13 **RF-05** (Codex, backend) and **RF-06** (Claude, frontend).
Requests to Codex: [CODEX_REQUESTS_FROM_CLAUDE_P11_P15.md](./CODEX_REQUESTS_FROM_CLAUDE_P11_P15.md).

## 0. Scope and method

| Phase | Screen | Route |
|---|---|---|
| P11 | 03 Run Progress (re-audit after RF-04 wave A) | `/research/quantbt/runs/:id/progress` |
| P12 | 01 Run Library | `/research/quantbt/runs` |
| P13 | 04 Evidence Flow | `/research/quantbt/runs/:id/evidence` |
| P14 | 05 S1 Split | `/research/quantbt/runs/:id/split` |
| P15 | 06 S2 Search & Selection | `/research/quantbt/runs/:id/search` |

- **Preview:** isolated stack `:8095`; backend images rebuilt at `62d7d864`
  (migrations to `…057`); web = RF-04 wave A (`12c41ab3`), because the working
  tree's S00 `JourneyMap.tsx` (edited by another session) did not compile.
- **Data:** real QuantBT 1.1.1 runs created through Screen 02 on this backend
  (`rrun_31110946…`, `rrun_91f4b6ac…` live-watched), older `rrun_80d3c2f4…`,
  four CANCELLED runs and one legacy 1.0.8 row — all P04 fixed Delta profile,
  one fold, no optimizer study, current-source lane `PENDING_RETENTION`.
- **How:** every HiFi `.dc.html` rendered and measured per block
  (`getComputedStyle`); the build driven with Playwright at 1440 / 1280 / 660:
  clicks, hashes, reload, back/forward, keyboard, axe, console, network,
  60-s idle logs, live SSE trace; error states stubbed in the browser only.
  GETs only, except one run created on purpose to watch S03 live.
- **Not tested (no data):** RUNNING/FAILED rows in S01, multi-fold runs, an
  issued claim, an optimizer study, 32-fold scale, dark theme, screen readers.
  Screenshots are in the session scratch folder, not archived.

## 1. Headline

1. **The screens are honest but mostly empty, and the cause is upstream.**
   Every run on this stack is the P04 fixed profile, and every current-source
   read answers 409 `PENDING_RETENTION`. The rich passport (S04), real folds
   (S05) and trial ledger (S06) cannot render with real data until `CG-P10-02`
   (profiles beyond the fixed one) and `CG-P05-01` (retention writer) land.
2. **Real frontend bugs found by interaction — 23**, the worst:
   - S03: live events other than console lines change nothing on screen; stage
     rail, %, tqdm and artifacts jump only at completion. `availability` is
     never refreshed while streaming, so a running run shows seven PARTIAL
     banners and "source has not reported yet" (N1, N2).
   - S04: the claim strip says **"claim — available"** for a NOT_ISSUED claim;
     metric tiles print 47-digit decimals; charts put 25 uneven samples on a
     category axis (time distorted); the sticky strip hides under the topbar.
   - S05/S06: opening the screen without a hash writes `stage=summary`, so the
     way back lands on the wrong hub tab; S06 ignores a fold change (304 on a
     stale ETag); both call current-source on every visit and log a 409.
   - S01: two list requests per load and per filter, 14 requests for 7
     keystrokes (no debounce), a checkbox refetches the list, compare refused
     for a valid pair hidden by a filter, "open compare" goes to an unbuilt
     screen and bounces.
3. **State vocabulary is misused on four screens:** 404 shown as EMPTY, a 409
   with nothing retained shown as STALE, a pending source shown as EMPTY, a
   cancelled run told to "watch progress". The state semantics forbid all four.
4. **Fixed copy contradicts the data** on S05 (subtitle/footer claim a sealed
   holdout, fold_plan and true-scale purge/embargo the run did not publish), S06
   (footer asserts a fixed profile on a 404), S04 (passport refusal blames the
   profile while the cause is retention).
5. **Backend now serves fields no screen reads:** S03 `queue`/`attempts[]`,
   `terminal_materialization`, `mandatory_bundle`, stage timestamps; S04
   `published_fold_count`; S01 `technical_retry_count`, `source_updated_at`.
6. **Speed is in budget** on 01/03/05/06 (route chunks 5–23 KB gzip, total
   ≈118–125 KB with the shell). S04 still loads ECharts (240 KB) eagerly with
   the route; spec wants the chart lib lazy.

## 2. Per phase

Owner: **FE** Claude (RF-06) · **BE** Codex (RF-05) · **DQ** Bobby. Sev: **bug**
(wrong or broken) · **gap** (HiFi element missing) · **polish**.

### P11 — Screen 03 Run Progress

Round-2 items: FE-S03-01 (named SSE), -02 (hidden tab, code only), -04 (claim
copy) **fixed**; -12 closed by DQ-04. Still open: -03 meta strip, -05 hand-off
and breadcrumb, -06 console backfill/height/stage log, -07 time-scaled Gantt,
-08 artifact size/digest, -09 states, -10 attempts drawer (now unblocked),
-11 raw codes/bar/pulse/role.

| # | Finding | Owner | Sev |
|---|---|---|---|
| FE-S03-13 | Live events (`stage_*`, `fold_completed`, `trial_completed.overall_pct/tqdm_line`, `artifact_writing/sealed`, `seal_started`) are ignored; the server attaches a snapshot only to heartbeat/terminal frames. Live run showed 0 %, trials 0/1, no artifacts beside a "completed" console line until the final refresh | FE (or BE `CG-P11-08`) | bug |
| FE-S03-14 | `read.current`/`availability` frozen at the open frame: seven PARTIAL banners and "source has not reported yet" during the whole run; `may_cancel`, attempts, FINISHING frozen too | FE | bug |
| FE-S03-15 | COMPLETED run without a claim gets a solid red border and red NOT ISSUED badge — reads as a failure | FE | bug |
| FE-S03-16 | Layout: claim passport last (HiFi first); Gantt and Artifacts stacked (HiFi side by side 602 + 528); artifacts as cards (HiFi table) | FE | gap |
| FE-S03-17 | SSE label follows `live`, not transport ("SSE live" with a grey dot while polling/hidden) | FE | polish |
| FE-S03-18 | Unrendered served fields: `queue.*`, `attempts[]` (a CANCELLED run's `LOST_LEASE` never shown), `CANCELLED_BEFORE_SOURCE`/`QUEUED_NO_SOURCE`, `terminal_materialization`, `last_received_at_utc_ms`, `mandatory_bundle`, stage start/end, `created_at_utc_ms`, `run_completed.usage` | FE | gap |
| FE-S03-19 | a11y: heading order h1→h3; no `aria-pressed`/arrow keys on folds; stage cells not focusable; budget "0/no cap core-min"; console times UTC without zone; status pill printed twice | FE | polish |

### P12 — Screen 01 Run Library

| # | Finding | Owner | Sev |
|---|---|---|---|
| FE-S01-01 | Every load and filter change sends the list request twice (reset effect makes a new cursor object); no 150 ms search debounce (14 requests / 7 keys) | FE | bug |
| FE-S01-02 | Ticking a compare checkbox refetches the list (`sel` in the URL gives filters new identities) | FE | bug |
| FE-S01-03 | Filter change while paged first sends the old page cursor with the new filter | FE | bug |
| FE-S01-04 | Compare refuses a valid pair when one is hidden by a filter (looks up keys among visible rows); no "(hidden by filter)" note | FE | bug |
| FE-S01-05 | "open compare →" navigates to unbuilt Screen 13 and bounces to `/runs`, losing the selection — must be disabled with phase P20 | FE | bug |
| FE-S01-06 | Atlas deep link `?mode=mode_2_sbb` etc.: no chip pressed (catalog lists only modes with runs), generic empty, no way to clear but editing the URL | FE | bug |
| FE-S01-07 | `?sel=R-FAKE-1` accepted; page cursor not in URL (reload loses page 2); counter says "11 of 11" while 4 shown | FE | bug |
| FE-S01-08 | Claim face says "not published" for COMPLETED runs whose reason is `SOURCE_CLAIM_NOT_ISSUED` — Screen 04 prints the server's sentence for the same run | FE (+BE `CG-P12-09`) | bug |
| FE-S01-09 | Raw reason codes in tooltips; digest instead of the binding sentence; scratch chip without tooltip | FE | bug |
| FE-S01-10 | No CANCELLED/QUEUED status chip; `aria-pressed` missing on all filter chips; selected mode/alpha chips not styled; scratch chip looks on when off | FE | bug |
| FE-S01-11 | Error states have no retry button; loading is a blank panel (HiFi: 5 skeleton cards); filtered-empty lacks "0 of M runs match — loosen a filter" + clear | FE | gap |
| FE-S01-12 | Compare bar not sticky (at page end); native 13 px checkbox, no selected-card outline, target < 24 px | FE | gap |
| FE-S01-13 | Double "new run" (module header + screen); header lacks attempt lineage (disabled, P19), journey map ↗, breadcrumb; extra "RUNS" panel frame; cards 130 px (HiFi ~100) with the link wrapping; cert chip dropped when null (spec: `—`); rules footer is invented copy | FE | gap |
| FE-S01-14 | Legacy row: mode shows "legacy metadata" though the server sent it; grouped under scratch (see BE `CG-P12-07`) | FE | polish |

### P13 — Screen 04 Evidence Flow

| # | Finding | Owner | Sev |
|---|---|---|---|
| FE-S04-01 | Claim strip reads "claim — available" for NOT_ISSUED (falls through to `Withheld availability=AVAILABLE`); Claim tab styles the NOT_ISSUED sentence like an issued claim | FE | bug |
| FE-S04-02 | Metric tiles print exact decimal strings (`-0.0015449412401856354502…`, `19965.998848845535`), 156 px tiles; no %/currency (= DQ-08: round by unit, exact value on hover/copy) | FE | bug |
| FE-S04-03 | Charts: category x-axis for time (uneven samples drawn evenly, a date labelled twice), 47-digit tooltips, underwater axis in fractions not %, rolling tooltip unnamed and not confined (covers the sidebar), no fold markLines / trough marker, heights 210/130 vs HiFi 380/180 | FE | bug |
| FE-S04-04 | Sticky strip uses `top:0` and hides under the topbar (spec `top:56px`) | FE | bug |
| FE-S04-05 | 404 → EMPTY, no link to 01, cursor bar still drawn; CANCELLED run told "has not sealed its evidence yet… watch progress"; stubbed 409 → STALE with nothing retained; on 409/503/404 the strip, header and tabs vanish | FE (+BE `CG-P13-12`) | bug |
| FE-S04-06 | Unobserved fold (`#fold=4`, `99`) kept with prev/next both disabled and carried into deep-dive links (golden cases clamp); `published_fold_count` unread | FE | bug |
| FE-S04-07 | Drawer Escape returns focus to `<body>`, not the chip | FE | bug |
| FE-S04-08 | Atlas link back to the hub drops the hash (05/06/07 keep it) | FE | bug |
| FE-S04-09 | Passport refusal sentence blames the admitted profile; the cause is `PENDING_RETENTION` | FE | bug |
| FE-S04-10 | Empty MONTHLY_RETURNS shows "0 of 744 points · full" and a blank body (needs the empty copy) | FE (+BE `CG-P13-06`) | bug |
| FE-S04-11 | Status and scope strings lowercased (amendment: render durable status exactly) | FE | polish |
| FE-S04-12 | ECharts (240 KB) loaded eagerly with the route; spec §11 wants the chart lib lazy; tab switch to Summary 107 ms (budget 16) | FE | gap |
| FE-S04-13 | Layout: breadcrumb stops at "QuantBT Backtest"; tabs 86 px mono (HiFi 173 px Inter uppercase + sub-label); tabs and cursor not one sticky card; extra h1/subtitle; strip background `#f4f2ec` vs `#fdfbf5`; S1–S4 tabs all show one generic paragraph | FE | gap |

### P14 — Screen 05 Split

Timeline geometry is **true to time**: warmup 10.5 % / IS 51.4 % / OOS 26.1 % /
holdout 11.8 % of 1102 px, identical at every width, no overflow.

| # | Finding | Owner | Sev |
|---|---|---|---|
| FE-S05-01 | Direct entry without a hash writes `#stage=summary`; back link lands on the hub Summary tab (`parseCursor` default overrides the `split` seed). Same bug on S06 | FE | bug |
| FE-S05-02 | `current-source/split` fetched on every mount and revisit → one 409 console error each (7 in one session) | FE (+BE `CG-P13-09`) | bug |
| FE-S05-03 | Subtitle/footer assert a sealed holdout, fold_plan source and true-scale purge/embargo that this run does not publish | FE | bug |
| FE-S05-04 | 200 with `PENDING_SOURCE_CALLBACK`/`NOT_READY` → "EMPTY · No rows"; first-read 409 → STALE; 404 → EMPTY with live links | FE | bug |
| FE-S05-05 | Layout dropped when data is missing: θ* flow, fold table, boundary-integrity, stitched-OOS and feeds-forward cards removed instead of kept as shells with typed absences (Astra A11) | FE | gap |
| FE-S05-06 | Protocol card reduced to one strip with a 64-char digest and ISO-ms as-of; absences listed twice (unlock three times) with inconsistent names; `readiness: PARTIAL` never shown | FE | gap |
| FE-S05-07 | Axis ticks at arbitrary dates (month starts read better, allowed by the ruling); warmup painted with the holdout role colour; header: no copy-link, crumb mono 11 vs Inter 12; next-stage hash still says `stage=split` on S2 | FE | polish |
| FE-S05-08 | Segments carry `title` only (spec §16: role=img + aria-label); revisit loses the ETag (hook-held) → full 200 + skeleton | FE | polish |

### P15 — Screen 06 Search

The screen is **honest about the fixed profile** (chip "fixed profile no
search", mode "declared not executed", a reason in every optimizer panel).

| # | Finding | Owner | Sev |
|---|---|---|---|
| FE-S06-01 | Same `stage=summary` bug as FE-S05-01 | FE | bug |
| FE-S06-02 | Fold change ignored: `?fold=3` sent with fold 1's ETag → 304 → still "Fold 1 was requested" | FE + BE `CG-P15-02` | bug |
| FE-S06-03 | `current-source/search` called although the ledger is `NOT_APPLICABLE` → 409 each visit and contradictory copy ("pending retention… yet" next to "not applicable") | FE | bug |
| FE-S06-04 | Rules footer asserts a fixed profile during loading/403/503 and on a real 404; says "panels below" at the bottom of the page | FE | bug |
| FE-S06-05 | Atlas deep link `mode/schedule` neither honoured nor acknowledged, and forwarded into every link | FE | bug |
| FE-S06-06 | `fold=999` (400) shows TERMINAL above stale fold-1 content, no cursor notice | FE | polish |
| FE-S06-07 | Grid 513/52/513 inside an extra card (HiFi 567/52/525 on the page); freeze line a small box (HiFi full-height dashed line + rotated label); ledger inside Stage B (HiFi full width); Stage B keeps no frames while Stage A keeps 7; every absence printed twice | FE | gap |
| FE-S06-08 | A1 table lacks `kind` (served) and levels; claim row missing; no copy-link; loading is a generic skeleton; 404 wording EMPTY; raw ISO-ms as-of; three 64-hex strings inline; `readiness partial` unexplained | FE | gap |

## 3. Cross-screen

| # | Finding | Owner |
|---|---|---|
| FE-X-10 | One cursor fix for S05/S06/S07: the screen's own stage seeds the cursor unless the hash names a stage | FE |
| FE-X-11 | One state rule for 404 / first-read 409 / pending / cancelled across S03–S06 (run-not-found page with a Runs link; no STALE without a retained value) | FE |
| FE-X-12 | Skip current-source reads whose lane cannot apply (fixed profile, `NOT_APPLICABLE`), until `CG-P13-09` gives a typed answer | FE |
| FE-X-13 | Number/time formatting helper used by S01/S03/S04/S05/S06: unit-aware rounding with exact value on hover/copy (DQ-08), UTC with zone label, no ISO-ms in headers, digests shortened with copy | FE |
| FE-X-14 | Contrast: `--ink-faint` serious nodes on every screen (56–171) — the DS-01 token step, scheduled | FE (DS-01) |
| FE-X-15 | Module header still above every screen (DQ-01 approved: drop it, use the HiFi breadcrumb) — pushes titles to y≈167–188 vs HiFi ≈90 | FE |

## 4. Backend — summary (full list in the request file)

- **Blocks HiFi everywhere:** `CG-P10-02` (only the fixed profile runs) and
  `CG-P05-01` (no retention/materializer; `retained_artifacts: []` even for new
  runs — the P05 receipt writer is flag-dark on this preview, `CG-P11-05`).
- **P11:** budget literal 0/null with no `budget_tick` (`CG-P11-04`); cancelled
  runs stay `PENDING` (`CG-P11-06`); retry owner points at a route that does
  not exist (`CG-P11-07`); snapshot per event or read delta decision
  (`CG-P11-08`); `run_completed` payload fields not in the contract, unmeasured
  usage reported as 0 (`CG-P11-09`); `CG-P11-03` still open.
- **P12:** stats and sparkline hard-coded null though the P13 projection has
  them (`CG-P12-02/03`); mode chip built from protocol, not schedule
  (`CG-P12-04`); ledger counts cancelled/legacy as pending (`CG-P12-05`); rc
  always null (`CG-P12-06`); legacy binding reads as scratch (`CG-P12-07`);
  `before` cursor off by one (`CG-P12-08`); claim text differs from S04
  (`CG-P12-09`); search misses mode (`CG-P12-10`).
- **P13:** metric registry lacks Sharpe/Sortino/CAGR/PF/hit rate/decay
  (`CG-P13-03`, Astra A09); rolling Sharpe/beta (`-04`); coarse caps (`-05`);
  empty monthly marked AVAILABLE (`-06`); claim-strip facts (`-07`); per-fold
  verdict (`-08`); one refusal code for every retention case (`-09`); status
  vocabulary READY vs COMPLETED (`-10`); hub revision identical for two runs
  (`-11`, Astra A04); no terminal flag (`-12`); ETag weak/strong mix and no
  Cache-Control (`-13`).
- **P14:** fold facts (warmup/label/purge/embargo/inner) missing from RS-02
  `Fold` though the engine has them (`CG-P14-02`); `NOT_APPLICABLE` vs
  `NOT_PUBLISHED` for three-window (`-03`); `as_of` is read time (`-04`); no
  timeframe fact (`-05`); duplicate absences (`-06`).
- **P15:** ETag ignores fold (`CG-P15-02`, Astra A06); RS-02 search lacks
  trial→fold/stage link, typed state, metrics, feasible flag, best/selected
  (`-03`); diagnostics labelled unpublished without a probe (`-04`); claim-row
  facts (`-05`).

## 5. Decisions for Bobby

| # | Question | Claude recommends |
|---|---|---|
| DQ-13 | S03 live updates: FE patches the screen from each event payload, or Codex attaches a snapshot/read delta to every event? | BE attaches the snapshot (one source of truth; `CG-P11-08`); FE patches from payloads meanwhile only for pct/stage/artifacts |
| DQ-14 | When data is missing, keep the HiFi layout as empty shells with typed reasons (Astra A11), or collapse? | Keep the shells — the reader sees what the screen will show and why it is absent |
| DQ-15 | Screen copy that describes what the method guarantees (S05/S06 subtitles, footers): keep verbatim HiFi, or make it conditional on what the run published? | Conditional: the sentence is shown only when the run published the fact it names |

## 6. Order of work (RF-06)

1. **Wave A — bugs, no dependency:** FE-S03-13/14/15, FE-S01-01…10, FE-S04-01…11,
   FE-S05-01…04, FE-S06-01…06, FE-X-10…13.
2. **Wave B — HiFi layout (after DQ-13…15):** FE-S03-16…19, FE-S01-11…14,
   FE-S04-12/13, FE-S05-05…08, FE-S06-07/08, FE-X-15, remaining FE-S03 round-2
   items (-03, -05…-11).
3. **Wave C — consume RF-05 contracts** as each is DELIVERED; real-API receipt
   per screen at 1440/1280/660.

## 7. RF-06 status — 2026-09-24 (Claude)

Bobby: "xử lý hết phần frontend đang có lỗi … làm luôn". DQ-13…15 applied as
recommended (DQ-14 shells with typed reasons, DQ-15 fact-asserting copy only
when published); recorded as delegated, for Bobby's later review.

| Area | Status |
|---|---|
| FE-X-10 cursor seed + next-stage stage, FE-S04-06 clamp | fixed (`evidenceCursor.ts`, hub calls `clampToObserved`) |
| FE-X-11 states | fixed: 404 → terminal "not found" + `notFound` → run-not-found page with Runs link; first-read 409 → failed-retryable, never STALE; pending → partial |
| FE-X-12 current-source reads | fixed on S05/S06 (skipped when the lane cannot apply). S04 passport still reads it on READY runs: no typed fixed-profile fact in the hub, so skipping would be a frontend inference — waits `CG-P13-09` |
| FE-X-13 formatting | new `researchFormat.ts` (unit-aware, exact value kept in title/copy) |
| FE-X-15 module header | removed on Research Loop screens (DQ-01); legacy screens keep it |
| S01 FE-S01-01…14 | all fixed; list requests on load 3→1, typing 7 keys 14→1, checkbox 1→0 |
| S04 FE-S04-01…13 | all fixed; charts lazy (route chunk 15 KB gz, ECharts only on chart mount), time axis, % tooltips, sticky under the measured topbar |
| S05 FE-S05-01…08, S06 FE-S06-01…08 | fixed except: A1 `levels` (not served), near-bound θ* ticks (would be browser judgement), search cinema and S05 lens (not built) |
| **S03 (P11) FE-S03-13…19 and round-2 S03 items** | **handed to Codex's RF-04 run**, which is editing `RunProgress.tsx`/`useRunProgress.ts` in the same checkout; not touched here except one test expectation (404 → terminal) in `runProgress.test.tsx`, left uncommitted for Codex's commit |

Deviations for Bobby's review: card height S01 131 px vs HiFi 101 (real ids
are long; shorten id?); strip/tab card not sticky below 768 px; strip colour
`var(--paper)` (no `#fdfbf5` token); RUNNING/QUEUED on S04 get a banner, not the
spec §23 redirect; S05/S06 use the HiFi title/subtitle (DQ-02); a few added
lines not in HiFi/spec (cancelled-claim line, "open progress →", "open legacy
run →", P19/P20/P21 disabled labels). The e2e probe (`_probe-research-product`,
Codex's working copy) expects `128400.00`; the tile now reads `128,400.00`.

## 8. HiFi fidelity pass — 2026-09-24 (Claude)

Bobby: "rules là luôn bám HiFi về chi tiết UI UX, font chữ, cỡ, cách chuẩn hoá
số, hoạt động, tính động … làm luôn màn 3". Each screen was measured block by
block against its `.dc.html` (getComputedStyle, 1440/1280/660 + HiFi motion
observed), then rebuilt to it. S03 is taken back from the RF-04 hand-off.

| Screen | Result (measured, 1440) |
|---|---|
| shared | `researchScreen.css`: 13 px / line-height normal (was 16/1.5), shell gutter removed for 01/03/04/05/06 which own their HiFi frame, 120 ms colour transitions, HiFi double-ring focus, link hover, `rs-pulse`/`rs-flow`/`rs-caret` with reduced-motion off |
| 01 | card 101 px (HiFi 101, was 131), frame 248/1192 (was 280/1128), chips/pills/inputs at HiFi heights, sparkline placeholder bars, 2-dp ratios, run id ellipsis + copy, HiFi pulses |
| 03 | HiFi order (meta strip, claim passport first), 5 stage pills (DQ-04), 14 px gradient bar, Gantt 602 + Artifacts 528 side by side, fill = trial progress (DONE 100 %, was 11 %), console 330 px lh 1.75, Live console / Stage log, done banner with S1–S5 links, alertdialog cancel, live patching from events + refreshed availability (DQ-13) — verified on two real runs |
| 04 | passport card + inline dataset panel (HiFi over spec, DQ-02), only the cursor bar sticks, tiles 220.8×90 (HiFi), EChart 1/2 split with provenance row, HiFi grids/axes/tooltips, U+2212 and `Z` times, verdict/monthly/behaviour shells |
| 05/06 | frame 272/1144, S06 grid 567/52/525 and 629/52/583 (HiFi identical), fold table fits (was 1207 in 1126), numeric columns right-aligned, `[start, end)` spans, gold holdout row, fold keyboard, freeze arrow chip, A1/ledger HiFi columns and colours |

Everything that still differs is data the backend does not publish (RF-05
ids cited on each shell) or a recorded decision: 5 stages not 11 (DQ-04), 2-dp
money without `$` and "currency" not "USD" (DQ-08, no currency code in the
contract), `reset to θ*` and retained-source passport kept (spec), cursor
notices, 409 on S04's current-source read until `CG-P13-09`. Colours without a
token were approximated to the nearest token (console palette, #e8eff1,
#f4f8f9, #fdfbf5) and listed per screen in the agents' receipts.
