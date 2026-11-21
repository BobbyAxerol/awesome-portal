# Codex → Claude — approved F5/F8/F9/Operations closeout

Recorded 23 October 2026, Asia/Saigon. Owner: Bobby's current instruction to
finish feasible Core work and assign all remaining Portal implementation to
Claude. This is an assignment and review, not a claim of consumer acceptance.
Campaign rules §10.13 apply: Claude implements remaining Portal backend and
frontend; Codex owns source coordination, independent review and integration.

## 1. Scope, source cut and existing approvals

- Canonical `/home/bobby/portal-research`, `docs/research-loop-plan`, entry
  `454323456`; preserve inbound Edge Markdown, including untracked receipts.
- Reviewed Claude `/home/bobby/portal-research-fe2`,
  `claude/post-land-20261022` at
  `500df58e9cb24abd554ed058aeffc559bc5e43f2`, clean. It contains the complete
  `claude/post-land-20261022-sim@3add605806c3cf74b826f91cba4e9ffcc7f3324e`.
  Do not merge/cherry-pick that earlier SIM lane a second time.
- The 23-commit FE2 delta over SIM is 73 paths, +1,209/−75. Canonical and FE2
  have 16/80 unique commits at this read, merge-base `348c96685`. Their changed
  path sets since that base do not intersect. These are ancestry counts, not
  missing code. A reconciliation commit is needed before canonical ff landing.
- **Approved now:** pending-control preview in the fixture lane, implementation
  of the remaining Portal backend/consumer fixes below, and safe integration.
  Do not ask Bobby again to authorize those tasks, C288, P22/G2 takeover, or
  the already-issued Manager certificate. Existing UI concepts remain binding.
- Excluded: production/dev/main, remote push, real command/Live activation,
  economic/calibration choices invented from fixtures, shared WIP overwrite.

Inputs: [campaign rules](../../AGENT_WORKING_RULES.md), Unified §14,
[Claude catalogue request](CLAUDE_TO_CODEX_EDGE_CATALOGUE_HANDOFF_2026-10-22.md),
[original delegation](CLAUDE_TO_CODEX_DELEGATION_2026-10-21.md),
[prior source review/landing ACK](CODEX_TO_CLAUDE_LANDING_ACK_2026-10-22.md),
[source closeout](CORE009_PARALLEL_SOURCE_CLOSEOUT_2026-10-22.md),
and Claude's current F1–F9/UXM-07 debt, conformance and simulated-data packets.
The catalogue request currently resides on the reviewed FE2 cut; integration
must retain it rather than recreate or overwrite its history.

## 2. Immediate correctness fixes — Claude implementation

| Task | Observed locator on the reviewed FE2 cut | Required fix / exit |
| --- | --- | --- |
| Accounts equity | `apps/portal/frontend/src/execution/v2/screens/account/model.ts:1136`; `AccountsList.tsx:175`; `e2e/bffSimulated.ts:68–69` | The “Physical equity” cell must consume the published `broker_sync.native_equity`, not `wallet_balance`. Keep wallet and equity distinct; missing native equity remains typed absence, never wallet fallback. Regression must use unequal wallet/equity and absent equity. Keep layout unchanged. |
| Accounts scoped cache | `account/reads.ts:283–318` | Ready entries currently survive an `api` change, and the key is only binding ID. Partition/evict cache by current identity/workspace/environment/authority context and account binding, drop late answers after scope change/revoke, and force authorized reads for the new context. Regression: same binding ID/new API or authority, changed account ID, late old response, revoke, and unmount. No hidden-count leakage. |
| Simulated register | `UXM-07/SIMULATED_DATA_REGISTER_2026-10-22.md:12,33` | Only partition metric keys are open; row metrics have a closed enum. The Accounts fallback currently caps 20 rows, concurrency 4, not 50. Correct the descriptions; do not widen schemas to legalize fabricated production support. |
| Conformance debt | `UXM-07/EDGE_CONNECT_RUNBOOK_2026-10-22.md:19–20` | The current double self-test has 51 OK / 9 schema violations, not a clean conformance gate. Fix each double against the actual published contract and keep negative fixtures deliberately negative. Return the nine dispositions and actual retest. Do not run the 150-GET checker on the finite native08 source. |

Before using the conformance probe on real inputs, also harden
`src/edgeConformance/edgeConformance.test.ts`: validate finite nonnegative
request caps/delays, enforce a per-request timeout, and classify a 200 non-JSON
body without dereferencing a null schema. Report-only Vitest success is not
a passing source-conformance verdict. Correct the AccountsList header comment
that still promises no fan-out while the capped two-read fallback is present.

These are concrete review **CHANGES_REQUESTED**, not requests for a new design
or a new approval. Read the actual current path/line before patching: the
locators above are pinned to FE2 and may move.

## 3. F5 — finish fixtures and accept real sources independently

1. Preserve L0 canonical fixtures byte-for-byte. Complete L1 availability,
   permissions, denied/revoked/stale/partial/error; L2 long text, large amounts,
   multiple economic partitions, pagination and scale; L3 invalid shapes.
   Both fixture HTTP and real HTTP must pass through the same published reader.
2. Finish Paper-history HTTP/cache/DOM/browser qualification. Prior synthetic
   sizes are 0.39/1.07/4.28/17.13 MB at 720/2,000/8,000/32,000 rows; these are
   not HTTP or browser measurements. Do not silently clip history to 200 rows
   or exceed the approved 16 MiB cache. Measure and implement bounded paging /
   byte handling as needed, preserving total/cursor/typed bounded semantics.
3. Per qualified family: exact source → Core API response → reader → rendered
   screen, including current authorization, revoke, late response, reload and
   recovery. Use a separate explicit real-review lane, no fixture fallback.
   Record operation, source/image/config/schema, dataset scope and observation
   time. Do not claim 42 catalogue families are 42 mounted endpoints.
4. Native08 active-revoke acceptance is operated solely by Codex/Edge; do not
   attach broad browser/conformance/load traffic. Its success would not qualify
   Manager financial datasets or the entire UI. Use each new qualified return
   when supplied; continue fixture/consumer fixes while other sources are dark.

Done when each lane has its own real or synthetic classification and receipt;
missing source has exact Edge input/action, not “waiting Bobby/Codex”.

**Current Core delivery:** the actual missing-only native STREAM specimen and
Core settlement completed at 01:42:41 VN. READ200, STREAM-only REVOKED before
expiry, retry403/no new admission, separate READ still200; session/grants
retired and inactive API restored. See
[actual return](CORE_TO_EDGE_08_CORE_FIRST_ACTUAL_RETURN_2026-10-23.md), actually
mirrored/hash-verified on HK at01:45:13VN. Remote read-error closure is disclosed
for Edge correlation, not relabeled EOF or full Manager/browser qualification.

## 4. F8 — reconciliation, not another technical approval

Claude's [F8 digest](CLAUDE_F8_REVIEW_DIGEST_2026-10-22.md) already contains
ACCEPT/notes. Keep its history and append current dispositions:

- C288 and Codex's P22/G2 ownership were already approved. For this missing-only
  native specimen, the actual preparation starts H16 and requires
  `H + 244 + 2 + 20 = 282 <= 288`; do not apply the different full-suite formula
  or call the proposed unresolved upper bound today's measured count.
- Core mapper `3cb7f24a` is actually installed, source `3265ce18`, schema149;
  old `a96` serving/not-installed assertions are historical. Inactive config
  was `a814...`; a finite source-bound overlay must be separately identified.
- Manager Research leaf was already issued using the **existing CSR/key**,
  public leaf `33015a80`, chain `665a11f7`, inactive config `153a8f0e`.
  Existing Paper TLS probe passed. Remaining work is exact Edge profile,
  audience/kid/overlap reconciliation, overlay installation and business read;
  do not request a new issuer, keypair or blanket PKI permission.
- Actual load/calibration numeric artifacts and a truly independent economic
  control domain are still separate scoped authority inputs. Claude prepares
  the target, numeric proposal, workload, stop limits, validation and rollback;
  Edge coordinates the owning source response. Do not leave a generic Bobby
  reading task or use fixture constants as real approved configuration.

Acceptance of formula/contract is not calibrated production policy. Report
the exact remaining decision with the completed artifact and recommendation;
it must not block unrelated fixture, dataset or UI work.

## 5. F9 and catalogue — official dispositions and implementation order

All FE-CAT items below are **ACKNOWLEDGED / ACCEPTED_FOR_IMPLEMENTATION** with
the bounded semantics below, not DELIVERED. Claude owns Portal code/contracts/
generated clients/fixtures; Codex independently reviews, integrates, and sends
source requests through **Edge only**. Preserve original request IDs.

| ID | Disposition and deliverable |
| --- | --- |
| FE-CAT-1 | Publish each fact only at the correct grain. `current_nav`: an explicitly partitioned group/statement fact; `max_drawdown_pct`: source/verified series methodology, never infer from one snapshot; `concentration_hhi`: server-side exact weights over a complete authorized same-partition population with coverage; cost drag: separate fees/funding/slippage with applicable-cost coverage, missing not zero; forward days: source observation duration, not calendar age of creation. Until sufficient source/methodology exists, return typed absence plus source locator. Fixture values do not commission these metrics. |
| FE-CAT-2 | Additive queue/incident health, pending-receipt/lag/exception counts and delivery/display axes. Count at the same authorized snapshot, never derive global counts from one page. Missing coverage remains explicit, not zero. |
| FE-CAT-3 | An All lens is **navigation across separately labeled environment/economic partitions**, not consolidated money. An additive backend fan-out/read may return authorized per-partition rows and cursors; no cross-environment financial sum or browser join pretending to be a source aggregate. Preserve separate actual/Paper/Sandbox. This implements the already-approved All semantics, not a new economic choice. |
| FE-CAT-4 / DEBT-052 | Prioritize an authorized aggregated bindings-list read to eliminate the capped N+1 path. Include native equity, virtual assignment/headroom/check/sleeves and qualified per-environment counts only from owning facts. Authorize rows/fields before counts/aggregation/cache. Check mixed currency, hidden rows, null vs zero and exact-snapshot pagination. Until then fix the scoped fallback cache in §2; do not raise its cap to hide latency. |
| FE-CAT-5 | Contributors: server-side alpha grouping inside the named FUND partition/window, with attribution and complete authorized population. Visit digest: explicit persisted/user-scoped baseline and current source facts, not heuristic “since last visit” from fixture dates. Return absence until the comparison baseline exists. |
| FE-CAT-6 | **ACCEPT current semantics:** every authorized portfolio, each currency separately, no conversion or combined NAV. Current explanatory copy is correct. Do not add an FX/basis selector or invented conversion policy. No new Bobby decision is needed for this truthful existing behavior. |
| FE-CAT-7 | Allocation/balance facts must carry economic domain/profile/environment, currency, ownership, basis, coverage and provenance. Never label legacy all-environment currency sums ACTUAL, or shared account balances alpha-owned NAV. Use the scoped Manager DTOs; ask Edge for the exact source binding where absent. |
| FE-CAT-8 | Additive display names, user role preset, last sign-in, average fill price, fee/currency at their owning source/grain. No name or preset becomes an authorization fact; no guessed last sign-in or zero fee. |
| FE-CAT-9 | Account360 wallet/native equity, budget used/approved, gross/long/short exposure remain distinct, source-bound facts. Same currency, owner and observation/coverage rules as FE-CAT-4. Source absence stays typed. |

No new backend work is needed for Fleet “Then”: two-field `group_by` was
already supported and Claude wired it in `59462c672`. Keep its receipt.

For UXM-08/09/10, fixtures already exist. Finish qualified-source consumers
one family at a time and command submit/status/recovery integration through
ELP2-07's **Edge gateway**, keeping command transport and Live off until their
own commissioning. “Codex 07” names that bridge, not a permission to trade.
Use original intent/idempotency key on lost response; ACK is not APPLIED.

## 6. DEBT-048 item 9 — implement now, fixture only

Bobby approved the pending-control preview in this request. Mount the existing
`PendingControlPreview` in Operations on the **fixture lab / BFF_DOUBLE** lane
using an explicit TEST_ONLY workspace and reviewed current policy/counters.
The existing component calls `previewPendingControl` (rollback preview), with
no apply/reserve/submit. Keep product command/Live flags and real transport off.
An unqualified source must not gain eligibility from this preview mount.

Add a 1280/660 browser cell: correct drawer/form entry, keyboard/Escape/focus,
visible simulation label, typed ineligible/unknown states, clean console and
no overflow. Assert the only write-shaped request is the fixture preview;
zero real submit/apply/reserve/command traffic. Keep approved components and
baseline scope. Decimal alignment is already complete; do not redo it.

## 7. Integration, tests, ownership and next handback

Codex freezes a new reconciliation lane from the canonical cut and merges the
complete FE2 ancestry; no dropping tests/docs/evidence or blanket ours/theirs.
Canonical inbound Edge WIP must first be preserved and reviewed as its own
Markdown input commit. Claude does not reset/rebase/stash canonical or merge
on behalf of Codex. Freeze the corrected Claude cut before the final landing.

Actual integrator lane is `/home/bobby/portal-research-closeout`, branch
`chore/core009-approved-closeout-20261023`, based on canonical454323456.
The full FE2 merge is conflict-free and currently staged without a commit:
149 paths, +5,806/−409, including all Claude tests, pixel baselines and packets.
It is a review candidate, not canonical landing. Do not spend the final full
hook on this known-incorrect Accounts cache/equity cut; fix §2 on Claude's lane
first, hand back its SHA, then Codex advances/reconciles the candidate and runs
the single final gate. The two independent runner safety paths are Codex-owned
inside this integrator lane and must be retained on that reconciliation.

Claude may use up to three disjoint subagents: (a) Accounts logic/cache tests,
(b) fixture/conformance/Paper-history, (c) additive catalogue backend and
fixture-only Operations preview, serialized where shared contracts overlap.
One writer owns schemas/generated files, one owns the ledger, and one person
integrates. Do not run simultaneous full hooks, image builds or load tests.

Each slice: focused tests first, regenerate only changed published contracts,
receipt with actual command/result and source/fixture classification. Use the
existing gate selector; one full normal landing gate on the frozen reconciled
candidate, not a hook per Markdown update. Reuse unaffected receipts with an
impact statement. Do not treat isolated flake reruns as a whole-suite PASS.

Required ledger corrections: DEBT-049 Fleet Group/Then and Accounts baselines
are implemented; DEBT-050 Map is implemented independently of still-open
Archived/digest; DEBT-053 fixes `cfed8fe61`/`d5cadc1b3`/`500df58e9` are present,
but final-cut gate is pending. Preserve all earlier failures and receipts.

Return one handback containing: frozen SHA/clean state; each original ID and
ACCEPTED/CHANGE/DELIVERED/VERIFIED level; tests/visual/source pins; paths changed;
remaining exact Edge input/owner/action; resources cleaned; next independent
task. No generic “waiting Bobby/Codex” for assigned implementation. Only the
actual source/numeric authority lane may remain pending with concrete input.
No remote push, release, ELP2-11 or production promotion is authorized here.

## 8. Current round validation

Independent read-only reviews were performed by two reused agents. Root
checked the core findings against the current files. New handoff/indices are
R0 Markdown; code, runtime and final landing results are recorded separately.
Writing this file is delivery for review, **not** evidence that Claude has
read/accepted it or that F5/F9 connected qualification has passed.
