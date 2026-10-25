# Core / Edge — provider, financial source and safe integration, 25Oct2026

Status: SOURCE_COMMITTED; Claude integration CANDIDATE_ONLY / NOT_LANDED. This packet does not
claim installed runtime, connected permission, financial APPLIED/ACK, command,
browser, load or whole-phase acceptance. No push or shared-preview change.

## 1. Scope and preserved inputs

Bobby approved continuing the existing actual permission-provider, financial
publication and command-gateway slices; preserve Claude's implementation and
merge compatible completed work into `docs/research-loop-plan` only after checks.
No new UI design, stable/dev/main/provider28445 change, command or Live activation.

- Canonical clean input: `88a0d140c288aac1b4ca7cf2a0b0199847a6d1c3`;
  scope-only Markdown entry `b6d63cf184b32837fa68f0b958acb151f1ba7b1a`.
- Claude clean input: `00e7f6cff2fadbd88b8ed461fa870b28ee88ad94`,
  `claude/post-land-20261022`; peer checkout untouched.
- Staging: `/home/bobby/portal-research-integrate-20261025`,
  `chore/research-source-integration-20261025`; not a `/tmp`-only source.
- Owned Edge: `/home/bobby/.worktrees/portal-core-current-policy-wire-20261024`
  on HK, `feat/core-current-policy-wire-20261024`,
  `6d44b52c5c088e2f7ada8fe3aaee94f7599d3266`. Full Git source also fetched
  read-only into Core ref `refs/remotes/hk-candidate/core-current-policy-20261024`.
- Owned PM: `/home/bobby/.worktrees/pm-core-financial-assembly-20261024`
  on HK, `feat/core-financial-assembly-20261024`. PM remains a separate Git
  repository and business authority; its Python is not vendored into Portal.
- Peer HK Edge `8727e530` and PM `6f474c72` retain their existing WIP.

`/tmp` paths hold disposable runner/mount/output copies only. Source lives in
the named Git worktrees. Incremental public-source PM bundle is additionally
preserved on HK and SGP; it requires the existing PM baseline `b9dd32d1`:
`/home/bobby/.local/state/portal-integrations/20261025/pm-source-06e5-29022.bundle`,
SHA256 `b506d14a3ad302dd80d7266720abaf28e205688b73b5d96ccd2277e4d60128da`.
No secret/session/trust material is in the source bundle.

## 2. Actual backend fixes

### Native correspondence — PM `06e5a51547cb39fb5577045339b874cdba5d0618`

Three source/test files, +82/−7. Core's semantic grant binding and the hash of
the full original grant are intentionally different. PM had equated them,
rejecting actual Core-shaped grants. Preserve both reviewed pins instead;
Core still verifies semantic binding against the real grant. ROOT now requires
the exact ROOT-plus-children resource census, not ROOT alone, extra or missing
targets. Total cap includes ROOT. No authority is minted by this repair.

New Core cross-language test `elp210-native-correspondence-roundtrip.spec.ts`
(86 lines) exports a synthetic public Core vector, runs it through the actual PM
codec, then validates PM output through Core. This is structural source proof,
not a real grant or connected source receipt.

### Financial mount / exact original — PM `29022f96578b5fde5e6ed7627e4d2d613b778fa8`

Seven source/test files, +606/−10. Actual operator bootstrap now accepts the
explicit default-OFF financial factory and mounts its six routes through the
existing admission, lifecycle and drain. Same real session, selected Paper
source/workspace, bounds, DB identity, original manifest and concrete durable
ACK callback are required; raw/enveloped route collisions are rejected.

Financial snapshot now reconstructs the retained original under the ordinary
fresh HUMAN HISTORY/EXPORT read, retaining its generation, barrier, page chain
and expiry. Whole reconstructed manifest must match after pages are recomputed;
expiry is checked again after owning COMMIT/release. Legacy unpinned snapshot
still creates a new generation. This fixes the previous self-refusal in which
a fresh snapshot generation differed from the signed original.

Receiver APPLIED, source current-authorization renewal and durable source ACK
remain distinct real checks. No proof, receipt or acknowledgement is synthesized.
Independent source review ACCEPT; installation and real commissioning still open.

## 3. Focused test record

Raw logs and public round-trip vectors:
`/home/bobby/.local/state/portal-integrations/20261025/`.

| Lane | Actual result | Scope / limits |
| --- | --- | --- |
| PM correspondence codec | 35 PASS | Pinned no-network cell, 2 CPU / 1536 MiB |
| Same held-PG runner | 43 PASS / 1 conditional SKIP | Includes repeated codec coverage; 9 actual held-PG tests, not 43 new tests |
| Core → actual PM codec → Core | 4 PASS | Final vector echo supplied; earlier export-only run 3 PASS / 1 conditional SKIP retained |
| Seven financial suites, initial | 230 PASS / 5 FAIL | All failures in the new fixture file; original failure log retained |
| Entire corrected financial test file | 62 PASS | Only fixture fixes: datetime wrapping, actual OpenAPI route introspection, exact synthetic DB identity |
| Composed financial coverage | 235 unique PASS | Unchanged other 173 tests reused; not a fresh 235-test whole rerun |
| Core integration source typecheck | PASS | Actual `tsc --noEmit -p tsconfig.build.json` |
| Core integration focused | 62 PASS, 9 environmental FAIL initially | All 9 loopback EPERM; failed suite retaken with loopback permission: 9/9 PASS |
| Frontend integration typecheck | PASS | Initial missing dependency symlink and one unused constant corrected |
| Frontend linked fixture / app / V2 tests | 79,750 PASS / 1 stale-copy FAIL / 5 expected failures / 9 SKIP | 342 files; 621.25 seconds, 2 workers. Entire corrected Alpha file retaken: 6/6 PASS; do not describe as a fresh whole-suite green run |
| Fixture nginx/config tests | 16 PASS / 3 environment SKIP | Exact accepted matrix/activity/library-list routes, no broader QuantBT prefix or admin catch-all |
| Frontend production builds | PASS OFF and ON | 19.96s and 20.46s; isolated artifacts only, no served preview rebuild |
| Initial normal landing hook | Reached contract test cell: 1,863 PASS / 5 suites could not load | Explicit source copy omitted new `bffWorld.ts`; original failure log retained |
| Corrected five contract suites | 24 PASS / 5 files | Added only the missing dependency to the explicit no-network test-cell inventory |
| Relevant Core/PG/restore | 89 PASS / 1 conditional SKIP | Six files; actual isolated PostgreSQL, all forward migrations through 151 and legacy/versioned identity/session/command/custody restore checks PASS. Conditional PM-vector test already passes in its explicit cross-language lane |
| N29 / R3-2 closure / tracking | PASS | Static/source-only gates; N29 still reports product release NO_GO, not actual source qualification |
| Whole landing R2 | NOT_MET | Broad tests and OFF/ON builds are not a substitute for the outstanding pinned-image visual verification; failed normal-hook attempt and focused continuations are not described as a fresh whole hook PASS |

PM test image: `sha256:28ea39588edd1b4fee1715d1e9ca6bd289effac82a573a920b217a8c350226b3`.
Pinned SDK wheel SHA256:
`c0cb9ab2ac1075035399fa88cfa30fcbaeaedf07702cab4dd65c56041eb1db53`.
Pure cells have no network; held-PG uses an isolated network, no published port.
Each HK invocation bounded to 300 seconds; tested containers removed by exact ID.
The separate Core PG runner used its existing local runner bounds (Node 3 CPU /
3 GiB, PostgreSQL 1 GiB), not the HK cell budget. Its two exact containers
`control-api-test-node-5719373214925213` and
`control-api-test-postgres-5719373214925213` are absent after runner cleanup.
No source/runtime acceptance is inferred from these test fixtures.

## 4. Integration decisions — preserve both sides

Canonical/Claude inputs diverged 55/163 commits. Blind ff-only or blanket
ours/theirs would lose work. An ancestry-only merge of two old Core candidate
commits is `ba2fd6a58425a7035b0fdfce9b78fe407f96f1c8`; its tree is identical
to the already newer canonical parent. Their source had already landed by
compatible selective integration; do not count their 4,837 lines as new work.

The Claude integration preserves all code/tests/docs/evidence, with no file
deletions. Current staged inventory: 410 files, +31,717/−1,712, primarily Claude's
163 commits, not all authored by Codex. Resolutions keep newer Core final-access
fences, actual-principal Account360 and financial composition, and Claude's
accepted UI/BFF implementation. Both histories of Unified and sync are retained.

No component, layout, color or baseline redesigned. Two non-behavioral frontend
validation cleanups are explicit: remove an extra EOF blank line and an unused
`SCORE_COVERAGE_GAP` constant rejected by TypeScript; align one stale test
expectation with Claude's approved ticket-free absence copy. This is not a claim of zero
frontend textual diff. No standalone browser/pixel acceptance is invented.

PM commits and the Edge-owned Git ref are preserved separately rather than
wholesale-merging an external Edge fork or PM business repository into Core.
The explicit contract-cell inventory now copies Claude's new `bffWorld.ts`;
N29/EDS-12 were regenerated mechanically with `runtime_effect: NONE`. The exact
nginx test allowlist reflects the already accepted three route additions, with
negative prefix/catch-all assertions retained. Packages/contracts itself is
byte-identical to canonical: no new DTO, schema or generator source was hidden.
Preserved integration merge commit:
`183872ca9aefbb283fe7be42e9ac62193883804e`, parents
`ba2fd6a58425a7035b0fdfce9b78fe407f96f1c8` and Claude
`00e7f6cff2fadbd88b8ed461fa870b28ee88ad94`; tree
`4a92c5f40d6ff93a121ae6a3da61527e3479686c`.
This is an intermediate R1/source commit under campaign §10.10c.4, not a
canonical landing. Normal-hook invocation was attempted once; its actual failure
and exact focused continuations are retained. No second full hook was run merely
to hide the failed attempt. The full landing R2 is NOT_MET: no current complete
pinned-image visual receipt exists for these pixel-changing Claude commits.
Do not reuse an older visual run as if it covered this merged tree.

Canonical `docs/research-loop-plan` receives only this Markdown report and its
Unified/sync pointers. Source from both sides is safe in the named branch; it is
not represented as already on canonical. To land, complete the actual remaining
R2/visual disposition on the frozen candidate, recheck a clean current canonical,
incorporate compatible new commits without losing either history, then ff-only.
No remote push.

## 5. Exact next actions / handoff

| Slice | Still required, not merely "waiting for a window" |
| --- | --- |
| Actual permission provider | Purpose-specific authenticated registered-relations root receipt provider and genuine source terminal/custody through Edge. Existing Manager business provider is a different domain, not a ROOT grant verifier. Same original/hash; no expiry/disconnect-as-COMMIT, no READ→STREAM inference. Root intake is asynchronous VERIFIED authority, not login; no synthesized user/session/JWT |
| Financial | Accepted financial-purpose source/receiver trust, current HUMAN HISTORY/EXPORT original, signing/verifier acceptance and bounded durable ACK DB privileges; then actual source → receiver COMMIT/APPLIED → source ACK |
| Command gateway | PM already has its real opt-in listener and owning session/edge_intent/edge_status path; do not duplicate it. Concrete production seams still missing: Edge `PmAssertionIssuer`, Edge `AuthorityProvider` for current requester/session/policy/original visibility, and Core `EdgeCurrentRequesterStatusPort` authenticated transport. Implement purpose-specific STATUS-only composition first; keep original/delivery custody and consumed-lease handling separate. No READ/financial-purpose reuse, command or Live activation |
| Qualification | Matched candidate, approved budget/calibration, coexistence/G2 and real consumer/browser receipts; reuse only compatible unchanged evidence |

Claude: use the preserved integration candidate and existing rich linked fixtures;
preserve accepted components. Candidate is not yet canonical or installed.
This round adds no public OpenAPI/generated DTO/enum requiring new UI binding.
Take real API/browser acceptance only against independently qualified source and
exact image/config/schema/authority pins. Fixture UI review can continue now.

The existing six phase exits are unchanged. ELP2-05/06/07/09/10 remain incomplete;
ELP2-11 is not entry-ready. Rollback for source integration is a forward revert
on the development branch, preserving both parent histories; no DB/runtime has
changed in this round. Do not delete source branches or source bundles now.

## 6. Provider follow-through — exact implementation boundary

The actual root provider is still an owned code gap, not just a missing window.
`access-trust.ts::verifyRootReceipt` cannot be replaced by the Manager
business-domain reader: its domain, acceptance UUID and root-held bridge differ.
PM's genuine `NativeRelationsHeldBridge.issue_registered()` is implemented;
its purpose-specific authenticated composition through Edge is still required.

Before that composition is qualified, carry explicit QUALIFY/COMMIT context and
the actual persisted mutation identity. Qualification acquires an unentered
mutation fence and retires it without inventing ROLLBACK. COMMIT reacquires the
same original and holds ENTER until Core's actual transaction terminal. Link
attempt custody and immutable TS receipt in the same transaction; acknowledge
COMMITTED only after physical COMMIT or serialized read-back. Loss of ACK,
restart and UNKNOWN recover the same attempt/original, not a new authority.
A successful READ is never a MUTATION terminal. Root intake is asynchronous
verified authority, not login or a reason to mint a synthetic human JWT.

No account, grant, trust, credential, DB schema, shared service or installed
configuration changed this round. No prior finite window is reopened. Current
PM/Edge source fixes alone do not prove this provider, financial APPLIED/ACK or
command gateway connected. Requests and exact implementation gaps above remain
open in ELP2-05/06/07/09/10; ELP2-11 has not entered final acceptance.
