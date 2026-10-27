# Browser review rounds — summary and freeze proposal (27 Oct 2026)

Lane `claude/post-canonical-20261027` @`e946dd6d8`: Codex canonical `be2c527c3` + 27 Claude commits (fast-forwardable). Preview bundle reviewed in round 5: `index-BZKL1Jiy.js`.

## Rounds

| Round | Date | BLOCKER | Main finding |
|---|---|---|---|
| QA1 | 23 Oct | many | missing data, overflow, fonts |
| QA2 | 24 Oct | 13 | one fact with several values, dead links, `undefined` titles |
| QA3 | 24 Oct (canonical world) | 27 | orders/exposure/marks, canary identity, wall-clock leaks, ticket ids |
| QA4 | 27 Oct | 25 | stage lineage, order ids, drawdown, people, approvals |
| QA5 | 27 Oct | 24 (R1 7, R2 3, R3 5, R4 6, R5 3) | stage pages vs alpha page, timeline order inside pages, Overview deep links, approval capital |

Fixed and verified by independent reviewers in the DOM: ticket ids gone from V2 text; no `undefined` / `ACCOUNT_NOT_FOUND`; one deployment id (`dep_canary_01`); one clock (no future dates); Core NAV / allocated / drawdown tie across register, 360, Capital panel; Compare numbers; closed approvals offer no decision; layout clean at 1440 / 1024 / 660 on all 53 routes; Operations cards below 1100px; Cmd K finds portfolios, people, approvals, incidents.

## What is left (all fixture-world coherence, none is a contract or real-API defect)

1. Stage pages vs the alpha page (Paper/Sandbox "current" or RUNNING on pages for stages the alpha already left; Basis B canary room vs finished canary; SX-14 sandbox record carrying the canary's figures).
2. Times inside one page (replay fills before submits; fill after the page's as-of; blotter vs replay times for the same order).
3. Overview deep links (Verify / Investigate / Review land on missing or different entities; `dep_88`; 57/182 vs 41/72).
4. Approval AP-352 shows two capital worlds (270,000→295,000 and 350,000.50→375,000.50); AP-118/AP-152/AP-311 provenance links.
5. Per-alpha drawdown shape (saw-tooth) and some repeated figures (exposure, fees).
6. Marks on Account 360 positions (BTC 165,000 vs 66,470) and "Whole account" figures that differ by sleeve.
7. Small items: Users last-seen depends on filter, environment labels on Operations, board lane header "10 of 9", raw ids in a few titles.

## Why the count is not dropping faster

The doubles for stage pages, blotter, replay, approvals and account were written separately and each now reads some world facts but still builds other facts itself. A fix in one double reveals the next mismatch to a deeper reviewer. Patching double by double converges slowly (27 → 25 → 24).

## Proposal (needs Bobby's decision)

A. Freeze this candidate now: record visual baselines once, run the full test suite, re-pin N29 / EDS-12, update the debt ledger and this list as owned debt, hand the SHA to Codex for the single gate and ff-only landing. Nothing is lost; canonical gets all improvements.

B. Then, as a separate step with its own receipts: rebuild the stage / blotter / replay / approval doubles so every body is computed from `bffWorld` only (no hand-written constants), with generated cross-page ties. This is the structural fix for items 1–6.

Recommendation: A then B.
