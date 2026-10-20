# BE-P2 · ELP2-08 stage bodies (FE-067, FE-071, FE-072, FE-070)

Writer: Claude (backend, assigned by Bobby 2026-10-20). Branch `claude/be-gaps-2-p2` from `792319bb` (the
`claude/be-gaps-2` name is shared by four concurrent worktrees, so this package used its own ref).
Verification tier **R3, focused**. Local producer/contract delivery only: **not** provider/runtime or
browser acceptance. No FE file, migration, credential or runtime was touched.

## Status per request id (vocabulary of Unified Plan §5: no bare DONE)

| Id | Status | Meaning |
| --- | --- | --- |
| FE-067 | `CONTRACT_DELIVERED_AT_COMMIT 7591dca0`, `PENDING_GATE` (contracts-test.sh, PG specs) | Typed runtime / reconciliation / sessions on Paper workbench, Sandbox, Canary, Live Full V1 bodies. Runtime and Paper sessions/reconciliation are typed `NOT_PUBLISHED` today (see "What stays unavailable"). |
| FE-071 | `CONTRACT_DELIVERED_AT_COMMIT 53630719`, `PENDING_GATE` | Canary compliance rows + server verdict, 4 rollback items, trial schedule. Only `capital` / `open_orders` / `gross_notional` (exact 0) consumed figures and `broker_data` readiness can publish. |
| FE-072 | `CONTRACT_DELIVERED_AT_COMMIT 61245988`, `PENDING_GATE` | Typed position / order rows, Internal/Broker/Difference figures, series points, gap window, finding `opened_at`, plan `author` / `envelope`. |
| FE-070 | `CONTRACT_DELIVERED_AT_COMMIT a25d50cb` (contract + typed `NOT_PUBLISHED`), `SOURCE_NOT_WIRED` | No trading-calendar source of truth exists in the repo. |

Producer-receipt request to Codex: see the last section.

## Design (all four)

* **One value shape**: a *Fact* is `{availability: AVAILABLE, value, reason_code: null}` or
  `{availability: NOT_PUBLISHED, value: null, reason_code: <CODE>}` (same pattern as the parent criteria
  facts). There is no third shape, so a missing source can never read as zero, empty or healthy.
* **Additive, optional, `schema_version` unchanged.** The Sandbox / Canary / Live Full V1 bodies stay
  `*.v1`; the new members are optional properties. The FE V1 readers are tolerant (`obj()/str()` style),
  so they ignore the new keys; none of the new keys is `provenance_basis` / `field_contract_revision`, so
  `v1Refusal` does not trigger. The new blocks carry their own `schema_version`
  (`execution.stage-facts.v1`, `execution.venue-calendar.v1`).
* **SCOPED_V2 bodies are not changed**: `portal.execution.following-parent.v2` (Sandbox/Canary) and
  `portal.execution.live-source-operations.v2` are sealed closed objects with literal consts
  (`runtime.state: null / SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED`). Putting facts there needs a v3 of those
  objects and a source that asserts them; neither exists. Everything below is the legacy/V1 route.
* Generator `packages/contracts/tooling/generate-execution-stage-facts.mjs` (`--check` wired into
  `verify-generated.sh`, script `generate:execution-stage-facts`) writes the family schema
  `schemas/execution-stage-facts.v1.schema.json`, inlines the same definitions into the Paper standalone
  schema and OpenAPI (those two are compiled alone in tests), and syncs the dark fixtures.
* Pure producers (unit-testable with fakes): `apps/control-api/src/execution/{stage-facts,
  stage-facts-profile,canary-envelope-facts,stage-rows,venue-calendar}.ts`.

## Per request

### FE-067 runtime, reconciliation, sessions

* Schema: `StageFacts` = `{schema_version, runtime{runtime_state,since}, reconciliation{basis,verdict,
  open_finding_count,unknown_order_count,as_of}, sessions{availability,reason_code,basis,rows[{id,started,
  ended,state}],returned_count,omitted_count,source_complete}}`.
  Paper: `data.stage_facts`; Sandbox/Canary/Live: top-level `stage_facts`.
* Runtime: closed vocabulary `RUNNING|PAUSED|HALTED|STOPPED` (the words the FE chip already maps), only from
  the source deployment row's `runtime_state`; `active`, sessions, readiness, freshness are never read.
* Reconciliation: `NO_OPEN_FINDINGS | OPEN_FINDINGS`, basis named `FINDINGS_RELATION_NOT_A_RECONCILIATION_RUN`;
  no verdict from a PARTIAL window or an unreadable status; `unknown_order_count` exact 0 only when nothing is
  open, otherwise `NOT_PUBLISHED / FINDING_TYPE_VOCABULARY_NOT_CLASSIFIED` (table
  `UNKNOWN_ORDER_FINDING_TYPES` is intentionally empty: the source does not publish its `finding_type` words).
* Sessions: newest first, cap 50, malformed rows counted in `omitted_count`.
* Answer to the FE ledger question: the Paper workbench does **not** fill `data.sessions` /
  `data.reconciliation` (not in `WORKBENCH_SPECS`; the screen binding `N22_PAPER_SCREEN_BINDINGS` has no
  `manager.sessions` / `manager.reconciliation` for the workbench screens). The overview fills `sessions`,
  the blotter fills both.
* FE reader change: Paper: read `objects.stage_facts` (the tolerant `readProfileEnvelope` already collects
  non-array `data` objects). Sandbox/Canary/Live V1 readers: read `root.stage_facts`; map
  `runtime.runtime_state.value` into `runtimeState`, `sessions.rows` into the Sessions tab,
  `reconciliation.verdict` + `open_finding_count` + `unknown_order_count` into the Reconciliation chip.
  Print `Not published (FE-067)` only while the fact is `NOT_PUBLISHED`, and show its `reason_code`.

### FE-071 Canary envelope, rollback, trial

* `envelope_compliance.rows[4]` `{cap, unit, policy_limit, approved, consumed, used_ratio, as_of}` and
  `envelope_compliance.verdict {state: WITHIN_ENVELOPE|BREACH|UNDETERMINED, basis, undetermined_caps}`.
  `used_ratio` is server-computed: 6 fractional digits, ROUND_HALF_UP, canonical (may exceed 1).
* `rollback_readiness.items[4]` `{key: flatten_plan|paper_twin|broker_data|rollback_drill, ready, checked_at}`.
* `lifecycle.trial {basis, duration_days, started_at, exit_review_opens_at}`; `day_index` stays null.
* FE reader change: `readCanary.ts` `LimitFact.usedRatio` <- `rows[].used_ratio.value` (string, never divide);
  `CapGauge` `fe="FE-071"` cells <- `consumed`, `policy_limit`, `as_of` facts; verdict chip <-
  `verdict.state`; the four rollback items <- `rollback_readiness.items`; TrialStrip <- `lifecycle.trial`.

### FE-072 typed rows, figures, series, gap, findings, plans

* `typed` on `positions` / `blotter` (Canary) and `positions` / `orders` (Live): typed rows plus
  `not_published_columns` (`leverage`, `ack_latency_ms` are not columns of the source relations).
* `source_figures` (Canary, Live, Sandbox): fixed order `equity, gross_notional, positions, open_orders, fees`,
  each `{key,label,unit,internal,broker,difference}` as Facts. The FE Live Triad keys differ
  (`gross` -> `gross_notional`; `Fees` is new): map in the reader.
* `series`: dark-source consts relaxed (`resolution` nullable `^[0-9]{1,3}[smhd]$`, `points` <= 2000 typed
  `{t,value}` decimal strings, optional `methodology_ref`, `unit`). `projection_continuity.gap_ranges` Fact of
  `[{from,to}]` (Live).
* Sandbox: findings rows `opened_at` (= `created_at`, the FE already derives Opened from it); promotion plans
  `author {user_id}` and `envelope` (Fact of the latest Canary envelope drafted from the plan; AVAILABLE with a
  null value = none exists). One extra read-only query on `governance_canary_envelopes` in
  `SandboxCertificationRepository` detail load (table/columns from migration `1723680000011`).
* Still-pinned consts, deliberately kept: every side-effect / `production_command_active` / command
  `visible|enabled` flag, `rollback_readiness.ready=false`, `lifecycle.runtime_state=null`,
  `day_index=null`, `activated_at=null`, `envelope.status=DRAFT`.
* FE reader change: `publishedRows.ts` consumers use `positions.typed` / `blotter.typed` / `orders.typed` when
  `availability` is AVAILABLE; keep the free rows otherwise. Triad <- `source_figures`; chart <- `series`
  when `points` non-empty; Continuity gap <- `gap_ranges`; Sandbox Opened / Author / Envelope columns.

### FE-070 VN market calendar

* `data.venue_calendar` (`execution.venue-calendar.v1`) on `GET /api/v1/execution/screens/paper/{id}/vn-market`
  only. Facts: `timezone` (IANA), `windows[{name,kind,open,close}]` (`kind` TRADING_SESSION|OPENING_AUCTION|
  CLOSING_AUCTION; ATO/ATC only if the source names them), `breaks` (gap between published windows),
  `holidays[{date,name}]`, `is_open` (the source's statement beside `as_of`), `as_of`.
* No calendar source of truth exists in the repo (`venues.calendar`, adapter
  `portal.execution.data-layer-session-calendar.v1`, `GET /v1/control/session-calendar`, is `SOURCE_DARK`;
  the n28 `session-calendar.valid.json` is a shape sample with no holidays or auctions). All members are
  `NOT_PUBLISHED / N28_VENUE_CALENDAR_NOT_ACTIVE`. `venueCalendarFromSource` is the validating mapping for the
  payload once wired.
* FE reader change: read `objects.venue_calendar` on the VNM variant; chip prints the facts; AGING/PAUSED only
  from a server statement (`is_open`), never from window arithmetic.

## What stays typed-unavailable, and why

| Fact | Reason code | Needs |
| --- | --- | --- |
| `runtime_state`, `since` (all stages) | `SOURCE_RUNTIME_STATE_FIELD_NOT_PUBLISHED` | `strategy_deployments.runtime_state` (+ changed-at) added to the Manager deployments field catalogue and `DEPLOYMENT_FIELDS`; vocabulary confirmed (`strategy_deployments.runtime_state` words are unclassified in `ts-contract-v1`). Producer already reads `runtime_state`, `runtime_state_since|changed_at`. |
| Paper `stage_facts.sessions/reconciliation` | `PAPER_WORKBENCH_RELATION_NOT_BOUND_TO_SCREEN` | Add `manager.sessions` / `manager.reconciliation` to the workbench entries of `N22_PAPER_SCREEN_BINDINGS` (EDS pins). No code change here is then needed. |
| `unknown_order_count` with any open finding | `FINDING_TYPE_VOCABULARY_NOT_CLASSIFIED` | Fill `UNKNOWN_ORDER_FINDING_TYPES` / `OTHER_FINDING_TYPES` from the source `finding_type` vocabulary. |
| `policy_limit` | `BASE_RISK_PROFILE_LIMITS_NOT_PUBLISHED` | Source publishing the base risk profile limits (Portal holds only the revision id). |
| `daily_loss` consumed | `DAILY_LOSS_WINDOW_NOT_PUBLISHED` | A daily PnL window relation. |
| `gross_notional` / figures gross | `E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED` | Position currency + mark lineage (same rule as Live). Note: the legacy `consumed.gross_notional` / `daily_pnl` in Canary are unqualified aggregates predating this rule. |
| rollback `flatten_plan`, `rollback_drill`, `paper_twin` | `FLATTEN_PLAN_NOT_RECORDED`, `ROLLBACK_DRILL_NOT_RECORDED`, `E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED` | Recording sources. |
| `trial` | `CANARY_ACTIVATION_NOT_RECORDED` | Source activation instant (`activated_at`). |
| Broker side of figures, `equity` internal | `BROKER_*_NOT_PUBLISHED`, `INTERNAL_EQUITY_FIGURE_NOT_PUBLISHED` | Broker population / equity / fee totals; equity snapshots bound to the stage screens. |
| series points | (panel `unavailable`) | An equity/PnL series relation bound to Canary/Live (none is). |
| `gap_ranges` | `PROJECTION_GAP_WINDOW_NOT_RECORDED` | Gap wall-clock window in the projection journal. |
| `venue_calendar` | `N28_VENUE_CALENDAR_NOT_ACTIVE` | Market-data-layer session calendar wired (+ holiday list, ATO/ATC names). |
| positions `leverage`, orders `ack_latency_ms` | `*_NOT_IN_SOURCE_RELATION` | Relation columns / gateway-event join. |

## Files

* control-api src: `execution/{stage-facts,stage-facts-profile,canary-envelope-facts,stage-rows,venue-calendar}.ts`
  (new); edited `canary/canary.service.ts`, `live/live-operations.service.ts`,
  `sandbox/sandbox-certification.{service,repository}.ts`, `paper-read/paper-read.service.ts`; **shared helper
  touched (minimal, additive)**: `execution/profile-screen-composer.ts` (public `relationState(key)`).
* control-api tests: `stage-facts`, `canary-envelope-facts`, `stage-rows`, `venue-calendar` specs, helper
  `stage-contract-validator.ts`, additions to `paper-read.spec.ts`.
* contracts: generator, `schemas/execution-stage-facts.v1.schema.json`, edits to the Paper / Sandbox /
  Canary / Live schemas, Paper OpenAPI, fixtures (`execution-stage-facts.{unavailable,source-backed.synthetic}`,
  `execution-canary-envelope-facts.synthetic`, `execution-stage-rows.synthetic`, `execution-venue-calendar.synthetic`
  + synced dark Canary/Live/Sandbox and Paper partial fixtures), d.ts for paper-read, canary, governance,
  live-full, `test/execution-stage-facts.spec.ts`. **Shared files touched**: `packages/contracts/package.json`
  (one script), `tooling/verify-generated.sh` (one `--check` line). Not touched: `contracts-snapshot.json`,
  EDS-12/N29 ledgers, `tooling/snapshot.py` (its TRACKED list does not yet name the new generator / schema /
  fixtures: lead to add at merge if wanted).

## Gates

* control-api focused (host Node 20, unlocked): `stage-facts` 22, `canary-envelope-facts` 21, `stage-rows` 13,
  `venue-calendar` 6, `paper-read` 24, `profile-screen-composer` 5.
* Real service output validated against the published schemas: `CanaryService.publicDetail` dark and
  source-backed (full `CanaryControlRoom`), `SandboxCertificationService.publicDetail` plan row.
* contracts focused (host): `execution-stage-facts` 27, plus `fixtures`, `execution-reader-refinements`,
  `execution-live-source`, `execution-operation-reader`, `execution-positive-parent` (305) green at the FE-067 state.
* `tsc -p apps/control-api/tsconfig.build.json --noEmit` exit 0 on the final tree (an earlier run caught a missing index signature on `SandboxCanaryEnvelopeRef`, fixed in the last code commit).
* `scripts/contracts-test.sh` via the docker wrapper under flock on the tree with FE-067/071/072/070: exit 0, 79 files / 1183 tests, all `--check` and d.ts diffs clean.
* control-api focused re-run on the final tree: stage-rows, stage-facts, canary-envelope-facts, venue-calendar, paper-read: 86 passed.
* **Not run**: PostgreSQL-backed `sandbox-certification.spec.ts`, `canary-control-room.spec.ts`,
  `elp2-product-reads.spec.ts` (no DB here). They assert with `toMatchObject`/`toHaveLength`, so additive keys
  should not break them, but that is unproven. The new SQL in the Sandbox detail load is a read-only SELECT
  against a table verified from its migration; it has not been executed.

## Producer-receipt request to Codex

1. Review the five pure modules and the three service call sites; run the PG-backed Sandbox / Canary / Live specs.
2. Decide the source wiring in the table above, in this order of value: deployment `runtime_state` (+ since) in
   the Manager catalogue; workbench bindings for `manager.sessions` / `manager.reconciliation`; the
   `finding_type` classification; the data-layer session calendar; a Canary/Live equity series relation.
3. Decide the legacy `consumed.gross_notional` / `daily_pnl` aggregates in Canary (unqualified, see above).
4. Regenerate `contracts-snapshot.json` and the EDS-12/N29 ledgers at merge.
