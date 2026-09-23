# Audit P01–P10 — HiFi ↔ build ↔ backend, 2026-09-23 (round 2)

**Auditor:** Claude (frontend lead) · **Branch:** `docs/research-loop-plan` @ `1852dd5e`
**Asked by Bobby (2026-09-23):** check every screen owned by P06–P10 (and any
earlier phase that still has a frontend gap) against the HiFi: layout, metric
standard, UI/UX, load speed; list what the backend still owes; plan the fix and
the wiring. Screens 08–11 and 13 (Thanhvuong, P17–P21) are **out of scope** and
are not wired in.

**Mode:** read-only. No product code changed. Round 1 is
[AUDIT_P01_P05](./AUDIT_P01_P05_CLAUDE_2026-09-23.md); its findings closed in
RF-01/RF-02. This round is the follow-up plan: **RF-03** (Codex, backend and
contracts) and **RF-04** (Claude, frontend and wiring), both in Unified §13.
Requests to Codex: [CODEX_REQUESTS_FROM_CLAUDE_P01_P10.md](./CODEX_REQUESTS_FROM_CLAUDE_P01_P10.md).

## 0. Scope and method

| Phase | Screen(s) in scope | Route on this branch |
|---|---|---|
| P02 · P08 · P10 | 02 New Run | `/research/quantbt/runs/new` |
| P05 · P06 (+P11 read) | 03 Run Progress | `/research/quantbt/runs/:id/progress` |
| P07 | 14 Alpha Import | `/research/quantbt/alpha-import` |
| P04 · P09 | 12 Engine Atlas, 00 Journey Map | `/research/quantbt/atlas`, `/journey` |
| P08 (foundation) | 05 Split — P08 facts only | `/research/quantbt/runs/:id/split` |
| P01 · P03 | none (harness/inventory) | — |

- Each HiFi `.dc.html` rendered in Chromium at 1440×900 and 660, every step and
  tab walked; each block measured with `getComputedStyle`.
- The live build on the isolated preview (`localhost:8095`, commit `361f68b4`,
  auto-login, real QuantBT 1.1.1 run `rrun_80d3c2f4…` COMPLETED), same
  measurements, plus network, performance entries and 60-s request logs.
- Backend: live `GET`s on every read the screens use; OpenAPI, zod, Python
  producer/worker and migrations read with file:line; packets and debt
  registers for P01–P10, RF-01, RF-02.
- **Not done:** no run created, no alpha registered (every mutating POST
  intercepted), except one preflight (`POST /preflights` creates no run).
  Screenshots and raw measurements are in the session scratch folder and are
  **not archived** here; every value quoted below was measured, not estimated.

## 1. Headline

1. **Three real bugs make screens look dead on the real API** (all frontend, all small):
   - **S03 never receives live updates.** The server sends only *named* SSE
     events (`research.progress.snapshot`, `research.progress`, heartbeat,
     gap); `useRunProgress.ts:228` listens on `onmessage` only. No error fires,
     so the 5-s poll floor never starts: a RUNNING run freezes at its first
     snapshot. The unit test calls `onmessage` directly, which hid it.
   - **S02 cannot create a run through the UI.** Four causes, reproduced:
     `"$defs": {}` in the payload → 400 (generated type makes it required; zod
     is `.strict()`); FE requires `strategy_id == entrypoint`, server requires
     `strategy_id == alpha_id`; all 8 declared params are always sent as
     overrides, the P10 adapter requires `[]`; an empty trials field is sent as
     `0`. Only with all four corrected does preflight answer `may_create_run: true`.
     The P10 "declare → preflight → create" receipt ran on the stub lane.
   - **S03 on a COMPLETED run says "the run failed before Stage 5"**, replacing
     the server's own sentence (`RunProgress.tsx:694`).
2. **The backend publishes almost nothing S03 and S02 draw.** The only real
   producer is P10's fixed Delta qualification (1 trial, 1 fold, child reports
   only at exit). No ETA, rate, per-fold facts, study ledger, claim, cursor or
   retained tables reach the browser, and `research.artifacts` has **no runtime
   writer at all**. Create admits only the fixed profile: 2 of 14 routes, no
   overrides, no sweep, no scratch, no DRAFT, no imported alpha.
3. **S00 shows a stale, different map.** The P09 descriptor still says New
   Run / Run Progress are `PLANNED` (shown SOON although they work) and has 14
   cards where the HiFi has 27; the schema cannot carry the HiFi map (revision
   `const 1`, `maxItems 8` per phase, no mapping table, no deep-link fragment).
4. **Every Research route loads ~457 KB gzip of JS**, 246 KB of it ECharts, on
   screens that draw no chart. Spec budgets: S00 < 30 KB, S03 < 70 KB, S02 < 90 KB.
   `QuantBTModule` imports every Research view statically and polls legacy
   `/api/runs` every 4 s forever, on every Research screen.
5. **The screens do not link to each other the way the HiFi does.** Almost
   every in-screen link of the HiFi between built screens is missing (§3).
6. **No Codex review is recorded** for Claude's RF-01/RF-02 backend commits
   (Atlas facts, preflight options, `config_digest`, cursor v2, route gate,
   worker fix, producer fix, preview auto-login). Filed as `CG-RF02-06`.

## 2. Per phase

Legend — owner: **FE** Claude frontend (RF-04) · **BE** Codex (RF-03) ·
**DQ** Bobby decides (§5). Effort S/M/L.

### P01 — inventory and route gate

No screen. Backend: Claude's route gate (`e5daa7e2`) and removal of the Python
public Atlas route (`a0d0004d`) have no Codex review → `CG-RF02-06`.
P01-GAP-06 (deployed flags/schema proof) stays with P23.

### P02 — requested spec, cursor codec

| # | Gap | Owner |
|---|---|---|
| P02-1 | `research-preflight.d.ts:348` makes `$defs` a required `RequestedSpec` property; the server's zod rejects it. Generated wire type must not carry JSON-Schema `$defs` | BE `CG-P02-01`; FE strips it meanwhile (`FE-S02-01`) |
| P02-2 | No requested-spec field for purge / embargo / label horizon, inner folds (`inner_split_frequency`, `inner_window_mode`, `inner_train_window`), rolling train width | BE `CG-P02-02` (with P04/P08) |
| P02-3 | No field for capital, fee, slippage, sizing target (HiFi review row "account · execution") | DQ-12, then BE `CG-P02-03` |
| P02-4 | Cursor codec `p02-cursor.v2` (Claude, `c7cc1ceb`/`dbe569e8`) unreviewed | BE `CG-RF02-06` |

### P03 — schema, refusal codes

No gap. F-06 (query keys) stays deferred with its trigger.

### P04 — engine catalog → S12 (and S02 route grid)

Frontend (S12), measured against HiFi 12:

| # | Gap | Owner | Effort |
|---|---|---|---|
| FE-S12-01 | Rule One text (hard-coded `EngineAtlas.tsx:650-653`) promises `mode_1_decay + per_fold_causal` is strict, while the manifest does not list that schedule, so its chip is struck through: the screen contradicts itself | FE copy now; BE `CG-P04-02` | S |
| FE-S12-02 | Mode cards: 2 columns, radius 10, no shadow; HiFi 3 columns (reads / objective / schedule→claim), radius 8, shadow. Modes tab 3,743 px vs HiFi 2,273 px (+65%) | FE | M |
| FE-S12-03 | Claim block 139 px vs HiFi 30 px; `claimTone` never paints the calibration claim red (spec §7 red) | FE | S |
| FE-S12-04 | Formula block: no 2 px teal left border, KaTeX 14.5 px vs 15.7 px | FE | S |
| FE-S12-05 | Header CTA "open search & selection →" missing; per-card link ignores the run's own mode and drops `schedule`; `SearchRoute` never reads cursor `mode`/`schedule` | FE | S |
| FE-S12-06 | "← this run" card highlight missing; Evidence Flow sends `#run=` without the run's mode/schedule | FE | S |
| FE-S12-07 | Rule Two copy changed meaning (drops `CandidateSelector.mode`); "Rules of this screen" only on one tab; routes/claims captions missing; claims never-claims colour `#226173` matches neither spec nor HiFi | FE | S |
| FE-S12-08 | Routes: `#route=` row not highlighted and not scrolled to on reload; tab bar has no arrow-key roving; invalid chips not focusable (tooltip unreachable by keyboard); ResearchPanel frame wraps every tab (HiFi: on the page) | FE | S |
| FE-S12-09 | RF-02 deviation list item 7 is inaccurate (says the header CTA appears with a run; the build has none) — correct the record | FE (docs) | S |

Backend:

| Id | Gap |
|---|---|
| `CG-P04-02` | `mode_1_decay × per_fold_causal` absent from `research-engine-catalog.v1.json:343` though QuantBT 1.1.1 supports it (`walkforward.py:532-545`, `wfo_contracts.py:174`). Publish it (admitted, or NOT_ADMITTED with the missing inner-fold fields as reason) — it decides Rule One, the default chip and S02's options |
| `CG-P04-03` | No reason per invalid schedule (`invalid_schedules[{schedule, reason, source}]`); engine messages exist at `walkforward.py:521-536` |
| `CG-P04-04` | `oos_use` is 2-state; spec 04 §4 / HiFi need selection input · withheld until S4 · retrospective · report only · n/a |
| `CG-P04-05` | `cert_cap` and `avoid_when` are typed *only* as NOT_PUBLISHED (FO:89/92, ZOD:137/168): a ruling that they stay unpublished for 1.1.1, or a contract that can carry a value |
| `CG-P04-06` | Routes: no description, method (wfo/tape), status word, resolved backend, arbitrage per-spec 6/9 matrix, `route_params` option lists (S02 four route forms) |
| `CG-P04-07` | Claims: certification qualifier ("L2 · causal") and source locators; objective term meanings and mode 2–5 weights |
| `CG-P04-08` | Engine sub-stage vocabulary (VALIDATING_DATA … BUILDING_ARTIFACTS) if DQ-04 picks the 11-pill stepper |
| `CG-RF02-06` | Review Claude's Atlas facts + locators (`d67a0fb4`), walk-forward options (`99d5b2a5`), `config_digest` (`996eef6c`) — RF02-B1 exit said "reviewer checks each locator" and none is recorded |

### P05 — artifacts → S03 artifacts / retained tables

| Id | Gap | Owner |
|---|---|---|
| `CG-P05-01` | Nothing at runtime registers a P05 row: the worker seals into the legacy `ContentAddressedArtifactStore` (`durable_worker.py:27,295,342`); `reserveArtifact`/`sealArtifact`/`createArtifact` (`repository.ts:2989/3131/3805`) have no caller; the RS-02 seal table is not what the progress read selects (`progress.repository.ts:363`). So `retained_artifacts` is `[]` on every real run. Widens `CG-RF02-03` | BE |
| — | `reader_href` pinned to `null` (P12/P13 reader owed) | BE later (P12/P13) |
| FE-S03-08 | Artifact size shown as raw bytes ("5787"), digest 16 hex (spec 8); state vocabulary vs HiFi READY/BUILDING (P05 forbids READY) | FE + DQ-02 |

### P06 — scheduler, worker, retry → S03

| Id | Gap | Owner |
|---|---|---|
| `CG-P06-01` | (open since P06, never on the board) no attempt/queue read: attempt ordinal, state, `started_at`/`ended_at`; `QueuePanel` mounted only in fixtures | BE, then FE-S03-10 |
| `CG-P06-02` | The child has no progress channel (`research_supervisor.py:213-235` Popen → wait → terminal receipt): no per-trial/fold/budget event can leave a running child | BE |
| `CG-P06-03` | Caps 45 CPU-s / 90 s wall (`research_supervisor.py:37,41`) are far below any real walk-forward (HiFi: 600 trials × 5 folds) | BE + DQ-11 |
| `CG-P06-04` | Bug: child `cpu_seconds` is a float, `_p11_usage` accepts only int → usage always 0 (`durable_worker.py:716-727`) | BE |
| `CG-P06-05` | Bug: a budget/wall kill is re-wrapped as "P10 … failed" and classified `CAPABILITY_MISMATCH` (`research_run_producer.py:280-281`, `durable_worker.py:626-640`); the budget error code is lost | BE |
| `CG-RF02-01` | (open) reviewed narrow seccomp/AppArmor profile for the namespace child; preview runs unconfined | BE |
| `CG-RF02-02` | (fixed by Claude `5b2cf660`, unreviewed) idle fetch timeout killed the consumer | BE review |

### P07 — alpha import → S14

Frontend, measured against HiFi 14 (S14-VIS-01 — three authority states, anatomy
as parse substage — is a recorded decision and not re-reported):

| # | Gap | Owner | Effort |
|---|---|---|---|
| FE-S14-01 | **0 links in the screen.** HiFi: Journey → 00, next: New Run → 02, new run with this av_ → 02 (with `?alpha=&av=` prefill, which NewRunRoute does not read), run library → 01, lineage → 10 (disabled, out of scope) | FE | S |
| FE-S14-02 | Header: no in-page crumb, no state chip (QUARANTINE / `DRAFT · av_…`), lede not verbatim | FE | S |
| FE-S14-03 | Mirror values printed as raw JSON (`["1h","4h"]`, `{"window":{…}}`); HiFi formats them | FE | S |
| FE-S14-04 | Gate rows: two-line 42 px rows, no status dot, 10.5 px state (HiFi 9/700), no header/meta | FE | S |
| FE-S14-05 | Register card: generic panel, full 64-hex digest, grey DRAFT (HiFi amber), no "where it goes next" card; after activation still prints `rev 1` (reads registration, not activation revision) | FE | S |
| FE-S14-06 | Registry strip lists every alpha in the workspace (no `alpha_id` filter, no name) | FE | S |
| FE-S14-07 | Parse / Run gates / Register stay enabled in flight and after success (double submit); 403 on activate shows a banner ~2,000 px above the button and leaves Activate enabled; non-admin gets no sentence why Activate is hidden | FE | S |
| FE-S14-08 | Code anatomy `h4` renders in Newsreader (global `h4` rule), HiFi Inter; "what the pipeline asserts" card missing; drop zone lacks size/digest/quarantine line | FE | S |
| FE-S14-09 | **Anatomy copy describes a file the live analyser rejects** (`class Alpha`, dataclass, `@njit`, `pkg.module:Class`), and states gates the server does not run (seeded twice, perf floor, smoke raising) — false on screen | FE copy + DQ-05 |
| FE-S14-10 | `activationAdmitted` reads only `registration.may_activate`: after reload a DRAFT cannot be activated from the registry | FE | S |
| FE-S14-11 | P07 board row still says "no product route is mounted"; `V11-P07-BR` real-backend receipt (parse → gates → register → activate) never recorded | FE (evidence) | S |

Backend:

| Id | Gap |
|---|---|
| `CG-P07-02` | Analyser accepts only a literal `ALPHA_CONTRACT` + one plain function, no imports/classes/decorators (`research_alpha_analyzer.py:36,219-228,270,301`); HiFi/spec describe a class/dataclass module. Decide the v1 file contract (DQ-05) |
| `CG-P07-03` | Mirror is 7 fields, `version` never mirrored; HiFi has 14 (strategy_id, display_name, default_timeframe, structural_contract, artifact.digest, data_requirements, supported endpoints, execution contracts, output contract…) and a per-field check (PASS/VERIFY/SMOKE/GATED) + note |
| `CG-P07-04` | Gates: no `RUNNING` state, per-gate `ms` measures only in-memory checks (analyser time unattributed), no `QUARANTINED_*` reason codes, parse receipt has no `expires_at` (server holds 10 min), no client-declared digest to verify |
| `CG-P07-05` | `RegistryEntry` lacks `supersedes`, display name, `strategy_id`, `warmup_bars`, `required_columns` (server has them, projection drops them), full digest; RegistrationResponse lacks capability registration per release and signature/SBOM (unowned) |
| `CG-P07-06` | `may_activate` is role-only (true on the P04 entry whose activate would 404); HiFi says "owner-only", server: register = any session, activate = ADMIN — confirm the rule |
| `CG-P10-02` | (see P10) an imported av_ can never run |

### P08 — data, effective spec, preflight → S02 (and S05 foundation)

| Id | Gap | Owner |
|---|---|---|
| `CG-P08-02` | Rolling window mode refused (`TOPOLOGY_UNSUPPORTED`) until a manifest-owned train width exists (with `CG-P02-02`) | BE |
| `CG-P08-03` | Preflight returns no per-gate list and no reason when `may_create_run=false`; 400 has no `field_path` (spec T35/§28). S02 cannot tell the user which step to fix | BE |
| `CG-P08-04` | No Research dataset catalog; `dataset_id` is free text; legacy `/api/datasets` uses `1D` vs `1d` | BE |
| `CG-P08-05` | Preflight does not check trial ceiling, `seed_required`, declared bounds, sweep ceiling (`research_preflight_snapshot.py:655-675`) — FE rules are unenforced | BE |
| `CG-P08-06` | S05 foundation facts: per-window gap scan (critical/watch, items), holdout seal record (digest, actor, read log — DR-01), holdout cap; advanced topology has `sealed_holdout: null` | BE (P08 → P14) |
| FE-S02-* | P08 preflight widgets (`PreflightPanel`: quality, UTC `[start,end)`, warmup, resource) exist but the product S02 does not use them | FE |

### P09 — journey, atlas foundation → S00

Frontend, measured against HiFi 00:

| # | Gap | Owner | Effort |
|---|---|---|---|
| FE-S00-01 | Map wrapped in a white ResearchPanel ("JOURNEY · revision 1") so white cards sit on white; HiFi rows sit on paper | FE | S |
| FE-S00-02 | Cards: no hover (HiFi: border darkens 120 ms), badge 17 px vs 14 px, weight 500 vs 600, no shadow, redesign bg `#faf9f5` vs `#fdfbf5`; rail line-height inherits 1.5 (rows 5–10 px taller) | FE | S |
| FE-S00-03 | Unreachable card: HiFi swaps the tag to SOON and keeps it focusable (`aria-disabled`); build adds a line and renders a `<span>` (not focusable); no `aria-label`, rail not `h2`, heading order skips | FE | S |
| FE-S00-04 | Developer panels on screen: "deep link inspection · INSPECTION_ONLY · NOT_APPLICABLE…" and a sha256 footer | FE | S |
| FE-S00-05 | 503 hides the whole map, no retry although `mayRetry=true` | FE (+DQ-03) | S |
| FE-S00-06 | Arrows hidden below 768 px while two cards still sit side by side at 660 | FE | S |

Backend:

| Id | Gap |
|---|---|
| `CG-P09-03` | Descriptor availability frozen at P09 (`journey.descriptor.ts:59,66,74,83,90,97`): New Run, Run Progress etc. `PLANNED` though mounted |
| `CG-P09-04` | Descriptor content ≠ HiFi 00 (14 vs 27 cards, different phase names); schema cannot carry it: `revision const 1`, `cards.maxItems 8` (HiFi P6 has 9), no mapping table, no `target_fragment` (e.g. `evidence#stage=claim`), no `requires_run` for per-run screens; registry immutable → new migration + revision bump (DQ-03) |
| `CG-P09-05` | Atlas contract fixes routes = 14, modes = 5, claims = 7 (FO:103, ZOD:257-261) while the manifest allows 32/8/16: spec 12 T06 ("a 15th route appears by itself") cannot pass |
| `CG-P09-06` | `?release_id=er_quantbt_108` returns kind HISTORICAL with a body byte-identical to 1.1.1 facts — reads as if 1.0.8 had those facts |
| `CG-P09-02` | (open) canonical fixtures for journey/atlas/preflight |

### P10 — new run end-to-end → S02 (and S14 → S02)

Frontend, measured against HiFi 02:

| # | Gap | Owner | Effort |
|---|---|---|---|
| FE-S02-01 | **Create is impossible from the UI** (the four causes in §1). Strip `$defs`; follow the server's `strategy_id = alpha_id` rule and pin it; send only edited params; trials default and ≥ 1 validation | FE | S |
| FE-S02-02 | Context: Alpha and Version are free-text inputs; HiFi selects from the registry (`version_label · lifecycle · digest`), passport 5 facts, per-state note; links runs of this av_ → 01, import new version → 14, full route atlas → 12 | FE | M |
| FE-S02-03 | Right rail: HiFi shows Window timeline + Claim forecast (claims from Atlas `modes[].facts.schedules[]`, cert ceiling "not published") on every step; build shows a review list | FE | M |
| FE-S02-04 | Advanced walk-forward: no fold preview (formula, ≈ N folds, mini-strip, > 20 / < 2 warnings); mode/schedule are `<select>`s that **hide** invalid schedules (spec §13-3 forbids hiding) | FE | M |
| FE-S02-05 | Route grid: no badge/description, 12 of 14 cards show red reason text, nested in a panel, no selected-route detail panel | FE (+`CG-P04-06`) | M |
| FE-S02-06 | Data step: timeframes hard-coded (`NewRun.tsx:470`) instead of `declaration.timeframes`; no requirements block | FE (+`CG-P07-05`) | S |
| FE-S02-07 | Parameters table: no header row, no STEP column (declaration has `step`), inputs 29 px vs 20 px | FE | S |
| FE-S02-08 | Optimization: ~40 LOCKED default rows always expanded; HiFi: collapsed accordion + "pinned by protocol" chips | FE | S |
| FE-S02-09 | Preflight result: three 64-hex digests + "folds 1"; HiFi: named gate rows then CREATE RUN; reuse `PreflightPanel` | FE (+`CG-P08-03`) | M |
| FE-S02-10 | Wizard bar 2 rows / 100 px (HiFi 1 row / 51 px, sub = state); step `h3` in Newsreader (HiFi Inter 12/600); field labels mono (HiFi Inter); primary buttons ghost (HiFi filled teal, uppercase mono); columns 764/320 (HiFi 1.6:1) | FE | S |
| FE-S02-11 | Fresh screen shows Data "!" and Walk-forward "!" before any input; `?step=` ignored; reload loses the draft (no sessionStorage, no discard); no `aria-current="step"`/`aria-invalid`/arrow roving | FE | S |
| FE-S02-12 | 403 origin refusal shown as TERMINAL; 400 generic | FE (+`CG-P08-03`) | S |

Backend:

| Id | Gap |
|---|---|
| `CG-P10-02` | **Create admits only the fixed Delta profile** (`run-admission.service.ts:109-128,165-176`): `signal_notional` + `three_window_decay`, no route params, no overrides/optimization config, trials = 1, no scratch, ACTIVE only, P04 binding only. So the HiFi's sweep, 13 routes, advanced WF, scratch, DRAFT-as-evidence and every imported av_ cannot run. P07 debt register says P10 owns the imported-source adapter; P10 says P12/P19 — **nobody holds it** (DQ-11) |
| `CG-P10-03` | Imported av_ gets `RESEARCH_RUN_PREFLIGHT_NOT_READY` "no longer available" (INNER JOIN on bindings fires before the lifecycle check) — wrong code and message |
| `CG-P10-04` | Producer publishes no progress facts: `fold_segment_observed` never emitted, `eta_s` never set, no rate, `budget_tick` never emitted, `tqdm_line`/`overall_pct` are literals, `run_completed` carries no claim or cursor, only 4 of the bundle files are journaled |
| `CG-P10-05` | Create does not check mode/schedule and the producer never reads them: a mode_5 request would run as the fixed qualification while the claim forecast describes mode_5 — confirm |
| `CG-P10-06` | A run cancelled before any source progress stays `PENDING_SOURCE_CALLBACK` forever; a QUEUED job with no progress row returns `progress: null` |
| `CG-RF02-04` | (fixed by Claude `12750366`, unreviewed) timeline starts at warmup |

### P11 dependency for S03 (read contract, not in P01–P10 but S03 needs it)

`CG-P11-03`: progress snapshot has no run identity (mode, schedule, alpha,
symbol, tf, route, wheel, config digest, display id); no per-fold pct / best J /
selected trial / params digest; no declared fold count; `claim.cursor` is a
nullable string; artifact has no `DENIED`, note or row count; GET lists no 403.
The P13 evidence read already carries most identity fields — the FE can join it
now (FE-S03-03).

### S03 frontend (P05/P06/P11 consumer), measured against HiFi 03

| # | Gap | Owner | Effort |
|---|---|---|---|
| FE-S03-01 | **SSE named events never handled** (§1) | FE | S |
| FE-S03-02 | Hidden tab closes the stream at once and it never reopens (effect deps unchanged; poll runs only in "poll" transport) — a live run freezes after any tab switch | FE | S |
| FE-S03-03 | No run meta strip; join the P13 evidence read for mode · schedule · alpha · symbol · tf · route · config digest | FE | S |
| FE-S03-04 | Claim copy bug on COMPLETED (§1) | FE | S |
| FE-S03-05 | No hand-off: HiFi "OPEN EVIDENCE FLOW →" button and done banner with S1–S5 links carrying `#fold&trial&params`; build prints `claim.cursor` as text | FE | S |
| FE-S03-06 | Console: no initial backfill (COMPLETED run says "no console observation" while `GET /console` has 9 lines); box shrinks to 32 px (spec fixed 260); no Stage log tab | FE | M |
| FE-S03-07 | Fold Gantt is time-scaled: the DONE fold fills ~5 % of its track and reads unfinished; no best J / trial / digest notes, no cursor chips | FE | M |
| FE-S03-09 | States: 404 renders seven "EMPTY" panels (spec: run-not-found page with a Runs link); QUEUED with null progress renders seven PARTIAL panels; CANCELLED shows "source has not reported yet" + seven PARTIAL panels; `terminal_materialization` / FINISHING (RS-01) unread | FE (+`CG-P10-06`) | M |
| FE-S03-10 | Attempts drawer (`QueuePanel`) not mounted | FE after `CG-P06-01` | M |
| FE-S03-11 | Raw codes on screen (`P12_OWNED_NO_P11_RETRY_ROUTE`, `PENDING_SOURCE_CALLBACK — …`); progress bar 10 px (HiFi 14), no thousands separator, elapsed as raw seconds; SSE dot never pulses (no CSS for `data-pulse`); `role="presentation"` on the bar (spec `progressbar`) | FE | S |
| FE-S03-12 | Stage stepper 5 cells vs HiFi 11 engine pills | DQ-04 | M |

## 3. Wiring between built screens

In-screen links the HiFi has, between screens that exist on this branch. All
missing today unless marked. Links to 08–11 and 13 stay **disabled with the
phase that delivers them** (Bobby: do not wire Thanhvuong's or unbuilt screens).

| From | To | HiFi link | FE item |
|---|---|---|---|
| 00 | every built screen | cards | `CG-P09-03/04` + FE-S00-* |
| 01 | 00 | journey map ↗ | FE-W-01 |
| 01 | 03 | RUNNING card opens Run Progress (build sends every card to 04) | FE-W-02 |
| 02 | 01 / 14 / 12 | runs of this av_ · import new version · full route atlas | FE-S02-02 |
| 03 | 01 / 04 | breadcrumb Runs · OPEN EVIDENCE FLOW with cursor | FE-S03-05 |
| 04 | 00 | journey map ↗ | FE-W-03 |
| 05 / 06 | 04 | hash carries `stage=split` / `stage=search` (build writes `stage=summary`) | FE-W-04 |
| 07 | 08, 10 | next: S4 · sibling attempt | disabled (P17/P19) |
| 12 | 02 / 04 / 06 | declare → · Evidence Flow · open search with `#mode&schedule` | FE-S12-05/06 |
| 14 | 00 / 02 / 01 | Journey · next: New Run (prefill `?alpha=&av=`) · run library | FE-S14-01 |
| header | — | "Runs (1)" counts the legacy store; S01 lists 6 | FE-W-05 |

## 4. Shared frontend work (all screens)

| # | Item | Measured now | Target |
|---|---|---|---|
| FE-X-01 | Lazy-load each Research route inside `QuantBTModule` (today all statically imported) | 92 KB gzip module on every route | per-route chunks |
| FE-X-02 | Keep ECharts out of non-chart routes (`theme-*.js` 246 KB gzip loads on 00/02/03/12/14) | 457 KB gzip JS per route | S00 < 30 KB, S03 < 70 KB, S02 < 90 KB route JS (spec budgets) |
| FE-X-03 | Stop legacy `/api/runs` (4-s poll, never stops) and `/api/strategies` on Research routes | 15 req/min idle | 0 |
| FE-X-04 | Start the KaTeX chunk on Atlas mount, not after data (typeset 530–690 ms cold, 5.6 s on slow 3G-class) | — | parallel with the Atlas read |
| FE-X-05 | Fonts: Newsreader 300 and JetBrains Mono 700 are not shipped, so titles render at 500 and badges fake-bold; global `h3/h4` rule leaks Newsreader into cards that are Inter in the HiFi | — | match the HiFi faces, latin subset only |
| FE-X-06 | Module header "QuantBT Backtest REAL" + 5 buttons sits above every Research screen; HiFi screens start with an in-page breadcrumb (00 has no shell at all) | title at y≈167–188 vs HiFi y≈90 | per DQ-01 |
| FE-X-07 | ResearchPanel frames wrap content the HiFi puts on the page (00, 12, 02 routes) | — | per screen |
| FE-X-08 | S04 metric values printed at full engine precision (`19965.998848845535`) | — | per DQ-08 |
| FE-X-09 | Receipts: one real-API browser receipt per screen after each wave (1440/1280/660), axe, console/network, screenshots read by eye | — | `REAL_API_E2E_RECEIPT` per screen |

## 5. Decisions for Bobby

**Approved by Bobby 2026-09-23 ("Duyệt DQ và bắt đầu Wave A ngay"): DQ-01…DQ-12
as recommended in the right-hand column.** Codex works RF-03 in parallel.

| # | Question | Claude recommends |
|---|---|---|
| DQ-01 | Research Loop screens: keep the QuantBT module header, or drop it and use the HiFi's in-page breadcrumb (00 fully shell-free per spec §1)? | Keep the Portal sidebar/topbar; **drop the module header on Research Loop screens**, add the HiFi breadcrumb; 00 keeps the shell (navigation) but no module header |
| DQ-02 | HiFi and spec disagree on copy/visual in places (titles, subtitles, poll floor 8 s vs 5 s, passport colour, SUSPECT style, artifact vocabulary) | **HiFi wins on look and copy; spec wins on behaviour and data rules**; each conflict listed in the RF-04 receipt |
| DQ-03 | Journey map: Codex publishes descriptor v2 with the HiFi's 27 cards, or the frontend draws the HiFi map statically? | Descriptor v2 (availability stays server truth); map renders from a build-time snapshot while the read fails |
| DQ-04 | S03 stepper: 5 contract stages or the HiFi's 11 engine states? | 5 now; 11 only if P04/P11 publish engine sub-stages (`CG-P04-08`) |
| DQ-05 | S14 alpha file contract: server v1 (literal `ALPHA_CONTRACT` + one function) or the HiFi's class/dataclass module? | Screen tells the truth of v1 now (anatomy copy rewritten to the server's contract); widening is a Codex design item |
| DQ-06 | S14 visual stepper for the three recorded authority states? | Yes, three steps (S14-VIS-01 kept) |
| DQ-07 | `strategy_id`: server requires `= alpha_id`, HiFi says "pinned by the av_" | Follow the server; Codex publishes `strategy_id` on the registry entry |
| DQ-08 | Metric display precision on S04 | Round by unit (currency 2 dp, fraction as % 2 dp, counts integer); full value on hover and copy |
| DQ-09 | Release id `er_quantbt_111` (server) vs `er_quantbt_1_1_1` (HiFi/spec) | Show the server id; docs follow |
| DQ-10 | `mode_1 × per_fold_causal` | Codex publishes it NOT_ADMITTED with reason (inner-fold fields missing); Rule One demo uses a pair that is valid today |
| DQ-11 | **Widen the P10 adapter now** (routes, overrides, sweep, advanced WF, DRAFT/imported av_, real caps) or keep the fixed profile until P12/P19? Without it S02/S03/S14 can only ever show the fixed qualification | Pull a scoped part forward into RF-03: imported/DRAFT av_ on the fixed route, overrides + trials > 1 on `signal_notional`, caps sized for one real walk-forward. The other 12 routes stay NOT_ADMITTED with reasons |
| DQ-12 | Execution assumptions row (capital, fee, slippage, target) has no field anywhere | Leave out of S02 until a requested-spec field exists; recorded as HiFi deviation |

## 6. Order of work

**Wave A status (Claude, 2026-09-23):** done — FE-S03-01, FE-S03-02, FE-S03-04,
FE-S02-01, FE-X-01, FE-X-02, FE-X-03, FE-X-04, FE-S14-07, FE-S12-01, FE-S12-09.
Moved to wave B: FE-S14-10 (activating a DRAFT from the registry after a reload
needs an Activate control on the registry row, which is a layout change).

1. **Now, no dependency (RF-04 wave A):** FE-S03-01/02/04, FE-S02-01, FE-X-01…04,
   FE-S14-07/10, FE-S12-01 (copy), FE-S12-09 — real bugs, speed, false copy.
2. **Codex RF-03** reads this file and the request list, fixes and declares
   contracts (P02, P04, P05, P06, P07, P08, P09, P10, P11 dependency), reviews
   Claude's RF backend commits.
3. **RF-04 wave B, after Bobby's DQ answers:** layout/UX to HiFi for 00, 02, 03,
   12, 14 (items FE-S00/S02/S03/S12/S14 without a BE dependency), wiring §3,
   fonts, shell.
4. **RF-04 wave C, after each RF-03 contract lands:** consume it (regenerate,
   render), remove the "not published" it answers, real-API receipt per screen.
