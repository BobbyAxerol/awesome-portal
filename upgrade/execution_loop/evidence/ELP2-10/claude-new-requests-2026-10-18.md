# C1–C7 recurring intake: Claude FE-044…055

Date: 2026-10-18 UTC. Scope: read-only source/contract triage; **not an implementation, delivery, runtime qualification or consumer ACK**. There is no FE-047 in the supplied request table. The independent review changed no source, generated contract, test, database, runtime or remote. Main records its dispositions here; implementation and gates remain separate.

## Pins and interpretation

- Canonical `/home/bobby/portal-research`, `docs/research-loop-plan`, HEAD `5291a80f68a11cbccad879d1e99bb6282634f636`, **with concurrent C3–C7 WIP**. Locators below describe the inspected working files, not a claim that every line is in that commit.
- Claude `/home/bobby/portal-research-fe`, `claude/fe-parity`, HEAD `02d22ac329425dc3e16dee14fada4308ee2f6321`; WIP in the accessEffective/operationalQueue readers and their conformance tests. This review does not import or modify that WIP.
- Request: peer `upgrade/execution_loop/evidence/UXM-07/backend-requests.md:19–29`, SHA256 `92bf55b8c815449c0db73d35a32942440a59ba9766b08918a32a9fa32efaabe2`.
- `ALREADY_DELIVERED_WITH_LOCATOR` below means an existing answer/contract subpart is located; it does **not** mean the whole mixed request is closed or that current WIP is committed/runtime verified. `ACCEPTED_FOR_IMPLEMENTATION` identifies a valid local backlog item for the owning phase, **not permission to expand C3–C7 implementation**. Missing source/authority remains missing.
- Preserve per-endpoint schema identity and current authorization selection. A legacy DTO, scoped retained DTO and V2 Manager dataset are not interchangeable. Latest Main intake already records FE-044…055 as triage-only at `upgrade/execution_loop/evidence/ELP2-10/manager-intake-2026-10-18.md:450`.

## Per-request disposition, consumer guidance and close conditions

### FE-044 — Portfolio paging/search and environment-separated allocation

**Mixed: ALREADY_DELIVERED_WITH_LOCATOR for scoped paging/environment; ACCEPTED_FOR_IMPLEMENTATION for portfolio-name query/legacy compatibility. Owner: Codex ELP2-04/06 contract; Claude consumer.**

- `/api/v1/execution/portfolios` accepts `after`/`before`/`limit` and environment in `apps/control-api/src/manager-lists/contracts.ts:42`; there is **no `q` or `search` in PortfolioListQuery**. In SCOPED_V2, `scoped-manager.reader.ts:127` and `:227` implement portfolio collection selection and fingerprinted paging. `scoped-manager.contract.ts:20` carries each item's `environment` and `:44` its actual page cursors. Do not label that implementation as absent merely because the legacy `listPortfolios()` consumer has no argument (`apps/portal/frontend/src/execution/api/httpApi.ts:535`).
- The legacy `execution.portfolio-list.v1` response is different: `manager-lists.service.ts:210` returns a bounded list; `:247–322` gathers source environments and aggregates allocation by currency without retaining environment in `allocated_by_currency`. Scoped all-environment rows must **not** be collapsed back into that mixed total.
- C4 `/manager/fleet` supports bounded name `q`, but its controller exposes fleet/resource overviews, **not a portfolio-list replacement** (`execution-v2/manager-model.controller.ts:19–29`). Query presence there does not deliver `q` on `/portfolios`.
- Financial V2 already partitions ACTUAL/PAPER/SANDBOX with currency, basis, profile and proof (`manager-model.contract.ts:24`), and stage/environment mapping is paper→PAPER, sandbox→SANDBOX, live→CANARY+LIVE (`manager-query-p1.contract.ts:38`). Environment alone is not a license to sum money or deduplicate shared economic capital incorrectly.

**Claude now:** branch on the genuine schema/authority selection, wire published scoped cursor/environment if consuming that DTO, keep legacy Load more unavailable, and do not call the mixed legacy amount an economic total. **Done when:** a deliberately published portfolio-query contract and producer agree on name query, authority-before-search/count/cursor, environment/economic partitions and forward/backward paging; tests cover same ID/currency in real and simulated books. No new financial source is approved here.

### FE-045 — Portfolio-linked Approval inbox

**ACCEPTED_FOR_IMPLEMENTATION, qualified local lineage only. Owner: Codex ELP2-04/08; Claude presentation.**

`apps/control-api/src/governance/contracts.ts:117` / `:307` publishes subject, subject_id and release_candidate, but no portfolio_id on inbox rows. R2 detail has a separately authorized scope portfolio (`governance.service.ts:765–781`); that proves a possible **gate-specific detail lineage**, not a universal inbox join. `workflow.contract.ts:180` also has nullable portfolio identity in a different object, not an inbox-row contract.

**Claude now:** keep the explicit unfiltered queue link; never infer portfolio from subject text or a coincident resource ID. **Done when:** an authorized, gate-specific nullable portfolio link/filter is published from retained lineage, absent lineage remains typed, and filtering/count/cursor all occur after current access scoping. Do not invent R1 portfolio identity from an R2 record.

### FE-046 — Capital ledger sequence/command/receipt and older paging

**ACCEPTED_FOR_IMPLEMENTATION for bounded local pagination; NEEDS_OWNER_DECISION/source proof for missing authoritative sequence/receipt linkage. Owner: Codex ELP2-06 plus TS/Edge source owner for unpublished facts.**

`apps/control-api/src/execution/portfolio360-local.service.ts:231–311` publishes ledger_id/allocation/account/movement/exact amounts/time, caps displayed entries at 250 and reports has_more. `:320–366` boundedly drains source pages internally; this is **not a public older-page cursor**. No seq/command_id/receipt_ref is mapped. V2 capital statements (`manager-model.contract.ts:43–56`) are a different financial summary, not delivery of a ledger cursor or total ordered economic journal.

**Claude now:** preserve returned-entry/partial wording, do not fabricate seq from row index, do not turn ledger_id into command/receipt identity. **Done when:** source-backed optional linkage and a scoped stable public cursor are actually published, or each missing linkage is explicitly NOT_PUBLISHED with its source locator. No global ordering, settlement history or lifecycle replay is inferred from current rows.

### FE-048 — Missing stage_counts

**ALREADY_DELIVERED_WITH_LOCATOR for source semantics; consumer correction remains needed. Owner: Claude reader; Codex ELP2-04/06 for explicit census contract if later commissioned.**

`apps/control-api/src/manager-lists/manager-lists.service.ts:757–773` builds stage_counts from the union of stages **represented in its composed rows**. It omits unrepresented keys; it does not publish an explicit per-stage authoritative zero/absence verdict. Scoped Manager explicitly declares PARTIAL/AUTHORIZED_ONLY (`manager-lists/scoped-manager.contract.ts:38–43`). V2 Manager quality/coverage are also explicit (`manager-model.contract.ts:137–146`).

**Claude now:** do **not** apply `stage_counts[stage] ?? 0`. Missing means “not represented/published by this summary”, not “the global population is zero”. The observed summary can be described as counts over its stated population; a full-source census needs additional coverage proof. **Done when:** D4 tests pass by preserving this distinction, including partial, denied and absent-stage cases; a fixture missing a stage does not authorize a false zero.

### FE-049 — Schema constraints and reader conformance

**Mixed: ALREADY_DELIVERED_WITH_LOCATOR for V2 decimal/closed vocabularies; ACCEPTED_FOR_IMPLEMENTATION for actual legacy schema mismatch; NEEDS_OWNER_DECISION only for a broader validator-tooling replacement. Owner: Codex producer/schema, Claude consumer validator.**

- V2 exact decimal already has maxLength 128: `execution-v2/foundation.contract.ts:4–5`, generated `packages/contracts/openapi/execution-v2-foundation.openapi.json:10–19`. Scoped retained decimal has max128 (`manager-lists/scoped-manager.contract.ts:6`). Do not widen these contracts or label the bound absent globally.
- Legacy fleet **really differs**: `packages/contracts/schemas/execution-alpha-fleet-list.v2.schema.json:7` lacks decimal maxLength, and `:26–31` MetricState allows AVAILABLE/EMPTY/UNAVAILABLE. Its producer emits PARTIAL for incomplete equity windows (`manager-lists.service.ts:727–738`). This is a producer/schema repair candidate, not evidence that every metric must accept a universal five-state enum.
- V2 Manager metric availability is AVAILABLE/PARTIAL/UNAVAILABLE/NOT_APPLICABLE (`manager-model.contract.ts:32–42`); scoped financial availability is AVAILABLE/PARTIAL/NOT_PUBLISHED (`scoped-manager.contract.ts:30–31`). DENIED may be a profile/panel/authorization state, not a numeric metric value. Preserve schema-specific enums; do not merge vocabularies to make fixtures pass.
- `uniqueItems` over objects is not uniqueness of their ID field. Reader/producer invariants must reject duplicate identity keys and inconsistent page counts separately. Reported invalid-payload counts 115/478 and 250/288 were **not independently executed** in this read-only review.

**Claude now:** keep strict fail-closed limits/identity checks and match the **exact selected schema**, not a hand-made union. **Done when:** owning producer/schema invariants agree, fixtures explicitly cover max length/duplicate keys/closed enums/page counts, generated outputs come from repo scripts, and both valid/invalid consumer conformance cases have receipts. Choosing AJV versus equivalent checked parsing is a consumer/tooling decision; neither choice excuses accepting invalid contract data.

### FE-050 — Binding environment, sibling sleeves, clocks and broker_sync

**ALREADY_DELIVERED_WITH_LOCATOR for environment/default/clock distinctions; ACCEPTED_FOR_IMPLEMENTATION only for a qualified extra DTO field; missing history or complete sibling census is NOT delivered. Owner: Codex ELP2-06; Claude consumption.**

- GET binding list defaults to **paper**, not all: `manager-lists/contracts.ts:11–18`, `:35`; detail also defaults paper (`manager-lists.controller.ts:59–68`). Continue passing environment explicitly; never merge same binding_id across environments/workspaces.
- Source venue_accounts has binding_id/account_id (`execution/profile-projection.catalog.ts:358–361`), which can support a **visible current** same-binding grouping. It is not proof of all siblings, shared capital ownership or authorization over hidden sleeves. Scoped projections remain permission-first (`manager-lists/scoped-manager.reader.ts:30–34`, `:49–69`).
- Legacy envelopes publish separate ISO `read_at`, nullable `source_as_of` and projection_refreshed_at (`manager-lists.service.ts:159–170`, `:1035`). Scoped Manager publishes `read_at_ms`, but **no as_of_ms field** in that schema (`scoped-manager.contract.ts:37`). Do not substitute read/refresh time for missing source time.
- `broker_sync` source allowlist **does** include buying_power and synced_at (`execution/profile-projection.catalog.ts:354–357`). Basic binding-list/detail DTOs do not map buying_power into the item (`manager-lists/contracts.ts:124–132`, `manager-lists.service.ts:1020`); an allowed raw source field is not automatically a published field on every endpoint or a verified current value. Fixture values are not runtime evidence.
- C4 is **CURRENT_ONLY**, rejects as_of_ms input rather than silently ignoring it (`execution-v2/manager-query-p1.ts:15–17`; controller `:37`; options contract `:38`). Response clocks are facts; a historical query is a separately commissioned capability.

**Claude now:** keep explicit environment, distinguish all three clocks and label visible siblings only. **Done when:** every used field is traced to the exact selected endpoint/schema and authorized source grain; any new buying-power/sync field preserves freshness/null reasons, not fallback truth.

### FE-051 — Account long/short/gross, margin, credential metadata and modes

**NEEDS_OWNER_DECISION/source qualification for new public facts; ACCEPTED_FOR_IMPLEMENTATION only for mapping facts already qualified by their exact family. Owner: TS/Edge source authority + Codex ELP2-06, credential/privacy policy owner; Claude absence rendering.**

Finite source allowlists contain exposure_long/exposure_short on performance and margin_initial/margin_maintenance on account equity (`execution/profile-projection.catalog.ts:398–412`), but those are not a commissioned account-wide gross/ratio/mode contract. A legitimate margin ratio requires a defined numerator, denominator, clock and basis; do not derive one from whatever two amounts happen to exist. Core Manager financial metrics remain finite (`manager-model.contract.ts:15–20`, `:32`). There is no inspected published credential alias/scopes/expiry DTO on these binding reads.

**Claude now:** retain A360-n typed absence. **Done when:** source owner publishes qualified account-grain facts and the current browser-safe field policy admits them; credential metadata must have an explicit safe allowlist and authorization, never keys/tokens/private identity. No direct DB/credential access or source capability expansion is authorized by this request.

### FE-052 — Blotter fields, filters and bracket order linkage

**ACCEPTED_FOR_IMPLEMENTATION for finite qualified mapping/filtering; NEEDS_OWNER_DECISION/source qualification for missing execution linkage/metrics. Owner: Codex ELP2-06/08, TS/Edge source owner, Claude consumer.**

`apps/portal/frontend/src/execution/api/ports.ts:284–294` BlotterQuery has status/venue/symbol/side/sort/cursor, not the requested stage/deployment/account/alpha axes. Source allowlists differ: orders has order/client/venue IDs and quantity/price/status, fills has commission, conditional legs has filled_quantity/average_fill_price, but bracket-leg subset lacks order_id (`execution/profile-projection.catalog.ts:387–397`, `:426–440`). Presence of a fill commission does not produce per-order fee/slippage or authoritative fill aggregation automatically.

**Claude now:** keep “loaded pages” for client-only scope chips; never present those as server filters or full-query totals. **Done when:** each server filter is a declared finite field authorized **before** query/count/cursor, exact order/fill/leg joins have source lineage and compatibility proof, and missing average/slippage/fees/order linkage stays typed absent. Do not guess deployment from account or bracket order_id from leg_id/client_order_id.

### FE-053 — User last sign-in and malformed roster

**ACCEPTED_FOR_IMPLEMENTATION for consumer malformed-body error; NEEDS_OWNER_DECISION/source/privacy for last-sign-in publication. Owner: Claude accountApi reader; Codex identity contract if separately approved.**

`apps/portal/frontend/src/features/admin/accountApi.ts:162–169` returns [] if accounts is not an array: real silent-empty bug in a frontend-owned reader, not proof that server returned zero users. Backend intentionally projects a finite browser-safe roster (`admin/account-lifecycle.service.ts:207–217`; `repos/account-lifecycle.ts:50–73`), without last sign-in. Do not infer sign-in from updated_at, active sessions or owner actions.

**Claude now:** use a typed contract-invalid failure for malformed/null/body rows; [] remains valid **only** for an explicitly valid empty roster. Keep last-sign-in Not published. **Done when:** malformed-root/row and valid-empty tests distinguish error from empty, no higher-privilege defaults are introduced, and any last-sign-in addition has an explicit privacy/access/source decision. Do not expand the admin roster or change account authority in C3–C7.

### FE-054 — Exact stage drift, observed state/outcome, replay route

**ACCEPTED_FOR_IMPLEMENTATION for exact-decimal producer repair; bounded observed facts need qualified mapping; dedicated route is Claude/product navigation ownership, not a new replay authority. Owner: Codex ELP2-06/09, Claude UX/router; source owner if historical lifecycle is requested.**

`execution/local-query-analytics.service.ts:618–626` actually converts exact source strings with Number and sums binary64; `:658–663` emits numeric series. This is a genuine exactness gap: merely stringifying the rounded number in FE/server does **not** repair it. Fix must aggregate source decimals exactly and publish a deliberately versioned/additive contract so V1 consumers are not silently broken. Research-binding drift remains explicitly unavailable (`:673`); stage equity is not drift versus approved Research evidence.

Observed timeline publishes only current-page observation clocks/resource IDs/exact values (`:1253–1280`, `:1529–1594`), not status/outcome at every historical timestamp. Current row status or command outcome can be added only as explicitly **observed current row facts** under their source allowlist; never backdate current final status to submitted_at and call it a lifecycle event. A dedicated replay route may reuse these reads, but cannot upgrade BOUNDED_CURRENT_PAGE into authoritative replay. `?tab=replay` versus route is a frontend/product navigation choice, outside this backend intake.

**Claude now:** keep Daily-close partial wording and current exactness warning; no Number→string pseudo-fix. **Done when:** exact-decimal read and generated contract/fixtures agree, malformed/missing decimals remain typed, observed state has an honest time/authority label, and any route keeps workspace/resource authorization and the correct observation-not-replay story.

### FE-055 — Command-center/profile/scoped realtime schemas

**ALREADY_DELIVERED_WITH_LOCATOR; CHANGES_REQUESTED_WITH_REASON for wrong double/consumer pairing. Owner: Claude fixture/consumer; Codex ELP2-07/09 only for owning contract.**

Three distinct contracts exist and must not be merged:

1. Legacy profile snapshot `/profiles/:environment/realtime-snapshot` and profile stream (`execution/realtime.controller.ts:161`, `:186`): `portal.execution.profile-realtime.v1` (`profile-realtime.service.ts:67`, `:259`).
2. Command-center snapshot `/command-center/realtime-snapshot` and stream (`realtime.controller.ts:281`, `:332`): proxy expects `execution.manager-realtime-snapshot.v2` (`realtime.proxy.ts:54`, `:388`), and existing Command Center consumer explicitly checks that schema (`apps/portal/frontend/src/execution/screens/profileContainers.tsx:119`).
3. Scoped V2 revalidation frames: `portal.execution.scoped-realtime.v1`, `semantics=NOTIFICATION_ONLY`, distinct event/terminal/next-action contract (`execution-v2/realtime.contract.ts:19–40`). C7 Manager observation adapter validates its own model, scope, generation and dense retained observation coordinate (`manager-observation-source.ts:70–112`); it is not profile-v1 or business event replay.

**Claude now:** make each double answer its actual route's schema; do not weaken the consumer to accept any of the three. `stream:"published"` in a fixture is not deployment capability. **Done when:** route-specific fixture conformance/negative cross-schema tests and cursor handling pass; retained-review still opens no stream, READ and STREAM authority remain independent, and no provider/listener/runtime activation is inferred from this review.

## Required main follow-through / explicit non-results

- Integrate these dispositions with owning phase/ledger locators; do not mark FE-044…055 collectively DELIVERED from this note. Existing WIP must still pass its approved gates and be landed before Claude consumes a canonical committed pin.
- Immediate consumer corrections can be handed to Claude without new source capabilities: FE-048 absent-stage handling, FE-053 malformed roster, FE-055 correct double; FE-044/050 consume the selected schema rather than legacy/V2 unions. Backend producer/schema gaps are accepted backlog, not silently added to the active implementation package.
- No FE-047, no hue/token/baseline decision, no added account secrets, no direct TS DB, no new historical source, no economic ledger, no broker mutation or stream activation.
- Not run: tests, generation, build, browser, DB, performance, SSH or runtime probes. Prior normal-hook counts are deliberately **not reused** as qualification of this review/new request set. Reported peer validation statistics remain peer evidence, not independent PASS.

## Inspected WIP hashes (SHA256)

| Canonical path (relative to /home/bobby/portal-research) | SHA256 |
| --- | --- |
| apps/control-api/src/execution-v2/manager-model.contract.ts | d55433840d921453cf1e4a90b3a670bd09ad275bea17f49128f9c338fb649c3b |
| apps/control-api/src/execution-v2/manager-query-p1.contract.ts | 5e372c7eabc72fd72a34580e83bcad716eb1a429a54f608502af27c22fe10300 |
| apps/control-api/src/execution-v2/manager-query-p1.ts | 0973a0d8c82f669b84da730d12f87a9146f2b37aa0472db54840740e44eff259 |
| apps/control-api/src/execution-v2/foundation.contract.ts | 4f3a33bb423c9097a201aa8e621084dddae93b7d3751c2d2683237ddfd29e369 |
| apps/control-api/src/manager-lists/contracts.ts | f5b7639932ad4a5a5817df67f94501c42bbc37cec88a73c6e05baa820d1e861f |
| apps/control-api/src/manager-lists/scoped-manager.reader.ts | 2dde734686431b3c310dffc449b1458756e2d58544217177a170442a6eb7624e |
| apps/control-api/src/manager-lists/scoped-manager.contract.ts | cff6bff02f6fb50ba9dab0e8fac7fd73cfc3fd038eb1b28cc74a69efd4dcc495 |
| apps/control-api/src/manager-lists/manager-lists.service.ts | ed259d7a237dca9a3e60442b869a4ecf305ed1ddebfe134dbb67b45aa94d424c |
| apps/control-api/src/execution/local-query-analytics.service.ts | fc0e458ae4f46098cab859c177f5b76848b83e5d55fc0882c4b1184a30585287 |
| apps/control-api/src/execution/realtime.controller.ts | 2d5837fbf557eac3ddbbcf9b168c6f5e68b72a7e17f1fede03b62549d0f59e2f |
| apps/control-api/src/execution/profile-projection.catalog.ts | 9f332b4aa0a7bfa389c58ba5006ef0d044a4d34119441aca0d64e12aa2909abb |

Peer WIP reader hashes: `accessEffective.ts` = `4290b081a87fab620b9b234e3bd699d24ba82688059fb48e7545f67e03e45f08`; `operationalQueue.ts` = `2d1006bb6545a182087b5e48f8299a95bffa97f4b444cf54eff82dffdc1cbe7b`. These pins make the observations reproducible but are not stable source authority after further edits.
