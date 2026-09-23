# Audit P01–P05 — backend ↔ frontend ↔ HiFi, 2026-09-23

**Auditor:** Claude (frontend lead) · **Branch:** `docs/research-loop-plan` @ `30fb9f21`
**Mode:** read-only. No code was changed by this audit. Every fix below waits for
Bobby's approval.

There is no P00 in the Research board: the campaign starts at P01. "P0–P5" is
read here as **P01–P05**.

## 0. What P01–P05 were supposed to deliver

| Phase | Backend (Codex) | Frontend (Claude) | Screens |
|---|---|---|---|
| P01 | source/route/protected inventory, 15 HTML + 15 spec matrices | discrepancy review of the matrices | none |
| P02 | `research.run-request.v1`, `requested-spec.v1` (24 S02 controls), cursor codec | review; typed wizard/RC harness + `pick/trade/study` codecs owned by P10/P21 | none (S02/S11 later) |
| P03 | `research` schema, scoped role, repository, 3 refusal codes | state harness, query keys, fixtures, `ResearchPanel` | none |
| P04 | QuantBT 1.1.1 pin, 14-route Atlas, 4 capability axes | `atlas.ts` + Screen 12 composition | **S12 Engine Atlas** |
| P05 | sealed Parquet artifacts, Rust reader, 5-state vocabulary | `artifacts.ts` + `ArtifactPanel` | artifact panels (in S03/S04) |

## 1. How this was checked

- Every phase section of Unified §13, every packet, phase report, handoff,
  debt register and my own composition receipts for P01–P05.
- `node scripts/research-loop-v11/p01-baseline.mjs --verify` (read-only).
- Four generated contracts regenerated from their OpenAPI into a temp dir and
  diffed against the committed `.d.ts`: **all in sync**.
- Code graph: who imports each P03–P05 module in product (non-test) code.
- P02 field map (24 S02 controls) matched against the wizard's code.
- **Visual:** HEAD built, served by `vite preview`, S12 (three tabs) and the
  P03/P05 fixture lane captured at 1280 and 660 and read against
  `QuantBT 12 Mode Atlas.dc.html` rendered in Chromium at the same widths.
  Two extra browser probes: a `503` on S05 and a `401` on S12.
- Lane: `PRODUCT_ROUTE_BROWSER_RECEIPT` with fixtures. **No real API was
  called** — see §5.

Gates at HEAD: `vitest run` 2928 passed, 1 skipped; probe 77/77; tsc 0;
build 0; S12 and fixture lane 0 console errors, 0 px overflow at both widths.

## 2. Backend gaps (Codex)

| ID | Finding | Evidence | Impact | Recommendation |
|---|---|---|---|---|
| **B-01** | `GET /api/v1/research/quantbt/atlas` is declared twice: Python P04 (`routes_research.py`, bare `Atlas` document) and Control API P09 (`foundation.controller.ts`, `AtlasResponse` wrapper). | `p01-baseline.mjs --verify` fails: `actual static route collision(s): GET /api/v1/research/quantbt/atlas` | Today the gateway defaults to Control API, so the browser gets P09. But the documented one-line rollback `PORTAL_WEB_UPSTREAM=portal-api:8000` serves the P04 shape: `response.atlas` is undefined, so **S12 and S02** (which read `trial_ceiling`, `optimizer_defaults`, `submission_constraints`) break silently. | Retire or rename the Python route; re-run P01 `--write` + `test-p01-baseline.sh`; note in the rollback runbook that Research reads are Control-API-only. |
| **B-02** | P01 baseline captured 2026-09-19 (180 routes) and never re-captured, although P01's own rule requires `--write` in the same change whenever a captured root changes. Every later phase — mine included — changed those roots. | `baseline.json` `source_capture_commit a402f7b`; rule text in §13 P01 | The P01 gate is no longer a live check; B-01 went unnoticed because of it. | Bobby/Codex decide: make P01 an explicit point-in-time capture, **or** run `test-p01-baseline.sh` in each phase gate. |
| **B-03** | Artifact vocabulary split: P05 froze `WRITING/SEALED/CORRUPT/MISSING/ABORTED`; the P11 progress contract publishes `PENDING/WRITING/SEALED/ABORTED`. | `artifacts.ts:20` vs `research-progress.d.ts:111` | A post-seal `CORRUPT`/`MISSING` artifact can never reach S03; `PENDING` is not in P05's set. One concept, two vocabularies. | Publish `CORRUPT`/`MISSING` on the artifact reader (or state they belong to a later reader contract) and add `PENDING` to P05's documented set. |
| **B-04** | S12's central HiFi interaction has no data. `AtlasMode` publishes `objective_summary`, `suspect`, `rules`, schedules — but not the **objective formula + term table** (J₁ = S̄_OOS − λσ_d − γ·max(0,d̄), with release-bound λ, γ), the **schedule → claim mapping** (validation / chronological claim per mode × schedule), the **cert cap** per mode × schedule, the OOS-use status, the **"what it reads"** data-use descriptor, or **"avoid when"** for the spec's mode table. | `research-foundation.d.ts:138`; spec 12 §2, T02, T03 | Spec 12 rule one — "click the schedule chips and watch the claim change" — cannot be built. S12 today shows static schedule chips. | One `CG-P04-01` request: publish those per-mode × schedule facts in `AtlasMode`, or rule them out. |
| **B-05** | P02 cursor codec vs spec 04 §3 disagree: the codec (12 keys, opaque identifiers, unsupported keys are typed errors) has no `stage`; spec 04 needs `stage` and writes `fold`/`trial`/`seq` as integers. | `P02/cursor-codec.md`; spec 04 §3 | The frontend implemented both, differently (F-01). | Codex/Bobby rule: admit `stage` as a presentation-only key and fix the value types. |
| **B-06** | P02–P05 debt registers still show downstream gates at their original state (e.g. `P02-DG-02 NOT_STARTED` though P04 closed it; `P04-DG-03`, `P05-DG-02` never updated). | `evidence/P0x/debt-register.json` | A reader of the register sees open gates that are closed — and `P05-DG-02` is marked `HANDOFF_READY` though its consumer is not actually wired (F-07). | Append a closure note per gate. |

Not a gap: generated contracts are in sync with their OpenAPI; the P03–P05
backend receipts record `PASS` for their declared scope; the boundary sweep
(no lease epoch / worker identity / work digest in the browser) still passes.

## 3. Frontend gaps (Claude)

| ID | Finding | Evidence | Impact | Recommendation |
|---|---|---|---|---|
| **F-01** | **Two cursors.** `foundationClient.ts` (P09) implements the P02 codec faithfully — 12 keys, opaque ids, `seq`/`event_seq` agreement. `evidenceCursor.ts` (S04–S07) has 7 keys, coerces `fold/trial/seq` to integers and **silently drops** unknown or duplicate keys. | both files; codec rule 1 | A link carrying `study`, `pick`, `trade`, `event_seq`, `mode` or `playback_ordinal` into S04–S07 loses them; a non-numeric trial id is dropped. S00 → S04 → S00 does not round-trip. | One shared codec module (P02 exact) used by S00 and S04–S08; `stage` added once B-05 rules. |
| **F-02** | **Retry is swallowed.** S04–S07 pass a "reread" action, but `ResearchPanel` renders actions only in `available/stale/partial`. | browser: S05 on `503` → **0 retry buttons** | On `unavailable` the reader's only way forward is a manual page reload. | Give `ResearchPanel` a separate `recovery` slot shown in `unavailable`/`failed-retryable`/`stale`, leaving the FE-P03-01 rule for content actions (Export) intact. |
| **F-03** | **No re-auth path on `401`.** Research clients use raw `fetch`, map `401` to `denied`, and show the server text. | browser: S12 on `401` → **no sign-in affordance** | State semantics v1: `denied` must "render a permission/reauth path". Today it is a dead end. P03 also requires session recovery through existing flows. | On `401`, hand over to the existing `AccessProblemScreen` `SESSION_EXPIRED` flow (reuse, not a new screen). |
| **F-04** | **Denied copy leaks existence.** `state.ts:69` — "This object belongs to a workspace you are not a member of." | fixture lane screenshot | Confirms the object exists and belongs to someone else — the exact thing P03 says `denied` exists to hide. | Neutral copy: "You don't have access to this in your current workspace, or it doesn't exist." |
| **F-05** | **Five copies of one refusal mapper**, all by HTTP status only, all rendering raw `error.message`. | `toLibraryRefusal`, `toEvidenceRefusal`, `toSplitRefusal`, `toSearchRefusal`, `toFreezeRefusal` | Handoffs P12/P15: "never show raw server messages". Admission saturation (`503 RESEARCH_ADMISSION_SATURATED`) reads as `unavailable`, not P03's `failed-retryable` — the distinction P03 made on purpose. | One `toResearchRefusal()`: P03 code table first, contract problem codes second, status last; fixed copy on screen, server text only in details. |
| **F-06** | `queryKeys.ts` (P03) is imported by no product code. | import graph | P03's actor/workspace/revision keys and auth-switch cache clearing were never wired. Low impact today: one workspace, no selector, logout unmounts. | Decide: wire when a workspace selector ships, or record an explicit deferral. |
| **F-07** | `ArtifactPanel` (P05) is used **only by the fixture lane**. S03 renders artifacts with its own code. The P05 receipt says it is "used by Run Progress and Evidence Flow" — false. | import graph | Two renderers for one concept; the P05 rules (three facts for export, no `READY`) are not enforced where artifacts actually appear. | Correct the receipt now; after B-03, make S03 use `ArtifactPanel` over the reconciled vocabulary. |
| **F-08** | P04 receipt still says S12's data lane is "typed inactive"; P09 has mounted it. | P04 composition receipt | Stale claim. | Docs correction. |
| **F-09** | **S12 vs spec/HiFi.** Tabs read `MODES/ROUTES/CLAIMS`; spec 12 fixes "WFO modes · Execution routes · Claims by contract" verbatim (T10 copy diff ≠ 0). No breadcrumb "Evidence Flow / Engine Atlas". No "OPEN SEARCH & SELECTION →" although S06 now exists (T03). Hash writes only `#tab=`, dropping `mode=`/`route=`. The mode table "when to reach for which mode" is absent. Published release facts not rendered: `optimizer_defaults`, `submission_constraints`, `trial_ceiling`, native package version. | screenshots `s12-*` vs `hifi-12-*` | Copy and navigation gaps a reviewer sees at once; release facts a researcher needs are hidden. | Copy + breadcrumb + deep link + full hash; a release-facts panel; the mode table with "use when" (and "avoid when" after B-04). |
| **F-10** | S02 against the P02 field map: 8 of 24 controls have no UI — intrabar ×3, portfolio sizing, reactive ×2, DCA base order, walk-forward `split_mode`/`window_mode`. `routeParams` is always `{}`. | field-map match | Low for route params today (those routes are not admitted). **Not low** for walk-forward: the advanced protocol sends `split_mode`/`window_mode` with no control — the HiFi has a rolling/expanding toggle. | Owned by P10's screen; recorded here because P02's map is its denominator. Expose `window_mode`/`split_mode`; route sub-forms when routes are admitted. |

## 4. HiFi deviations to approve (deliberate, not bugs)

| ID | HiFi | Built | Why |
|---|---|---|---|
| D-1 | S12 routes: one STATUS word (`RUST`, `OK`, `6/9`, `EXP`) | four axis chips + reason | P04 rule: the four axes stay four facts; one word hides who owns the gap. The HiFi table also clips at 1280. |
| D-2 | S12 per-route `declare →` / `replay parity →` | not shown | no such action is published |
| D-3 | S12 per-mode `OPEN DEMO →` | not shown | demo lanes may not share a product route |
| D-4 | S12 Rule One in gold | accent blue | proposal: return to the HiFi's gold — it is a claim warning, not an accent |

## 5. The visual lane Bobby asked about

All visual evidence so far is fixtures in a local preview (`P01-GAP-03` is still
open: "no Research real-build/browser evidence"). Two ways to see the real
thing:

| Option | What | Needs | Gives |
|---|---|---|---|
| **A — preview domain** | Build HEAD; serve the Research routes with the fixture stubs on a temporary subdomain behind Cloudflare Access | Bobby: DNS + tunnel approval | Bobby and I review the same pixels; still fixture data |
| **B — real API** | Dev stack with `FEATURE_RESEARCH_*` on, disposable Postgres seeded from the phase receipts | Codex: seed + flags; Bobby: approval | the first `REAL_API_E2E_RECEIPT`; exposes B-01-type integration faults fixtures cannot |

Recommendation: **B**, with A as a same-day stopgap if B needs time.

## 6. What needs whom

**(a) Bobby decides**
1. B-01 — retire the Python atlas route (touches the rollback runbook).
2. B-02 — P01 baseline: point-in-time, or a per-phase gate.
3. F-06 — wire query keys now or defer explicitly.
4. D-1…D-4 — approve the HiFi deviations.
5. §5 — visual lane A and/or B.

**(b) Claude, after approval** — in this order, one commit each:
1. F-04 denied copy · F-02 recovery slot · F-03 re-auth path · F-05 shared refusal mapper — the cross-cutting truth/UX fixes, every Research screen benefits.
2. F-01 one cursor codec (after B-05).
3. F-09 S12 corrections + release-facts panel.
4. F-07/F-08 receipt corrections; S03 on `ArtifactPanel` after B-03.
5. F-10 walk-forward controls (coordinate with the P10 owner).

**(c) Codex**
1. B-01 duplicate route · B-02 baseline rule · B-03 artifact vocabulary · B-04 Atlas mode facts (`CG-P04-01`) · B-05 codec ruling · B-06 register closures.
2. §5 option B seed + flags, if approved.

## 7. Not claimed

No fix was made. No backend was called. No visual baseline was re-recorded.
Fixture screenshots are evidence of composition, not of real data.
