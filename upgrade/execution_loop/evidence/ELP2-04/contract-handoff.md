# ELP2-04 — Scoped reader handoff to Claude

**Exact-own collection local validation2026-10-18T03:46:03UTC:**7API suites/
454PASS and45contract PASS, build/scoped restore/current source freeze/owned
cleanup PASS. Producer is UNCOMMITTED pending one normal hook; exact per-file
working pins are in `f0-collection-focus-034103/controller.json` and
[owning receipt](f0-current-audit-read.md#affected-terminal--2026-10-18t034603utc).
No shared preview/source or consumer acceptance follows from this test lane.

**Current exact-own collection continuation:** additive
executionF0BlockedOperationsListV2/F0CommandCollection requires explicit
workspace/resource kind/id/lowercase environment and optional limit/after;
[owning schema/state/cursor/fixture handoff](f0-current-audit-read.md#additive-consumer-handoff).
Same12field BLOCKED items, no global totals/source dispatch or historical plan-
expiry filtering. Internal current session ceiling is not a browser contract.
APPLIED_UNCOMMITTED/validation NOT_RUN at entry; no shared preview available.
FE remains owner-held/AWAITING_CONSUMER_REVIEW, not consumer-accepted.

**2026-10-18 finite F0 continuation:** Portfolio producer landed67e5ea66;
[actual normal-hook terminal](explicit-resource-and-portfolio.md#portfolio-normal-hook-terminal-20261018-003634)
supersedes the prior pending landing, not source/runtime/consumer qualification.
[F0 exact contract and consumer map](f0-current-audit-read.md#contract-and-claude-handoff)
publishes additive executionF0BlockedOperationGetV2/F0BlockedOperationRead.
Required workspace_id, same finite12field BLOCKED body, no source call/command.
Use only for a known F0 intent; do not infer family by op_ or retry generic
parent/legacy after refusal. Synthetic fixture is not a broker/source receipt.
Generation command, typed errors and current authority/date semantics are in
the owning packet; entry APPLIED_UNCOMMITTED/NOT_RUN until actual terminal.
FE remains NOT_STARTED_BY_OWNER_DIRECTION/AWAITING_CONSUMER_REVIEW. Prepared
handoff does not establish Claude receipt, assignment or acceptance.

F0 affected validation00:48:55UTC:69actual-PG/HTTP tests+27contract tests PASS;
five unchanged suites252PASS reused separately. Canonical CommandProblem now
types400/401/403/404/409/503 bodies; do not parse prose or expect copy/action on
every guard error. [Exact receipt/limits](f0-current-audit-read.md#affected-retake-terminal-2026-10-18t004855utc).
Normal-hook landing remains pending; no shared preview rebuild or FE assignment.

**2026-10-18 exact-sharing/mixed-Portfolio validation:**
[Owning04-009 packet](explicit-resource-and-portfolio.md#affected-retake-terminal--2026-10-18t000452z)
has actual112/112 affected tests/build/scopedPGrestore PASS and separately
reused323 unchanged tests. No new public schema/field/generation requirement;
existing scoped Manager consumer must preserve whole ordinary vs restricted
items, visible-only totals and per-profile states. A real positive-purpose
error is not permission to retry a broader/legacy API. Exact account DENY may
remove both own/peer tuples sharing that account; do not infer full custody
from is_full_resource. Producer landing remains pending normal-hook terminal,
runtime and consumer acceptance separate; frontend remains owner-held. Read
the packet and producer commit before proposing a consumer change. Claude
requests/reviews will be triaged under rules7.3, not inferred as accepted.

Status: **AWAITING_CONSUMER_REVIEW; NOT_RUNTIME_ACTIVATED**.
Producer branch: `docs/research-loop-plan`; base
`c1d6b2dc53f1f80ac44cdfd9d96d159c4e9aae64`. The closeout receipt in this
packet supplies the actual landing/test pin. Until that pin exists these
contracts are working-tree changes, not a deployed artifact.

## 1. What changed and what did not

The server selects legacy compatibility versus scoped V2 from current durable
policy. There is no browser flag to acquire scope. A removed/pending V2 policy
cannot fall back to legacy. Session, viewer/source workspace, profile, current
resource membership, field policy and source publication participate in the
scope and final delivery fence. The browser cannot supply a relation, authority
tuple, policy proof or trusted profile mapping.

Legacy response versions remain distinct. V2 uses finite DTOs and scoped
counts; it is not a legacy full response with some rows hidden. No frontend
file, layout, token or baseline is changed by this backend package. No source,
stream, mutation, preview or production activation is authorized by delivery.

## 2. Contract/consumer map

| Consumer | Published source / generated types | Required behavior |
| --- | --- | --- |
| History | `execution-history.openapi.json` / `execution-history.d.ts`; `executionRetainedHistoryGet` | Exact decimals, UTC-ms public times; opaque server continuation. Preserve null/zero and authorized coverage across pages. Private microsecond cursor prevents duplicates without exposing extra precision. |
| Fleet, Portfolios, Bindings | existing `execution-manager-lists.openapi.json` / `.d.ts`, response union with scoped Manager DTO | Scope before search/sort/count/page; `profile_dispositions` explains partial all-environment reads. Do not turn denied profiles into zero totals or drop permitted profiles. Portfolio pagination accepts bounded after/before. |
| Alpha/Portfolio/Account/Binding detail | `execution-resource-scoped.openapi.json` / `.d.ts`; four `executionScoped*ResourceGetV2` operations | Consume finite panel fields. Shared-account identity is not permission to display the account's whole balance. Financial summaries may remain typed unavailable while authorized raw panels are available. |
| Adapter and Alpha/Account records | `execution-scoped-records.openapi.json` / `.d.ts`; `executionScopedAdapterGet`, `executionScopedAlphaRecordsGet`, `executionScopedAccountRecordsGet` | No generic raw payload rendering. Query/filter only published fields; preserve scope-bound cursor and availability. |
| Technical health/diagnostics | same scoped-records file; `executionScopedTechnicalHealthGet`, `executionScopedTechnicalDiagnosticsGet` | Technical permission is independent of full business read. Do not show topology, global findings/counts or raw admission diagnostics in a business-only view. |
| Retained banner/context | existing `execution-retained-review.openapi.json` / `.d.ts`, V1/V2 union | V2 does not publish global history counts/clocks. Null is “not published”, not zero/current time. Retained mode never implies stream or mutation permission. |
| Local query analytics | existing `execution-query-analytics.openapi.json` / `.d.ts`, additive `execution.query-analytics-envelope.v2` | `scoped_metadata` states authorized-only coverage. Global observation clock is null; `as_of` comes only from authorized record timestamps or is null. Do not cast V2 into V1. |
| Named retained operation pages | `execution-retained-operation-page.v1.schema.json` additive scope fields | `visibility`, `coverage`, `read_scope` travel together. Authorized observations do not upgrade rejected/current-source authority or claim replay. |
| Command Center | existing `execution-command-center.openapi.json` / `.d.ts` additive `read_scope` | Fleet counters are visible-deployment-only. Unresolved Portal workflow/journal/reconciliation cards keep explicit reasons, not fake zero or whole-screen denial. |

All OpenAPI/schema/generated paths above are relative to `packages/contracts/`.
Regenerate with `npm run generate:execution-history` there (chains the scoped
families), and the existing Command Center generator for that existing file.
Canonical examples are `fixtures/execution-*.synthetic.valid.json` and
`fixtures/execution-query-analytics.scoped.v2.json`. Their lane is explicitly
**TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT**; they must not be shown as real users,
real grants, accepted TS mappings or current runtime facts.

## 3. Refusals and continuation

- Preserve HTTP 400/403/404/409/503 and typed error codes. Unknown and hidden
  resource lookups must not become an existence oracle.
- `EXECUTION_READ_ACCESS_CHANGED` invalidates a flight/cursor after policy,
  session, membership or publication changes. Start a fresh authorized read;
  never retry by stripping the cursor's authority or switching to a legacy API.
- `ANALYTICS_SCOPED_TRANSPORT_NOT_COMMISSIONED`,
  `MARKET_CONTEXT_SCOPED_TRANSPORT_NOT_COMMISSIONED` and
  `EXECUTION_SCOPED_STREAM_NOT_COMMISSIONED` describe exact unqualified V2
  transports. They do not mean all local scoped reads are unavailable.
- Public venue price candles and private Market Context are different sources;
  public-data permission is not a grant to private account/market projections.
- Refresh performs a new authorized read. Never cache effective permission with
  immutable payload, infer export from read, or reopen a global stream after a
  V2 refusal. Current gate authority still controls Governance separately.

## 4. Claude work and acceptance

When Bobby assigns frontend: inspect existing shared components and UX guide;
add typed V2 branches, manager/researcher variants, per-profile partial states,
safe missing-clock/financial-summary copy and opaque pagination. Preserve
workspace deep links and Research consumers. No design implementation is
assigned by this handoff alone.

Fixture gates: schema union narrowing; full/own/linked-shell/denied/empty;
missing global metadata; revoked cursor; technical-only versus business-only;
no stream/poll fallback; no hidden totals in text/tooltips/export buttons.
Real API/browser gates require a separately qualified source/profile and
approved policy; test fixtures do not meet that prerequisite. Record
`ACCEPTED` or `CHANGES_REQUESTED` with producer pin, bundle/API identity and
receipt. Producer delivery alone cannot close consumer acceptance.

## 5. Remaining dependencies and next phase

Read the current route-census disposition and closeout receipt before enabling
any V2 policy. Parent Governance/incident/workflow target lineage, source
publication and exact technical field policy must not be inferred from a
workspace role or a scoped child panel. The external decision/request IDs in
ELP2-00/03 retain their original owners. ELP2-05 is not started by this package;
dependency readiness and owner assignment are separate.

## 6. Prompt for the next explicitly assigned Claude review

> Read Unified §14 ELP2-01…04, this handoff, `closeout-2026-10-16.md` and
> `route-census-closeout.md` on `docs/research-loop-plan`; pin the producer
> commit before changing a consumer. Review generated V1/V2 narrowing and the
> canonical TEST_ONLY fixtures. Wire only the screens Bobby assigns, preserving
> the accepted shared UI and workspace/deep links. Show authorized-only counts,
> per-profile partial states and null clocks/financial summaries truthfully.
> Do not enable policy/source/SSE or replace a commissioning refusal with an
> empty list/zero/legacy request. Catalogue readiness is not permission.
> Acknowledge ELP2-REQ-04-010 as ACCEPTED or CHANGES_REQUESTED, with exact
> component/operation/field and receipt; record fixture versus real API/browser
> separately. Any missing positive parent/alias contract belongs to008/009,
> not a frontend workaround. Do not open the next backend phase or deploy.

This text is a prepared handoff, not proof that Claude received or accepted it.

## 2026-10-17 — additive finite readers, consumer still owner-held

Read [the exact producer packet](finite-account-command-readers.md) first.
Account-sync current/snapshot use the existing named-page DTO, five public
candidate fields and their distinct source clocks; private sync_id stays
private even in legacy. V2 field/resource/current-source scope is not widened.
Other27 unclassified aliases remain closed; no complete-history/health claim.

Additive `executionCapitalCommandCollectionV1` publishes `CommandCollectionQuery`
and `CommandCollection` in `execution-trusted-commands.d.ts`. Require explicit
workspace/resource_kind/resource_id/environment. limit1..100(default25), signed
after; no global totals/mixed queue. Preserve UNKNOWN/null amounts and four
status axes. Hidden/unknown404, invalid400, refresh409 and unavailable503 are
not empty successes. Canonical synthetic fixture is
`execution-trusted-command-collection.synthetic.valid.json`.
Regenerate with `npm --prefix packages/contracts run generate:execution-trusted-commands`.
Existing submit/detail schemas and UI remain unchanged. Source at this entry
is UNCOMMITTED/NOT_RUN; consult terminal addendum before consumption.
AWAITING_CONSUMER_REVIEW / NOT_STARTED_BY_OWNER_DIRECTION, not delivered UI.

**Producer landed,2026-10-17T20:07Z:**
`5cac1151e27a3276ed9c32f56fe485197c2cdcaa` supersedes UNCOMMITTED for the
finite readers above. [Actual hook/restore/source and cleanup receipt](finite-account-command-readers.md#finite-reader-terminal-20261017-2007).
No further schema/field change in this addendum; do not rerun or regenerate
unchanged contracts just for this record. Consumer still awaits Bobby's
assignment and Claude's actual acknowledgement/browser receipt.

## 2026-10-17 — Account-policy metadata / current account scope

Read [owning producer packet](account-policy-metadata.md) and its actual terminal
before consuming. Existing `managerAccountPoliciesPageV1` now has a finite
`AccountPolicyMetadataValues` component in execution-retained-review.d.ts and
canonical TEST_ONLY fixture `execution-account-policy-metadata.synthetic.valid.json`.
Only account_id/mode/venue/created_at/updated_at can publish, still intersected
with the current V2 field/resource grant. Private account_policy_id is keyed,
not a public field or business permission. Source mode case is preserved;
null/missing/epoch0 and retained PARTIAL/STALE/unknown-history remain distinct.

Valid explicit current account authority is no longer implicitly dependent on
Alpha ownership or Portfolio membership. Existing account-purpose readers keep
their own finite fields/current fences; no account-only population is invented.
The new alias is finite/keyed in BOTH retained modes; unrelated legacy aliases
and the separate legacy current-source translator keep their behavior. Old
retained account-policy continuation may invalidate at this new identity recipe.
No fee/leverage/margin/loan UI, action, polling, source refresh or custody claim.

Consumer remains NOT_STARTED_BY_OWNER_DIRECTION/AWAITING_CONSUMER_REVIEW.
When assigned, pin producer commit and generated type/fixture, map only real
granted values, then take fixture and genuine API/browser receipts separately.
This handoff is not proof of a real current-human/source provider or acceptance.

## 2026-10-17 — exact sharing and mixed Portfolio purposes

Account metadata producer landed `da3a5f5cf64b1db191d804e43dbc96a0a8375e76`;
its [normal-hook terminal](account-policy-metadata.md#normal-hook-terminal-20261017-234642)
supersedes earlier UNCOMMITTED, not source/runtime/consumer qualification.

Read [the owning exact-sharing packet](explicit-resource-and-portfolio.md).
No new public schema/operation/field or regeneration is required. Existing
`ManagerScopedResponse` / `managerPortfoliosList` and named retained readers
receive the corrected current exact-ALLOW population. Explicit Alpha/Portfolio
sharing does not require inventing ownership/member/linkage. Ordinary Portfolio
items win whole over restricted duplicates; never union fields, financial rows
or totals. `is_full_resource` is complete visible resource row grain, not
business.read_all/custody/accounting authority. Counts remain visible-only.

Respect each profile's PARTIAL/DENIED/UNAVAILABLE, typed 404/409/503 and refresh
requirements. Old Portfolio cursor semantics intentionally invalidate; do not
reuse a cursor from the old single-purpose population. Other Manager surfaces
keep their existing cursor/legacy behavior. Source errors do not grant absence
and final revoke/expiry aborts prepared bytes even for omitted/shadowed scopes.
This correction is APPLIED_UNCOMMITTED/NOT_RUN at entry; pin actual terminal
and commit before integration. Claude remains NOT_STARTED_BY_OWNER_DIRECTION /
AWAITING_CONSUMER_REVIEW; no frontend edit/assignment/acknowledgement inferred.
