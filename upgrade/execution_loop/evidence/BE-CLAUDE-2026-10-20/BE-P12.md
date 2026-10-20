# BE-P12 · stage facts and identity on the SCOPED_V2 stage bodies (FE-066, S3-U5, FE-067; R-1, R-2 of the BE-P2/P3 consumer receipt)

Writer: Claude (backend, Bobby's all-remaining-backend assignment of 2026-10-20; Codex reviews). Branch: the isolated
worktree reset to `claude/fe-parity` @ `be6d98d1`. Tier **R3, focused**. Local producer/contract delivery only: **not**
provider/runtime or browser acceptance. No FE file, migration, credential, runtime, Docker stack or DB was touched.
Statuses use the Unified Plan §5 vocabulary (no bare DONE).

## Status per request id

| Id | Status | Meaning |
| --- | --- | --- |
| FE-066 / S3-U5 identity, **Live** `live-source-operations.v2` | `CONTRACT_DELIVERED`, `PENDING_GATE` (contracts-test.sh, PG specs) | `identity` (alpha_id, alpha_name=null, portfolio_name, two reason codes), opt-in `include=identity`. |
| FE-066 / S3-U5 identity, **Sandbox / Canary** `following-parent.v2` | `CONTRACT_DELIVERED`, `PENDING_GATE`, `OWNER_DECISION_PENDING` (shape, option O1) | Same block, opt-in `include=identity`, attached after the sealed parent flight. |
| FE-067 stage facts, **Live** v2 | `CONTRACT_DELIVERED` (partial by design), `PENDING_GATE` | `stage_facts`, opt-in `include=stage_facts`: reconciliation says `OPEN_FINDINGS` or is absent; runtime, sessions absent with a reason. |
| FE-067 / FE-071 / FE-072, **Sandbox / Canary** v2 | `NOT_DELIVERED`, `OWNER_DECISION_PENDING` | Needs a scoped Sandbox/Canary source reader; see the design note. |
| FE-070, FE-071 compliance/rollback/trial, FE-072 typed rows/figures/series/gaps on any v2 body | `NOT_DELIVERED`, typed absence unchanged | See "stays typed-absent". |

## Design note: what moves, what needs a new seal, what stays absent

Three facts decide everything (read in the code, not assumed):

1. **The two v2 families are different authorities.** `live-source-operations.v2` is a *source* reader: per-relation
   scopes (`authorizeRetainedRelation`: alpha.read on the deployment, account.read on the account), the viewer's field
   policy (`retainedFieldAllowed`), row visibility over the qualified tuple publication (`projectionRowVisible`), one
   combined final fence (`deliverScopedTogether`). `following-parent.v2` is a *Portal record* read: audit-anchor
   authority plus parent-field-purpose seals, and it states `accepted_manager_facts: PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION`.
2. **The v2 objects are closed and their tests reject unknown members**, but the neighbouring contracts show the accepted
   way to grow them: new optional sections, same `schema_version`, a typed absence when not qualified. A new parent-field
   *purpose* changes the seal list (cap 31, "no headroom") and needs a newly installed reviewed policy; an existing
   purpose's field set must never change (its digest is in installed seals). Nothing here changes any digest:
   `execution-scoped-stage.spec.ts` pins the seven Sandbox/Canary/Live purpose digests and the cap.
3. **The read-field vocabulary is closed** (`execution-v2/read-fields.ts`): `alpha_id`, `portfolio_id`, `name`, `status`,
   `state` exist; `runtime_state`, a session id and a session's started/completed instants do **not**. A field policy can
   only allow a name from that list, so those facts cannot be published on a scoped read by any policy.

Compatibility rule used for every new member: **optional and opt-in** (`include=` query value on the existing GET). A
request without it returns the original v2 body byte-for-byte (tested), so no closed FE reader, fixture, or installed
consumer changes until it asks. The legacy/V1 bodies already carry both and ignore `include`.

| Member (BE-P2 / BE-P3) | Decision | Authority and reason |
| --- | --- | --- |
| `alpha_id` + `alpha_reason_code` | **Moved**: Live v2, Sandbox/Canary opt-in | alpha.read deployment scope, qualified deployment-to-alpha tuple publication, field `alpha_id`. A hidden peer's deployment is the same uniform 404 as before; a hidden field is `ALPHA_IDENTITY_NOT_AUTHORIZED`. Never from `strategy_id`. |
| `portfolio_name` + reason | **Moved** under the viewer's alpha.read row and field policy (fields `name` + `portfolio_id`) | A portfolio shared with an alpha the viewer cannot read is hidden by the row predicate (`PORTFOLIO_NAME_NOT_AUTHORIZED`, name never in the body); unnamed/ambiguous/unpublished each have their own reason; a served row with foreign lineage voids the read (503). **Caveat for Codex:** the relation's declared purpose is `portfolio.read`; this reuses BE-P3's alpha-scope rule for parity. Switching to the portfolio collection-purpose machinery is an owner decision (below). |
| `alpha_name` | **Stays null**, constant in the sealed object, `ALPHA_NAME_NOT_PUBLISHED` | No source publishes an alpha display name. A future source needs a reviewed revision of the identity object, not a silent widening. |
| reconciliation (verdict, counts, as_of) | **Moved, Live only, partially** | Derived from the rows the reconciliation panel already authorized. `OPEN_FINDINGS` is a true monotone statement and is published. `NO_OPEN_FINDINGS` and every exact count are **never** published: a resource-bound scope cannot prove it holds the whole findings population (`scopeAllowsFullAccountingPopulation` is false for every such scope, business.read_all included), so a hidden peer's finding could exist. Typed `AUTHORIZED_POPULATION_ONLY` / `AUTHORIZED_POPULATION_COUNT_NOT_EXACT`. The rule is in the JSON Schema and the Zod object, not only in the producer. Hidden `status` field: `FINDING_STATUS_NOT_AUTHORIZED`. |
| runtime state + since | **Needs a new vocabulary entry (and source field), stays absent** | `RUNTIME_STATE_FIELD_NOT_IN_READ_VOCABULARY`. Needs: `runtime_state` (+ changed-at) added to the read-field vocabulary, the Manager deployments catalogue and `SCOPED_LIVE_SPECS`; the closed word list confirmed. |
| sessions rows | **Needs a new vocabulary entry, stays absent** | `SCOPED_SESSION_ROW_FIELDS_NOT_IN_READ_VOCABULARY`: session id/started/completed instants are not in the vocabulary. The existing `sessions` panel already carries state, counters and `updated_at_ms`. |
| `unknown_order_count` | Absent | `FINDING_TYPE_VOCABULARY_NOT_CLASSIFIED` (needs the source `finding_type` words, Codex). |
| Sandbox/Canary stage facts, Canary compliance/rollback/trial, Sandbox findings `opened_at`, plan `author`/`envelope` | **Not moved: needs an owner decision on composition** | They mix a Portal record with source facts (consumed figures, broker readiness, findings, sessions) the parent flight does not read, and the parent says it is not a source composition. Two clean options in "Options" below. |
| typed positions/orders rows, Internal/Broker/Difference figures, series points, gap ranges | **Stay typed-absent on v2** | The scoped Live panels already publish the same position/order records under the same scope (FE can type them); the broker side is `BROKER_PURPOSE_NOT_COMMISSIONED`, gross/notional need the E5 currency and mark lineage, series and gap windows have no relation. No new fact would be honest. |
| venue calendar (FE-070) | Unchanged | `N28_VENUE_CALENDAR_NOT_ACTIVE`, not on a stage body. |

### Options for the Sandbox/Canary parents (owner decision; recommendation first)

* **O1 (implemented, recommended now).** Optional `identity` sibling, `include=identity`, computed by the *same* fenced
  retained-projection resolution the legacy composer uses (`ExecutionProductReadSource.resolveDeploymentScope`), attached
  after the sealed parent flight and parsed through the closed contract. No seal, no cap change, no digest change; default body
  unchanged. A 403/404 from the scope is one uniform typed absence; a changed (409) or unavailable (503) authority ends the
  request (no parent body without its identity). Cost: the body mixes two authorities, labelled by `identity.basis`.
* **O2.** New purposes `SANDBOX_IDENTITY` / `CANARY_IDENTITY` in the parent seals. Cap 31 -> 33, a newly installed reviewed
  policy, and the gate would be `audit.read` TS-accepted grants, which business readers do not hold, so the audience that may see
  names would not reach the field. Rejected unless Codex wants a second reviewed gate.
* **O3.** One new read-only route per concern (a Live-style scoped source reader for the Sandbox and Live-canary profiles)
  so each route keeps one authority. Cleanest, and the only way to carry the Sandbox/Canary stage facts; **new HTTP route(s)**,
  capability-inventory rows needed. Not done: it is Codex's authority call. Recommended for the stage facts, not for identity.

## FE reader change per member (no FE file was edited)

| Member | Reader change |
| --- | --- |
| Live v2 `identity` | `v2/readers/liveSourceOperations.ts`: accept the optional closed `identity` (7 keys incl. `basis`); request `?include=identity,stage_facts` on the SCOPED_V2 GET (the legacy body ignores it); reuse the V1 identity crumb/subtitle code (`screens/stage/identity.ts`), print `Alpha name Not published (FE-066)` with `ALPHA_NAME_NOT_PUBLISHED`. |
| Live v2 `stage_facts` | Same reader: closed `execution.stage-facts.v1`; only `reconciliation.verdict` can be AVAILABLE (`OPEN_FINDINGS`); chip wording "N open findings" must not be printed (the count is absent); runtime and Sessions keep `Not published (FE-067)` with the reason in the title. |
| Sandbox/Canary `identity` | `v2/readers/governanceParents.ts` following readers: accept the optional `identity`; send `?include=identity`; the SCOPED_V2 headers then show the Alpha crumb and the portfolio name or the typed absence. |
| everything else | No change: still typed absent. |

## Tests

* control-api `test/be-p12-scoped-stage.spec.ts` (43): Live default body unchanged (key list), identity positive, hidden-peer portfolio
  (name never in the body), hidden-peer deployment (uniform 404, no oracle), field policy hiding `alpha_id` / `name` / `portfolio_id`,
  absent/ambiguous/unnamed portfolio, foreign-lineage portfolio row (503), 6 invalid and 3 non-string `include` values (400), revoked
  scope at the final fence (409, nothing returned), no legacy / named fallback in any case; stage facts: runtime and sessions
  reasons, no verdict from an empty authorized population, `OPEN_FINDINGS` without a count, resolved vs unreadable status, hidden
  `status`, a hidden peer's finding changes nothing, business.read_all gets no `NO_OPEN_FINDINGS`, uncaptured relation; Sandbox and
  Canary services (fake sealed parent from the canonical fixture, forbidden legacy doubles): untouched without `include`, identity
  attached and judged against the published schema, hidden/not-read typed absence, 409 ends the request, bad `include` refused before
  any read; `ProfileReadService.deploymentIdentity` over the real scoped source: named, shared-portfolio hidden, hidden peer
  deployment, no grants, authority changed before delivery (409). Every real Live body and every attached parent is also validated
  against the **published** JSON Schema.
* contracts `test/execution-scoped-stage.spec.ts` (44): fixtures valid in both validators, original bodies untouched, `alpha_name`
  constant null, 14 identity contradictions refused in all three bodies, 9 stage-fact over-claims refused, reason vocabulary equals the
  producer's, route surface (query parameter only, no new path), the seven parent-purpose digests and the seal cap pinned, generated
  type tripwires. `execution-live-source.spec.ts` adapted only to register the sibling stage-facts schema.
* Generators: `node tooling/execution-operation-reader.mjs --check` clean; `openapi-typescript` outputs regenerated by the repo script only.

## Gates (actual)

| Gate | Result |
| --- | --- |
| control-api focused: be-p12-scoped-stage 43, elp2-product-reads 86, deployment-identity, stage-facts, paper-read, profile-read, governance-parent-read-boundary | green |
| contracts focused: execution-scoped-stage 44, execution-live-source 12, execution-positive-parent | green |
| `tsc -p apps/control-api/tsconfig.build.json --noEmit` | exit 0 (final source tree) |
| `scripts/contracts-test.sh` (once, under flock, docker wrapper) | exit 0: 87 files / 1444 tests, all `--check` and d.ts diffs clean. The first run failed 6 suites with "Cannot find module" because the Docker workspace stages only named leaf files; `stage-facts.ts` and `scoped-stage-wire.contract.ts` were added to that list (`scripts/contracts-test.sh`, shared file, two lines) and the rerun is the green one. |
| **NOT_RUN** | PostgreSQL-backed `elp204-positive-parent.spec.ts` (Live source section), `canary-control-room.spec.ts`, `sandbox-certification.spec.ts`; full hook / R2; visual suite; contracts-snapshot and EDS-12/N29 ledger regeneration (not committed here). |

## Producer-receipt request to Codex

1. Review the shape decision for Sandbox/Canary (O1 now, O3 for their stage facts) and the `include` opt-in rule; say whether the
   neighbouring-contract rule you want is "required typed-absent member" (then flip `optional()` to required and the fixtures/FE move
   together) or this opt-in.
2. `portfolio_name` authority: keep the alpha.read row+field rule (BE-P3 parity) or require the `portfolio.read` /
   `portfolio.read_restricted` collection purposes. The second is stricter for alpha-only viewers and wider for portfolio members.
3. Vocabulary: add `runtime_state` (+ since) and the session instants to the read-field vocabulary and to the Manager catalogue /
   `SCOPED_LIVE_SPECS`, with the closed runtime word list; that unlocks runtime and Sessions on Live v2 with no other change.
4. `finding_type` classification table (unknown-order count), and whether a scoped reader may ever state `NO_OPEN_FINDINGS`
   (it needs a whole-population scope on a dataset-level, not resource-level, authorization).
5. Decide O3 for Sandbox/Canary stage facts, Canary compliance/rollback/trial and the typed rows (new routes, inventory rows).
6. Regenerate `contracts-snapshot.json` and the EDS-12/N29 ledgers at merge (the changed tracked files are the generator, the
   operations schema, three OpenAPI documents, three `.d.ts`, two fixtures).
