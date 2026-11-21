# Research portal: visual-parity sweep of S01–S14 (excluding S00/S04), 2026-09-30

Scope: HiFi `upgrade/research_loop/release-v1.1/*.dc.html` compared with live `research-portal.primusspark.com`. All captures are 1440 wide, full page. Live pages got 8s to settle.
Runs used: WFO `rrun_17f762128acf8c998ac7cc44d13f663f` (R-WFO-017) and P04 `rrun_464bf9c3dd8979af87e44388ea6910ef` (R-P04-018).
Screenshots are `<id>-sweep-{hifi,live}.png` in this folder. Extra states are `02-live-bound.png`, `02-{hifi,live}-Walkforward.png`, `14-hifi-{Codeanatomy,Quarantinepipeline}.png`, `14-live-{anatomy,gates}.png`, and the P04 variants `06p/07p/09p-sweep-live.png`. Network JSON for each page is in `<id>-net.json`.

**Headline.** Outside S00 and S04 the live screens are *not* "all text". Every major chart, table and strip on S01, S03, S06, S07, S09, S10 and S11 renders. Most of the text you see on those screens is typed honest absence with a reason code. The real graphic defects are few. The two larger ones are S02's window timeline and S13's claim ladder and OOS column.

Capture caveat: the S09 HiFi is broken in the repo. It loads `doc-page.js`, and that file is not in `release-v1.1/`, so `<doc-page>` stays `visibility:hidden` and the page renders blank. It also needs HTTP rather than file:// because it fetches itself. I captured it by serving the folder on localhost and forcing `doc-page{visibility:visible}`.

---

## S01 Run Library → `/research/quantbt/runs`
| HiFi block | Live | Class | Evidence |
|---|---|---|---|
| Status/claim mini-bar (7 runs · completed/running/failed) | "CLAIM LEDGER" bar + counts | MATCH | — |
| Evidence trail S1–S5 glyph row per card | present, coloured per stage | MATCH | — |
| Stitched OOS equity sparkline per card | drawn for cards in view; below the fold the full-page shot shows the placeholder "until the card scrolls into view" | MATCH (lazy by design) | `RunLibrary.tsx:520-588` IntersectionObserver; `/runs/{id}/sparkline` fetched for the first 5 cards only |
| Stat trio (OOS Sharpe / Δ decay / trades) | present; decay `not measured` on P04 | MATCH / HONEST-ABSENCE | `P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT` |

## S02 New Run → `/research/quantbt/runs/new`
| HiFi block | Live | Class | Evidence |
|---|---|---|---|
| 8-step stepper | present (wraps to 2 rows at 1440) | MATCH (layout: wraps) | — |
| **Window timeline: IS/OOS/Holdout proportional bars + bar counts** | text: `IS not declared → not declared`, or the date strings | **TEXT-INSTEAD-OF-GRAPHIC** | `NewRun.tsx:1696-1727` prints `draft.windows[k].start → endExclusive`. The draft already has the dates, and the same band primitive exists: `SplitBand.tsx:74-80` and the FreezeDetail data-time band (P04 S07 draws IS/outer OOS/holdout hatched). Bar counts are only available after preflight. |
| Claim forecast + cert-ceiling glyph "C" | forecast text; "cert ceiling not published" | HONEST-ABSENCE | atlas `cert_cap.state=NOT_PUBLISHED` ("QuantBT 1.1.1 certifies an execution route… not an optimization mode") |
| Walk-forward "Three windows" date grid | date inputs + mode/schedule selects | MATCH | — |
| Version binding detail card | present after binding | MATCH | `P22_ALPHA_VERSION_PUBLICATION_NOT_PUBLISHED` for last RC |

## S03 Run Progress → `/runs/<WFO>/progress`
| HiFi block | Live | Class | Evidence |
|---|---|---|---|
| Claim passport | present (NOT ISSUED) | MATCH | — |
| Stage chip rail + segmented progress bar + runtime budget bar | present | MATCH | — |
| Fold Gantt (bars + DONE pills + evidence cursor) | present, 2 folds | MATCH | — |
| Artifact ledger | present + retained-table card | MATCH | — |
| Terminal console | present | MATCH | — |
| (copy) H1 | reads "Run completed — rrun_17f76212" although `R-WFO-017` is known (it appears in the breadcrumb) | minor | — |

## S06 Search & Selection → `/runs/<WFO>/search` (P04: `06p`)
| HiFi block | Live (WFO) | Class | Evidence |
|---|---|---|---|
| Mode row + "what this mode reads" fold glyph strip | present | MATCH | `SearchFoldStrip.tsx` |
| **Search cinema (scatter + 5-step narrative, ▶ play)** | not rendered | MISSING by decision | Unified plan D6: "Không dựng tới khi engine publish sampler trace". A1 shows `SAMPLER TRACE not published`. The live page has no typed placeholder where the cinema would sit. |
| A1 search space table + range-position ticks | present | MATCH | — |
| A2 trial surface scatter | present (3 dots; thin, but real) | MATCH | — |
| A3 progression (two mini charts) | present | MATCH | — |
| A4 per-param sampled regions (small multiples) | present | MATCH | — |
| A5 param importance bars | "not applicable — 3 complete trials" | HONEST-ABSENCE | needs ≥8 trials |
| A6 interaction matrix + heatmap | not published | HONEST-ABSENCE | `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PARAMETER_INTERACTIONS` |
| B1 pool-freeze funnel bars | present | MATCH | — |
| B2 formula + per-fold decay bars + S_IS×S_OOS scatter | present | MATCH | — |
| B3 best-trial vs selected cards | present | MATCH | — |
| B4 θ* journey dot strip | present | MATCH | — |
| Trial ledger | present + candidate-replay ledger | MATCH | — |
| P04 (`06p`): A2–A6, B1, B2, B4 | typed "not applicable" panels | HONEST-ABSENCE | `P04_FIXED_PROFILE_DOES_NOT_PUBLISH_SEARCH_DIAGNOSTICS`, `P04_FIXED_PROFILE_DOES_NOT_CREATE_OPTIMIZER_STUDY` |

## S07 Freeze → `/runs/<WFO>/freeze` (P04: `07p`)
| HiFi block | Live | Class | Evidence |
|---|---|---|---|
| F1 data-time per-fold bars | present (IS/OOS bars per fold); P04 shows a three-window band | MATCH | — |
| F1 wall-clock 3-event timeline | typed absence | HONEST-ABSENCE | `QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_FREEZE_OR_OOS_READ_CLOCKS` (P04: "not asserted") |
| F2 frozen θ* table + range ticks | present | MATCH | — |
| F3 digest chain | present | MATCH | — |
| F4 binding to Stage 4 | present | MATCH | — |
| What-if sandbox (sliders + 9×9 grid) | present on WFO; P04 not applicable | MATCH | — |

## S09 Run Report → `/runs/<WFO>/report` (P04: `09p`)
| HiFi block | Live | Class | Evidence |
|---|---|---|---|
| Certification badge "B" | "not published" | HONEST-ABSENCE | `P18_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE` |
| Claim passport, identity, KPI tiles | present | MATCH | win rate: `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS` |
| Equity IS vs stitched OOS + drawdown with fold markers | present (ECharts, 2 svgs) | MATCH | — |
| Per-fold verdict table | present | MATCH | — |
| Certification chain, key artifacts, promotion, provenance | present | MATCH | — |

## S10 Attempt Lineage → `/alphas/delta-rsi-polynomial-alpha/lineage`
| HiFi block | Live | Class | Evidence |
|---|---|---|---|
| Root alpha / version bands with attempt chips | present | MATCH | — |
| Attempt tree rail (dots, nested cards, diff line) | present, but 1 storied node; the other 35 sit behind "show 35 probe attempts" | MATCH (data-driven) | the server returns `presentation_kind` STORIED for 1 attempt only |
| Selected-attempt panel | present; claim, OOS and cert typed absent | HONEST-ABSENCE | `P11_PROGRESS_SNAPSHOT_NOT_PUBLISHED`, `P19_RUN_LIBRARY_PUBLISHES_NO_PERFORMANCE_CELL_FOR_STATUS` (root attempt is FAILED) |
| Promotion pick | typed absence | HONEST-ABSENCE | `P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK` |
| (semantic) | the node chip says **ACTIVE** while the panel says `state failed` | minor | `LineageDetail.tsx:206`: the chip is derived from the version lifecycle, not the attempt |

## S11 Release Candidate → `/runs/<WFO>/release-candidate`
| HiFi block | Live | Class | Evidence |
|---|---|---|---|
| Identity chain strip (5 boxes →) | present | MATCH | — |
| Change taxonomy table + gate verdict | present (all UNSET) | HONEST-ABSENCE | `P22_NO_PUBLISHED_PREDECESSOR` |
| 12-row evidence pack table + claim-ceiling/engine-cert chips | present; chips "not published" | MATCH / HONEST-ABSENCE | — |
| Record preview | present; **long digests run past the card's right edge** | MATCH (layout break) | — |
| Publish / local-seal / inbox preview | present, blocked | MATCH | `P22_LOCAL_SEAL_REQUIRED`, `P21_RESEARCHER_DECLARATIONS_REQUIRED` |

## S13 Compare → `/alphas/delta-rsi-polynomial-alpha/compare`
| HiFi block | Live | Class | Evidence |
|---|---|---|---|
| Mode tabs | present | MATCH | — |
| **Claim ladder: 4 cards in one row, claim strengthening left→right, big OOS number** | 15 cards in a 4-column grid. All are the same family `WALK_FORWARD_OOS_COMPATIBILITY`, yet a "claim ↑ →" arrow sits between every pair. All 15 are chipped ACTIVE. | layout break / misleading glyph | `CompareDetail.tsx`; claim `rank:3` is identical for all |
| **OOS Sharpe on the 8 P04 cards** | "OOS sharpe — not published P20_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE" | **TEXT-INSTEAD-OF-GRAPHIC** (data exists in a sibling read) | the Run Library read has `stats[oos_sharpe]=0.7440` (`research.metric.v3.oos_sharpe`, AVAILABLE) for R-P04-018; the compare read `original_metrics.OOS_SHARPE` is NOT_PUBLISHED for the same run |
| EChart 1 grouped bars, OOS Sharpe per fold × attempt | present (7 WFO series × 2 folds); "27 attempts have no per-fold rows" | MATCH / partial | P04 has one outer-OOS window (744 bars) but gets no bar |
| Config diff table | present; wide, columns cut at the right | MATCH (overflow) | — |
| Trajectory text | present | MATCH | — |

## S14 Alpha Import → `/research/quantbt/alpha-import`
| HiFi block | Live | Class | Evidence |
|---|---|---|---|
| Contract mirror field/value/check table | empty state "No source has been parsed yet" | EMPTY (needs input; not a defect) | the HiFi shows a sample import. I did not trigger a live parse (it is a server POST). |
| Code anatomy (6 code cards + "declare more → unlock routes") | collapsed disclosure | MATCH-ish (collapsed; code, not graphic) | — |
| Quarantine pipeline 7 gate dots | "Gates run once a source parses" | EMPTY | — |
| Stepper | 3 steps vs HiFi 4 (anatomy folded into step 1) | deviation | — |

---

## Prioritized defects (TEXT-INSTEAD-OF-GRAPHIC / MISSING)

1. **S13: claim ladder is misleading at real scale (M).** There are 15 identical-claim cards with "claim ↑" arrows between equal claims, and all are chipped ACTIVE. Group cards by claim family: draw one ladder step per family and show "N attempts" inside the step, or drop the arrows when the ranks are equal. The HiFi reads as a 4-step strengthening line; the live reads as a wall of text cards.
2. **S13: P04 OOS Sharpe shown as absent although the Run Library publishes it (S backend / S frontend join).** Compare says `P20_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE`, but `/quantbt/runs` has `research.metric.v3.oos_sharpe=0.744` for the same run. This needs a backend request: compare should read the v3 metric. The alternative is to document why the compare scope differs. The per-fold chart could also give P04 its single outer-OOS bar.
3. **S02: window timeline is text, not bars (S).** Draw proportional IS/OOS/Holdout bars from the draft dates by reusing the `SplitBand` / FreezeDetail data-time band. Add bar counts once preflight returns them. This is the most visible "chữ" block on S02.
4. **S06: search cinema MISSING by decision D6 (L when unblocked).** Nothing needs building now. It does deserve a one-line typed placeholder where the HiFi hero sits, e.g. "search cinema — sampler trace not published", so the gap reads as honest absence rather than a missing block.
5. **S11: record-preview digests overflow the card (S, layout).** The same overflow shows on S13's config-diff table. Wrap or ellipsize with a title attribute, or confirm there is a visible horizontal scroll affordance.
6. **Minor copy (S).** The S03 H1 uses `rrun_17f76212` instead of `R-WFO-017`. The S10 node chip says ACTIVE for a FAILED attempt.
7. **HiFi source (S, docs).** `QuantBT 09 Run Report.dc.html` references `doc-page.js`, which is missing from `release-v1.1/`, so the HiFi opens blank for anyone comparing.

Nothing else on S01, S03, S06 (Stage A/B), S07, S09 or S10 is a text-for-graphic defect. Where a graphic is replaced by text on those screens, the text carries a server reason code.
