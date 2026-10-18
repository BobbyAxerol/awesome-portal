# ELP2-05 coverage and consumer handoff

## Claude intake2026-10-18 — FE-002/003/004/017/018/019/022

Owner Codex, consumer Claude. To-do: explicit stage/environment/freshness
mapping and immutable historical alpha-version/source statement lineage.
FE-018 CHANGES_REQUESTED: use exact versioned Edge compatibility/source pins,
not vendoring its entire repo. FE-019 PM39aaa9c6 is a read-only source pin, not
proof of deployed runtime or installed authority. Missing source mappings stay
OPEN with producer locators. Exit: generated closed mappings, historical-version
regression and source refusal tests, then selected genuine producer receipts;
fixture/code review cannot close source gates. [Intake](../ELP2-10/claude-review-intake-2026-10-18.md).


## Current source return —2026-10-18

Original05-001 remains OPEN for a qualified selected financial publication,
not for rebuilding code already supplied by PM. [Full readonly source intake,
exact byte pins, owner receipts and missing assembly](manager-source-intake.md)
is SOURCE_ONLY/NOT_RUN. PM observed39aaa9c6 now implements17selected-history
factories, strict request/selection correlation, existing mTLS storage/status
and a source-COMMIT-before-network delivery coordinator. Reuse those named
paths; STORED is not Portal projection applied or source whole-census proof.
Owner157/180-case receipts overlap historical receipts and are not Main tests,
one combined run, installed-provider acceptance or new Portal coverage.

Accepted next implementation/request to the source owner, in original05-001:
exact five-ID+stage/time mapping; unique economic ownership/full member census;
actual independent account/root/Portfolio NAV and classified flows; full
allocated denominator including absent/unscored/archived members; complete
cost/mark/FX/notional/observation grid; accepted source-set/cuts/epoch/generation
and owning ReportSourceDefinition/publication. Existing typed missing fields
must not become zeros, Portal observation time or a fabricated TS checkpoint.
These are actual assembly/installation gaps, not merely calibration approval.

Done-when: qualified owning bytes and current human/workload/field publication
enter the existing06consumer/worker transaction with exact receipts, one atomic
raw+Manager revision/head/checkpoint and ACK after release, plus affected
source/PG/API proof. Regime corpus is separate; independent finite current
reads and approved command preparation continue. No new producer endpoint,
parallel ledger/poller, schema availability, installed provider or frontend
change is claimed. Claude remains owner-held/AWAITING_CONSUMER_REVIEW; apply
recurring7.3 intake at entry/freeze/landing/exit, with original finding IDs.

Producer branch `docs/research-loop-plan`, entry `2ec5924d`; coherent commit
supplies the landing pin. This handoff is prepared for Bobby to assign Claude,
not proof of consumer acknowledgement. Frontend NOT_STARTED_BY_OWNER_DIRECTION;
AWAITING_CONSUMER_REVIEW. No preview rebuild or new source activation.

## Contract mapping

Existing authenticated `GET /api/v1/execution/manager/operations`, operationId
`executionManagerPublicationCatalogueGet`, gains additive `publication_catalogue`.
Generated file `packages/contracts/generated/execution-publication-catalogue.d.ts`,
types `ManagerPublicationManifest`, `PublicationCatalogue`, `PublicationFamily`,
`PublicationField`. Regenerate only with
`npm --prefix packages/contracts run generate:execution-publication`.

- Existing54 operation IDs/route aliases and current-page DTOs remain unchanged.
  New inventory has42 logical families and31 fields, not42 mounted endpoints.
- Catalogue availability/owner/grain/history/retention are explicit and static.
  It is not actor permission, latest source clock, source totals or a grant.
  No raw source relation, query, JWT, cursor, mTLS input or credential is added.
- `lane=SOURCE_CONTRACT_NOT_RUNTIME_ACCEPTANCE`; new exports stay UNAVAILABLE,
  history UNKNOWN, runtime false. Do not replace these with0/empty/AVAILABLE.
  Existing current pages have a different authority and do not become disabled
  merely because a new semantic family is unqualified.
- Current-page cap200 rows/1MiB is per request, not a total-history cap. The
  opaque continuation is operation/principal/workspace/environment/profile/
  contract/catalogue bound. No stable snapshot or event replay is asserted.
- Public times remain UTC epoch-ms; valid source micro/nanoseconds are explicitly
  floored to ms, never asserted as event ordering. Four existing composite-key
  aliases (fills, portfolio-equity snapshots, broker-sync valuation history,
  reconciliation observation buckets) now preserve source sub-ms distinctions
  in their private hashed identity preimage in both current/retained adapters.
  Equivalent offsets/fraction spellings agree; exact-ms IDs stay unchanged.
  This corrects collisions, not an event replay/sequence capability; source
  precision absent from retained data is not reconstructed. No raw key is exposed.
  Exact decimal strings and known
  zero/null distinctions are unchanged. Unknown source fields remain stripped;
  secret-shaped *selected schema fields* fail closed at registry compilation.
- The new server-only `datasetPublication` parser / `withCataloguePublications`
  composes with existing AccessTrustProvider and ReadScopes, not a new identity
  service or HTTP client. Default trust is unchanged/unqualified. Frozen new
  SOURCE_VERIFIED exports are rejected; TEST_ONLY needs an explicit isolated
  server option. No production caller installs this provider in this package.
- Test continuity is partition-specific: W/W+1 counters remain strings beyond
  JS safe integer, with expected epoch/generation/partition/snapshot, retention
  floor and proof refs. This validates input contracts, not source ordering or
  durable projection/ACK (ELP2-06/09). Drain/revoke/expiry are re-read without
  caching by the existing mint/final-delivery mechanism. No old-provider fallback.

Canonical examples: `fixtures/execution-publication-catalogue.source.valid.json`
is derived from actual pinned *logical* contracts; the separate
`execution-dataset-publication.synthetic.valid.json` is explicitly TEST_ONLY.
Neither is an accepted TS publication, current grant or product read receipt.

## Fourteen product groups → source / available reuse / remaining gap

Full42-family source registry preserves writer/query/grain/retention/schema and
source gates. Full31-field dictionary preserves source locators and units;
field presence is not window/return certification. This index maps the ELP2-00
groups, not an alternative authority or inferred field join.

| Product group | Named existing current surface / logical source families | Remaining positive requirement |
| --- | --- | --- |
| Identity/session/app | Portal access/session; portal_identity_profile_session | Current Portal policy and stable IDs, never TS login substitution |
| Membership/ownership | user_identity_mapping,portfolio_membership,alpha_ownership | Accepted current TS membership/human mapping, not Manager names |
| Assignment | portfolios,strategy-deployments,portfolio-allocations; portfolio/deployment/internal-account registries | Exact temporal assignment/version/account scope |
| Binding/profile | accounts/profile/resource readers; account_binding | Current native mapping; physical custody purpose independent |
| Capital | account-reservations,portfolio-capital-ledger; root limit/assignment/budget/locks/recall | R2 economic backing vs margin/risk budget vs separate exposure cap; legacy rows insufficient |
| Orders/fills/obligations | orders,fills,paper-open-orders,order-brackets,conditional-order-groups | Source commit/epoch/correction/retention; current observations are not lifecycle replay |
| Postings/corrections | accounting_postings_corrections,economic_journal | Published economic fact identity/revisions, not local capital-ledger inference |
| Positions/episodes | positions-v2; positions_episodes | Episode grain, late obligations and correction proof |
| Risk/capacity | risk-grants,sizing-decisions; risk_state_limits,execution_grant_reservation | Budget/backing/cap units/provenance; no universal1x |
| Valuation/reconciliation | equity snapshots/balances; valuation_prices_used,reconciliation | Currency/FX/source-cut/cost coverage; technical permission separate |
| Audit/receipt/recovery | command/ack/operations aliases; command_receipts,operational_audit,recovery_quality_events | Technical/audit purpose and current parent lineage; existing04-008/009 stay open |
| Fund/portfolio overview | fund_portfolio_overview,balances_collateral,fees_funding,accounting_postings_corrections | Unique consolidated NAV, classified external/internal flows, cost applicability and fill/FX notional |
| Fleet | scoped Manager lists; alpha_fleet_overview,alpha_registry,deployment_registry | Fleet alpha/version/portfolio grouping and exact five-ID member tuples, owner/archive proof |
| QBTS/Regime | qbts_per_alpha,manager_alpha_score,portfolio_score,regime_fit | Approved runtime calibration and inputs. Direct ledger NAV score does not require a Research run; Regime does |

## Claude task, only when assigned

Consume the generated additive catalogue type; preserve existing approved UI.
Map requested screen fields to availability/grain/unit without inventing an
endpoint for each family. Maintain pending fields, purpose-specific refusal,
unknown source clocks, current-page versus retained versus authoritative history
and research-dependent versus ledger-only score states. Use current04 handoff
for scoped data/cursor handling. No stream/poll fallback, source URLs, generic
relation selector or hidden financial totals. Design/fixture gates can proceed;
real UI acceptance waits on an actually qualified selected source and06 read model.

Acceptance: generated union narrowing and null/zero behavior, old54 mappings,
unavailable new family beside available authorized legacy page, no hidden
query/existence signals, opaque cursor errors/revoke. Browser receipts must pin
bundle/API/policy/source and be distinct from fixtures. Return ACCEPTED or
CHANGES_REQUESTED with exact fields and receipt; no acknowledgement recorded yet.

### C4/P1 follow-through —2026-10-18

Bounded authorized-name query, true metric keys/stage vocabulary and explicit
current-only refusal are integrated for the same06 reader. Exact types,
fixtures and qualified-window limitations are in the
[shared producer packet](../ELP2-10/manager-intake-2026-10-18.md).
Qualification/consumer ACK remain pending; no catalogue row becomes mounted.
