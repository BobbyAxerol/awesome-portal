# DOCS_B audit — S11 Release Candidate & Publish, S12 Engine/Mode Atlas (2026-10-02, HEAD b965741e)

Read-only. Screenshots: /home/bobby/portal-research-qa-2026-10-02/audit-final/DOCS_B/{S11,S12}/ (cited as S11/NN, S12/NN). Only GET plus client-side mocked 503/403 (page.route; non-GET aborted). No create/seal/publish/save.
Preview is HEAD-equivalent for these screens: the served bundle (index-Bg1CpS5q) contains strings of the latest FE commits (causal_selection, PER_FOLD_STUDY, "retry original seal request", retry-atlas, data-back-to-current). S11/S12 files last changed in 8a6365dd; later commits do not touch them. Not byte-proven (no docker access).
Runs: WFO-023 (sealed rc_06GFFD…), WFO-027 causal (draft), P04-021/022 (no RC), P04-020 FAILED.

## S11 rows
| id | claim | status | evidence | note |
|---|---|---|---|---|
| 11-26 | FE invents `P22_${state}` codes | DONE | ReleaseCandidateDetail.tsx:2254-2272 `publicationStateWord` (state words + served blocked_reason only) | |
| 2_wiring S11 / F2 promotion_pick | pick state/trial/artifact unread | DONE (code), live UNVERIFIED | :788-850 PromotionPickNode | live RC has no publication, so only "promotion pick — not published" (S11/01-wfo); filled branch only by fixture |
| actor-local flags / seal retry verbatim / typed refusal after seal (F7c) | | DONE (code), live UNVERIFIED | :151, :1548 retry-seal-original, :1607-1640 ReadFailure retry | write paths not exercisable read-only |
| 11-08 | pack header wraps | DONE | :350 `.rc-packhead` space-between, one line (S11/01-wfo) | |
| 11-10/15/17, 8_sweep#5 | digests | PARTIAL | table and seal card short; record preview still prints full 64-hex wrapped (S11/01-wfo; mobile m02 char-wide column) | HiFi `sha256:3fe4a1…` |
| 11-03 | raw SEALED_LOCAL / NOT_DELIVERED | PARTIAL | compose shows words (:679,706); pack route identity card prints raw `SEALED_LOCAL` (S11/04-pack-wfo) | P3 TEXT |
| 11-28 | identity card stretches empty | DONE | S11/01-wfo | |
| D10 | 660 evidence table clipped | DONE / LEDGER_STALE | S11/w660-rc-wfo.png rows stack, scrollWidth 660 | |
| CG-FG-S11-02 | param_set_id + trial number | PARTIAL / BLOCKED_BY_BACKEND | trial shown on sealed ("retained trial 350 · global"); fixed-profile "selection not published" | B3#11 |
| VD-FG-05-04/08/09/10, 01-24/25/26 | decisions | DECISION_PENDING | mirror lists raw enum outcomes, pool "not published" (S11/01-wfo) | |
| S11-REAL lane / F3 X1 P22 publish stub | | OPEN (not run) | e2e/_preview-research-real-api.spec.ts:542-605 hand-built stub | BLOCKED on Codex OL-05 + candidate freeze |
| QA U1 sealed RC offers seal/edit, header DRAFT | | DONE | S11/01-wfo: header SEALED, no seal card/edit | |
| QA U3 Esc editor | | DONE | live 1 textarea -> Esc -> 0 | |
| QA U17 crumb raw rrun_ | | OPEN P3 | S11/02-notfound-run | |
| QA U19 record preview id after seal | | DONE | S11/01-wfo | |
| QA R-6/R-7/R-8 | server seal-block, param_set_id, source links | BLOCKED_BY_BACKEND | rows 1,10,12 no link | |
| VD-TEXT-01 | subtitle + rules footer | DONE (approved deviation) | S11/01-wfo vs S11/00-hifi-11 | |
| E1 ISO-ms (S11:1815,1980) | | LEDGER_STALE | times now minute precision "2026-10-01 13:44Z" | |

## S12 rows
| id | claim | status | evidence | note |
|---|---|---|---|---|
| CG-FG-S12-01 historical_identity bind | | DONE | EngineAtlas.tsx:1385-1410; foundationRoutes.tsx:247; hubStageAtlas.tsx:58; S12/07-historical | |
| "historical view: 3 empty tabs + footer" | | WRONG_IN_LEDGER / LEDGER_STALE | EngineAtlas.tsx:1623 hides tabs for HISTORICAL; live 0 tabs, "← current release", no footer | UX-6 fixed in QA wave |
| REQ-F historical facts body | | BLOCKED_BY_BACKEND | `atlas:null` for er_quantbt_108 | |
| AtlasNotPublishedFact lacks reason_code | | BLOCKED_BY_BACKEND | research-foundation.openapi.json:907 required [state, reason] | |
| 12-15 retry on 503, request id on 403/404 | | DONE | EngineAtlas.tsx:1678,1695; mock 503 -> "Read again" restores content (S12/13); 403 shows request id (S12/14) | |
| aria-controls on tabs | | DONE | :1638; roving tabindex, arrows work (S12/11) | |
| 7_root WHAT IT READS strip | | PARTIAL | tiny swatches + text chips (S12/01-modes) vs HiFi glyph strip (S12/00-hifi-12) | HIFI P3 |
| FG 12-02 release block overrun | | DONE | no overflow 1280/660/390 | |
| R-15 route deselect | | DONE | click adds `&route=`, click again removes | |
| walk_forward_status | | DONE by decision | tooltip only (EngineAtlas.tsx:150) | |
| trial_ceiling | | DONE | :1264 in collapsed Release facts, "4,000" | |
| UX-2 DECLARE drops mode | | DONE | -> `/runs/new?step=optimization&mode=mode_3_flat_minima&schedule=global` (S12/12) | |
| G7 §2.4 claims tab sideways scroll | | DONE | scrollWidth == viewport 1280/660/390 | |
| missing S12 visual baseline | | OPEN | e2e/research-loop.visual.spec.ts CELLS lack s12 (and S03 progress) | Bobby decides |
| VD-FG-01-27 tab replace vs push | | DECISION_PENDING (behaviour = replace) | tab/schedule/route clicks replace; Back leaves atlas | |
| VD-FG-01-29 404 EMPTY | | DECISION_PENDING | S12/08 | see N-S12-1 |
| VD-TEXT-01 | | DONE | subtitle/footer gone; "no cert cap" | |
| UX-18 Esc closes facts / aria-disabled | | OPEN P3 | invalid schedules are spans | not verified Esc |

## Ledger corrections
- B1 S11: D10, 11-08, 11-28 -> DONE; 11-10/15/17 -> PARTIAL (record preview); 11-26 -> DONE.
- B1 S12: 12-15, aria-controls, min-w overrun, R-15, UX-2, claims-tab scroll -> DONE; walk_forward_status -> DONE by decision.
- FRONTEND_GAPS §8 F1 "historical view 3 empty tabs + footer" -> LEDGER_STALE.
- F5 visual "no baseline S03/S12" -> still true.
- QA inventory S12 cert-cap/avoid-when -> rendered as "no cert cap", avoid-when line gone; S11 U1/U3/U19 -> DONE.

## New gaps
| id | sev | class | what | evidence |
|---|---|---|---|---|
| N-S11-1 | P2 | BUG/DATA | Sealed RC shows served "GATE VERDICT: local seal blocked — review evidence" (rendered :983-989) beside "SEALED LOCALLY" and a Publish button. Contradiction; hide when sealed or backend serves sealed verdict | S11/01-wfo |
| N-S11-2 | P2 | UX | FAILED run: normal compose screen with PARTIAL banner, 6/12 MISSING, RUN REPORT offered; never says run FAILED. Needs "run failed — nothing to release" with exit to Progress/Library | S11/01-fail |
| N-S11-3 | P2 | UX/TEXT | Not-found/denied run: distinct DENIED + request id + "← Run Library" (good) but then 3 "denied — nothing from this block" cards, ghost seal/publish/mirror cards, RUN REPORT button, raw id crumb | S11/02, 03 |
| N-S11-4 | P2 | UX | Cursor lost: hub `#stage=summary&fold=3` -> RC (link has no cursor) -> crumb "Evidence Flow" goes to `#stage=claim&fold=1` (DEFAULT_CURSOR, ReleaseCandidateDetail.tsx:46). Back/Forward themselves OK (hub fold=3 restored) | S11/10-12 |
| N-S11-5 | P3 | UX | Malformed pack id -> TERMINAL 400 "Reopen it from the run's evidence hub or report" but only "← Run Library" offered | S11/05 |
| N-S11-6 | P3 | A11Y | Touch targets under 24px: 24/32 (S11), 22/25 (S12) at 390 | t6 |
| N-S11-7 | P3 | HIFI | Mobile record-preview digests wrap in 1-char column | S11/m02 |
| N-S12-1 | P2 | UX | Unknown release_id 404: labelled "EMPTY", three dead tabs, no link to current release | S12/08 |
| N-S12-2 | P3 | UX | Unknown `route=` silently ignored; `#tab=zzz` silently modes | S12/10 |
| N-S12-3 | P3 | HIFI | Topbar crumb stops at "Research / QuantBT Backtest" on S12 (HiFi has run + "Engine Atlas"); VD-FG-01-17 | S12/01 |
| N-S12-4 | P3 | TEXT | Raw `HISTORICAL_IDENTITY_RETAINED`; Release facts dumps run-together raw keys | S12/07, 06 |

## Rubric verdict
| # | S11 | S12 |
|---|---|---|
| 1 source | PASS, except N-S11-1 | PASS (code gap is backend) |
| 2 HiFi/less text | PARTIAL | PARTIAL (reads strip) |
| 3 next step | PARTIAL (failed/denied dead ghosts) | PARTIAL (404 dead end) |
| 4 links/Back/cursor | PARTIAL: Back/Forward OK, cursor reset | PARTIAL: replace history, Back leaves atlas (decision) |
| 5 states | PARTIAL: no-RC, sealed, denied, 503 OK; FAILED not distinct | PARTIAL: 503/403/historical OK; 404 "EMPTY" |
| 8 mobile/keyboard | PASS no h-scroll 390/660/1280, Esc, focus rings; small targets | PASS; arrow-key tabs; small targets |
| 9 hard text | PARTIAL (server verdict, enum list) | PASS |

Not verified: contrast of the four approved ink/chip deviations, write paths, real-API lane. Preflight not run.
