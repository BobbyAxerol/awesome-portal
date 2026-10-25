# Operations health writer and notice qualification —25Oct2026

## Goal / authority / entry

Bobby requested the remaining backend work, no frontend or runtime changes.
Read AGENTS, campaign rules, Unified/phase packet and actual source; preserve
Claude WIP. This continues ELP2-10, not permission to enter ELP2-11.
Candidate `/home/bobby/portal-backend-residuals-20261025`, branch
`chore/backend-residuals-20261025`; parent7572f148c includes the previously
tested seven packages. Canonical685bc1915 and Claude00e7f6cff remain clean.

Code commits:

- `4591ae580`: owning Operations health persistence, migration154, fixture and
  PostgreSQL tests;4files,+486/−0.
- `111c6d5720ccad5de9673fadb50cc8371ab65642`: each notice revision must be
  qualified;5files,+37/−9.
- Combined source tree `28c95d9cc950b6f03d09c8b758d60207e92b970d`;
  **9code/test/migration/fixture files,+523/−9**. No frontend/shared public DTO
  changed. R1 source commits; full R2 and canonical landing are still pending.

## Source repin — actual read-only SSH, not mounted-source proof

On HK, read-only inspection reconfirmed:

| Checkout | Full source pin / disposition |
| --- | --- |
| Peer Edge upgrade worktree | `8727e5303b1815d54bc2bdcb927a55457ff4da5b`; existing tracked/untracked peer WIP preserved. |
| Peer PM worktree | `6f474c72088f000a198a73324ad3083236f2bf5c`; peer WIP preserved. |
| Owned Edge current-policy candidate | `86178d694abf156453cdf450553fa80bdd9becab`; clean. |

PM's `upgrade/PM_OWNER_ACK_AND_NET_PNL_RETURN_2026-10-21.md` still explicitly
leaves the accepted economic wire mapping OPEN. Its source_id/leaves rules
do not provide the missing namespace/census/ownership/valuation mapping.
Edge's `contracts/n28-missing-capability-v1/missing-capability-registry.v1.json`
still declares `venues.calendar` SOURCE_DARK; the valid calendar JSON is only
a fixture. No calendar endpoint was invented or called directly on DL.
HK has no `rg`; the first read-only search returned127 and was retried using
`find`/`grep`. No remote edit/build/DB/config/credential/runtime mutation.

## 1. Operations owning persistence — FE-CAT-2

Previously, the real reader accepted a qualified health-source injection but
the named view did not exist and there was no persistence path. Implemented:

- `src/operations/operational-health-publication.ts` exports a closed private
  Zod contract and `OperationalHealthPublicationRepository.publish/retire`.
  It has no controller, poller, network client, automatic provider or grant.
  Deployment supplies an explicit `withVerifiedSource` owner port that verifies
  the actual source and holds its custody through COMMIT. A JSON string saying
  SOURCE_VERIFIED is neither accepted by this schema nor a verifier.
- Migration154 creates separate health head, append-only receipt and current
  observation tables, and `execution_operation_queue_health_v2`. No queue row,
  source_status, verification_result, source authority or triage is rewritten.
  The one-to-one join includes workspace/operation/target/environment/workflow
  version. Missing, retired, expired or different-version observations become
  NOT_REPORTED, not successful delivery, CURRENT display or zero.
- One transaction, source-scoped advisory lock, deterministic target row locks,
  exact previous revision/contiguous numeric sequence/monotone source cut.
  Same original publication after restart is REPLAY with the same digest;
  changed contents under that revision refuse; old retries never rewind head.
  Foreign source cannot replace another source's operation, including races.
- Receipt stores the canonical validated source document/digest. UPDATE/DELETE
  is blocked by an immutable receipt trigger. Retirement is sticky; a retire
  before first publish stores a tombstone with **null** sequence/revision,
  not a made-up attempt, source receipt or source ordinal.
- Explicit bounds: maximum2000rows and512KiB incoming JSON; PostgreSQL receipt
  text maximum1MiB. `maximumReceipts` is required server installation input,
  range1..10000, not a new production default/approved budget. At capacity
  new publications refuse; no silent audit deletion. SQL statement2s/lock1s.
  Current rows stay at one per original operation. No new pool/background job.
- Non-destructive down migration removes only the view. Tables, original queue,
  receipts, cursors and retirement evidence remain for audit/recovery.

Migration154 SHA256:
`6bb5d4ab881c01d02de932863b66cf89473e13600eff6229390dd03ffa39c37b`.
Reserved after checking canonical, Claude and integration migration directories.
The schema was applied **only** in the isolated disposable test databases.

Runtime composition when a genuine source is ready: create the repository with
the exact workspace/source/epoch and verified-source owner; install the existing
`createOperationalQueueHealthSource` binding for the migration154 view through
`AppModuleDependencies.operationalQueueHealth`. Validate the installed migration
checksum and use the source's actual explicit delivery/display axes. Never map
BLOCKED/SUCCEEDED or triage to those axes. Exceptions remain their separate,
same-RR-scope callback: no invented source exception census in this writer.

## 2. Notice qualification defect — ELP2-09

The initial Fleet snapshot qualified its head but the notice reader did not
check every intermediate publication. A TEST_ONLY revision between two verified
checkpoints could therefore produce a notification under that verified baseline.

`revisionMetadataAfter` now selects **one additional scalar** qualification
alongside the existing revision/ordinal/clock, not the payload document.
`ManagerFleetNoticeSource` refuses the entire batch on an unknown/non-verified
revision with SOURCE_COVERAGE_UNPROVED. It does not skip that ordinal, send a
partial prefix, silently re-baseline or create an extra query per notice.
Existing final-current-authority, STREAM-specific grants and hub bounds remain.

This is the Portal publication-revision notice source, **not** commissioning
an actual Edge notice stream. `edge_notice_source: NOT_COMMISSIONED` is retained.

## 3. Actual gates / no duplicate coverage

Campaign§10.10c selects affected BE/PG lanes, not a full hook for each candidate
commit. One locked official `scripts/control-api-test.sh` invocation ran exactly:

```text
test/operational-health-publication.pg.spec.ts
test/operational-health-source.spec.ts
test/operational-queue-health.spec.ts
test/be-p16-alpha-fleet-realtime.spec.ts
test/be-p16-alpha-fleet-realtime.pg.spec.ts
test/be-p17-fleet-pairing.spec.ts
test/be-p18-stream-revocation-hints.spec.ts
```

Result: **7specs/138tests PASS**, production TypeScript build PASS, migrations
through154 PASS; actual runner dump/restore preservation for legacy counts,
access digests and versioned identity/session/command/custody PASS. Runner exit0.
Health spec has30cases (9schema/21real-PG), including retry/restart, whole-batch
rollback, changed target/workspace/environment/version, duplicate publication,
capacity, expiry, competing source, sticky retirement and additive rollback.
The restore drill does not claim an actual Edge source or browser receipt, nor
a separate populated health-data disaster-recovery benchmark.

Earlier lightweight lane:108PASS/20PG-skipped; superseded by the actual PG
batch, **not added** to138. A broad host `tsc --noEmit` was intentionally stopped
(exit143) after confirming its exact owned PID: it included every repository
test type and duplicated the required production build. It is NOT a PASS.
The selected production build in the official lane passed instead.

Separate baseline differential:2PASS, importing the exact baseline7572f148c
notice implementation beside the candidate. All-verified batches were identical;
the mixed TEST_ONLY case produced2notices on baseline but was refused by the
candidate. Temporary probe source/spec were removed after the test; the durable
regression remains in both service and real-PG specs. No production source
changed during the official gate. This differential is not extra source coverage.

Unchanged public OpenAPI/generated types/enum fixtures reuse previous valid
contract receipts. Release-integrity `--check` PASS, no hash rewrite needed;
product remains NO_GO/runtime_effect NONE. `git diff --check` and tracking PASS.
No full visual/baseline re-record. Old full integration R2/visual failures are
not made green by these focused tests.

Official log:
`/home/bobby/.local/state/portal-backend-residuals/20261025/health-followthrough/affected-pg-build-restore.log`.
SHA256 `2b2448edc5013d9183e679925ff918fc1d47b848ee51b0b7dc26304352d5a714`.
Runner SHA256 `969abe7a7b43d7361fcfe0555a4254a75d7312e29eb815cb0c82b673261bf322`.
Same pinned Node/PostgreSQL images as the preceding seven-package packet.

## 4. Claude handoff / exact remaining source owners

**Claude:** no component redesign or new UI field is required by these two
commits. Existing health row axes/count DTO and fixtures remain canonical.
Consume the prior seven-package fields using its§4 handoff. For notices,
SOURCE_COVERAGE_UNPROVED must take the existing resnapshot path; never interpret
that terminal frame as a user revoke or an execution event. After a qualified
install, verify same-principal/workspace queue + full-filter counts and the real
snapshot/SSE/recovery path. Consumer/browser ACK is OPEN, not implied here.

| Via the single Edge coordinator | Exact remaining input/action |
| --- | --- |
| Financial publication owner | Authenticated batch financial source matching original Accounts binding cut; source proof/channel/verifier and COMMIT→APPLIED→ACK acceptance. Existing Core batch writer does not invent native equity from wallet balance. |
| PM economic source owner | Accepted wire namespace/identity/leaves/census/cut/revision/ownership mapping, not just duplicate rules or TEST_ONLY examples. The existing shared Core economic runtime feeds dataset/series once that mapping is supplied. |
| Operations owning publisher | Exact operation→target/workflow mapping and delivery/display observations, authenticated source context held through COMMIT, approved retained-receipt budget and explicit source retirement. Migration154/writer remove the Core persistence gap; they do not manufacture this producer. |
| Manager detail owner | Actual same-grain credential status/margin-ratio/order-level aggregation and completion/correction semantics. Previously published fields stay supported; no conditional-leg price aliased into an ordinary order. |
| Calendar/notice owner | Qualified venue session-calendar carrier and independent Edge notice publication/pins, with actual source clocks. No direct DL call, holiday assumption, or Portal revision counter labelled Edge data. |

## 5. Exit / next / cleanup / rollback

This **source slice** is committed and its affected gates PASS. Overall
ELP2-05/06/07/09/10 remain OPEN for genuine qualified sources, financial APPLIED,
business trust, original STATUS/recovery and qualification/browser inputs;
ELP2-11 remains not entry-ready. Next Core step is source-backed installation/
qualification in each ready lane, plus review/landing under the required R2,
not rewriting the completed seven-package helpers or inventing values.

Cleanup verified read-only:0`control-api-test` containers/networks after runner
trap. Root filesystem68%used,204GiBfree: **NO_ACTION_NEEDED**. Preserve logs and
source. No frontend, shared preview, stable/dev/main/provider28445, credentials,
command/Live change; no push or remote source installation. Rollback keeps this
candidate unmounted; if a future install rolls back, remove only the optional
health binding/view and retain the immutable data/identity/audit.
