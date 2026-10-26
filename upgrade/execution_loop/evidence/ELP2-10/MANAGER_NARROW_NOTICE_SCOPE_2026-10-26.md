# Manager narrow notice scope — 26Oct2026

## Entry, authority and assignment

IMPLEMENTED_R1 / SOURCE_ONLY. Bobby assigned continued ELP2-10 backend work;
this slice investigates and implements safe narrow original-human notice
selection without widening CURRENT, HISTORY, REPLAY or STREAM authority.
No UI, source upload, shared runtime, push, stable/dev/main/provider28445,
command or Live mutation. Calendar remains SOURCE_DARK.

Entry Core b5482b904b11c0c017e098e6e9f71a09a5ce6254;
local owned Edge 53eea251f0426536bfc64c8e753bfb6f4f0af37e.
Canonical 685bc1915db51c7869254c1fdfa68991d7e4aae4 and Claude
00e7f6cff2fadbd88b8ed461fa870b28ee88ad94 unchanged/clean. No new
committed Claude request or consumer ACK. Read-only SSH repinned owned Edge
86178d694abf156453cdf450553fa80bdd9becab (clean), peer Edge
8727e5303b1815d54bc2bdcb927a55457ff4da5b and owned PM
fad5e3fd876460f3aecfcf8ebd57a66610b6069c. Existing peer WIP preserved.

## Single-writer task map

- Primary: architecture, actual Manager writer/source adapter, migrations,
  docs, shared test scheduling, integration and commits. No landing inferred.
- Existing source_metadata_notice_review: read-only audit of durable affected
  membership, deletion and atomic-seal coverage. Return concrete source
  locators and safe design; no writes, SSH, containers or build.
- Existing financial_qualification_review: independent read-only review of
  narrow notice implementation after design, adversarial authorization,
  retention and reconnect analysis; no writes or heavyweight tests.
- Existing pm_bootstrap_review: replacement independent read-only final
  review when the financial reviewer's capacity was exhausted; no writes,
  SSH or gates. ACCEPT on source8981f3c38/tree0d5525609; no new test counts.

After completing its read-only source audit, source_metadata_notice_review
owns ONLY the new `projection-store-pg/tests/manager_notices/narrow.rs` test
module. Primary owns its parent fixture helpers; test writer runs no heavy
gate and does not edit production/schema/docs. Financial reviewer remains
read-only. This replaces that reviewer's initial no-write scope for this file.

## Exit for this slice

Implement only provable atomic future observations, not invented historical
membership. Narrow hints must not expose hidden cycle timing/count/gap,
global digest or source payload. Preserve current-policy final fences,
opaque cursor/restart/revoke, bounded scan and shared quotas. Genuine old
history without membership must resync/fail closed. Focused tests plus
independent review and explicit source/runtime dispositions are required.
Connected/browser acceptance remains separate, not satisfied by fixture/SQL.

Financial/economic/health qualified originals and exact-grain metadata stay
in the prior packet's owner/input/action table; do not build duplicate adapters
or silently promote SOURCE_DARK. Final result and Claude handoff follow below.

## Delivered source, not an installed service

Edge code `8981f3c38daf9572d62d06a4cebd45aa23d72065`, tree
`0d55256097ec2530f72dce1bfaba678553eebc6a`:14files,+1,534/−109.
Persistent worktree `/home/bobby/portal-edge-scoped-notices-20261026`, branch
`chore/manager-scoped-notices-20261026`. No source-code upload or divergent
Edge-history merge into Core. Canonical/Claude remain unchanged and clean.
Image/config/schema installation: **NOT_BUILT / NOT_INSTALLED**. There is
no current connected or browser acceptance pin for this new implementation.

1. The official Paper Manager cycle writer now captures affected identities
   in its existing epoch-lock/seal transaction. It compares the complete
   final state to the **last sealed** compact semantic baseline, not the
   partial snapshot journal. Deletion, reused snapshots, interrupted cycles
   and A→B→A recovery are covered. No payload history is duplicated.
2. Additive migration0026 supplies immutable per-cycle proof/changed refs and
   a bounded compact baseline (≤80,000current members; ≤160,000changed refs).
   Existing historical cycles are untouched. The first new capture is an
   explicit baseline; absent checkpoint/intermediate/head proof requires
   RESYNC. Proof and cycle roll back together on a bad prior baseline.
3. Narrow model `manager.affected-entity-notices.v2` uses opaque hash(kind,key)
   membership. The private qualified source registry binds a complete
   one-tuple-per-entity mapping into its source-set digest. No ID aliases,
   independent-set cross-join or inferred alpha version is accepted.
4. Ownership is not assumed stable: every selected changed record must match
   the same complete canonical five-tuple **before and after** the change.
   Latest sealed ownership is rechecked too. A transfer away and back cannot
   hide the intervening foreign-owner period. Missing, null, numeric or
   differently named source ownership fields fail closed, not synthesized.
5. Hidden-only changes emit no public hint. Private bounded scan state can
   advance across hidden cycles, but never publishes their ordinals/counts/
   state digests, keys, payloads or owner hashes. The same durable cursor
   handle advances only over verified invisible rows; random token rotation
   consumes no extra cursor quota and never extends fixed expiry. Rotation
   by age retains the same half-TTL cadence as idle.
6. Silent catch-up keeps the normal idle SSE comment cadence and final
   original-human authorization checks. It no longer suppresses all frames
   while draining an unrelated backlog. READ does not grant STREAM/REPLAY.
7. Whole-profile v1 remains explicit whole-profile authority. Even a Core
   whole-population decision on a v2 pin is capped to that pin's closed source
   members; empty authorization never widens it. Retired cleanup uses the
   original restore-verified transaction; new immutable proof cascades only
   after the parent cycle cleanup is authorized. Compact baseline is removed,
   epoch/audit shells retained. No new active-data cleanup aperture.

### Important qualification limit

The generic Manager catalogue does **not** prove an immutable owner merely
because an entity ID persists. Some current feeds do not publish the complete
canonical `alpha_id/alpha_version_id/portfolio_id/deployment_id/account_id`
tuple. Those feeds still cannot be qualified for narrow v2. Source owner must
confirm an exact mapping and genuine source fields through Edge; the adapter
does not rename unrelated fields or use fixture constants to fill the gap.
This delivery closes the missing membership/guard **implementation**, not the
source qualification. Existing separately qualified whole-profile v1 is not
silently downgraded or granted to a narrower user.

## Focused verification and resource closeout

**137 distinct focused cases PASS**, including36actual disposable-PG cases;
18new tests, existing regressions and the expanded cleanup drill. No count
inflation from retakes.26unchanged Core policy/mTLS cases are separately reused
from the preceding source receipt; not a new connected run or same-image claim.

| Selector | PASS | Final receipt / impact reuse |
| --- | ---: | --- |
| manager_notice_source | 10 | focused-1; source logic unchanged except equivalent match syntax/comment |
| core_scoped_runtime | 85 | focused-1; runtime source unchanged afterward |
| projection-store-pg manager_notices | 22 | focused-3;21actual PG,1pure tuple test |
| scoped_backend | 19 | focused-2;14actual PG,5unit; final change only equivalent tail expression |
| n05_retention_recovery_cleanup | 1 | focused-2 actual guarded cleanup and retained audit drill |

Strict production Clippy `--lib --bins -- -D warnings`: PASS on final source.
Independent source review ACCEPT after fixing the identified ownership,
hidden-cursor/cadence and cleanup issues. Financial reviewer hit model capacity;
existing PM reviewer completed the independent review instead. No new agent
spawned; primary wrote production/schema, test author only the new narrow
module, no overlapping writers or parallel heavy gates.

Failed attempts retained, not called flakes: initial lint found long methods;
first PG pass found3new fixture failures because its row order differed from
the official mapper's canonical order. Only the fixture was sorted. Retake
passed22/22; further lint failures were fixed by extracting the same checks
and equivalent pattern/tail-expression rewrites, never by weakening lint.
Only affected store tests/lint were retaken; unrelated95unit cases,19stream
cases and cleanup were not rerun unnecessarily.

[Structured gates, exact log/runner hashes](MANAGER_NARROW_NOTICE_SCOPE_2026-10-26.test-results.json).
Hard test-cell caps: aggregate2CPU/1536MiB/300s; disposable PG16 uses0.5CPU/
256MiB, Rust1.5CPU/1280MiB. Final lint-only cell has no network. No host ports,
named volumes or shared runtime; no OOM. These are hard caps, not a measured
production budget or maximum-population performance claim. At
2026-10-26T06:50:32Z own containers/networks were absent; root free
218,198,482,944bytes,68%used. Recomputable Cargo cache586MiB/target2.2GiB
retained; no prune. Cleanup disposition: NO_ACTION_NEEDED.

R1 per campaign§10.10c. No full hook/push/ff-landing; prior integration R2/
visual RED remains. Focused source PASS does not clear that gate.

## Exact handoff, remaining owner/actions and next phases

**Claude ACT_NOW:** public `execution.scoped-notice.v1` DTO and accepted
components do not change. Keep notification→authorized refetch, idle comments,
RESYNC and revoked/disconnected states. Use existing rich fixtures; do not
parse global cycle IDs or assume CURRENT permits STREAM. Earlier metadata
consumer ACK remains due. Browser acceptance awaits a qualified installed
source and an exact API/bundle pin; no UI implementation was changed here.

**Edge/source owner ACT_NOW:** review the source commit and migration0026;
qualify the exact Paper epoch/catalogue/adapter and retained interval plus
entity-ref→complete canonical tuple mapping. Apply0025and0026 before any
reader/writer from this binary, with normal backup/forward-migration procedure
under the separately approved install package. A valid new baseline and future
sealed cycle are needed; do not backfill old memberships or bind a current-only
source as REPLAY. Supply fresh Research trust and independent original-human
REPLAY/STREAM rights; then test initial/catch-up/coordinator, active revoke,
reconnect/restart/recovery and browser. No old expired ACK/window is reused.

| Remaining group | Owner/input/action still required |
| --- | --- |
| Financial original/verifier/APPLIED→ACK | PM through Edge: genuine original+manifest digest, receiver/purpose issuer/audience/kid, source acceptance, durable ACK installation for that same original; use existing Core owner-context orchestration, not another adapter |
| NET_PNL/economic source | Edge: accepted economic-account/ownership partition namespace, census/leaves/cut/revision/currency; qualify the already-wired reducer/dataset/series/Accounts batch without double-counting shared accounts |
| Health | Edge: authenticated owning-operation→workflow binding and delivery/display/exception observations; queue SUCCEEDED is not financial/venue success |
| Remaining metadata | Edge: exact-grain source facts and complete ownership where available; fill price/commission is not order VWAP/aggregate fees; no made-up account credential/margin facts |
| Calendar | Edge authenticated scoped provider is still absent: SOURCE_DARK; Portal BFF is implemented, no HMD/realtime substitution |
| Connected/browser | Core+Edge actual source/trust/current rights first; Claude consumer receipt on exact installed source/API/bundle afterward |
| Budget/calibration/coexistence/G2 | Existing measured/approval package still required; test fixture/cell caps are not production calibration |

Backend next-ready: source qualification/connected ELP2-09/10 using this proof,
independent ELP2-05/06 financial/economic/metadata source follow-through and
ELP2-07 gateway acceptance as inputs arrive. No need to redo completed BFF or
fixture packages. ELP2-10 remains OPEN; ELP2-11 preparation is preserved, final
integrated exit/release is not met or newly authorized.

Rollback: stop/unmount the new listener, retain grants/custody settlement and
immutable evidence; leave expand-only schema. An old writer sealing new cycles
without proof makes narrow v2 RESYNC, never silently global. Forward resumption
after that gap requires a newly qualified epoch/baseline; do not delete or
repair historical evidence to force it green. Bounded cleanup remains the
original retired/restore-verified workflow.

Source preservation: local incremental bundle
`/home/bobby/.local/state/portal-backend-residuals/20261026/narrow-notices-8981f3c38.bundle`,
verified against53eea251f, SHA256
`b09db5be08522d0b8f5fa3b9ad6b2ac399b77aaa9a1c752238346f735b7c9077`.
Not uploaded. Durable source is outside/tmp; no production code depends on it.

Documentation validation R0: both repositories' execution-tracking checks,
added local links, JSON/counts, exact source/tree/diff/migration and all recorded
log/runner/bundle hashes PASS. Read-only Node validator initially hit subprocess
EPERM; retried without spawning children and PASS, no escalation or code change.
Explicit staged path/diff checks precede the docs-only commits. No full build,
test or hook repeats for this receipt; source-test tier remains R1.
