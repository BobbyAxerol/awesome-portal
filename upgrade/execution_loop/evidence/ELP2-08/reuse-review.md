# ELP2-08 — independent reuse / boundary review

Read-only source review on the assigned integration baseline
`3d537127313fb3c282eda054fd180499fe4732ca`,
`/home/bobby/portal-research`, branch `docs/research-loop-plan`.
Reviewer scope: root/campaign rules, the phase task map, Portal guide §§10–12
and ELP2-08, UX guide §§5–18, existing source and canonical fixtures. This
review did not run tests, browser, build, source SSH, migration or runtime
commands, and did not change any implementation/shared contract. Its only
written file is this review. Findings describe source, not deployed behavior.

## 1. Reuse decisions

| Existing authority / exact locator | Reuse for ELP2-08 | Boundary that must remain |
| --- | --- | --- |
| `apps/control-api/src/execution-v2/foundation.contract.ts:4–20`, `:61–66` | Exact decimal strings, UTC-ms, opaque revisions, precise amount-partition assertion | Never floating-point money or status inferred from HTTP code |
| `foundation.contract.ts:68–76`; `command.contract.ts:5–10` | Browser intent excludes trusted actors, generic relation/URL/SQL and credentials; exact recipient kind/deployment binding | A workflow DTO is not another accepted command-intake route |
| `command.contract.ts:22–42` | Amounts, business receipt states, four independent status dimensions and source-dark preview | Its executable capital catalogue has eight operations only; schema support elsewhere is not dispatch commissioning |
| `command.service.ts:58–82`, `:141–186` | Partition and monotonic status merge, unknown-outcome lookup semantics | ACK is not APPLIED; stale projection is not a reason to send again |
| `access.contract.ts:8–19`, `access-policy.ts:128–172`, `access.service.ts:68–120` | Finite current actions and fenced access decisions | Never grant mutation from read-all, persona name, a link, numeric score or synthetic fixture |
| `packages/contracts/tooling/execution-v2-foundation.mjs:74–138` | Canonical Quality, Binding, ScoreCapsule and AmountPartition definitions | Prefer references/composition, not an alternative score vocabulary or competing operation body |
| Same generator `:186–211` | RestrictedPortfolio, OwnershipInterval and ArchiveDisposition | Own-slice must not contain manager denominators, peers or physical-pool totals; archive never implies liquidation |
| `manager-model.contract.ts:19–33`, `:98–116`; `manager-model.service.ts:24–66` | Metric quality, six named surfaces, partitioned economic statements and typed policy-pending production scores | Product constructor rejects TEST_ONLY documents; synthetic workflow responses are not served source truth |
| `manager-score.ts:138–145`, `:210–256`, `:429–503`, `:536–579` | Canonical exact band, shared reference calculation, allocation/full-denominator semantics, continuity and actual/observed duration | Explanation projection must not compute a new formula or promote TEST_ONLY preview into production value |
| `governance/review-context.ts:25–80`, `:82–120` | R1/R2/Live/Paper Exit current context, workspace, expected version, exact evidence hashes, gate-specific command type; all have `source_side_effect_requested=false` | Preserve the context; do not fabricate gate acceptance, use lineage hashes as evidence hashes, or route R2 through R1 executor |
| `research/release-candidate.contract.ts:119–161`, `:197–249`; `release-candidate-publication.contract.ts:31–145` | Local seal/delivery/approval separation, exact immutable pack and approval linkage, selected-trial presentation, safe R1 href | A local seal is not publication; publication is not approval; approval is not upstream execution |

Canonical fixtures already exist at:

- `packages/contracts/fixtures/execution-v2-foundation.synthetic.valid.json`
  (FX-01…25 authority, binding, scoring and lifecycle examples).
- `execution-trusted-commands.synthetic.valid.json` in the same directory
  (exact intent, blocked preview and ACK+UNKNOWN).
- `execution-access.synthetic.valid.json`,
  `execution-manager-dataset.synthetic.valid.json`,
  `governance-review-context.synthetic.valid.json`,
  `research-release-candidate-publication.p22-governance.fixtures.json`.

These fixtures are inputs to consumer testing, not real source/runtime receipts.
ELP2-06/07 packets already record their own actual test results. This review
does not rerun or add their counts to ELP2-08 coverage.

## 2. Navigation is a reuse map, not permission to rename routes

The registry owns deployed route definitions. `PortalRoutes.tsx:145–153` still
uses `/` for Command Center; `previewRegistry.ts:45–54` maps several feature
roots to cast/default detail components. New manager IA must not silently claim
those roots already implement the proposed M01/M02 views.

| UX surface | Existing route / source | ELP2-08 treatment |
| --- | --- | --- |
| M01 Fund/Manager Overview | No independent commissioned Fund Overview product route; `/` currently Command Center | New UI route is PROPOSED / owner design work, not an existing-route assertion |
| M02 Portfolios Directory | `/deployments/portfolios` (`registry.json:916`) currently defaults Portfolio 360 fixture (`previewRegistry.ts:50`) | Preserve root/deep links; directory composition remains Claude work |
| M03 Fleet | `/deployments/alphas` (`registry.json:2401`) | Preserve exact immutable IDs and query/context |
| M04 Portfolio 360 | `/deployments/portfolios/:portfolioId` (`registry.json:2482`) | Existing detail compatibility |
| M05 Alpha 360 | `/deployments/alphas/:alphaId` (`registry.json:2446`) | Existing detail compatibility |
| M06 Account 360 | `/deployments/accounts/:accountId` (`registry.json:2568`) | Existing logical account route; do not expose physical custody by default |
| M07 Deployment/Execution | `/deployments/paper/:deploymentId`, `/deployments/sandbox/:deploymentId`, `/deployments/live/:deploymentId`; canonical encoded ID mapping `execution/idLinks.tsx:18–26` | Environment/source fact chooses route; Canary is financial stage, not a fourth environment |
| M08 Archived Alphas | No independent commissioned product route in current registry | Lifecycle filter/proposed design; do not invent a source/API route or auto-create monitor |
| M09 Operations/Decisions | `/execution/operations` (`registry.json:749`, `:1836`) | Reuse receipt/log context; no generic relay |
| M10 Profile/Access | `/administration/profile-access` (`registry.json:669`, `:1762`) | Preserve existing protected policy surface; self-profile and management rights remain distinct |

Named backend read dependencies already exist under
`/api/v1/execution/manager`: `/fund-overview`, `/fleet`,
`/portfolios/:id/overview`, `/alphas/:id/overview`, `/accounts/:id/overview`,
`/deployments/:id/overview` (`manager-model.controller.ts:18–29`). HTTP paths do
not establish that new UI compositions, qualified publication or product routes
are active.

Research publication mirror already provides a bounded same-origin R1 link
with `workspace_id` (`release-candidate-publication.contract.ts:45`, `:109`).
Governance contexts retain workspace/version/hash authority. Preserve these
rather than synthesizing a second approval object. Existing FE contract tests
in `execution/governanceCrossLoop.test.tsx:123–150`, `:494–502` demonstrate the
expected workspace/deep-link behavior in their own fixture scope; this review
does not claim a new browser receipt.

## 3. Minimum additive contract / projection shape

The proposed route-less technical slice is appropriate if all trusted facts
remain server inputs and each public output is closed/bounded. A small set of
composed workflow variants is preferable to one new service, ledger or generic
workflow executor:

1. **Read/navigation state:** loading, authorized-empty, partial, stale,
   unavailable, denied/revoked and disconnected are distinct. Keep scope,
   exact environment/stage/lifecycle and allowed context together. Loading is
   a presentation fixture, not a fabricated source readiness state.
2. **Capital confirmation/receipt:** reuse command preview/status. Add short
   typed copy/next-step metadata without reducing four dimensions to one
   success flag. Preserve exact requested/applied/pending/cancelled/rejected;
   partial cancellation cannot mean that applied capital was undone.
3. **Create/register:** explicit zero/positive economic capital and management
   budget, separate create/FUND/grant receipts unless a certified atomic
   transaction proves otherwise. `CREATED_UNFUNDED` does not enable trading.
4. **Lifecycle/readiness:** assignment vs rebind vs archive are distinct;
   obligations include unknowns/reservations/locks/recall and may themselves
   be unavailable. Unknown is not drained. Move preserves original attribution
   until source acceptance; late facts keep original interval/correlation.
   Cancel does not undo already applied receipts. Paper clone has a separate
   ID and immutable origin/config lineage; it does not liquidate/promote.
5. **Analytics explanations:** compose canonical ScoreCapsule/Regime state;
   raw, contribution, allocation composition and direct NAV have different
   meanings. Contribution has no quality band. Early5d/compare30d and mixed
   observation70d/actual10d must remain separate; no client formula, reweight,
   forecast, auto-live or analytics-based denial of authorized reduce-risk.

Operation readiness should be explicit per action. The eight ELP2-07 capital
bodies have technical bridge support but no deployed trust/relay qualification.
RETURN_CAPITAL, APPLY_PENDING, CANCEL_REMAINING, locks, composite reallocation,
create/register/move/rebind/archive and HALT/REDUCING/RESUME must not inherit an
enabled capital route or weaker capability just to populate a UI fixture.
See canonical existing debt `ELP2-07-001/002`; do not duplicate or close it from
this schema-only delivery.

## 4. Required test mapping and security review bar

| ELP2-08 tests | Minimum technical proof | Still separate |
| --- | --- | --- |
| T08-01 | Three persona fixture projections; current action/field inputs respected | Real accepted field policy and browser persona receipt |
| T08-02…05 | Zero/positive separate receipts; economic/budget/native distinctions; immediate rejection not recall; exact partitions including partial-cancel | Source execution/transaction receipts and UI confirmation |
| T08-06…09 | Ancestor restrictions; exact-instance ambiguity; move pending/late attribution; rebind unknown/open obligations blocked | Qualified management/control adapters and end-to-end source operations |
| T08-10 | Safe next action for ACK/unknown/projection lag; refresh is read; draft cancel has no command; no implicit resend | Actual keyboard/back/reload/double-click/browser behavior |
| T08-11…13 | Named navigation map; stage/lifecycle split; residual disposition and clone lineage/no-auto-live fixtures | Approved lowfi→HiFi, existing-route compatibility and real monitor/assignment proof |
| T08-14…16 | Canonical score references/bands and q73.3/provisional; contribution no band; Early/mixed duration/window boundaries | Qualified source/calibration and product consumer display |
| T08-17 | Analytics missing/stale/unbound does not become safety denial; own-slice strips denominator/provisional-weight metadata | Current source-qualified action checks at commit and browser privacy acceptance |

Additional fail-closed checks for the primary implementation:

- Do not include rejected/hidden candidates or hidden-obligation counts in an
  ambiguity or blocked-reason payload. A public DTO validates shape, not ACL.
- Enforce existing command amount partition in projection, not just nonnegative
  member fields; `requested = applied + pending + cancelled + rejected` exactly.
- Bind related receipts to the same workspace/environment/target/currency;
  matching totals alone do not prove a valid flow.
- Unknown obligations, partial censuses and zero count are different facts;
  no `null ?? 0` readiness or archive-complete shortcut.
- Four status dimensions may legitimately differ. Do not reject
  APPLIED+CATCHING_UP or ACK+UNKNOWN; do reject claimed success without its
  authoritative receipt.
- Restricted researcher output must omit manager denominator and coverage
  metadata entirely, not merely mask a displayed percentage.
- Keep generic URL/relation, browser actor, grant and source-proof installation
  out of these types. No workflow input route should be mounted by accident.
- TEST_ONLY fixtures must carry explicit lane/non-production identity. Numeric
  fixture preview does not satisfy production calibration/source eligibility.

## 5. Review disposition / consumer handoff

**ACCEPT technical approach with the boundaries above:** additive generated
schema/fixture + pure projections, no route/migration/executor, is the smallest
backend change that lets Claude design and type-test the requested workflows
without waiting for unrelated source activation. Primary still owns final
implementation review and actual tests.

It cannot close the full ELP2-08 product gate. The detailed guide also asks for
HiFi text/state specifications, operator walkthroughs, every advertised action
mapped to dataset/API/rights/receipt/error/test, and actual browser accessibility
and interaction acceptance. Those must remain explicit handoff/gates rather
than being called PASS because a DTO validates. UX-F22 and connected UXM-08/09
remain NOT_RUN until the separately assigned frontend/source work exists.

No new production formula choice or source activation is requested by this
review. Claude consumer status stays `NOT_STARTED_BY_OWNER_DIRECTION` /
`AWAITING_CONSUMER_REVIEW`. Existing source and consumer debts stay canonical in
their original dependency packets. No runtime, source-qualified read, real
command or accepted HiFi claim is made here.
