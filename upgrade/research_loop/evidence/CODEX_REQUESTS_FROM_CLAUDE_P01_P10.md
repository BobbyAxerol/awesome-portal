# Requests to Codex — P01→P10 backend gaps (RF-03), 2026-09-23

From Claude's round-2 audit
([AUDIT_P01_P10_CLAUDE_2026-09-23.md](./AUDIT_P01_P10_CLAUDE_2026-09-23.md),
evidence and file:line for every item) and Unified §13 **RF-03**. Every request
below blocks or degrades a HiFi element on a screen that is already built
(00, 02, 03, 05, 12, 14). Screens 08–11 and 13 are out of scope.

Nothing here is worked around in the product: until a request is answered the
screen shows `not published` with the reason, never a guessed value.

## Prompt for Codex (Bobby pastes this)

```text
Codex — RF-03, Research Loop backend repair P01–P10.

Read, in this order, before changing anything:
1. upgrade/UNIFIED_IMPLEMENTATION_PLAN.md §13: board rows RF-03 and RF-04, then
   the "RF-03" section (goal, to-do, exit gate).
2. upgrade/research_loop/evidence/AUDIT_P01_P10_CLAUDE_2026-09-23.md — §1 headline,
   §2 your phases (P02, P04–P10, P11 dependency), §5 decisions Bobby has answered.
3. upgrade/research_loop/evidence/CODEX_REQUESTS_FROM_CLAUDE_P01_P10.md — the
   request list (this file). Each item: what is missing, where (file:line),
   which HiFi element it blocks, done-when.
4. For each phase you touch, re-read its own packet (evidence/Pxx/README.md,
   phase-report.md, debt-register.json) and the P01–P05 audit so the fix does not
   undo an accepted decision.

Then:
- Review first: CG-RF02-06 (Claude's RF-01/RF-02 backend commits),
  CG-RF02-02 (5b2cf660), CG-RF02-04 (12750366). Record accept / change in the
  RF-02 packet.
- Fix the bugs (CG-P02-01, CG-P06-04, CG-P06-05, CG-P10-03, CG-P10-06) and the
  stale descriptor availability (CG-P09-03).
- For every contract item: change OpenAPI/zod/schema, regenerate
  packages/contracts/generated, add fixtures, and declare it in this file:
  status → DELIVERED with commit, the generated type name, and one example
  response. A fact the engine cannot supply is declared NOT_PUBLISHED with a
  typed reason and a source locator — never a sample value.
- Where a request needs Bobby (DQ-03, DQ-05, DQ-07, DQ-10, DQ-11), wait for his
  answer in AUDIT §5; do not pick for him.
- Work on branch docs/research-loop-plan (never dev/main), commit per request
  (code / docs split), push origin + primus-origin, update the RF-03 board row
  with commits and the list of DELIVERED ids. Claude consumes each delivered
  contract in RF-04 and takes the real-API receipt on the research-portal preview.
```

## Status legend

`OPEN` not started · `DQ` waits for Bobby (AUDIT §5) · `DELIVERED <commit>`
declared and generated · `CONSUMED <commit>` Claude has rendered it.

## Review requests

| Id | What | Status |
|---|---|---|
| `CG-RF02-06` | Review Claude's backend work under RF-01/RF-02: route gate `e5daa7e2`, Python public Atlas removal `a0d0004d`, cursor codec v2 `c7cc1ceb`/`dbe569e8`, `retained_artifacts` `c0166746`, Atlas facts + every QuantBT 1.1.1 locator `d67a0fb4`, walk-forward options `99d5b2a5`, `config_digest` `996eef6c`, preview auto-login `6a87f77b`. RF02-B1's exit said "reviewer checks each locator" and no review is recorded | ACCEPTED · [RF-03 review](./RF-03/README.md) |
| `CG-RF02-02` | Durable consumer survives idle fetch timeout — `5b2cf660` | ACCEPTED by code review · NATS image test pending |
| `CG-RF02-04` | Producer timeline starts at warmup — `12750366` | ACCEPTED · warmup ingress regression |
| `CG-RF02-01` | Narrow seccomp/AppArmor profile for the P06 namespace child (preview runs unconfined) | OPEN |

## P02 — requested spec

| Id | Gap → need | Blocks | Done when | Status |
|---|---|---|---|---|
| `CG-P02-01` | Generated `RequestedSpec` (`research-preflight.d.ts:348`) makes `$defs` required; `preflight.contract.ts` is `.strict()` → 400. Remove `$defs` from the wire type | S02 preflight on the real API | generated type has no `$defs`; a payload built from the type passes preflight | DELIVERED `3bb91fa5` · `research-preflight.d.ts:RequestedSpec` |
| `CG-P02-02` | Fields for purge / embargo / label horizon, inner folds (`inner_split_frequency`, `inner_window_mode`, `inner_train_window`) and rolling train width (with P04/P08) | S02 advanced WF, rolling toggle; S05 purge/embargo/inner folds | requested-spec v-next + preflight admission; unsupported values refused with typed reasons | OPEN |
| `CG-P02-03` | Capital / fee / slippage / sizing target | S02 review row | only if Bobby keeps it (DQ-12) | NOT_PUBLISHED · Bobby DQ-12: leave assumptions row out until versioned requested-spec facts exist |

## P04 — engine catalog / Atlas

| Id | Gap → need | Blocks | Status |
|---|---|---|---|
| `CG-P04-02` | `mode_1_decay × per_fold_causal` absent from `research-engine-catalog.v1.json:343` though QuantBT 1.1.1 supports it (`walkforward.py:532-545`) — publish it, NOT_ADMITTED with reason if inner-fold fields are missing | S12 Rule One, default chip; S02 schedule options | DELIVERED `57cf04ee` · `research-foundation.d.ts:AtlasMode.invalid_schedules` · `{schedule:"per_fold_causal",admission:"NOT_ADMITTED",reason:"...inner_split_frequency...",source:[...]}` |
| `CG-P04-03` | Reason per invalid schedule (`invalid_schedules[{schedule, reason, source}]`) | S12 struck chips "with the reason" | DELIVERED `05b4e96c` · `research-foundation.d.ts:AtlasMode.invalid_schedules` · all 15 mode×schedule pairs partitioned into admitted or sourced `NOT_ADMITTED`; example `{schedule:"per_fold_decay",reason:"...requires mode_1_decay...",source:[...]}` |
| `CG-P04-04` | `oos_use` 4 states + n/a (selection input · withheld until S4 · retrospective · report only) | S12 claim block, S02 claim forecast | OPEN |
| `CG-P04-05` | `cert_cap`, `avoid_when` typed only as NOT_PUBLISHED: rule they stay unpublished for 1.1.1 (and say so in the contract doc) or allow a value | S12 cap chip, S02/S05 cap | NOT_PUBLISHED · QuantBT 1.1.1 has no per-mode cert cap or avoid-when guidance; `AtlasNotPublishedFact` reason + cert source locator; see RF-03 packet |
| `CG-P04-06` | Route description, method (wfo/tape), status word, resolved backend, arbitrage per-spec matrix, `route_params` option lists | S12 routes tab, S02 route grid + 4 route forms | OPEN |
| `CG-P04-07` | Claims certification qualifier + locators; objective term meanings; mode 2–5 weights | S12 claims tab, term table | OPEN |
| `CG-P04-08` | Engine sub-stage vocabulary for the S03 stepper | S03 11-pill stepper | NOT_PUBLISHED · Bobby DQ-04: five contract stages only; no 11 engine sub-stage source |

## P05 — artifact authority

| Id | Gap → need | Blocks | Status |
|---|---|---|---|
| `CG-P05-01` | No runtime writer registers `research.artifacts`: worker seals into the legacy store (`durable_worker.py:27,295,342`); `reserveArtifact`/`sealArtifact`/`createArtifact` have no caller; RS-02 seal table is not what `progress.repository.ts:363` reads. Widens `CG-RF02-03` (no retention materializer; current-source stays `PENDING_RETENTION`) | S03 artifacts/retained tables; S04–S07 current-source lanes | OPEN |

**RF-03 P05 checkpoint (2026-09-23, source-dark):** The P10 fixed Delta worker now has a private signed, exact-lease reserve/seal path into `research.artifacts`. It writes an immutable one-row `run_receipt` Parquet part and bounded receipt document on the durable artifact volume. Exact retries verify and reuse the manifest; failed or expired leases abort only WRITING metadata. Both flags default false. This is real S03 retained evidence, **not** RS-02 Advanced-WFO observations/folds/trials/candidates/selection. S04–S07 stay `PENDING_RETENTION` until P10 admits that profile and the RS-02 importer is wired, so `CG-P05-01` remains OPEN for its full exit. Focused proof: Control API build, ingress/config 22/22, Python 35/35, disposable PG P05 5/5 and P11 10/10, P01 route ledger 227/no collisions. No runtime activation.

## P06 — scheduler / worker

| Id | Gap → need | Blocks | Status |
|---|---|---|---|
| `CG-P06-01` | Attempt/queue read: ordinal, state, `started_at`/`ended_at` (open since P06, never on the board) | S03 attempts drawer, queued state | DELIVERED `390f179a` · `research-progress.d.ts:ProgressQueue/ProgressAttempt`; `{queue:{queue_class:"INTERACTIVE",queued_at_utc_ms:0,retry_not_before_utc_ms:null},attempts:[{ordinal:1,state:"CANCELLED",claimed_at_utc_ms:0,started_at_utc_ms:0,ended_at_utc_ms:0}]}`; 8-row bound, immutable scheduler-event times; generated fields optional for additive FE rollout, server emits them |
| `CG-P06-02` | Progress channel from the running child (today Popen → wait → terminal receipt only) | S03 live console, tqdm, Gantt fill, cursor | OPEN |
| `CG-P06-03` | Caps 45 CPU-s / 90 s wall vs a real walk-forward | any non-trivial run | APPROVED_PENDING_MEASUREMENT · Bobby DQ-11 |
| `CG-P06-04` | Bug: float `cpu_seconds` dropped → usage 0 (`durable_worker.py:716-727`) | S03 budget, usage | DELIVERED `b0277b4f` |
| `CG-P06-05` | Bug: budget/wall kill classified `CAPABILITY_MISMATCH`, code lost (`research_run_producer.py:280-281`, `durable_worker.py:626-640`) | S03 FAILED verbatim error | DELIVERED `b0277b4f` |

## P07 — alpha import

| Id | Gap → need | Blocks | Status |
|---|---|---|---|
| `CG-P07-02` | v1 file contract (literal `ALPHA_CONTRACT` + one function) vs the HiFi's class/dataclass module | S14 anatomy, entrypoint card | NOT_PUBLISHED · Bobby DQ-05: v1 literal ALPHA_CONTRACT and one function; class/dataclass not a published parser variant |
| `CG-P07-03` | Mirror: add `version`; HiFi's 14 fields where the source has them; per-field check verdict + note | S14 mirror table | OPEN |
| `CG-P07-04` | Gates: `RUNNING`, analyser time per gate, `QUARANTINED_*` codes, parse `expires_at`, declared digest to verify | S14 pipeline card | OPEN |
| `CG-P07-05` | `RegistryEntry`: `supersedes`, display name, `strategy_id`, `warmup_bars`, `required_columns`, full digest | S02 context/strategy/data steps, S14 registry strip | DELIVERED `a1926f25` + `349657bb` · `research-alpha-import.d.ts:RegistryEntry/AlphaVersionDeclaration`; `{supersedes:null,supersedes_state:"RECORDED",display_name:"Alpha demo",strategy_id:"alpha-demo",warmup_bars:32}`; historical predecessor is typed `HISTORICAL_NOT_RECORDED` |
| `CG-P07-06` | `may_activate` is actor permission; combine with typed lifecycle DRAFT for first-activation affordance; ACTIVE exact replay remains idempotent | S14 activate affordance | DELIVERED `8f0c4c4e` · `research-alpha-import.d.ts:RegistryEntry`; [RF-03 ruling](./RF-03/README.md) |
**RF-03 P07 registry checkpoint `a1926f25` (2026-09-23):** The list now emits database-backed `display_name`, `strategy_id=alpha_id` (approved DQ-07), full `source_digest`, and source-validated `declaration.required_columns/warmup_bars`; the AST mirror adds literal `version`. Generated `research-alpha-import.d.ts:RegistryEntry/AlphaVersionDeclaration` fields are additive during FE rollout; current server emits them. Canonical example: `{display_name:"Alpha demo",strategy_id:"alpha-demo",source_digest:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",declaration:{required_columns:["open","high","low","close","volume"],warmup_bars:32}}`. `CG-P07-05` is DELIVERED by migration `0057`: new versions retain registration-time supersession; pre-migration rows are typed historical-unknown. `CG-P07-03` remains OPEN for the unverified 14-field mirror. Proof: parser 9/9, P07 disposable PostgreSQL 9/9, contracts 5/5, Control API build, frontend TypeScript and full pre-commit 117/117 files, 813/813 tests. P07/P08 warmup ceiling is aligned at 100000 (`348632e5`); no activation/runtime changed.


## P08 — data / preflight

| Id | Gap → need | Blocks | Status |
|---|---|---|---|
| `CG-P08-02` | Rolling window mode (train width, with `CG-P02-02`) | S02 toggle, S05 rolling | OPEN |
| `CG-P08-03` | Per-gate preflight list; typed reasons + `field_path` when `may_create_run=false`; `field_path[]` on 400 | S02 preflight result, error → step | OPEN |
| `CG-P08-04` | Research dataset catalog (id, symbols, timeframes, availability) | S02 dataset select | OPEN |
| `CG-P08-05` | Preflight checks trial ceiling, `seed_required`, declared bounds, sweep ceiling | S02 rules enforced server-side | OPEN |
| `CG-P08-06` | S05 foundation facts: per-window gap scan, holdout seal record (DR-01), holdout cap; advanced `sealed_holdout` | S05 holdout + gap scan | OPEN (→P14) |

## P09 — journey / atlas foundation

| Id | Gap → need | Blocks | Status |
|---|---|---|---|
| `CG-P09-03` | Descriptor availability: New Run, Run Progress (and every mounted screen) → `AVAILABLE` | S00 cards show SOON on working screens | DELIVERED `ea221dc2` · FE route-map consumption pending |
| `CG-P09-04` | Descriptor v2 = HiFi 00 (8 phases, 28 actual HiFi cards, names verbatim), schema: `revision` integer, `maxItems` ≥ 12, mapping table, `target_fragment`, `requires_run`; new migration row | S00 whole map | DELIVERED `ea221dc2` · `research-foundation.d.ts:JourneyResponse` |
| `CG-P09-05` | Atlas contract fixes 14/5/7 while the manifest allows 32/8/16 | S12 T06 | DELIVERED `ea221dc2` · `research-foundation.d.ts:Atlas` |
| `CG-P09-06` | Historical release returns 1.1.1 facts under a 1.0.8 label | S12 historical chip | DELIVERED `ea221dc2` · `research-foundation.d.ts:AtlasResponse` |
| `CG-P09-02` | Canonical fixtures for journey/atlas/preflight | fixture lanes | DELIVERED `5069b39a` + `b1afae0c` + `1f8fbac9` · generated `research-foundation.d.ts:JourneyResponse/AtlasResponse`, `research-preflight.d.ts:ResearchPreflightV1`; canonical Journey v2, current/historical Atlas and producer-tested preflight response fixtures |

## P10 — run creation / producer

| Id | Gap → need | Blocks | Status |
|---|---|---|---|
| `CG-P10-02` | Create admits only the fixed Delta profile (`run-admission.service.ts:109-128,165-176`); imported/DRAFT av_, overrides, trials > 1, advanced WF, 12 routes all refused. Adapter ownership conflicts (P07 says P10, P10 says P12/P19) | S02 real creation beyond the fixed profile; S14 → S02 | APPROVED_PENDING_IMPLEMENTATION · Bobby DQ-11 |
| `CG-P10-03` | Imported av_ gets `PREFLIGHT_NOT_READY` "no longer available" — return the real code (adapter unavailable / not active) | S02 refusal text | DELIVERED `f8217217` |
| `CG-P10-04` | Producer emits no progress facts: `fold_segment_observed`, `eta_s`, rate, `budget_tick`, claim + cursor on `run_completed`, all bundle files journaled; `tqdm_line`/`overall_pct` are literals | S03 progress, Gantt, claim hand-off | OPEN |
| `CG-P10-05` | Create ignores mode/schedule and the producer never reads them — confirm and refuse mismatches | S02 claim forecast truth | DELIVERED `f8217217` · fixed-mode mismatch refused |
| `CG-P10-06` | Cancelled-before-progress run stays `PENDING_SOURCE_CALLBACK`; QUEUED job returns `progress: null` | S03 cancelled/queued states | DELIVERED `3bb91fa5` · `research-progress.d.ts` availability |

## P11 dependency (S03 read)

| Id | Gap → need | Status |
|---|---|---|
| `CG-P11-03` | Progress snapshot: run identity (or a documented join with the P13 evidence read), per-fold pct / best J / trial / params digest, declared fold count, structured `claim.cursor`, artifact `DENIED` + note + rows, 403 in the GET contract | OPEN |

**RF-03 continuation 2026-09-24:** Source-backed partial additions are recorded in [RF-03 packet](./RF-03/README.md). `CG-P07-03/04`, `CG-P06-02`, and `CG-P08-05` remain OPEN for the missing parts; generated `research-alpha-import.d.ts` already contains the additive mirror/expiry/quarantine contract for RF-04. P10 WFO producer and P05 importer are not falsely marked delivered.

**RF-03 P08 continuation 2026-09-24:** `CG-P08-05` is partial, not DELIVERED. Exact bound AlphaVersion entrypoint/declaration now enforces `seed_required` and declared pin/sweep domains before snapshot; private snapshot enforces current-release `trial_ceiling`. Generated-wire 4/4 and isolated PostgreSQL 10/10 pass. No executable WFO or sweep/evaluation ceiling is inferred; see [RF-03 packet](./RF-03/README.md).
