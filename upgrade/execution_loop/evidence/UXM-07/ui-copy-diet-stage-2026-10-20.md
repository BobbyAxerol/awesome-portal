# UI copy diet, stage screens (Workbench, Sandbox, Canary, Live, New request), 2026-10-20

Lane: FIXTURE_LAB / BFF_DOUBLE (V2 e2e harness build on a private port, a temporary config and spec, deleted afterwards). Bobby's direction: far less text; no guide text; keep what decides or acts. Tier R1 (focused vitest + tsc); R2 (full hook, visual baselines) not run.

Screenshots (full page, before and after, 1440 and 390): `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/diet/before/` and `.../diet/after/` (`<screen>-wide.png|txt`, `<screen>-narrow.png|txt`; the .txt files are the rendered text). No horizontal page overflow in any of the 30 shots.

Visible words (innerText of the screen root) and visible request ids:

| Screen, 1440 | words before | words after | `FE-xxx` printed before | after |
|---|---|---|---|---|
| Workbench | 408 | 330 | 13 | 0 |
| Canary | 511 | 236 | 30 | 0 |
| Sandbox | 390 | 207 | 17 | 0 |
| Live | 364 | 206 | 12 | 0 |
| New request | 214 | 106 | 0 | 0 |

## The mechanism (shared blocks)

- `CompactGaps` (blocks/notPublished.tsx): below it a `NotPublished` prints the plain words `Not available`; `Not published (FE-xxx): what · request label · reason code` is its `title`. Only the four stage screens mount it, so every other screen still prints `Not published (FE-xxx)`.
- `GapLine` (same file): ONE line `Not available: A, B, C` for the unpublished facts of a panel; each fact's request id and the server's reason are in the line's `title`.
- `StageChipRow`: the chips that say nothing (not published, or no reason) are ONE chip `Not available  Runtime, Reconciliation`; a chip with a state or its own reason keeps its place. `StageHeader` gets an `actions` slot (Refresh sits in the frame, not on a row of its own).
- `DecisionGroup` (screens/stage): actions that are all off for the same reason share one reason line and one My access link; a server-given reason for one action (FE-068) falls back to one `DockAction` each.
- `figuresUnpublished` (screens/stage/triadRows.ts): a Triad whose cells are all the server's NOT_PUBLISHED is one `Not available` line (all distinct reason codes in the title).

## Removed or shortened (before -> after)

| Where | Before | After |
|---|---|---|
| All 4 | `Not published (FE-067)` x2 and `Not published (FE-066) Alpha name` in header | one chip `Not available  Runtime, Reconciliation`; `Alpha Not available` (ids in titles) |
| All 4 | `Source flag: active` printed beside Runtime | in the chip title |
| Workbench | `Tracking approved evidence? Ready to leave Paper?`; `Simulated` in sub; `← Alpha` crumb and `Alpha` link (3 links to one place) | removed; strategy crumb is the link |
| Workbench | `Stage history, gate criteria and decider: Not published (FE-027/028)` | title of the spine |
| Workbench | Drift / Fills reconcile / Cost drift rows, each `Not published (FE-0xx)` | one line `Not available: Drift vs approved band, Fills reconcile, Cost drift` |
| Workbench | `Approved band: Not published (FE-029)`, `Window: ...(FE-025)`, `... snapshots published`, a hatched drawdown box | one line `Not available: Drawdown, Approved band, Window` |
| Workbench | `Set by the server`, `SOURCE_RETENTION_SHORT`, `Counted separately`, `Latency Not available · N28_...` tile | titles; latency is `Not available: Latency` |
| Workbench | sticky bar `Deployment state` + Runtime/Reconciliation repeated | name, freshness, and only chips that carry a state |
| Workbench | exit-review reason `Not published (FE-028). Exit review requests are not offered from this screen yet.` | `Not offered from this screen yet.` (id in title) |
| Workbench | `The profile is partial: some branches or rows may be missing.` / `The source has not updated this deployment within its freshness budget.` / `Source not qualified. Figures below are not available.` + codes | `Some branches or rows may be missing.` / `No update within the freshness budget.` / `Source not qualified.` (codes in title) |
| Workbench | 5-row VN calendar of `Not published`; Sessions/By-side `Not published (FE-0xx)` captions | one `Not available: ...` line each |
| Sandbox | subtitle `Deployment dep_x · OKX · account · portfolio · Not published (FE-066) Alpha name` | `OKX · account okx_testnet_main · Alpha Not available` |
| Sandbox | 15 `Not published (FE-072)` Triad cells, `The figure for each row is...`, `The Difference is the server's...` | one line; Sources list and the Difference note inside a collapsed `Sources` |
| Sandbox | 5 tiles of `Not published (FE-0xx)` (V2 body) | one line; tiles only for published facts; `2 recorded, open or resolved` -> `2 recorded`; `None open`, `Server count`, `Exit review ·` captions dropped |
| Sandbox | per-step `Not published` + `The stored evaluation of each step is shown. Its explanation is...` | one line `Not available: Step explanations` |
| Sandbox | plan table with `Envelope` and `Author` columns of `Not published`, `A plan records a refusal...`, `Envelope and Author are Typed plan fields...` | columns not drawn, one line; refusal sentence in a title |
| Sandbox | banners (3 sentences each) | `Source panels did not report.` / `Stored certification and step evaluations only.` / `Data as of ...` |
| Sandbox | `A note records a review. It does not pass a step.`, placeholder repeating the 8-character rule, `Server reason: CODE`, `Blocked until every step passes and no critical finding is recorded` | title; placeholder removed; code in title; `Blocked until every step passes` |
| Canary | 15 `Not published (FE-071)` in the envelope table | Limit / Consumed / Used columns not drawn: `Not available: Limit, Consumed, Used`; `Envelope verdict`, `Used is the server's ratio`, `Used ratio and verdict` captions removed |
| Canary | 5 KPI tiles `Not available · source unavailable` | one line (reasons in title) |
| Canary | `Trial day not stated · duration 14 days  Started Not published...  Exit review opens Not published...` | `Duration 14 days  Not available: Trial day, Started, Exit review opens` |
| Canary | 4 rollback rows `Checked Not published (FE-071)` + `Not published (FE-071) Status` | one line; `Not available` flag in the head removed when nothing is said |
| Canary | 4 decisions each with a hint, a reason and My access; `How promotion works` | one row of buttons, one reason, one My access; hints are button titles |
| Canary | series `Not published (FE-029) Live, Paper and Backtest series Source unavailable.`; `Methodology ...` caption | `Not available: Live, Paper and Backtest series · Source unavailable`; methodology in title |
| Canary | position/order `Leverage` and `Ack latency` cells `Not published` per row; `Columns are the source's own field names.` | columns not drawn, one line; sentence in title |
| Canary | Reconciliation: 15 cells + `Not published (FE-072)` + `This is the findings relation, not a reconciliation run.` + source list | one line; sentence in title; `Sources` collapsed; panel asides `Internal, Broker, Difference` and `Scale-up only` removed |
| Canary | banners and blocker sentences (`..., so no decision can be sent.`, `..., which blocks scale-up.`) | one short sentence each |
| Live | KPI tiles of `Not published (FE-072)` | one line; tiles only for published or deliberately hidden figures |
| Live | 3 protective rungs each with the same reason and My access | one reason, one My access (rung headers and notes kept) |
| Live | Triad 15 cells, `Reconciliation figures: Not published (FE-072)`, `The Difference is the server's...` | one line |
| Live | `Position rows` / `Open order rows` / series / V2 panels `Not published (FE-0xx)` + `Not published` flags | `Not available: ...` lines; unpublished V2 panels are one line on Exposure and rows of the coverage table on Continuity |
| Live | `Operators, managers and reviewers`, `A gap blocks these first...`, `Retained observations`, `Predecessor` asides, banners | removed or shortened (`Source not qualified.`, `Stale. Data as of ...`, `Retained observations only.`) |
| New request | `Research → R1 gate · when it did not start in Research`; 3 step sentences; `What happens next` aside (3 lines) | title of the h1; `1 · Declare`, `2 · R1`, `3 · R2` (sentence in each title); one collapsed disclosure under the form (one column) |
| New request | notes under Alpha, Evidence run, claim; `8 to 2,000 characters. It is the reviewer's first sentence.`; `An id the server does not know is refused...`; `Nothing is sent until you click Submit.`; `Everything needed is filled.`; `Fill the missing fields first.` under the button; `Submit still asks the server.` | shortened to what the reader must do; limits in the counter's title; the shut Submit is described by the one `Still needed` sentence; Ready flag only |
| New request | `(0 so far)` in `Still needed`; outcome `The requester can never approve...`; `Asking the Portal whether ... This only reads...`; uncertain/could-not-send paragraphs | dropped or `Checking...` / `Nothing was created.` (long form in title) |

## Kept on purpose (honesty rules)

Exact values and units; PARTIAL / STALE / denied / unavailable chips; the fixture banner (global); one short reason beside every disabled control (accessible name and `aria-describedby` unchanged in kind); `Not available` is the only absent-value phrase (never 0, a dash or N/A); `Hidden while the figures disagree` stays its own claim; the Paper stage's `Unreadable value` stays visible (a defect, not an absence).

## Tests

Assertions on the removed copy were rewritten to assert the compact text AND that the detail exists in the title (`Not published (FE-0xx): ...`, reason codes, sentences), and that the old text is not printed. New block tests: `CompactGaps`, `GapLine`. Focused run (workbench, canary, sandbox, live, request, stage, blocks, v2Hygiene, absentValues, disabledReason, failClosed, castLeak, testHygiene, linkTargets): 3939 passed, 1 failed (a class-name collision with V1, fixed in the last commit). `src/execution` whole: 69029 passed; `realtimeProducerConsumer.test.tsx` (NestJS producer: `common_1.Optional is not a function`) fails and touches nothing here; `canary.facts` has one timing flake under a loaded run (`findByRole` default 1 s; passes alone and on a re-run).

NOT_RUN: Docker, full hook, visual-suite baselines (R2), flag-off shell digest build, Playwright V2 lane specs of the repo (a private-port temporary spec was used for screenshots).
