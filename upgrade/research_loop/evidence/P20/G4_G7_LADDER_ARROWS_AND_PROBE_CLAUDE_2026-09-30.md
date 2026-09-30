# G4 + G7 — Screen 13 ladder connectors, and the RF-04 probe harness (Claude, 2026-09-30)

> **Gom nhánh 2026-09-30 (Bobby duyệt kế hoạch):** chỉ phần **G7** (probe axe, `axeReceipt.ts`, heading Freeze, contrast Split) được đưa vào `integrate/research-loop-2026-09-30`. Phần **G4** (ladder grid, `CompareDetail.tsx`, probe ladder) **không** vào — nhánh chung giữ FG-04a (`b896d98d`) của Codex. Bản G4 còn trong patch sao lưu `~/.local/share/rl-0930-patches/fresh/g47.patch`.

**Mandate (lead, 2026-09-30):** close the two small frontend gaps of Unified §13.4.1 section G
(`#rl-open-ledger`): **G4** (S13 ladder: the `claim ↑ →` connector hangs at the end of a row)
and **G7** (the RF-04 a11y/product probe finds no `[data-screen]` on the dev server, so its axe pass
cannot run). Claude owns screens 00–14; P22/P23 not touched. Other agents edit S02, S06, S08, S09 and
the run-label registry in parallel: those files were not edited.

**Branch / base:** `feat/rl-g4-g7-ladder-probe` in worktree
`/home/bobby/portal/.claude/worktrees/agent-a12f335d67f8f4878`, from `d3d99f26`
(`origin/docs/research-loop-plan`, fetched). **Not committed and not pushed:** the owner asked for one
batched commit and one hook run (coordinator, 2026-09-30), so the changes sit in the worktree.

**Read first:** Unified §13.4.1 section G (G4, G7); `P20/E7_S10_S12_S13_HIFI_CLAUDE_2026-09-26.md` §7 item 7
(layout `VD-P20-14`); `P10/E6_S14_HIFI_CLAUDE_2026-09-26.md` "Left open" #4;
hi-fi `release-v1.1/QuantBT 13 Compare.dc.html` (ladder markup, lines 73–95 and 327–329).

## 0. Two premises in the assignment that the code does not bear out

1. **The axe pass is not in `_probe-research-product.spec.ts`.** That file has no axe at all (the only
   match for "axe" is the word "axes" in a comment). The axe pass is
   `_probe-research-rf04-a11y.spec.ts` (five routes × three widths, `stubPortalApi` only). Both were
   fixed; the product spec had its own defect (§2.4).
2. **`grep -l _probe-research-product` finds no config.** `playwright.research-probe.config.ts` selects by
   glob (`**/_probe-research-*.spec.ts`), so every `_probe-research-*` spec, this one included, is "listed"
   by that one config. (`playwright.research-w5a.config.ts` and `…-x2.config.ts` name their own specs.)

## 1. G4 — the ladder connector

### 1.1 What the hi-fi does, and what the connector means

The hi-fi ladder is one flex row of four cards (`flex:1; min-width:200px`). Each card is followed by
`<span … flex:none>{{ l.arrow }}</span>`, and the data sets `arrow: i < 3 ? "claim ↑ →" : ""`. So the
connector is a property of the **gap between two neighbours**: n cards draw n − 1, and the last card has
none. It never points at nothing. The rule text beside it says "Read the ladder left to right: the number
falls as the claim strengthens". The connector therefore means *the claim does not weaken as you move
right; the strongest claim is at the right end* — a reading direction, not a per-step rank increase (the
hi-fi itself draws it between `att_02` and `att_05`, both `SELECTION_ADJUSTED`).

### 1.2 Root cause

The connector was a **flex sibling** of the cards in a `flex-wrap` container. Which cards share a row is
decided by the browser at layout time, and nothing in the markup or CSS knew it, so the connector after
card 4 (8, 12 …) sat at the end of its row with nothing to its right. Measured on the read-only preview's
real alpha (`delta-rsi-polynomial-alpha`, 14 claimed attempts at the time):

| viewport | rows before | connectors drawn before | of which hanging at a row end |
|---|---|---|---|
| 1440 | 4 · 4 · 4 · 2 | 13 | 3 (after cards 4, 8, 12) |
| 1280 | 3 · 3 · 3 · 3 · 2 | 13 | 4 (after cards 3, 6, 9, 12) |
| 660 | 14 × 1 (stacked) | 13, rotated 90° | 0 hanging, but the rotated box kept its horizontal layout size and overlapped the card borders above and below |

### 1.3 The fix (`apps/portal/frontend/src/research/CompareDetail.tsx`, ladder area only)

* The ladder is a CSS grid whose **column count is decided by the ladder's own width** (container queries on
  `.cp-ladderwrap`): 4 columns from 1016 px, 3 from 744 px, 2 from 472 px, else 1; at ≤ 900 px of viewport
  the existing media query keeps one card per row (13-11). A card needs its 200 px, a connector a 72 px
  gap: each band opens exactly where its columns still give every card 200 px.
* The connector belongs to the card **it leads to** (`<li>` = connector + card), is absolutely placed in
  the 72 px gap before that card, and is `display:none` unless a band's rule says the card has a left
  neighbour in the same row: `:not(:nth-child(Nn + 1))`, N = the band's column count. So the last card of a
  row has nothing after it, and the first card of a row has nothing before it.
* **Order across the wrap stays readable** without lying: the ladder is an `<ol role="list">` (weakest first,
  the server's array reversed — unchanged), every card carries a corner tab `n/N` (its place in that
  order; title: "a place in the server's order, not a score"), and the header says
  `weakest claim first, strongest last · numbered in reading order` in place of `strongest claim on the
  right`, which was false on any wrapped or stacked ladder.
* The connector is decoration (`aria-hidden`); the list, the tab and the header carry the order for
  everyone else. **No attempt was added, dropped or reordered** (test G4-T01).

### 1.4 Deviations from the hi-fi, recorded (Bobby may veto any)

| Id | Deviation | Why |
|---|---|---|
| VD-G4-01 | A corner tab `n/N` on every ladder card (the hi-fi has none). | Four cards in one row need no numbering; a wrapped ladder does. It is the least invasive way to keep the rank order readable across a wrap. |
| VD-G4-02 | Header hint `strongest claim on the right` → `weakest claim first, strongest last · numbered in reading order`. | Layout-independent; the old hint was an implementation addition, not hi-fi copy. |
| VD-G4-03 | Grid instead of flex-wrap: the cards of a short last row keep the column width instead of stretching across the row. | Row membership must be known to CSS; equal columns are what makes that possible. |
| VD-G4-04 | Stacked (≤ 900 px viewport): no connector is drawn. | No card shares a row with another; the rotated connector overlapped the card borders. Corner tabs and the header carry the order. |

### 1.5 Checked in a browser (Vite dev server → read-only preview, real reads; looked at)

Real alpha, after the fix (the preview gained a 15th claimed attempt between my first and last shots, so
the real-data before/after counts differ by one card): 1440 → rows 4·4·4·3, **11 connectors, none at a row
end or a row start**; 1280 → 3·3·3·3·3, 10; 660 → 15 × 1, 0, page overflow 0 px at all three. A fixture
derived from the canonical `research-compare.attempts` with all four claim families (11 attempts: 1 strict,
2 selection-adjusted, 5 walk-forward, 3 full-sample): 1440 → 4·4·3, 1280 → 3·3·3·2, 1040 → 2 wide.

Probe `_probe-research-g4-ladder.spec.ts` (fixture lane, production build, 8 widths — 1440, 1280, 1100,
1040, 1000, 901, 900, 660 — covering the 4-, 3-, 2- and 1-column bands and the 900/901 media boundary):

| viewport | columns | rows | cards | connectors drawn | axe (other than D-B1) |
|---|---|---|---|---|---|
| 1440 | 4 | 3 | 11 | 8 | 0 |
| 1280 | 3 | 4 | 11 | 7 | 0 |
| 1100 | 3 | 4 | 11 | 7 | 0 |
| 1040 | 2 | 6 | 11 | 5 | 0 |
| 1000 | 3 | 4 | 11 | 7 | 0 |
| 901 | 3 | 4 | 11 | 7 | 0 |
| 900 | 1 | 11 | 11 | 0 | 0 |
| 660 | 1 | 11 | 11 | 0 | 0 |

(n cards in r rows draw n − r connectors, asserted from measured boxes: every drawn connector lies between
the previous card and its own card on one row and inside its row; every row-opening card has none; the
first card has none; reading order by position = order of the tabs; each card ≥ 199.5 px; no sideways
scroll.) The shell puts a 280 px sidebar in from 1024 px, which is why 1040 is 2 wide and 1000 is 3 wide.

## 2. G7 — the probe harness

### 2.1 Root cause (measured)

`_probe-research-rf04-a11y.spec.ts` did `page.goto(route); await settle(page);` and then read
`page.locator("[data-screen]").count()` **once** and expected > 0. Two things made that a race:

1. `settle()` returns as soon as fonts are loaded and the Portal shell's `<main>` exists — **before the
   lazily loaded screen has mounted**. `count()` does not retry.
2. On a `vite preview` build the screen chunk is a few ms behind the shell, so the single look usually
   lands after it. On the Vite dev server every module is transformed on first request: measured on this
   tree, `settle()` returned at ~1.1–1.4 s with `main` present and `[data-screen]` absent, and
   `[data-screen]` appeared ~0.6 s later (S00 at 1972 ms, S03 at 1693 ms after navigation start). The
   same first look on the stale 4317 preview (below) found the root for S00, S02, S12 and S14.

That is a **harness** defect; no screen was involved. Three contributing facts, none a screen problem:

* **Nothing boots the app.** The config has no `webServer` and falls back to `127.0.0.1:4317`, which is a
  `vite preview` started 7+ days ago from `/home/bobby/portal-research` (a 2026-09-23 build; port 4319 has
  another, 10 days old). A run without `RESEARCH_PROBE_BASE_URL` measures somebody's old build. (Both
  processes are still running; not mine, not stopped.)
* **The probe covered 5 of 15 screens and answered only the shell's stubs**: S03 was axed on a refusal
  frame, and S01, S04–S11, S13 not at all.
* **A cold dev server is a poor host** for the product probe (§2.4): Vite re-optimised `echarts/*` mid-run
  (07:19:28) and reloaded pages under running tests; and 4 tests fail only there (§2.4).

### 2.2 The fix (harness only; no screen was changed for this)

* `e2e/_probe-research-rf04-a11y.spec.ts` rewritten: it walks the P23 lane's `SCREENS` (all fifteen, each
  with its own root) under `installLane` (every read of every screen answered from the repository's own
  fixtures, so each screen is axed in the healthy state a reader meets), waits for the **screen's own
  root with a retrying locator** (30 s) and, if it never comes, throws what it did see (base URL, shell/main
  counts, roots present, h1, fixture gaps, console). It emulates `prefers-reduced-motion: reduce`: axe
  reads colour at the instant it looks and the running-state pulse (S01, S03) dims text through its cycle,
  so with motion the same page passed or failed by timing; with it held still, four pulse findings on
  S01/S03 disappear. 3 widths (1440, 1280, 660) × 15 screens = **45 cells**.
* **The receipt.** Every cell writes a row (all impact levels, node by node with the measured colour pair,
  `incomplete` "needs review" counts, `passes`, `waited_ms`, the base URL) into one JSON receipt
  (`RESEARCH_A11Y_RECEIPT`, else `$RESEARCH_SHOT_DIR/rf04-a11y-receipt.json`), per row as soon as it is
  known (a failed test restarts the worker). Helpers in `e2e/axeReceipt.ts`. **The one accepted finding is
  D-B1**: `color-contrast` where axe measured the foreground as exactly `#939db0`; it is marked
  `accepted: "D-B1"` in the receipt and does not fail a cell — its nodes keep target and colours, not
  markup. **Every other finding fails the cell.** A compact copy (D-B1 counted, every other node in full)
  is committed as `G4_G7_AXE_RECEIPT_2026-09-30.json`; the probe's own receipt (948 KB) is not.
* `playwright.research-probe.config.ts`: `RESEARCH_PROBE_SERVE=preview` builds this tree and serves it with
  `vite preview` (strict port, default 4361, private temp dist); `=dev` starts this tree's dev server;
  `RESEARCH_PROBE_BASE_URL` still points at anything already served. The 4317 fallback is kept but
  documented as what it is. No existing invocation changes meaning.
* `e2e/_probe-research-product.spec.ts`: one line removed — `expect(await unrouted.evaluate(...))` in "an
  unrouted card is drawn and says so" referred to a variable that no longer exists (the E12 change routed
  that card), so the test threw `ReferenceError` on every host before its later assertions could run. (The
  duplicate import E6 mentions was already fixed at merge.) That test passes now.
* The per-screen `theme-`/`echarts-` chunk assertion the old spec carried for S00, S02, S03, S12, S14 is
  kept; it only means something on a production build (the names differ on the dev server).

### 2.3 Axe findings per screen (fifteen screens × 1440/1280/660; axe-core 4.13.0; preview build of this tree)

"other" = nodes that fail the cell (anything but D-B1). "D-B1" = accepted `--ink-faint` nodes. "review" =
axe `incomplete` (not decided; not counted).

| Screen | 1440 | 1280 | 660 |
|---|---|---|---|
| S00 journey map | 0 other · 25 D-B1 · 26 review | 0 · 25 · 26 | 0 · 25 · 26 |
| S01 run library | **4** other · 58 D-B1 | 4 · 58 | 4 · 58 |
| S02 new run | **1** other · 44 D-B1 · 7 review | 1 · 44 · 7 | 1 · 44 · 7 |
| S03 run progress | **1** other · 31 D-B1 · 5 review | 1 · 31 · 5 | 1 · 31 · 5 |
| S04 evidence hub | **3** other · 51 D-B1 · 5 review | 1 · 51 · 7 | 0 · 47 · 14 |
| S05 split | 0 other · 80 D-B1 · 2 review (fixed, §2.5) | 0 · 78 · 2 | 0 · 73 · 2 |
| S06 search | **4** other · 91 D-B1 · 3 review | 5 · 87 · 7 | 4 · 91 · 3 |
| S07 freeze | 0 other · 87 D-B1 · 4 review (fixed, §2.5) | 0 · 87 · 4 | 0 · 87 · 4 |
| S08 execute replay | **1** other · 76 D-B1 · 3 review | 1 · 76 · 3 | 1 · 76 · 3 |
| S09 run report | 0 other · 142 D-B1 · 5 review | 0 · 142 · 5 | 0 · 142 · 5 |
| S10 attempt lineage | **12** other · 49 D-B1 · 1 review | 12 · 49 · 1 | 12 · 49 · 1 |
| S11 release candidate | 0 other · 1 D-B1 · 4 review | 0 · 1 · 4 | 0 · 1 · 4 |
| S12 engine atlas | 0 other · 3 D-B1 · 12 review | 0 · 3 · 17 | 0 · 3 · 12 |
| S13 compare | 0 other · 46 D-B1 · 1 review | 0 · 46 · 1 | 0 · 46 · 1 |
| S14 alpha import | 0 other · 18 D-B1 · 2 review | 0 · 18 · 2 | 0 · 18 · 2 |

Totals over the 45 cells: **2,389 D-B1 nodes accepted, 74 other nodes** (rules: `color-contrast` 2,456 in
all, of which the 2,389 accepted and 67 other; `heading-order` 6; `scrollable-region-focusable` 1). Cells:
**25 pass, 20 fail**; S00, S05, S07, S09, S11, S12, S13, S14 are clean apart from D-B1.

**Every non-D-B1 finding, with its cause** (identical at all three widths unless a width is named):

| Screen | Finding | Cause | Status |
|---|---|---|---|
| S01 | `color-contrast` ×2 nodes: stage-trail cell `S2` in state `cap` (R-WFO-118, R-WFO-120), `#9a6a1f` on `#f4ecdb` = 4.01:1 | the hi-fi's gold-on-pale-gold pair (the same pair `VD-P20-30` moved to raised paper on S13, 4.7:1) | open — hi-fi deviation, Bobby |
| S01 | `color-contrast` ×2: the superseded note line, 1.94:1 | `--ink-faint` under `opacity: .7` (`RunLibrary.tsx` ~1285): D-B1 compounded by a deliberate dim | open — design ruling |
| S02 | `heading-order`: `<h3>` "Context — alpha & version binding" straight under the `<h1>` | screen-wide: no `<h2>` | S02 is being edited by others — not touched |
| S03 | `color-contrast`: `[data-claim-text]`, 2.28:1 | `--ink-faint` under `opacity: .85` when the claim is not issued (`RunProgress.tsx` ~1450) | open — design ruling |
| S04 | `color-contrast` ×3 at 1440 (1 at 1280): the "SOON" chip and the "Promotion / Approval Gate · Paper" card, 1.78–2.87:1 | dimmed placeholder card (`data-promotion-soon`) | open — design ruling |
| S06 | `color-contrast` ×4: `Stage A · search` (`--role-is`, 3.49:1), `Stage B · selection` and the freeze-rule label (`--accent-2` at 11 px, 4.47:1), the OOS-column chip (4.34:1); + `scrollable-region-focusable` on `[data-panel="search-space"]` at 1280 | token colours at small sizes; a scroll region with nothing focusable | S06 is being edited by others — not touched |
| S08 | `heading-order`: `<h3>` "execution contract" | same as S02 | S08 is being edited by others — not touched |
| S10 | `color-contrast` ×12 (`att_01` card: `.ln-av`, `.ln-cfg`, `.ln-faint`, `.ln-st`, `.ln-note`, `.ln-spec`, `.ln-cert`, the OOS/decay metrics, `.ln-absent`; the `ROOT` chip `#ab8446` 3.39:1; the `att_01` chip 3.82:1), 1.91–3.88:1 | SUPERSEDED rows and chips are dimmed by `opacity` (`.ln-node[data-status="SUPERSEDED"] .ln-row { opacity: .82 }`, `.ln-chip[…] { opacity: .75 }`) | open — design ruling |

Why the contrast findings above were **not** fixed here: each is a hi-fi colour or a deliberate dim that
signals a state (superseded, not issued, coming soon). Changing them is a visual decision, and the
precedent (`VD-P20-30`, a11y over hi-fi) was recorded and approved case by case. Proposed fix in each
case: keep the recession with an explicit token colour (`--ink-soft` and no opacity) so it never drops
below AA; needs Bobby's word, and D-B1 (`--ink-faint`) remains its own step.

### 2.4 The product probe on the two hosts (not part of the assignment; measured because it names the file)

`_probe-research-product.spec.ts`, 78 tests, `--workers=1`:

| Host | Passed | Failed |
|---|---|---|
| Vite dev server, cold (first run) | 40 | 38 |
| Vite dev server, warm | 40 | 38 (same set) |
| `vite preview` of this tree, after the `unrouted` fix | **45** | **33** |

The five that differ: the `unrouted` test (fixed) and four that fail only on the dev server — S04 "reads
only the series the open tab draws" (`/evidence` read twice, expected once: consistent with dev-mode React
StrictMode running effects twice), S04 "says what it was never given", S05 "draws each window", S06 "never
draws an empty study" (dev-only ECharts size warnings). So **the product probe needs a built host; the dev
server is not one.** The 33 that fail on the build are stale assertions or lane gaps, **not touched**: 10
copy drift (`toContainText`, e.g. "poll floor 5s" is now "stream dropped · polling every 5s"), 6 S02 tests
that hit a read the product spec does not stub (501 in the console; the product spec stubs only the shell,
while `installLane` answers S02's reads, the dataset catalog among them — the URL was not captured), 4 element counts, 4 attributes, 3 S12 "3 elements need sideways scroll" (a
screen finding), 3 visibility, 2 click timeouts, 1 value. Fixing them means re-deciding what S01–S07 owe;
S02 and S06 are being edited by others.

### 2.5 Small real defects fixed on screens that are safe to touch

| Screen | Finding | Fix | Test |
|---|---|---|---|
| S05 (`SplitDetail.tsx`) | `scrollable-region-focusable` on the 760 px fold table at 1280 and 660 | `tabIndex={0}` and `aria-label="fold table (scrolls sideways)"` (the pattern S11 and S13 already use) | `splitDetail.test.tsx` "G7 — … fold table" |
| S05 | `color-contrast`: the month-tick labels (5–6 per width), `--viz-legend-inactive` (the hi-fi's swatch grey) 1.72:1 on white at 8.5 px | label text takes `--ink-faint`, so it moves with D-B1 instead of hiding from it (**VD-G7-01**, a11y over hi-fi; the token is for swatches and borders) | `splitDetail.test.tsx` "G7 — … month ticks" |
| S07 (`FreezeDetail.tsx`) | `heading-order`: `<h1>` → `<h3>` | the nine screen-level `<h3>` are `<h2>`; headings inside shared panels stay `<h3>` and now sit under an `<h2>`. No class changed, so nothing moved | `freezeDetail.test.tsx` "G7 — … heading-order" |

Not done, deliberately: no shared token was changed (D-B1 untouched); no screen edited by others.

## 3. Tests (exact counts)

| Suite | Result |
|---|---|
| `tsc --noEmit -p apps/portal/frontend/tsconfig.json` | exit 0 |
| vitest `compareDetail.test.tsx` | **47 passed** (42 existing + 5 new: G4-T01…T05) |
| vitest `splitDetail.test.tsx` | **93 passed** (91 + 2 new) |
| vitest `freezeDetail.test.tsx` | **54 passed** (53 + 1 new) |
| the three files together | **3 files, 194 passed** |
| whole frontend vitest run (before the last two comment/title edits, run once) | 197 files: 195 passed, 2 failed; 3,853 tests passed, 3 skipped, 2 failed. The two: `PortalShell.test.tsx` "translates a legacy Planning hash link" (passes alone, 18/18 — a timing flake under load) and `tokens.test.ts` "keeps every raw color literal inside the declared token files" — 6 raw colour literals in `AlphaImport.tsx` (S14) that **are in `d3d99f26`** (not mine; my own two hex literals were removed and the file passes apart from those six). Not re-run in full after the owner's "touched files only" directive |
| Playwright `_probe-research-g4-ladder.spec.ts` (production build, 8 widths) | **8 passed / 0 failed** |
| Playwright `_probe-research-rf04-a11y.spec.ts` (production build, 45 cells) | **25 passed / 20 failed** — every failure is a real axe node other than D-B1 (§2.3); none is a missing root |
| Playwright `_probe-research-product.spec.ts` | 45 passed / 33 failed on a build; 40 / 38 on the dev server (§2.4) |

G4-T05 parses the ladder's CSS out of the rendered `<style>` and checks, for every container width from 200
to 1800 px in 4 px steps and 1–30 cards (over 10,000 cases), that a connector is drawn exactly between two
cards of one row; a one-character change to one band's divisor fails it (checked by mutation, then
restored). The browser probe measures the same claim on real layout.

Type check of the new e2e files (an ad-hoc tsconfig, deleted): clean. Existing: the P23 lane's `stubs.ts`
does not typecheck at `d3d99f26` — its `replay` stub lacks the now-required `candle_overview` (TS2741). Not
touched (P23); S08 still renders on that stub (the a11y cells found its root).

## 4. Screenshots (SHA-256, first 16 hex; not committed)

Real preview reads through the Vite dev server (`:5234`, read-only proxy to `:8095`; the only write is the
session login), `delta-rsi-polynomial-alpha`, 1440 / 1280 / 660; "ladder" = the ladder panel, "full" = the
full page.

| Shot | ladder | full |
|---|---|---|
| before, 1440 (14 claimed) | `9c307351a6232784` | `bb7a21c5d02f52da` |
| before, 1280 | `23ccbbf35673c74c` | `71c4a494e54c68b6` |
| before, 660 | `209c83018e670e90` | `6d4fc3e64fb4e647` |
| final, 1440 (15 claimed) | `e22a549c86524491` | `071c7ffd55cf59b4` |
| final, 1280 | `22cec6ae54a17af9` | `8b9da52c1a4e10cf` |
| final, 660 | `08bfee8367ab2e88` | `682957ec14bb4d84` |
| fixture (11 attempts, 4 families), 1440 | `deeca831dee32a18` | `4dcde07c2fae3ffe` |
| fixture, 1280 | `476c5f9b1ee80e54` | `2c1e7783d1e62bf8` |
| fixture, 660 | `3cfe2ade19144438` | `ef913a974fdddc3f` |

The probe's own ladder crops (1440, 1280, 1100, 1040, 1000, 901, 900, 660): `fd54be908e2a4b86`,
`d1505e78083c34bf`, `7411779b3d578b55`, `3d29bff514f4c7d1`, `2dc11cd26e3cfdc2`, `a5c48e8967cf70a3`,
`80d173a8986aec5b`, `18e59a6283622339` (the shell's sticky bar overlays the top of an element crop; that
is the screenshot, not the page). Receipts: probe axe receipt `5173535ff0ef7338`, ladder receipt
`4df7aaca78e537c3`.

## 5. Files

`apps/portal/frontend/`: `src/research/CompareDetail.tsx` (ladder CSS and `Ladder` / `LadderStep` /
`LadderCard` only), `src/research/SplitDetail.tsx` (fold table, ticks), `src/research/FreezeDetail.tsx`
(heading level), `src/research/compareDetail.test.tsx`, `splitDetail.test.tsx`, `freezeDetail.test.tsx`,
`e2e/_probe-research-rf04-a11y.spec.ts` (rewritten), `e2e/_probe-research-g4-ladder.spec.ts` (new),
`e2e/axeReceipt.ts` (new), `e2e/_probe-research-product.spec.ts` (one line), `playwright.research-probe.config.ts`;
this record and `G4_G7_AXE_RECEIPT_2026-09-30.json`. `apps/portal/frontend/node_modules` and
`features/roadmap-task-board/frontend/node_modules` in the worktree are symlinks to `/home/bobby/portal-research`'s
(git-ignored; not part of the change). Not touched: `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md`, any P22/P23
file, S02, S06, S08, S09, shared tokens, any visual baseline.

## 6. Left open

1. **Equal-claim connectors (decision, Bobby).** On the real alpha all 14–15 claimed attempts are
   `WALK_FORWARD_OOS_COMPATIBILITY`, so every connector says `claim ↑` between two cards of one claim. The
   hi-fi does the same at `att_02 → att_05`, and `VD-P20-14` keeps it verbatim; but a reader can take
   "claim ↑" as "this claim is stronger". One-line option: draw `same claim →` when the neighbours' published
   ranks are equal. Not done — it changes decided copy.
2. The gold "rule of this mode" banner (`ATTEMPTS_RULE`, verbatim hi-fi as adapted by `VD-P20-15`) still says
   "Read the ladder left to right: the claim strengthens at every step"; at ≤ 900 px the ladder is one
   column. Not changed (decided copy); the header and tabs carry the order.
3. Density when more than 12 claimed attempts (Bobby, already in the ledger) is unchanged: 15 cards now
   wrap to four rows at 1440.
4. **Axe, 20 failing cells (§2.3):** S01 (cap cell 4.01:1; superseded note under opacity), S03 (claim text
   under opacity), S04 (dimmed "soon" card), S10 (12 nodes of superseded dimming), and — not touched
   because others are editing them — S02 and S08 (`heading-order`), S06 (4 contrast nodes, one
   `scrollable-region-focusable`). The probe stays red for them by design (D-B1 is the only accepted
   finding); the fix per screen is a design call, above.
5. **D-B1** (`--ink-faint`) remains the shared token step; 2,389 nodes ride on it.
6. **Product probe:** 33 of 78 fail on a build (§2.4) — stale copy assertions, an unstubbed read (501)
   in S02's tests, an S12 "sideways scroll" finding. Not part of G7; needs the owners of S01–S07/S12.
7. **P23 lane** `stubs.ts` does not typecheck at this base (replay stub lacks `candle_overview`); P23's.
8. The stale `vite preview` processes on 4317 and 4319 (from `/home/bobby/portal-research`, 7 and 10 days
   old) are still up; the config's fallback URL still points at 4317. Use `RESEARCH_PROBE_SERVE=preview`.
9. The whole-suite vitest was not re-run after the last two comment/title edits (owner's directive);
   `tokens.test.ts` is red at `d3d99f26` because of the six S14 literals (§3) — a small S14 follow-up.
10. Not committed: the batch commit and its hook run are the coordinator's.
