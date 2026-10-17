# ELP2-04 — finite retained business aliases, 2026-10-17

## Entry, scope and ownership

Bobby's remaining-backend02–11 assignment; `docs/research-loop-plan` at
fdab164ce0187ac164efbf30ee232e8f3e1d5f3a. Three reviewed private adapters
are now applied, **UNCOMMITTED / PENDING_GATE**. Other owner's12staged paths
and index remain theirs. No frontend, new field grant, collector, migration,
route, source request/activation, runtime restart, push or release change.

Primary owns `retained-business-aliases.ts`, `retained-operation-page.ts`,
the shared conditional-parent join in `portal-derivations.service.ts`, dedicated
test, this packet and Unified. Independent private source review accepted the
bounded candidate after correcting the private-ID dictionary attack; review is
not test or source acceptance. One correctness lane4CPU/4GiB/8GiB transient.

## Contract and behavior

Existing named operation response/schema stays
`portal.execution.eds11r.manager-relation-page.v1`; no new browser field.
Existing catalogue operations are `account-sync-effective`,
`reconciliation-findings`, `conditional-order-group-legs`; actual operationIds
remain those in `eds11r-manager-relation.registry.ts`, not invented here.
Three explicit `account.read` purposes use the existing vocabulary/current
field intersection; the other30null aliases remain closed.

| Relation | Finite values, further restricted by current fields |
| --- | --- |
|account_sync_effective|account_id,currency,mode,status,created_at|
|reconciliation_findings|account_id,strategy_id,mode,status,created_at|
|conditional_order_group_legs|group_id,leg_id,sequence,side,quantity,price,state,created_at,updated_at|

Decimals stay exact strings, timestamps UTC milliseconds. No raw sync/finding
ID, venue/custody value, diagnostics, SL/TP or undeclared lifecycle field is
newly disclosed. Validated private identity is used only after row authorization
in a domain/context-separated HMAC using the existing active query-signing key.
Rotation changes these observation IDs and invalidates their old cursor order;
legacy/nonfinite IDs and cursor bytes remain unchanged. No new secret/config.

Conditional child and parent require independent current dataset scopes and
come from the same immutable profile snapshot. Exact source aliases, valid
clocks and compatible complete parent quality are required; missing/unknown
parent is typed503, not empty success. Both row predicates precede projection
and paging. Bounded Map join rejects ambiguous/contradictory lineage; authorized
retained results stay PARTIAL/STALE, never authoritative current history.
Session-only findings still need an exact session-parent adapter and fail
closed when otherwise visible. Hidden unsupported shapes do not create an oracle.

These are sequential local delivery fences, **not an atomic held source fence**:
a parent-only source change during the outer child's final await remains a
compound-source gate. Do not commission this candidate as proof of that gate.
Paper sync fixtures are synthetic; current collector captures sync only in
Sandbox/Live. No positive Paper source receipt is claimed.

## Validation and exit

Planned:41expanded cases in `elp204-retained-business-aliases.spec.ts`, affected
product/named/derivation regressions, APIbuild, canonical contracts and normal
hook. Tests are NOT_RUN at preparation; actual terminal result is appended.
Review includes keyed IDs, rotation, hidden-empty equivalence, same-document
lineage, final local revoke/publication checks, exact decimals and legacy bytes.
No new route/schema means no generated named-page type is invented. Existing
generic catalogue consumer still validates the original response shape.

The existing published operation is `executionRetainedNamedOperationPageV1`
in `execution-retained-review.openapi.json`; generated type is
`components["schemas"]["RetainedNamedOperationPage"]` in
`packages/contracts/generated/execution-retained-review.d.ts`, backed by
`execution-retained-operation-page.v1.schema.json`. The relation schema tag
above is its existing payload discriminator, not a missing OpenAPI contract.
This subset changes no public property/schema and requires no new handwritten
consumer type or catalogue operation. Existing generic frontend reader remains
unchanged; no claim of consumer/browser acceptance follows.

Rollback reverts only the coherent reader/join slice; retain data, grants,
audit, immutable publications and keys. Clean only owned test resources.
04-008/009 remain OPEN for other parents/aliases and qualified source/field
matrix/compound-fence acceptance. No blanket phase PASS.

Claude: NOT_STARTED_BY_OWNER_DIRECTION; handoff AWAITING_CONSUMER_REVIEW.
When assigned, consume these existing finite pages without inferring full
diagnostics/custody/current history from the added status rows. Backend may
continue other exact readers and command/workflow work independently. Missing
source qualification is separate from still-unimplemented Portal adapters.

## Terminal focused correctness — 2026-10-17T09:04:12Z

The planned focused gate is now **PASS**:247/247API tests in7files, including
all41expanded finite-alias cases; APIbuild and scoped PostgreSQLdump/restore
with four row digests PASS. The same sequential resource window then passed
84/84contract tests in2files for the impacted workflow/Manager contracts.
These are overlapping regressions, not247new tests or a full phase PASS.
The unchanged retained-page contract was not regenerated or independently
rerun in this window; the new adapters retain its existing public shape.

Exact controller:
`/home/bobby/.local/state/portal-execution-elp210/20261017/reader-workflow-focus-085815/controller.json`;
logsha256 `8187be50c86f7af77c8dd9284ab2b9e0041f9410ec355cf117ba3d899c65fc27`.
Exit0/contract exit0; exact source unchanged during tests, other owner's index
unchanged, eight protected runtime image/start/restart tuples unchanged.
Owned containers/networks and measurement lease removed; remaining owned
resources=[]; no prune. One correctness sample:Node1.046GiB/3GiB and PG69.79MiB/
1GiB, not peak/load/G2. Host afterward had156GiB disk free(25%),12147MiB RAM
available and no swap; NO_ACTION_NEEDED within this slice.

Implementation remains UNCOMMITTED / NORMAL_HOOK_PENDING because the shared
index contains another owner's12staged paths, including their Unified hunk.
Do not unstage/commit those paths or bypass the normal hook to land this batch.
This terminal supersedes only the pending focused result above. Genuine source/
field-policy qualification,30other null aliases and compound held-source fence
remain OPEN;04is not fully complete. Claude remains owner-held.

## Narrow session-parent followthrough — 2026-10-17

APPLIED/UNCOMMITTED, focused tests PENDING. Baseline d483357a. A finding
with an already authorized account and absent/null strategy can now recover
that strategy through one unambiguous execution_session in the SAME retained
snapshot. Child account.read and parent alpha.read are independent current
purposes; both original parent and merged finding must pass their row predicates.
Direct findings keep their original path/bytes and do not depend on a session
publication. Hidden-only, unknown and partially authorized shared-account
candidates are omitted BEFORE parent lookup/shape validation; this slice does
not widen shared-account authority or infer missing accounts.

Parent dataset must have the exact registered alias, COMPLETE coverage, valid
source clocks and compatible FRESH/STALE quality. Missing/ambiguous/hidden or
contradictory parent ROWs uniformly omit a link; no hidden-key error oracle or
counter is published. Full parent census is bounded at2000 with no truncation;
the existing10000 direct-row bound is unchanged. A used parent fingerprint
binds pagination and final current-scope checks. No new public field, schema,
generated type, migration, upstream call, UI or runtime change.

Independent design/patch review is retained under the private commissioning
state root: `20261017/session-parent-review.md` (sha256
be3af7e8d01d9aa709b02a6b2bae1711139aeb573c2b6ba8f4adf5efb85cbc2d).
The additional expanded tests cover visible positives, independent scopes,
null inheritance, direct/empty/hidden equivalence, ambiguity, clocks, cursor,
revoke, snapshot drift, getters and bounds; their terminal result follows.
They use TEST_ONLY stored fixtures, not real source/PG authority installation.

Sequential final revalidation is still NOT a held compound-source fence.
04-008/009 remain OPEN, including a parent revision changing during an outer
final await. Other30 closed alias purposes require their own custody/config/
reference/technical/audit/analytics contracts; they are not30 generic missing
business pages. Backend can continue exact purpose-specific adapters and
policy recalculation independently. Claude stays NOT_STARTED_BY_OWNER_DIRECTION,
handoff AWAITING_CONSUMER_REVIEW; no consumer change is required by this subset.

### Focused correction and independent field review

`followthrough-check-focus-101752` ended123/125PASS,2FAIL at10:21:54UTC.
Command actual-PG15/15, transaction11/11 and component25/25 PASS; reader72/74.
APIbuild PASS, restore NOT_RUN after failure. Both reader failures were invalid
test assumptions: removing alpha.read also legitimately denied the existing
child's linked account population. Corrected ONLY the fixture to publish a
genuine qualified peer-only parent census while leaving the child authority
unchanged. This now isolates the intended parent denial instead of weakening
the existing evaluator. No production authorization rule was relaxed.
Logsha256 bb0da87a25044bb2aacadd74dd3567f606b413a5746662b8357746c76e0f139a;
source/index/eight runtimes unchanged; owned resources and lease removed.

Independent final review identified an actual field-policy edge: inherited
strategy must satisfy BOTH the child's and used parent's field grants. Fixed
with private joined-row tracking; original direct rows and child-owned fields
retain their prior behavior. One asymmetric regression mints real scopes:
wholly business-readable private child publication versus a broader mixed
session population with restricted fields, with a direct finding control.
Internal strategy remains usable for authorization even when not public.
Private review `20261017/session-parent-final-review.md`,sha256
0fc1b515f10e10ae6148b1c4c0ca30b543df0156d02d0882026cec1b81223502.
This additional test and corrected fixtures are NOT_RUN at this entry.
Repeat only this fixture suite first (no build/PG/restore/source claim); the
normal hook remains required for coherent build/actual-PG/restore/landing.

### Corrected fixture terminal — 2026-10-17T10:24:49UTC

**75/75PASS** in the one changed reader fixture suite, including genuine
asymmetric minted scopes and the two corrected parent-denial cases. No
permission rule was relaxed; the inherited strategy field is now intersected.
Controller `20261017/reader-correction-focus-102433/controller.json` under the
private commissioning state root; logsha256
e122dcde27a1ac716c471320f6895ee28abf12fbe1ed4711bf7a0d1c4e31fdcf.
Host Nodev20.20.2/Vitest4.1.11, one worker/heap1GiB; this is PURE FIXTURE
validation, **no APIbuild, PostgreSQL, restore, production budget or source
qualification**. Source/index/eight protected runtimes unchanged; no owned
container/network remains and the measurement lease is released.

The immediately preceding lightweight attempt (`reader-correction-focus-102400`)
is preserved as9PASS/66FAIL: private controller supplied an empty TEST_DATABASE_URL
and config correctly refused all fixture constructors. Fixed the private
harness to a labelled nonconnected TEST_ONLY URL, not production config or
application validation. Logsha256
128bef07d404813e77760ba11ec65db48f431968131d5a7d914e1c165cbc1d29.
It created no database and is not silently replaced by a PASS receipt.

Coherent normal hook remains the Node22 build/real-PG/scoped-restore/commit
gate; unchanged contract bytes reuse715/715 rather than a new schema claim.
Rollback reader changes only, preserve grants/keys/retained data. Compound
source fence and remaining purpose-specific aliases stay OPEN; Claude hold
and AWAITING_CONSUMER_REVIEW remain unchanged.
