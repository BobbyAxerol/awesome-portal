# ELP2-08 — workflow contract, text states và Claude handoff

Producer: coherent normal-hook commit containing this packet; parent
`3d537127313fb3c282eda054fd180499fe4732ca`. This is **schema/fixture and pure
read-side projection delivery**, not a mounted workflow endpoint or accepted
HiFi. Consumer: `NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW`.
Read [source alignment](source-alignment.md), [reuse review](reuse-review.md),
Portal guide §§10–12/ELP2-08 and UX guide §§5–18 together.

## 1. Contract pins / how to consume

| Artifact | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/workflow.contract.ts` | `1fb94fe4beb64db7ce3d4cbe50ed44d3638f38476005cb4806aa101ba005b574` |
| `apps/control-api/src/execution-v2/workflow.ts` | `c510ad593386b7e7c0bc0cdf0c6787650ef8cb8fa319c2325c449c289030cb3d` |
| `packages/contracts/openapi/execution-workflows.openapi.json` | `b977f20e94e618705a60367c8d3cb803ecba7c3d87518b8dbc27128e3e7b753a` |
| `packages/contracts/schemas/execution-workflows.v1.schema.json` | `83513c32029b026ec6ffdbbe367ed1579b963700b96bf6a70a7667fb8cb1c9c0` |
| `packages/contracts/generated/execution-workflows.d.ts` | `6573a4507eaad1f61de901c49692c2a481b080ffe5f027df92f02d7eaddaeb83` |
| `packages/contracts/fixtures/execution-workflows.synthetic.valid.json` | `9cd96a09bda2065d38d37643c4f4c5baccf04e0a89589182f9c49d4d05386b80` |

Run `npm run generate:execution-workflows` in `packages/contracts` (or the
existing aggregate `npm run generate`). `verify-generated.sh` checks drift;
snapshot inputs include generator, fixture builder and all four outputs.
Use `components["schemas"]["WorkflowCreate" | "WorkflowCapital" |
"WorkflowLifecycle" | "WorkflowConfirmation" | "WorkflowReadState" |
"WorkflowNavigation" | "WorkflowScorePresentation" | "WorkflowAction" |
"WorkflowScreen"]` from the generated file; do not copy types into frontend.

OpenAPI `paths` is deliberately empty. These are presentation contracts, not
browser POST bodies for installing authority/census/receipts. Existing06 reads
and07 command APIs keep their own operation IDs and contracts. A future mounted
adapter must first join current authorized source facts, validate receipt
binding (workspace/profile/environment/target/currency/revision/intent), and
then call these pure projectors. Receipt strings and prerequisite booleans are
**not** proof by themselves. No HTTP controller accepts them in this delivery.
Exact amount arithmetic is validated at runtime; generated structural schemas
also reject missing applied receipts, protected-data display and unsupported
funded headlines. Full cross-field/decimal semantics remain runtime invariants.

Fixtures carry `TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT`, `production_config=false`
and `TEST_ONLY:` locators. Never mount them as source facts. Existing production
constructors still reject TEST_ONLY documents. No scoring calculator, authority
policy or production calibration has been added or replaced.

## 2. Text/state specification — layout remains Claude's design

This describes required content/interaction, **not** a new approved visual.
Claude should creatively refine the existing components under UXM approvals,
not render internal enums as headings or change shared Research design tokens.

### Create / register and capital confirmation

- Display explicit economic capital, initial management budget and currency.
  Zero is an explicit choice, not a missing default. Show separate registration,
  FUND and initial-grant steps/receipts. `W08-CREATED-UNFUNDED`, `-ZERO`, `-FUNDED`
  are the three canonical stories; their nine typed headline states are derived
  from steps, not from a toast or HTTP200. None enables trading.
- Confirmation uses canonical `CommandIntent` and `CommandPreview`; show exact
  recipient/operation, before/projected-after economic backing, margin/risk
  budget and exposure cap **independently**. Non-null capacities need source
  receipt/time. If unavailable, show “Not published”, never zero/universal1x.
  Confirmation is not an approval receipt; projected after is not applied.
- `W08-FUND` changes economic assignment; `W08-TOPUP` changes management budget;
  neither says a native/physical transfer occurred. RETURN remains uncommissioned
  under07-002, not an alias for a negative FUND/TOP_UP.
- `W08-DECREASE-REJECTED` remains a rejection, not automatic recall. Recall may
  be `WAITING_ENCUMBRANCE`/partial; `W08-PARTIAL` preserves exact five-way amounts.
  `W08-PARTIAL-CANCELLED` keeps the applied300, cancels only the remainder.
- Four status columns remain separate: delivery, owning business outcome,
  projection freshness and venue. ACK+UNKNOWN says “Check original request”,
  never “Applied”. APPLIED+CATCHING_UP shows the receipt plus projection lag,
  not a resend/reversal. Preserve receipt/context across reload.
- Draft Cancel discards local input only. After submit, cancellation is a
  separately authorized, currently uncommissioned cancel-remaining operation.
  Refresh uses original command/status; unknown never creates a new key/send.
  Repeated clicks use existing07 same-intent behavior; disable duplicate UI
  submission without claiming that disabled UI is the security boundary.

### Lifecycle / obligations / archive

- Resolve exact deployment/internal account, never “first active instance” of
  an Alpha. Current access to source and destination precedes any disclosure.
  No blocked response may disclose hidden peer IDs/counts or hidden obligations.
- `W08-EXACT-INSTANCE`, `-PENDING-DRAIN`, `-MOVE-RECEIPTS-MISSING` and
  `-MOVE-REVIEW-ONLY` are distinct stories. Fresh COMPLETE census must retain
  positions, working orders, reservations, unknown outcomes, locks, recalls,
  settlements and active children. Null/partial/stale never means drained.
- Move requires separate source-budget-return, destination-budget-grant and
  economic-settlement APPLIED receipts. Even then READY means **authority review
  only**, never dispatch/APPLIED. Owning source rechecks same root/currency/
  binding/version, destination authority and original causal attribution.
  Late fill/fee/correction continues under its original causal binding.
- Rebind is not move. `W08-REBIND-DISABLED` has no fallback command. Nonzero or
  unknown obligations block it. Resume cannot erase an ancestor restriction or
  local lock/unknown/recall. Own-source risk/activation checks remain required;
  missing analytics/Regime must not become an extra reduce-risk denial.
- Archive is a lifecycle, separate from financial stage. Residuals remain a
  disposition/reconciliation problem, not automatic liquidation/cancel/return.
  Source R2 currently requires strict drained/non-ACTIVE/zero-budget conditions;
  residual archive support in the Portal guide is **not** source commissioned.
  Archived cannot resume/move/rebind through this workflow; reactivation remains
  explicit review, without a source executor here.
- Paper monitor is a **different deployment**, with immutable origin/version/
  parameters/config digest, reason, effective time, virtual capital/currency
  and last observation. `W08-PAPER-MONITOR-LINEAGE` is synthetic descriptive
  readiness, not provisioned authority. Show paused/stale/quota-stopped separately;
  no automatic Live, reuse of original position or implicit monitor creation.

### Common public states

| Typed state | Short copy intent / interaction | Protected data |
| --- | --- | --- |
| LOADING | Loading; no success/empty claim | Discard |
| AUTHORIZED_EMPTY | No authorized results | Authorized empty only |
| READY | Ready | Current authorized data |
| PARTIAL | Partial data; refresh once | Only disclosed authorized coverage |
| STALE | Stale data; show source time, refresh once | Last-known only with explicit existing policy |
| UNAVAILABLE | Data unavailable; refresh once | Discard |
| DENIED / REVOKED | Request access / Access revoked | Discard immediately; don't keep totals/chart/tooltip |
| DISCONNECTED | Disconnected; no fake-live claim | Last-known only with explicit existing policy |
| RESYNC_REQUIRED | Refresh required | Discard; rebootstrap under current authority |
| INSUFFICIENT_EVIDENCE | More evidence required | Honest partial evidence, not zero |
| OUTCOME_UNKNOWN | Check original request | Current authorized receipt/status only, no resend |

These are finite `public_copy_key`/`next_action` inputs. Do not render arbitrary
server exception strings. Focus, keyboard, colour-independent status, modal
close/back, responsive layout and screen-reader announcement need actual
Claude browser receipts; they were not tested by backend unit tests.

### Score / navigation / Research→Governance context

- Reuse **canonical** ScoreCapsule. `W08-Q73-3` is P80/R66/B70→73.3/fair/Sơ bộ;
  contribution18.325 at25% has **no band**. Raw quality, allocated-capital
  composition and direct consolidated-NAV quality have different headlines.
  Use canonical unrounded band;74.999 is fair even if display rounds to75.
  Score config pending stays null; fixtures are not production anchors.
- Early5d in requested30d is diagnostic, not a30d actual headline. Mixed70d
  contains actual10d plus Paper40d/Sandbox20d; display stage breakdown, original
  windows and actual duration. Never add virtual capital into actual NAV.
  Regime doesn't change score/band; missing analytics doesn't disable an
  independently authorized safety action. Reuse06 numerical receipts only for
  unchanged canonical calculator, not as new browser/runtime coverage.
- Global stage ALL is navigation, not an economic aggregation. Archive is a
  separate filter. Manager and own-slice have distinct projections; own-slice
  contains no portfolio denominator, peers, ranks or provisional weights.
- Preserve workspace, selected resource IDs, view, stage/lifecycle, currency,
  window and query revision through URL/back/reload/saved views. Saved views
  grant no access. Reuse current report/stream guards. No new polling/upstream
  calls are introduced here.
- `WorkflowNavigation.origin` keeps run/RC/approval/gate/review/evidence hash.
  `governanceWorkflowLink` emits only existing same-origin gate routes and
  encoded IDs + `workspace_id`; the receiving reader resolves immutable evidence
  and current grants itself. Do not submit that navigation object as approval
  evidence, substitute a newer RC, or use R1 executor for R2/Live/Paper Exit.

## 3. M01…M10 route / dataset / permission coverage

The fixture `screens` array maps read IDs; [reuse review §2](reuse-review.md)
pins existing registry/controller locators. New UI compositions are not mounted.

| Screen | Navigation / named read | Consumer boundary |
| --- | --- | --- |
| M01 Overview | Proposed UI route; `executionManagerFundOverviewGetV1` | `/` still Command Center; don't silently replace it |
| M02 Portfolios | Existing `/deployments/portfolios`; Portfolio360 read as current reuse candidate | Root is currently default detail; directory query/composition must be refined, not mislabeled existing |
| M03 Fleet | `/deployments/alphas`; `executionManagerFleetGetV1` | Server-scoped query/count/score fields, preserve immutable IDs |
| M04 Portfolio360 | `/deployments/portfolios/:portfolioId`; `executionManagerPortfolio360GetV1` | Current resource rights; own-slice not masked full totals |
| M05 Alpha360 | `/deployments/alphas/:alphaId`; `executionManagerAlpha360GetV1` | Exact deployment selection, not first-active fallback |
| M06 Account360 | `/deployments/accounts/:accountId`; `executionManagerAccount360GetV1` | Internal account default, physical custody separately restricted |
| M07 Deployment | Existing Paper/Sandbox/Live paths; `executionManagerDeployment360GetV1` | Environment from source; Canary is not a fourth environment |
| M08 Archive | Proposed route/filter; no commissioned archive-directory read | Keep immutable history; no auto-monitor/reactivation |
| M09 Decisions/Ops | `/execution/operations`; `executionCapitalCommandStatusV1` | Status only for existing exact8 capital operations; no generic relay |
| M10 ProfileAccess | `/administration/profile-access`; reuse current policy surface | Read-all ≠ grants/mutation/protected-owner takeover |

## 4. Advertised actions → authority/API/receipt/error/test

All24 fixture actions have `runtime_enabled=false`, dataset refs for exact
resource/current scoped authority/owning receipts, a safe disabled copy key and
finite commissioning state. Capability strings match03 vocabulary where one
exists; null means **no reviewed exact action catalogue**, not permission-free.
The named capital APIs are07 `executionCapitalCommandPreviewV1`,
`executionCapitalCommandSubmitV1`, `executionCapitalCommandStatusV1`; lookup-only
reconcile remains07, not a workflow send. Unsupported families have null API IDs.

| Action(s) | Rights / technical API and workflow state | Public failure / tests |
| --- | --- | --- |
| CREATE_PORTFOLIO, REGISTER_INSTANCE | `portfolio.manage` / `deployment.register`; no mounted create adapter; WorkflowCreate | Source not qualified; independent create/fund/grant, T08-02 |
| FUND | `capital.fund`;07 exact bridge, WorkflowCapital | Dark until qualified; no physical transfer, T08-03/10 |
| INITIAL_GRANT, TOP_UP | Exact `capital.initial_grant` / `capital.top_up`;07 bridge | Budget not economic assignment, T08-02/03 |
| IMMEDIATE_DECREASE | `capital.immediate_decrease`;07 bridge | Reject without auto-recall, T08-04 |
| RECALL_PARTIAL, RECALL_FULL | Exact `capital.recall_partial` / `capital.recall_full`;07 bridge | Pending/partial and unknown kept, T08-04/05/10 |
| ADJUST_TARGET_BUDGET, SET_ROOT_LIMIT | Exact matching03 capital capability;07 bridge | Target-budget vs nominal-root effects, T08-03/10 |
| RETURN_CAPITAL | `capital.return_capital`; adapter/state mapping not commissioned | No FUND alias;07-002, T08-03 inventory |
| APPLY_PENDING, CANCEL_REMAINING, REALLOCATE_BUDGET | Exact action catalogue/adapter pending; no submit/state alias | Cancel draft isn't cancel remaining;07-002, T08-05/10 |
| ADMIN_LOCK, ADMIN_UNLOCK | Exact lock-instance catalogue pending, no submit/state alias | Local unlock can't clear ancestor;07-002, T08-06 |
| HALT, REDUCING | Existing exact `safety.halt` / `safety.reducing`, no new bridge/state alias | Analytics never extra safety gate;07-002, T08-17 |
| RESUME | `safety.resume`; descriptive WorkflowLifecycle, no source adapter | Ancestor/local restrictions remain, T08-06 |
| MOVE_ASSIGNMENT | `deployment.assignment.propose`; descriptive WorkflowLifecycle | Exact target, drain/three receipts, T08-07/08 |
| REBIND | `binding.change.propose`; descriptive WorkflowLifecycle | No new binding command; obligations/qualification, T08-09 |
| ARCHIVE, CREATE_PAPER_MONITOR, REACTIVATE | Exact capability/source adapter pending; descriptive WorkflowLifecycle | Residual disposition/monitor/review, T08-12/13 |

State support does not commission any action above. Source PM R2 and current
Edge EPG10-07 WIP are pinned in source-alignment; relay is still deny-default.

## 5. Operator walkthrough script (not executed browser evidence)

Use the canonical fixtures first; source-connected steps require separately
qualified profile/operation. Record source/bundle/API/fixture SHA and lane.

1. Three presets: owner/manager full-business visibility, distinct explicit
   mutation/delegation; researcher own-slice. Inspect counts/tooltips/exports.
2. Register explicit zero, positive-unfunded and three-receipt funded cases;
   reload between steps; no trading activation in any receipt headline.
3. Compare FUND vs budget top-up vs unsupported RETURN; inspect confirmation's
   separate capacities and source time. Confirm is not an approval receipt.
4. Reject immediate decrease; pending recall; partial apply→cancel remainder;
   verify exact five amounts and unchanged applied portion.
5. ACK/timeout/disconnect/reload/double-click: query original intent only;
   projection catching-up remains distinct from source/venue outcomes.
6. Select ambiguous Alpha then exact instance; hidden source/destination denied
   before obligation disclosure. Move open/unknown/stale then drained with
   missing receipts, finally synthetic three receipts (review-only).
7. Test local unlock under ancestor restriction; resume with local lock/unknown;
   rebind with working orders. No automatic order cancellation/liquidation.
8. Archive separate from stage; residual case blocked. Monitor not provisioned
   then synthetic RUNNING/PAUSED/STALE/QUOTA_STOPPED with immutable separate
   lineage. Reactivation stays review; no action becomes Live.
9. Navigate M01→M02/M03→360→deployment→ops and Research RC→correct gate. Preserve
   workspace/filter/window/currency/back/reload. Mark proposed routes honestly.
10. Render all12 read states; revoke/resync discards cached charts/totals and
    tooltip data. Refresh once; no polling or blind resubmit added.
11. Render73.3/fair/Sơ bộ, contribution/no-band, composition/direct distinct,
    74.999 canonical band, Early5d and mixed70d/actual10d, config pending and
    Regime unbound. Authorized safety remains independent.
12. Desktop/mobile/keyboard/screen-reader: focus return, public copy, expanded
    detail, row/action visibility, no horizontal clipping. Save actual receipts
    and request IDs; fixtures cannot close real-source operation acceptance.

Applicable UX fixtures: F01–07, F08–18, F19/20/22/23/24, F25–27/29–34/38/39;
F21/35–37/40 cross-reference unchanged06/09/10 continuity/calculation dependencies,
not new08 PASS. **Every UX browser verdict here is NOT_RUN.** New lowfi/HiFi,
screenshots, accessibility, actual route wiring and real command clicks await
Claude assignment and relevant source qualification; no baseline was recorded.

## 6. Canonical requests / next work

| ID / owner | Status / done-when |
| --- | --- |
| ELP2-REQ-08-001 / Claude, Bobby assigns UX scope | AWAITING_CONSUMER_REVIEW. Read this pin+fixture, produce requirement→component/state→field/API→browser matrix under UXM-03…09; approved lowfi→HiFi→typed integration; send reverse requests with locator/reason, no invented values/rights |
| ELP2-07-001 / qualified PM+Edge transport owner | Remains OPEN in07: exact source trust/relay/status/runtime receipts; Edge EPG10-07 IN_PROGRESS is not acceptance |
| ELP2-07-002 / operation owner | Remains OPEN in07: exact broader operation/capability/source adapters. This action inventory does not close them |
| ELP2-REQ-06-002 / backend/source/config owners | Remains OPEN in06: publication materialization/scheduler/config/qualified ALL tie-out; reused Manager routes aren't new source proof |

No new production formula decision or second debt list. No reverse consumer
request/acknowledgement has arrived for08. **Backend next-ready:**09 scoped
revocation/replay after separate assignment, or independent10 bounded acceptance
planning; source-dependent sends remain blocked locally, not a global UI block.
Full08 still needs approved design/browser and source-connected operation/read
receipts. Rollback removes/hides only additive unused workflow consumers;
preserve immutable receipts, current grants, original command recovery/history.

## 2026-10-18 — current additive repair handoff

[Owning parity/read-fence matrix](workflow-parity-and-read-fences.md) covers
existing T08-02/03/06…13 without adding fields/actions or changing version.
Regenerate with `npm run generate:execution-workflows`; canonical synthetic
fixture includes all9Create states and partial capacity provenance. Runtime
still owns ID/time ordering and exact amount comparisons; types alone cannot
express those checks. Current status/workflow/collection safe errors and data
share a genuine final authority fence, no historical proof reauthorizes a read.
Producer APPLIED_UNCOMMITTED; focused proof/normal hook pending. No Claude
review/receipt/ACK newly received; ELP2-REQ-08-001 remains awaited, not CLOSED.
Keep accepted components; actual source/workflow/browser gates remain OPEN.

Focused proof now actual:368API/80contract PASS, APIbuild/scopedPGrestore and
cleanup PASS at06:22:32UTC; [pins and coverage limits](workflow-parity-and-read-fences.md#focused-terminal--2026-10-18t062232utc).
Producer still uncommitted until normal hook lands; this is not consumer ACK.

First hook now terminal06:59:41UTC:896contracts/6882API PASS,3test-seam failures,
no commit/restore PASS. [Failure and correction](workflow-parity-and-read-fences.md#first-normal-hook-terminal--2026-10-18t065941utc)
are retained; only affected11suite validation plus one combined original04/
07/08 normal-hook retry follow. Public contract/fixture/design handoff unchanged;
producer still UNCOMMITTED/AWAITING_CONSUMER_REVIEW, no claimed acknowledgement.

Affected retake actually passed11suites/320cases at07:08:35UTC, including all
three unchanged original revoke/safe-error assertions. [Receipt and narrow
test follow-through](workflow-parity-and-read-fences.md#corrected-spy-affected-terminal--2026-10-18t070835utc).
Public generated types/fixtures and owner-held Claude handoff stay unchanged.
One combined normal hook owns landing; no extra focused build for docs.
