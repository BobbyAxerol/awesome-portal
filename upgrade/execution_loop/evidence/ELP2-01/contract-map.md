# ELP2-01 — Contract dictionary and compatibility map

Delivery level: CONTRACT_ONLY; no new routes mounted and no runtime enabled.
Canonical source is `packages/contracts/tooling/execution-v2-foundation.mjs`;
generated schema/OpenAPI/types and synthetic FX-01…25 are versioned together.
Regenerate: `npm --prefix packages/contracts run generate:execution-v2-foundation`.
This narrow command does not regenerate Research or touch frontend fixtures.

| Existing source / authority | Foundation type / mapping | Compatibility / limits |
| --- | --- | --- |
| `auth/auth.service.ts`, stable Portal issuer+subject | HumanIdentity, WorkloadIdentity | Separate descriptors, not proof of authenticated PM human/workload. Mapping unverified stays UNMAPPED/CONFLICT; no username fallback |
| `execution/current-source.proxy.ts`, Edge producer | StreamEnvelope, BrowserSnapshotMetadata, LegacyObservation, Quality, EndpointReadiness | Proposed canonical `contract_version=edge.v1` maps explicitly to `schema_version=portal.snapshot.v1`; legacy runtime unchanged. Source continuity epoch, Portal generation, emitted/produced/received clocks independent; no inferred replay from current page |
| `manager-lists/contracts.ts`, resource BFFs | Binding, ManagerPortfolio, RestrictedPortfolio | Additive v2 DTO, not reinterpretation of existing nested alpha/grouping response. Fleet grain alpha/version/portfolio; native physical pool not internal balance |
| Current retained reads | Quality.coverage=RETAINED_OBSERVATIONS | Retained observation time is not source as-of; no stream/command activation |
| PM R2 HTTP candidate `operator_adapters.py:31–56,163–185` | PmaCapitalCommand, PmCounter | HTTP decimal-counter strings bounded int64; strict operation-specific keys. Internal Python integer is NOT HTTP JSON number. No actor/context/digest injected into economic payload |
| PM component parser `operator_api_contract.py:104–153` | AmountPartition, TrustedCommandContext | Context stays server-owned. Partition exact arithmetic tested; actual authentication/commit lease is not supplied by parsing schema |
| Score FINAL1.1 §§4/5.8/8 | ScorePolicy, ScoreCapsule, MetricCapsule | Fixed weights/bands, independent raw/contribution/composition/direct-NAV. TEST_ONLY numerical examples; production config policy_pending; no calculator or runtime calibration implemented here |
| Published client | `packages/contracts/generated/execution-v2-foundation.d.ts` | Schema-only OpenAPI paths empty, all definitions generated. Do not invent operationIds/routes from examples |

PM source pin reviewed read-only: `d16aa2b5f251596e469807f57e81fe14cdc7e763`,
worktree `/home/bobby/.worktrees/trading-system-pm-v1_1` on HK. R2 guide hash
`7d79d8de84eab19d0d2de3dce2b4c9278a691277b0b8b4379a7db0000dfc8945`.
HTTP adapter hash `71254a25adb9a91b0211dfb4bc3644877caa57e219dc8d7294a4612213659f18`.
Source-confirmed does not mean deployed/qualified trust or TS acceptance.

## Authority-source discrepancies (preserved, not papered over)

- R2 sample1060–1069 omits recipient_kind and adds command_scope, incompatible
  with current strict parser. Pinned parser/HTTP adapter governs this schema;
  no remote guide changed. Extra sample keys deliberately fail contract tests.
- RETURN_CAPITAL exists in component parser but candidate SUPPORTED excludes
  it. Schema represents component request, backend serializer refuses dispatch
  candidate input; unavailable adapter is explicit. No actual dispatch exists.
- Component zero initial grant is not zero HTTP amount support: current HTTP
  parser requires amount>0; absolute target fields may be0. No false positive
  zero-grant fixture. Candidate router is unmounted with no default trust leases.
- Currency is source-matched text (USDT valid), not forced ISO three characters.
- PM expected_versions is not the generic opaque Portal revision. Wrong
  operation keys, number values, >int64, exponent/leading-zero forms are denied.
- PM text is trimmed/nonempty, excludes controls and is limited to512 UTF-8
  bytes by the runtime validator. JSON Schema enforces character shape/ceiling;
  its maxLength alone cannot prove a byte limit. Multibyte byte-bound tests
  cover this distinction. Browser/session IDs use their own explicit bounds.

## Semantics and field dictionary

- Money, quantities, weights and scores: exact decimal strings; missing=null,
  known zero="0"; no float coercion. Currency/basis/domain travels with metric.
- Time: UTC epoch milliseconds, safe integer; requested/effective windows kept
  separately, end exclusive. Source time may be null; never replace with receive time.
- IDs/revisions/cursors: opaque strings; no display-name or encoded version
  inference. Canonical resolution/ambiguous-target rejection belongs the named
  resolver at command/read integration, not permission from an ID string.
- Environment paper/sandbox/live is not financial stage PAPER/SANDBOX/CANARY/LIVE;
  lifecycle ACTIVE/ARCHIVE_REQUESTED/ARCHIVED is independent. ALL is navigation.
- Availability uppercase and score status lowercase are separate fields. Missing
  constituent q does not suppress an independently supported direct-NAV score.
- Restricted schema has no portfolio NAV/totals/peer/rank/physical fields. Exact
  researcher disclosure matrix still pending; synthetic fixtures are not approval.
- FieldCatalogueEntry permits only named scalar operators, never SQL/expression.
- Score capsules include typed components/bounds/counts/duration/subject/binding,
  allocation coverage, consolidation/return source, formula/policy/config and
  append-only revision provenance. Aggregate-only states cannot label raw/direct
  scores. Canonical band boundary regexes do not use floating-point rounding.
- `edgeMetadataToBrowser` requires explicit projection reuse or derived lineage.
  Missing coverage proof yields UNRESOLVED and null facts/recorded watermarks;
  it never substitutes source observation/emission/receive time. Legacy RFC3339
  needs timezone and at most millisecond precision; ambiguous source_generation
  yields unavailable, not invented continuity/projection split. DEMO needs
  an explicit server-verified native-profile mapping before sandbox conversion.
- TrustedCommandContext is server-owned descriptor only. Public browser intent
  rejects actor/human/workload/relation/URL/JWT/mTLS/SQL inputs; source auth still
  requires separate verified transport and current authority at commit.

## Claude handoff (not an instruction to start)

Frontend NOT_STARTED_BY_OWNER_DIRECTION; acknowledgement AWAITING_CONSUMER_REVIEW.
Later consume generated `components["schemas"]` and the labelled synthetic pack
for UXM-01/02 role/state/field mapping. CONTRACT_ONLY, no operationId exists yet.
Do not call an unmounted endpoint or infer permission from fixtures. Identity/
lifecycle operations follow02; current policy/ceiling follows03; enforced reads04;
real source families/selected BFFs05/06. Do not modify accepted Research UI.
