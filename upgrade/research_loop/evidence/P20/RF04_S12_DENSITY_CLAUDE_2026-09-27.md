# RF-04 — Screen 12 (Engine Atlas) density, accounted for pixel by pixel (Claude, 2026-09-27)

**Closes:** RF-04 for S12, and E7 §7 open item 1 ("S12 height 3,016 px vs HiFi 2,273 — the engine's term
tables are longer than the HiFi's sample"). That sentence was a hypothesis; this record measures it.
**Branch:** `rf04/s12-density`, from `origin/docs/research-loop-plan` `05f0d6a0`. Not pushed.
**Sources read:** HiFi `release-v1.1/QuantBT 12 Mode Atlas.dc.html` (measured block by block in the browser,
not read off the markup); `P20/E7_S10_S12_S13_HIFI_CLAUDE_2026-09-26.md`; `RF-02/README.md` D-1…D-5;
`packages/contracts/fixtures/research-foundation.atlas-current.valid.json` and
`apps/portal/frontend/e2e/research-foundation/atlas.json`. The Unified plan was not edited.

Baseline reproduced exactly before any change: S12 modes at 1440 = **3,016 px**, sha `d79a252c9154a64f`;
at 660 = **4,468 px**, sha `684989e88f5cbe0c` — byte-identical to the two hashes E7 recorded. HiFi = **2,273 px**.

---

## 1. Where the 743 px were, block by block

Measured in Chromium at 1440 on the same run (`rrun_e1fa9e5c…`, R-WFO-016), HiFi content column 1,144 px wide,
real content column 1,128 px wide.

| Block | HiFi | S12 before | Δ | Verdict |
|---|---:|---:|---:|---|
| shell above the content column | 72 | 80 | **+8** | app shell (X-1), not S12 |
| header | 68 | 90 | **+22** | **spacing** — release identity stacked in four lines |
| release-facts card + its 14 px gap | 0 | 45 | **+45** | **layout** — a band the HiFi has no equivalent of |
| tab bar | 36 | 36 | 0 | — |
| rule one / rule two row | 113 | 77 | **−36** | credit (12-4: rule two cites only what the manifest carries) |
| mode_1_decay card | 335 | 413 | **+78** | see §2 |
| mode_2_sbb card | 301 | 423 | **+122** | see §2 |
| mode_3_flat_minima card | 298 | 426 | **+128** | see §2 |
| mode_4_is_only_robust card | 318 | 446 | **+128** | see §2 |
| mode_5_full_robust card | 289 | 423 | **+134** | see §2 |
| "when to reach for which mode" table | 203 | 308 | **+105** | **repetition** — one sentence printed five times |
| rules of this screen | 58 | 58 | 0 | — |
| shell below the content column | 56 | 64 | **+8** | app shell, not S12 |
| **document** | **2,273** | **3,016** | **+743** | |

### The mode cards: all of it is in one column

Each card is `pad 14 + header 26 + body(pad-top 10 + tallest column) + pad 14`. The three columns measured
separately (content height, not the stretched box):

| card | col 1 "what it reads" | col 2 "objective" | col 3 "schedule → claim" |
|---|---:|---:|---:|
| mode_1_decay | 161 | **347** | 141 |
| mode_2_sbb | 163 | **357** | 141 |
| mode_3_flat_minima | 183 | **360** | 141 |
| mode_4_is_only_robust | 179 | **380** | 141 |
| mode_5_full_robust | 145 | **357** | 141 |

The objective column was the tallest on every card, so **100 % of the +590 px of card excess was in it**,
while columns 1 and 3 each sat on 170–240 px of unused vertical space. Inside that column:

| part | HiFi (5 cards) | before (5 cards) | Δ |
|---|---:|---:|---:|
| the four term rows | 553 | 1,006 | **+453** |
| formula lead (stage-name line + the engine's longer formula) | 160 | 273 | **+113** |
| "N more terms, M more stages, …" disclosure summary | 0 | 91 | **+91** |
| coefficients / params line | 117 | 78 | −39 |
| SUSPECT line | 150 | 120 | −30 |
| artifact fields | 72 | 60 | −12 |
| column label | 60 | 60 | 0 |

So the honest split of the 743 px was: **≈ 220 px of spacing, layout and repetition** (header, release-facts
band, the stage line, the wrapping disclosure summary, the five-times avoid-when column) and **≈ 450 px of
term table** — which itself was part data and, as it turned out, part a fixed gutter that did not fit the data.

---

## 2. The term-table finding: a 140 px gutter sized for the HiFi's sample

E7 wrote "the tables are longer". They are not longer in **rows** — both the HiFi and this build show four
terms per card. They are longer in **characters**, and the row layout made that worse than it had to be.

Characters in the four shown terms per mode (symbol + meaning):

| mode | HiFi sample | engine (QuantBT 1.1.1) | longest symbol, HiFi → engine |
|---|---:|---:|---|
| mode_1_decay | 270 | 411 | 22 → 32 |
| mode_2_sbb | 223 (3 terms) | 486 | 20 → 32 |
| mode_3_flat_minima | 193 | 411 | 14 → 32 |
| mode_4_is_only_robust | 211 | 725 | 11 → **110** |
| mode_5_full_robust | 185 (3 terms) | 673 | 12 → **110** |
| **total** | **1,082** | **2,706** | **2.5× the text** |

The HiFi's symbols are *names* (`S̄_OOS`, `λ·σ_d`), so a fixed 140 px gutter fits them on one line. The engine's
symbols are sometimes whole expressions:
`plateau_score = q + plateau_median_weight * median - plateau_std_penalty * std + plateau_size_bonus * log1p(n)`.
In a 140 px gutter that broke over **seven lines** beside a three-line meaning, so the row cost **97 px** to
carry 46 px of reading. That is a layout defect, not data.

---

## 3. What was closed

All in `apps/portal/frontend/src/research/EngineAtlas.tsx`.

| # | Finding | Fix | Saved |
|---|---|---|---:|
| 1 | Header stacked the release chip, the verified line, the retained-history line and the button in four rows | one wrapped row for the release identity; the HISTORICAL warning keeps its own line because a warning is not a chip | 22 |
| 2 | `release facts` (audit F-09) took a band of its own; the tab bar used 369 px of a 1,128 px row | the disclosure is a chip at the right end of the tab row; opening it takes the row's full width and the tabs move above | 45 |
| 3 | `mode.when_to_use` printed in the card's column 1 **and** in the "when to reach for which mode" table | said once, in the table — where the HiFi keeps it | (frees col 1) |
| 4 | The table's third column printed the **same** `avoid_when` NOT_PUBLISHED sentence on all five rows, and took 547 px from the column that carries five different sentences | `sharedAvoidWhen()`: one identical sentence is said once under the table; a manifest that publishes different guidance keeps the per-row column | 87 |
| 5 | The visible `<thead>` duplicated the card title the HiFi has no head under | `sr-only` head — the columns stay named for a reader who cannot see the shape | (in #4) |
| 6 | `oos_candidate_selection · maximize` took a line above the formula | it rides the column's label row, right-aligned (12-2 keeps the fact) | 85 |
| 7 | The disclosure summary wrapped to two lines on two cards | one compact line | 26 |
| 8 | The objective column carried every extra pixel while columns 1 and 3 sat on 170–240 px of slack | column flex 1.1 : 1.3 : 1 → **1 : 2 : 1** (min-widths 236/384/236, sum still under the 900 px wrap point). Objective column 390 → 490 px | ~180 |
| 9 | The symbol gutter was fixed at 140 px | `symbolGutterCh()` sizes it in `ch` of the mono face from the longest symbol on the card, floored at 23ch (the HiFi's own width) and capped at 42ch | (in #8) |
| 10 | Past 42ch the gutter takes half the column and the symbol still wraps, so **both** halves wrap and the row pays twice | past the cap the term stacks: the expression on its own full-width line, the meaning indented under it (`data-term-layout="stacked"`, modes 4 and 5) | 37 |
| 11 | The engine's 51-character retention names have no break opportunity and crossed the column rule (already true before this work at col 1 = 330 px; worse at 264) | `overflow-wrap: anywhere` | overflow |

Nothing was truncated and no served term was dropped: a test asserts that shown + hidden equals every term the
manifest published, for every mode.

### The cap now says what it caps

The four-term cap (D9) existed but was silent about its size — it read "1 more term, 2 more stages, …".
The summary now names the cap in the HiFi's "top 10 / 214" style, and says so when nothing is capped:

- `4 of 7 terms · 2 more stages · weights · selection metric · sources`
- `all 4 terms shown · weights · selection metric · sources`

### E1 display helpers applied

| Helper | Where | Before → after |
|---|---|---|
| `shortId` | `ReleaseFacts` config digest | the 64-hex digest in full → `69c9431e`, whole value in `title` and `data-config-digest` |
| `groupDecimalString` | trial ceiling, trials accepted, sweep-dimension ceiling, outer-fold ceiling, cpu-seconds ceiling | `4000` → `4,000`; the cpu ceiling no longer goes through `toLocaleString` on a float |
| `claimToken` | claims tab `result_metadata_status` | `close_target_certified` → `CLOSE_TARGET_CERTIFIED` (HiFi 04's form for an engine claim token) |
| `REFUSAL_COPY.denied` | `foundationClient` | already correct: no `FOUNDATION_REFUSAL_SENTENCE` entry for `SESSION_REQUIRED`, so a `denied` state falls through to `refusalCopy("denied", status)` = `REFUSAL_COPY.denied`. Verified, not changed. |
| `formatUtc` / `iso` | — | **not applicable**: the Atlas contract carries no timestamp field. S12 prints no date. |
| `claimToken` on the claim pair | — | **deliberately not applied**: 12-7 is that claim strings are the engine's, rendered verbatim, and the HiFi prints `strict_nested_fold_local_retraining` in lower case. Uppercasing them would contradict both. |

No type was made smaller. The smallest size on the screen is still 8.5 px (`suspect`, the weights head, the
"not published" status word), all pre-existing; nothing new goes below 9 px.

---

## 4. Heights, before and after

Document `scrollHeight`, Chromium, same run, same preview data. `sw` equalled the viewport everywhere: **no
horizontal overflow at either width, on any tab.**

| Tab | 1440 before | 1440 after | 1440 HiFi | 660 before | 660 after | 660 HiFi |
|---|---:|---:|---:|---:|---:|---:|
| WFO modes | 3,016 | **2,478** | 2,273 | 4,468 | **3,977** | 4,110 |
| Execution routes (arbitrage selected) | 1,332 | **1,265** | 900 (no expandable row) | 1,748 | **1,710** | — |
| Claims by contract | 900\* | 900\* | 900\* | 1,245 | **1,207** | — |
| WFO modes, no run | — | 2,478 | — | — | 3,927 | — |

\* the claims tab is shorter than the 900 px viewport at 1440, so the document height is the viewport floor.
Its **content column** went 717 → **650 px**, which is **34 px under the HiFi's 684**.

Modes at 660 is now **133 px under the HiFi** (3,977 vs 4,110), and the HiFi itself overflows horizontally
there (`scrollWidth` 692 on a 660 viewport) where the real screen does not.

The modes tab at 1440 closed **538 of the 743 px — 72 %.**

---

## 5. What remains, and why it is honest to remain

**+205 px at 1440 on the modes tab.** Accounted for:

| Remaining | px | Why |
|---|---:|---|
| term tables | **+253** | 2,706 characters against the HiFi sample's 1,082 (§2). At 490 px of column the meanings (70–149 characters each) need two lines; 35 px is the row floor, and the HiFi's own 20 px rows carry 30–55-character meanings. Rendered at **3.4 characters per pixel against the HiFi's 2.0** — the screen is 1.7× denser per character than the design it is measured against. |
| the term disclosure summary, 5 × 13 | +65 | the price of not truncating: it is the affordance that says "4 of 7" and opens the rest. The HiFi shows a fixed sample and hides nothing, so it has no equivalent row. |
| shared avoid-when foot under the table | +18 | new: one sentence replacing five. The HiFi never carried the fact at all. |
| app shell above and below the content column | +16 | X-1, the shared breadcrumb shell. Not S12's. |
| credit: rule two, SUSPECT, artifacts, coefficients | −147 | the real copy is shorter than the HiFi's sample here |

**Deviation VD-RF04-01 — S12 modes is 205 px taller than its HiFi, and that is the data.**
The HiFi's five mode cards are drawn against a sample of 18 hand-written terms totalling 1,082 characters with
symbols no longer than 22 characters. QuantBT 1.1.1 publishes 27 terms, of which the screen shows 20 totalling
2,706 characters, with symbols up to 110. Closing the last 205 px would mean one of: dropping a served term
(refused), cutting a meaning (refused — never truncate silently), or taking type below 8.5 px (refused — the
design system's smallest documented size). The screen instead carries 2.5× the text in 109 % of the height.

**Deviation VD-RF04-02 — two term layouts on one screen.** Modes 1–3 keep the HiFi's `symbol | meaning`
gutter; modes 4 and 5 stack the expression above its meaning because their symbols are 110 characters and no
gutter width makes that pay. The switch is a measured rule (`symbolGutterCh` returns `null` past 42ch), it is
tested, and it is visible in `data-term-layout`. A reader sees one card shape change, not five.

**Judgement calls Bobby may veto:**
1. The release-facts disclosure as a chip at the right end of the tab row rather than a band of its own.
2. `when_to_use` removed from the mode card (it is still on the screen, in the table).
3. The per-row avoid-when column folded into one foot line while all five modes share one sentence.

Still open from E7 §7 and untouched here: the `R-WFO-###` run label (D1), 12-4's `CandidateSelector` manifest
field, `--ink-faint` contrast (DS-01) and X-1.

---

## 6. Tests

| Gate | Result |
|---|---|
| `engineAtlas.rf02.test.tsx` | 28/28 (21 before + 7 new: 6 RF-04, 1 avoid-when fallback) |
| `engineAtlas.rf02` + `composition` + `foundation` + `atlas.test.ts` | **123/123** (111 at E7) |
| whole `src/research` suite | **1,424/1,424**, 45 files |
| `tsc --noEmit` (frontend) | clean |
| pre-commit hook `verify-workspace.sh` | see §8 |

New tests lock the rules rather than the pixels: the gutter is sized from the published symbols and drops past
its cap; short symbols use the gutter and long ones stack; the cap names itself and shown + hidden equals every
served term; `when_to_use` appears exactly once; the governing stage is on the label row; the release facts sit
on the tab row; the avoid-when column returns when the modes stop sharing a sentence.

Two existing assertions were updated to the new, better behaviour, not relaxed: the avoid-when sentence is now
asserted **once** (with the shared foot and a two-cell row asserted alongside), and the release facts now assert
`trial ceiling4,000`, `cpu 86,400 s`, and a short digest whose full value is still carried in `title` and
`data-config-digest`.

## 7. Browser

Vite `:5222` from this worktree → read-only preview `:8095` (`c81e8dc2`), logged in as `claude-preview`,
1440 and 660, every shot looked at. sha = first 16 hex of the PNG's sha256.

| Shot | 1440 h / sha | 660 h / sha |
|---|---|---|
| HiFi 12 | 2273 / c9e8abd758970726 | 4110 / 5287961529313951 (HiFi overflows: sw 692) |
| S12 modes — before | 3016 / d79a252c9154a64f | 4468 / 684989e88f5cbe0c |
| S12 modes — after | 2478 / e8c9e5c20f4e51bd | 3977 / 3985eedc225002ec |
| S12 routes, arbitrage selected — before | 1332 / 6a4f4c2a2a8b26dd | 1748 / 91a469a4df31efa1 |
| S12 routes, arbitrage selected — after | 1265 / ce09cb24080688dd | 1710 / 933a5128ff13e03e |
| S12 claims — before | 900 / 205a46c3f4121de8 | 1245 / 769ba322db41d34b |
| S12 claims — after | 900 / ef3e55143c6cb007 | 1207 / 0e4f338e6d774cfe |
| S12 modes, no run — after | 2478 / 7238b0e78316e9f7 | 3927 / 5389661460d421cf |

The two "before" mode hashes are the ones E7 recorded, so the baseline is that screen and nothing else.

**Overflow.** A probe walked every element under `[data-screen]` and every element inside every
`[data-mode-column]`. Before: three mode cards leaked their retention name across the column rule at 1440
(`one_candidate_fold_return_path_plus_replicate_vector`, over by 57 px). After: **none**, at 1440 or 660, on
any tab, and `scrollWidth` equals the viewport everywhere.

**axe** on `[data-screen]`, all three tabs, 1440 and 660, and again with every `<details>` on the screen forced
open: **1 violation, `color-contrast` on `--ink-faint` (#939db0)** — the documented shared-token exception
D-B1/DS-01 that E7 already recorded. No new violation of any kind, including on the stacked term rows, the
`sr-only` table head and the release-facts chip.

## 8. Commits

| Commit | Subject | numstat (+/−, file) |
|---|---|---|
| (below) | fix(research): RF-04 S12 density — close the spacing, measure the rest | 207/78 `EngineAtlas.tsx` · 89/4 `engineAtlas.rf02.test.tsx` |
| (below) | docs(research): RF-04 S12 density record | this file |

Every commit went through the pre-commit hook (`verify-workspace.sh`), started only when no other
`verify-workspace.sh` process was running. No hook was bypassed. No backend, contract or fixture changed —
this is a frontend-only package.
