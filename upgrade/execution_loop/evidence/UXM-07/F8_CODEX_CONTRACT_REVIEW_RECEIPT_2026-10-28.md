# F8 — review of the contracts and packets Codex delivered 23–28 Oct 2026 (Claude receipt)

Supersedes the F8 row of `BE-CLAUDE-2026-10-20/F1_F9_CLOSURE_2026-10-21.md` for everything delivered since. Lane `claude/step-b-integrate`, frozen `9054bd410` on canonical `1a6c2012d`. Levels follow the shared rules: ACCEPTED or CHANGES_REQUESTED per item; fixture success is not real-API acceptance.

## 1. Delivered by Codex, read, consumed, verified

| Item (source) | Claude disposition | Evidence |
|---|---|---|
| Six backend support packages: linked fixtures, timing, visit digest, accounts counts, contributors paging with group attribution, scoped portfolio names/finance (`SIX_BACKEND_SUPPORT_PACKAGES_2026-10-23.md`, `CLAUDE_SIX_PACKAGES_INTEGRATION_HANDOFF_2026-10-24.md`) | ACCEPTED at fixture + code level; real-source parts (accounts financial carrier, group Return/Score, order VWAP/slippage) remain Edge/Core requests | consumers integrated earlier in the campaign; reader conformance tests; world ties; the reader guard below |
| `executionFullBlotterV1` server-side scope (`deployment_id`, `account_id`, `alpha_id`, `stage`; N22 refusal for non-PAPER stages) | ACCEPTED, now consumed: V2 blotter sends the scope, prints the scope's own population, says the refusal in words; fixture filters before paging | `claude/b-b1` squash merged; `blotterPath.test.ts`, blotter screen tests (142), tie W23 (111 checks), reader guard W116 |
| FE-069 alpha catalogue `researchRunLibraryAlphaCatalogueV1` (`CLAUDE_FE069_PAGINATION_HANDOFF_2026-10-27.md`) | ACCEPTED at fixture level; CHANGES_REQUESTED to Codex: publish a negative fixture (only one valid body is published, so the negatives are mutations of it); backend `feafe56a` still has to be in the running image | `FE069_CONSUMER_RECEIPT_2026-10-28.md` (reader 55 conformance tests, traversal/fence tests, route and picker wiring) |
| Research-stage alpha fixture fix `78b0a8477` / `837eae444` / integration `0c3441a5f`, `aea2501be` | ACCEPTED, adopted unchanged in meaning: an alpha with no deployment keeps `stage RESEARCH`, `stages ["RESEARCH"]`, a readable resource; `alpha_e` aligned | `researchAlphaStage.test.ts`, tie W38 (all query shapes), `alpha_e` rule; commit `d38045a19` |
| Test-cell repairs Codex made on its candidate: `control-api-test.sh` copy list (`v2/readers/stageFactViews.ts`), Contributors paging spec memoisation | ACCEPTED, applied | hook `9054bd410` passed |
| Discovery V2 lossless wire (`f6d16cc30`), STATUS/custody, financial graph slices | read; not consumer-facing for the V2 screens; no change requested; they remain source-only and Core/Edge qualification lanes | `CORE_EDGE_V2_FIXTURE_FOLLOWTHROUGH_2026-10-28.md`, `CORE_SEVEN_PACKAGE_FOLLOWTHROUGH_2026-10-28.md`, `CORE_TO_EDGE_CONSUMPTION_ACK_2026-10-28.md` |

## 2. Published by Codex or by the WP-K lane, not yet consumed by a screen (found by the scout, `getSibling`)

Fourteen sibling reads published by Claude's WP-K lane (controls, obligations, portfolio-members, account-profile, alpha-readiness, reconciliation, limits, cost-events, report-snapshots, recovery-events, grants, command-receipt, order-detail, blotter-summary) are served by the fixture BFF (`wpkSiblings`) and have a port method (`getSibling`) but no V2 screen calls them. `GET /deployments/{id}/equity-projection` (equity, drawdown, approved band) has a contract but no fixture producer, no port method and no screen. These are FE wiring slices (Forward/Cost bars, Archived list, Ready-for-exit KPI, drawdown strips), listed in the debt ledger of `FROZEN_CANDIDATE_HANDBACK_2_2026-10-28.md` / `_2_`.

## 3. Requests back to Codex raised by this review

1. Approval rows: publish a subject **type** next to `subject_id` (alpha vs deployment), so the row can link.
2. Rooms, incidents and queue rows: a "view of / variant of" member for fixture variants (`dep_live_01_mismatch`, `_gap`, `_stale`, `_dark`).
3. FE-069: a published negative fixture for the alpha catalogue; landing of `feafe56a` in the running image.
4. Evidence banner: a published place for the queue row's `blocker_summary` on the gate frame.
5. Equity projection: a producer (or an explicit "no producer" decision) for `GET /deployments/{id}/equity-projection`.
6. Workbench request-order case (`workbench.requests.test.tsx`): not reproduced on this tip (20 isolated and 3 wide runs); keep the full failure output if it recurs.

## 4. What this receipt does not claim

Real READ/STREAM, financial proof, STATUS gateway, calibration/G2 and connected browser acceptance are Codex/Edge/qualification lanes and are not PASS. No screen was checked against a real source.

## 5. Browser journey on the frozen tip (the check Codex asked for)

`node scripts/fixture-journey.mjs --build --scenarios positive --sweep 40` on `9054bd410` (local loopback stack, not the preview): 10 screens followed through real DOM links (Overview, Fleet, Portfolio, Alpha 360, Account, Deployment, Approval, Operation, Incident, audit): 0 horizontal overflow at 1280 and 660, 0 bad API responses, 0 console/page errors, back-links return. The Approval step now reaches `/governance/approvals?sel=EX-803` through the V2 hub (the earlier NO_LINK_FOUND is gone; this is a hub selection, not proof of a deployment-to-approval relationship). Link sweep: 40 of 92 detail links followed, 0 failed (52 not followed: the walker's sweep cap). World ties on the served bodies: 121 checked, 0 mismatches, 2 skipped (DOM P5 `alpha_a` not on the first Fleet page; DOM P8 the Live page lists no order id; was 6 skipped on Codex's run). DOM guards: jargon 0, stamps 0, dead 0, dual 0, later 2 (the sweep's `/governance/approvals/:id/live` pages print an instant equal to the world clock, 12:04Z, which the guard counts; the walker reports no problem, not independently classified). Positive scenario only: denied/stale/empty/missing/zero scenarios were not run. Raw result kept outside Git: `/home/bobby/.local/state/portal-claude-evidence/20261028/FIXTURE_JOURNEY_FROZEN_9054bd410.json`, SHA256 `e21aa424cf1b0b49732af0f830de4093d70059dd7bd575a9b55f0fb77467bf04`.
