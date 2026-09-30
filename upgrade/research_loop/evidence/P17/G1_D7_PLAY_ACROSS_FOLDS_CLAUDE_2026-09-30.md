# G1 · D7 — Screen 08 "play across folds" (Claude, 2026-09-30)

**Branch:** `feat/g1-d7-play-across-folds` (worktree `.claude/worktrees/agent-afd8dfc9e6b74d586`).
**Base:** `d3d99f26` (`origin/docs/research-loop-plan`). **Not pushed. Not committed** — left in the
worktree on the owner's directive (one batched commit and one hook run for all agents); the numstat is
`git diff --numstat` with the two new source files and the new test intent-to-add.
**Closes:** Unified §13.4.1 row **G1** (decision **D7**) and HiFi audit row **8.10**, at code + test level.
**Not closed:** the formal real-API lane cell and the visual baseline — see §9.

Sources read before building: Unified plan §13.4.1 rows D7 and G1 (`rl-open-ledger`), HiFi audit row
8.10 (`HIFI_AUDIT_S00_S14_CLAUDE_2026-09-26.md`), and the HiFi `QuantBT 08 S4 Execute Replay.dc.html`
(markup lines 137–147, `pill()` 525, `togglePlay`/`crossBoundary` 495–511), which I also **rendered** and
measured (§3). The plan and the audit row are **not edited** (instruction); whoever owns them should
mark G1 built at the commit that carries this file and 8.10 as decided-and-built.

---

## 1. The short version

Playing used to stop at the end of the loaded window, by design: windows are read only when the reader
asks. D7 lets the reader ask **once, in advance, for one thing**: *when playback reaches the last bar of
this window, read the next window and keep playing.*

| Rule from the decision | How it holds | Test |
|---|---|---|
| A switch, **off by default** | `useState(false)` in the hook; no hash key, deep link or earlier state can turn it on | "no link turns it on", "OFF" cells |
| The label says it issues reads | `play across folds · reads the next window at each boundary` is the switch's accessible **name**; ` · ON` / ` · off` is an aria-hidden suffix and `aria-checked` carries the state | "renders as a labelled switch…" |
| **No request while OFF, paused or stopped** | the only thing that can start a read is the playback loop running dry by itself (`ReplayTransport.subscribeEnd`); a step, seek, pause, hidden tab and a window load are not that | "OFF: plays the whole window … zero requests", "pausing mid-window…" |
| **One window read in flight, ever** | the read is recorded (`pending`) before it is sent; a second natural end with a read pending sends nothing; the stub's peak concurrency is asserted `1` | "a second natural end while the boundary read is still on its way…", 32-fold cell |
| **Never past the last fold** | the boundary is decided from the run's own published fold windows (`fold_capital.segments`), not from the source table; the last bar of the last segment is `end` | "canonical two-fold…", "four folds… none for a fifth", 32-fold cell |
| **Turning it OFF stops further reads at any moment** | the switch is mirrored in a ref read by the loop, so it takes effect before React renders it; a read already in flight finishes but does not resume playback | three "turning it off…" cells |
| **Reveal is unaffected** | reveal is not an input to the hook; the same window reads are sent with reveal on and off; the notice carries no outcome | "causal reveal is unaffected" |
| **A refusal or an unusable window stops playback and says why**, in the screen's words | `data-across-status="refused|unplayable|…"`, text from `REPLAY_REFUSAL_COPY` (the server's own message is never shown) | "a refusal or an unusable window…" cells |
| Retained WFO lane only; **nothing on the P04 hub lane** | the control lives in `CandleReplayBody`, which only the retained bar-ledger lane renders | "the control is the retained WFO lane's only" |

## 2. Decisions inside the brief that you should know about

1. **A fold's last bar reads the next fold by its own start cursor, not by `next window ›`'s cursor.**
   Both go through the one window-read path (`useReplay.setRetainedIntent` → `replayApi.currentSource`).
   *Inside* a fold (a fold longer than one window) the boundary calls the very handler behind
   `next window ›` (`retainedNextWindow`). *At* a fold's end it calls `retainedFold(next segment)` — the
   handler behind `next fold ▶|` — because `next window ›` keeps the **previous** fold's window length:
   with folds of different lengths a `cursor=` continuation would straddle two folds, and the new window
   would not start at the next fold's first bar. On the preview's run (2 folds × 168 bars) the two reads
   are the same size; the difference only shows on uneven folds.
2. **A boundary sends exactly one request — the window read.** The screen's existing per-fold child-audit
   read (P17-T14), which fires on any fold window's arrival, would have made it two. While a play-across
   chain runs (from its first boundary read until playback rests) that read is **deferred**, and the card
   says so instead of "reading…". It is sent once, when playback rests (a pause, the last fold, a stop),
   exactly as a manual fold switch sends it. It is the screen's own arrival read, not a window read, and it
   **does** happen after the switch is turned off if a chain was running — at rest, never while playing.
3. **An expired position costs the existing bounded recovery.** The hook's single 409 recovery re-reads
   the first window; D7 sees `recovered`, stops, and says so rather than play the first window as if it
   were the next fold. That boundary is therefore **two** reads, not one — the existing behaviour, tested.
4. **A window is checked before it is played.** It must start where it was asked to (the next fold's
   `first_ordinal`, or right after the last bar read), hold at least two bars, and not be a recovery.
   Otherwise playback stops and names the reason.
5. **The switch is disabled, with its reason, on a run with a single fold window** (nothing to cross).
6. **A stop retires itself.** A refusal/end/took-over note is retired by the reader playing, pausing or
   seeking, and by any window the reader asks for; a crossing note ("Entered fold_02 …") is history and stays
   until the next window. The screen never keeps saying "stopped" about a window it has left.
7. **The HiFi's boundary line is not copied.** It reads "params A → B · position FLAT at the boundary …
   never carries exposure across". This run's fold capital is `carry_position` /
   `CONTINUOUS_ACROSS_FOLDS` and the lane publishes no per-fold params, so the line would be false. The
   notice prints what the server published: the capital policy, its continuity, and the boundary event's
   `gap_bars` (a published `0` is printed as "0 bars", not hidden).
8. **HiFi defaults the switch ON (`playAcross: true`); the decision is OFF.** Decision wins.

## 3. Measured, not eyeballed — the HiFi control and ours

HiFi markup: `<button style="pill(active) + border-radius:3px; flex:none">` in the transport row
`display:flex; align-items:center; gap:10px; padding:8px 14px; flex-wrap:wrap`, **after the speeds span,
before the seek range**. Rendered in Chromium (`file://`, scratch `hifi-measure.mjs`) and compared with
our computed styles on the preview's WFO run:

| Property | HiFi (rendered) | Ours (computed) | |
|---|---|---|---|
| padding | `3px 10px` | `3px 10px` | same |
| font | JetBrains Mono `10.5px` | JetBrains Mono `10.5px` | same |
| border radius / border | `3px` / `1px` | `3px` / `1px` | same |
| off colours | border `#e3e0d7`, bg `#fff`, ink `#4e5a6e` | border `rgb(227,224,215)` (`--line`), `--paper-raised`, `--ink-soft` | same tokens |
| on colours | border/ink `#0f4c5c`, bg `#e2edf0` | `--accent` border/ink, `--paper-sunken` (the speed pills' own active state on this screen) | same role |
| position | between speeds and seek bar | between the `speed` group and the seek input (asserted) | same |
| height | 22 px | **26 px** — line-height 18px, so it matches every other control in this screen's transport row (26 px, `leading-[24px]` + border) | deliberate: follows the S08 frame, and keeps a 24 px+ target |
| width | 154 px (`play across folds · ON`) | **406 px** | **deliberate**: the label discloses the reads |

Consequence of the honest label: at 1440 the seek bar still shares the pill's line, but the readout
(`bar 1/168 · source bar 721 · …`, `nowrap`) drops to its own line under the row; at 660 the pill takes its
own line under the speeds. Overflow is 0 at both widths (§6). Recorded, not "fixed": shortening the label
would drop the disclosure the brief requires.

## 4. HiFi block → component → state → test

| HiFi block (`08 S4 Execute Replay.dc.html`) | Component / code | States | Test (`executePlayAcrossFolds.test.tsx`) |
|---|---|---|---|
| Pill in the transport row, after the speeds (L144) | `AcrossSwitch` passed to `Transport` as `acrossControl` (`ExecuteCandleReplay.tsx`) | off · on · disabled (one fold) | "renders as a labelled switch, off…" (order, geometry, name, description); "a run with one fold window…" |
| Label `play across folds · ON/off` (L811) | `ACROSS_LABEL` + aria-hidden ` · ON|off` | off · on | same; `role="switch"`, `aria-checked` |
| Pill style `pill(active)` (L525) | inline style on the button (padding/font/radius exact; tokens for colour) | off · on | geometry asserted; §3 |
| Tooltip "when this fold's tape ends…" (L144) | `ACROSS_HELP` as `title` **and** `aria-describedby` | — | "renders as a labelled switch…" (rewritten: no "frozen params" claim; says reads, one at a time, stops at a refusal) |
| `playAcross: true` initial state (L297) | **OFF** by decision D7 | off | "toggling is local", "no link turns it on", "OFF: …" |
| `togglePlay` → at the end, `if (playAcross && fold < folds) crossBoundary()` else stop (L497–503) | `usePlayAcrossFolds` + `decideBoundary` (`fold` / `window` / `last-fold`) | reading · crossed · end | "canonical two-fold", "four folds", "a window that ends inside a fold…", 32-fold cell; pure `decideBoundary` cells |
| `crossBoundary` resets `index: 0` and continues (L509) | arrival effect: `transport.load` (existing) then `transport.play()` | crossed (playing) | same cells (`data-playing`, index 0) |
| Boundary handoff line for 4 s (L509) | `AcrossNotice` (`role="status"`, `data-across-status`) | reading · crossed | asserts "Entered fold_02 · capital carry_position, continuous across folds · 0 bars between the two test windows · 1 window read by play across folds" |
| *(no HiFi state)* read stopped by the server | `AcrossNotice`, warn tone | refused · sequence gap · expired position · unplayable (<2 bars, wrong start) · no next window · not in a fold · busy | "a refusal or an unusable window…" (7 cells; one pins that the boundary's refusal is said once and the reader's own refused ‹next window› is still said) |
| *(no HiFi state)* reader intervenes | `usePlayAcrossFolds` | off (mid-read) · took over · hidden | "no request while paused or stopped, and none after turning it off" (6 cells) |
| *(no HiFi state)* the fold's child audit | `ChildAuditCard waiting` | waiting → loaded | "the only request a boundary sends is the window read…", "a pause ends the chain…" |
| Causal reveal (existing) | unchanged; not an input | on / off | "causal reveal is unaffected" |
| P04 hub lane / W3b seal | not rendered there | — | "the control is the retained WFO lane's only" (2 cells) |

## 5. Tests — exact counts

New file `apps/portal/frontend/src/research/executePlayAcrossFolds.test.tsx`: **36 tests**, all from the
published canonical fixtures in `packages/contracts/fixtures` (`research-current-source.replay.fold0`,
`…replay-transitions`, `…replay-child-audit.fold0`, `…replay.legacy-seal`, `research-replay.p04-real.first-window`).
The canonical fold-0 window is the only replay window the package publishes, so another fold's window is
that **same real window moved onto the fold's own published span** (`alignedFoldWindow`, added to the S08
fixture helper `w5bFoldScale.fixture.ts` beside the existing `scaleToFolds`); its shape (last fold:
`has_more:false, next_cursor:null`) was checked against the preview's own WFO run. No response is
hand-typed. Playback is driven by a manual scheduler (deterministic); one cell runs the product route on
the real `requestAnimationFrame` at 64×.

| Group | Cells |
|---|---|
| fixtures are the real two-fold run · pure `decideBoundary` · transport end event / user actions | 1 + 3 + 2 |
| the switch (label/role/geometry, local toggle, no-link, single fold) | 4 |
| OFF (whole window, then on-and-off) | 2 |
| ON: canonical two-fold, audit deferral, pause ends chain, four folds, in-fold window | 5 |
| no request paused/stopped/off (pause, off mid-window, off after crossing, off mid-read, off→on mid-read, took over) | 6 |
| one in flight (double end, 32 folds = 31 reads) | 2 |
| refusal / unusable (503 and its once-only wording, sequence gap, expired position, <2 bars, wrong start, no continuation) | 7 |
| reveal · other lanes (P04 hub, legacy seal) · product route real clock | 1 + 2 + 1 |

Runs at the final tree: `executePlayAcrossFolds` **36/36**; the two existing S08 files
(`executeCandleReplay`, `executeReplay`) **73/73**, unchanged — **109/109** in the three files;
`src/research` **46 files · 1466 tests · 0 failures**; `tsc --noEmit -p tsconfig.json` **exit 0**
(the Planning feature's `node_modules` symlinked into the worktree, as the sibling worktrees do).
Whole frontend suite (parallel, machine shared with other agents), run before the last two cells were
added (the expired-position and the once-only-refusal cell): **198 files · 197 pass · 3880 tests pass, 3
skipped, 1 fails** — the token gate, see §9.7. After them only `src/research` and the three S08 files were
re-run (the owner asked for touched files + tsc only). A first
whole-suite run also timed out on 6 tests in `PortalShell`, `adminCli` and `analytics360` under load; those
three files pass alone (60/60).
Mutation checks (each reverted): removing the "enabled" guard fails both OFF cells; removing the
child-audit hold fails "the only request a boundary sends…"; removing both one-in-flight guards fails "a
second natural end…" (`expected 3, got 4`).

## 6. Request-count evidence — the real preview API

Scratch driver `scratchpad/g1-d7/drive.mjs` (not committed): Vite on **:5231** serving this worktree,
proxying `/api` to the read-only preview `:8095`; login by the sanctioned flow; **no write to the
preview** (the only POST is the login). WFO run `rrun_17f762128acf8c998ac7cc44d13f663f`
(COMPLETED/READY; 2 folds × 168 bars, fold 1 = bars 721–888, fold 2 = 889–1056). Identical at 1440 and 660.

| Step | Requests sent (window reads = `GET …/current-source/replay`) |
|---|---|
| arrival | plain first read, then fold 1's `at=` read (168 bars), transitions, evidence, split, progress, requested-spec, **child-audit fold 0** |
| OFF, played fold 1 to its last bar (64×) | **0** |
| toggle ON | **0** |
| ON, played to the boundary (16×) | **1** window read (`at=<fold 2 start cursor>&limit=168`); **0** anything else while playing fold 2; hash `fold=2` follows |
| …while playing fold 2 | audit card reads "fold 1's child audit is read when playback rests — play across folds reads only windows." |
| …fold 2 reaches its last bar | status "Reached the last bar of fold_02, the last fold of this run. Nothing is read past it." — **0** window reads; then **1** child-audit read (`fold=1`) as playback rests |
| ON, cross, turn OFF while playing fold 2 | window reads after OFF: **0**; the one deferred audit read at rest |
| ON, play, pause mid-window | **0** |
| keyboard: Tab from *next fold* → `1×`, `4×`, `16×`, `64×`, **the switch**; Space → on; Enter → off | **0** requests |
| ON, play, boundary read **refused** (503 injected client-side by `page.route`; preview untouched) | boundary read **1**, no retry after 1.5 s; playback stopped on the last bar of fold_01; one sentence: "Play across folds stopped at the end of fold_01: the read of fold_02 was refused. Replay is unavailable right now. Nothing on this screen was changed. Playback stays on the last bar of the window on screen. Play again to retry, or turn the switch off." (`data-page-refusal` paragraph count 0 — said once) |

This run has **one** boundary. Multi-boundary counts (3 boundaries on 4 folds; 31 on 32 folds; none past
the last; peak concurrency 1) are the fixture-derived cells in §5, not the preview.

Console: no `pageerror`, no console error from the app. The only failed requests were `net::ERR_ABORTED`
on `portal/registry`, `portal/summary` and `execute/replay?limit=100` at arrival — the dev server's React
StrictMode double mount running each effect's cleanup (`useReplay` aborts its controller there). None is a
boundary read; the window reads themselves were each sent once.

## 7. Screenshots (SHA-256, first 16 hex; **not committed**)

In `scratchpad/g1-d7/shots/` — looked at, not just taken. `full` = whole page, `section` = the replay card.

| State | 1440 full / section | 660 full / section |
|---|---|---|
| 1 · off | `d13940f674040843` / `db1d6b267a52119d` | `9b775c5c1707357a` / `07ba4123519fbc4e` |
| 2 · on, before playing | `9ca6443b2b84aa90` / `c87cab9535c0f54d` | `0652407972b74bed` / `39d30b36777fb7e6` |
| 3 · playing fold 2 after the boundary | `d810b7f65dfb528a` / `44c901b13939a78e` | `679b3538e3611e58` / `25eb6129c13075ee` |
| 4 · last fold reached | `77982d773bbb6e0c` / `fe67b06b8eda3561` | `7b03657bb83269d6` / `415e71061aabdd36` |
| 5 · switch focused (keyboard) | `2bde26a5ea7b3c1e` / `522dded57cd6aaf8` | `964bcfadb6ce3a1d` / `f185c49f1a9fbd56` |
| 6 · boundary refused (section only) | `657ebadd828e5414` | `adee75c756734e59` |

What the eyes found: the pill sits in the transport row where the HiFi puts it, same height as its
neighbours, same active treatment as the speed pills; the HiFi focus ring (paper gap + accent ring) shows on
it; the notice line sits under the transport and turns warn-toned on a stop; at 660 the pill wraps under the
speeds; overflow `scrollWidth == innerWidth` in every state (1440 and 660).

## 8. Accessibility

* `role="switch"`, `aria-checked`, name = the visible label (state suffix is aria-hidden), `aria-describedby`
  → the help text, native `<button type="button">` (Tab reaches it; Space and Enter toggle — driven in the
  browser). No `aria-label` on it, so it stays out of the `[data-transport] button[aria-label]` lists other
  probes read.
* The notice is a `role="status"` live line; a stop is not colour-only (it is a sentence).
* axe on `[data-screen='execute-replay']` (ON + last fold, and again in the refused state), both widths:
  the only serious rule is `color-contrast` on `#939db0` (`--ink-faint`, the approved D-B1 exception, 89
  nodes); **0** blocking after that filter; **0** violations on the switch and on the notice.

## 9. What is left open

1. **G1 asks for a real-API receipt; this is a manual one.** Evidence in §6 is a dev server on this tree
   against the preview API. The Playwright real-API lane (`e2e/_preview-research-real-api.spec.ts`) has no
   S08 play-across cell (out of my file scope), and the preview's own **bundle** does not contain D7 until it
   is rebuilt (F3). Open: rebuild + one lane cell (`WFO: OFF plays to the end with 0 window reads; ON crosses
   with exactly 1`).
2. **Visual baseline (G6)** not run. The transport row of every S08 retained-lane snapshot has one more
   element; if a baseline covers it, it will differ. Only `./scripts/portal-web-visual.sh` compares
   correctly; not regenerated by me.
3. **One boundary on real data.** The preview run has 2 folds. The in-fold `cursor=` boundary
   (a fold longer than one 200-bar window) is exercised only on a two-slice fold 0 derived from the
   canonical fixture — no real run has a fold above 168 bars yet.
4. **Layout cost of the honest label:** the readout wraps to its own line at 1440 (§3). Bobby may prefer a
   shorter disclosing label; the copy lives in one constant (`ACROSS_LABEL`).
5. **Height 26 px vs the HiFi 22 px** is the screen's existing transport-row height, not introduced here.
6. **Expired tokens:** a boundary whose token expired is two reads (§2.3) and stops; the recovery itself is
   the hook's, unchanged.
7. **Full suite:** `src/styles/tokens.test.ts` ("keeps every raw color literal inside the declared token
   files") fails on `AlphaImport.tsx` raw colour literals (`#faf9f5 …`, `rgba(28,37,50,.05)`) — **already in
   the base commit** (`git grep` at `d3d99f26` finds them; this branch has no diff in that file), screen 14,
   not touched here. Whoever owns S14 should move them to tokens; it fails the same on any branch cut from
   the base.
8. **Plan bookkeeping:** Unified rows D7/G1 and audit row 8.10 still describe D7 as unbuilt (not edited, by
   instruction).

## 10. Files

| File | Change |
|---|---|
| `apps/portal/frontend/src/research/usePlayAcrossFolds.ts` | new — decision, chain, status, words |
| `apps/portal/frontend/src/research/ExecuteCandleReplay.tsx` | switch + notice + transport slot + audit deferral + refusal words shared |
| `apps/portal/frontend/src/research/replayTransport.ts` | `subscribeEnd`, `userActions` (read-only facts; the transport still never fetches) |
| `apps/portal/frontend/src/research/w5bFoldScale.fixture.ts` | `alignedFoldWindow` (test/probe helper) |
| `apps/portal/frontend/src/research/executePlayAcrossFolds.test.tsx` | new — 36 tests |
| `upgrade/research_loop/evidence/P17/G1_D7_PLAY_ACROSS_FOLDS_CLAUDE_2026-09-30.md` | this record |

`ExecuteDetail.tsx` is unchanged: the hub lane and the W3b body live there and are meant to stay silent.
