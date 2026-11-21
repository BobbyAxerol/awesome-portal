# Accounts native runtime commissioning — 27 October 2026

## Approved scope and round start

Bobby requests actual READ/STREAM commissioning, not another source-only closeout.
Canonical `/home/bobby/portal-research`, `docs/research-loop-plan`, entry
`1ce829bd6`, clean. Native BFF/physical HTTP custody is implemented in
`6964b4864`; its 321 focused tests and production typecheck are existing source
evidence, not connected acceptance. The active ELP2-10 goal remains open.

Preserve Research identity, audit/custody and retained data. No frontend, remote
push, dev/main/stable/provider28445 or command/Live activation. Existing approved
Research-only install/trust/temporary credentials and safe forward migration
scope applies. Correctness cell: 2 CPU/1.5 GiB/300s; compilation separately at
3 CPU/3 GiB/300s. No load/calibration defaults inferred from those ceilings.

## Single-writer and verification map

| Owner | Scope | Deliverable |
| --- | --- | --- |
| Primary | Runtime/private configuration, official writers, build/migration/install, shared tracking and integration | Exact source/image/config/schema pins; genuine original, finite API/terminal ACK, independent STREAM acceptance |
| Source auditor | Read-only owned Edge/PM factory and registration discovery; no secret values, source edits or tests with writes | Exact install/caller gaps and official writer path; private references only |
| Gate reviewer | Read-only ELP2-10 gates and compatible receipt impact | Concrete mandatory remaining gates and evidence; no scope reduction |

Read Claude committed branch/diff and request ledger each round; preserve dirty
peer work. Refresh deployed/source pins before using them. Do not re-run the
unchanged 321 source tests or migration clone rehearsal merely for Markdown.
Changed implementation gets focused tests; one integrated image and affected
operational checks. Full R2/consumer/qualification debt is not waived.

Rollback: stop new admission in the selected Research composition; drain or
recover the same originals before reverting image/config. Keep all authority,
source receipts and custody. No expired grant/window extension, manual SQL
authority seed, synthetic registration or blanket cleanup.

## Results

IN_PROGRESS. Packet date follows the preceding 27-Oct native-egress packet;
actual deployment observations are **26 October 2026, 18:45–19:14 UTC**, not
future observations. The user subsequently approved the exact PM bundle
transfer and owned-candidate fast-forward described below.

### Core configuration and image

Core **c1fecde97**:3files,+191. Explicit separate opt-in marker/overlay for
ROOT/CURRENT/CurrentView references; no native grant, STREAM or command switch.
18focused native-orchestration tests and3source-stamp tests PASS; shell syntax,
real Compose render and diff checks PASS. Existing unrelated unified-preview
test has2PASS/1FAIL due stale frontend regex; not repaired or called green.
R1 intermediate under campaign10.10c; fullR2 remains pending.

First image **`sha256:05b6cd3f7edc2124e03478f7fa6ae69b135522ba92ece4a1fcdc59b674f7a796`**
contains native BFF source6964b4864; OCI source1ce829bd6, before the orchestration
commit (no app-code change there). Compiled app/package inputs unchanged from
the frozen source. Full checked production emit PASS220.08s. First packaging
failed because BuildKit treated the local base digest as a registry name.
Locked re-emit without a second redundant typecheck produced exactly the same
file-manifest SHA256 **c89b93ca264637e6ad74038eda09f008c6a815bc74412443914b7b3dfc7235ff**;
local-base legacy-builder packaging and import/hygiene PASS. Failed logs retained.
Image72,381,755bytes; no source tree, compiler/npm cache or private inputs shipped.

Core **`05ab409900bdd87dffc6ed0c6b0c4a9dfa5d1af0`** fixes a real integration
defect in ROOT/CURRENT configuration loaders: a local Core client certificate
was incorrectly required to chain to the *remote peer's* CA. Independent local
and peer CAs are valid. Four files, +78/−11; ten additional real-PKI cases cover
independent peer CAs, complete local chains, bad signers, non-CA issuers and
chain ordering. Existing key-match and malformed-CA negatives remain. TLS 1.3,
remote CA/hostname/exact-leaf-pin verification before application bytes, local
chain validation, validity/clientAuth/key matching and buffer wiping remain.
Independent source review **ACCEPT**, not connected acceptance.

Focused ROOT/CURRENT tests: **52 PASS**, 15.90s. Locked checked production emit:
**PASS**, 220.17s, 3 CPU/3 GiB/300s, OOM=false. Packaging uses the already-local
pinned Node base, no registry pull; import and package hygiene checks PASS.
Final image, 72,381,161 bytes:
**`sha256:d65e77860860dbf24fa5bbf6ded8bc6225b063ebc15578ed6a2dd8d1e92132f8`**.
OCI source is the full `05ab4099…` SHA above; no dependency, migration or public
DTO/schema change in this fix. N29/EDS-12 integrity refresh reported
`changed:false`, `runtime_effect:NONE`; checks PASS. R1 focused intermediate
verification under campaign §10.10c; full R2 is not claimed.

### Actual Research install and migration

Control API is running/healthy on the **final d65e7786… image**;
healthz/readyz both return 200. Final installer receipt is
`independent-ca-install-MjWF1aQp/` in the private state directory below.
Web, fixture, migration and bootstrap container identities/images/start times
are unchanged across that install. Authority counter is unchanged at revision67,
lease_epoch118, drain_id=NULL. Native runtime config
remains unselected, retained_review_v1 unchanged: this is code installation,
**not source commission or business READ/STREAM acceptance**.

The first final-image attempt queried health immediately after Compose start,
before the HTTP listener existed (`ECONNREFUSED`); it automatically returned to
the healthy first image. The private installer now waits at most45s for both
health endpoints before either accepting the candidate or rolling back. The
successful retake did not rerun migration/bootstrap or modify credentials.

Official migration runner applied152ROOTcustody,153CURRENTcustody,
154operationhealth. Before the first attempt, API stopped and30MiB custom Core
DB dump plus pg_restore catalogue retained. Two post-check attempts failed and
automatically restored image01692fc5…; forward DDL/data were not rolled back.
Stage diagnostic isolated the true harness defect: expecting Research role's
portal_users SELECT to fail, contrary to migration037's intentional grant.
Do not revoke legitimate lookup to satisfy that assertion. Corrected check:
identity lookup allowed, auth_sessions read denied. Final official migration
idempotency/repeat,195table snapshot/19critical hashes, schema relations and
current protected-read checks PASS; API image install completed.

Final private receipt directory:
`/home/bobby/.local/state/portal-execution-accounts-native-egress-20261027/actual-install-aC6nOZU3/`.
Original pre152 backup retained separately at `actual-install-aESi1UH4/core.dump`.
The original custom backup was actually restored in an isolated pinned PG16
cell, not inferred from a postmigration baseline. The bounded restore initially
failed because tmpfs PGDATA was owned by root, then because512MiB was too small
for the actual683MiB restore; corrected uid70 and an exact labelled temporary
volume with a2GiB disk guard were used. Container CPU/memory/time caps remained
2 CPU/1.5 GiB/300s. A subsequent diagnostic corrected an inet `/32` comparison
to `host(inet_server_addr())`. Failed receipts are retained, not relabelled PASS.

**Original-backup preservation is now verified at the real postmigration,
pre-image-start observation:**189 original non-ledger table counts unchanged,
all19 critical table hashes exact, original migration rows and RLS policy hash
unchanged; only3 appended migrations and5 new empty tables. An offline bridge
reconciles independently captured real snapshots without rerunning the drill:
`original-migration-preservation-bridge.json`, SHA256
`b8d6b603f4f38abeafb3b2fe6b1fc4f8239f1a1d6a577b86ad82f0f6d52ed3e4`.

**Later operational side effect disclosed:** the private comparison cleanup
used Compose `start`, which replayed completed migration/bootstrap dependencies
three times. Bootstrap logs confirm existing owner/users unchanged and no
credential output, but its idempotent owner insert executes an authority trigger:
revision64→67, lease_epoch118 unchanged, no drain. Thus the later live snapshot
has **18/19**, not19/19 byte-identical critical tables. No counter reset or
synthetic authority repair was performed. Cleanup now uses
`up -d --no-build --no-deps control-api`; the final image install checks that
bootstrap/migration start times and authority counters stay unchanged. Actual
idempotent migration runner was also independently observed67→67.

This proves the stated migration-preservation scope, not every noncritical row
byte or global-role/ACL equivalence. Current application login portal is
SUPERUSER/BYPASSRLS; this is **not an application-role RLS PASS**.
No new grant/session, policy/original acceptance, source ACK or command was made.

### Source-side operator implementation

Local PM branch feat/core-registered-relations-runtime-20261025 at
**c8871acf3c5bcbd8c5ddad10eaa4a5294616a7a2**, parent operator5b618a76e and
factoryc9be45349, requiring real HK parentfad5e3fd8. Four new files,+956lines:
explicit registered-runtime config-check/serve and original-pinned correspondence
config-check/install/status, with exact private files/material/hash validation,
owned lifecycle/drain, readonly status and same-original UNKNOWN recovery.
No permissive callback or direct SQL authority seed; no new entitlement from
registration. Locked Python3.12.14 actual62focused tests PASS3.65s, independent
source review ACCEPT. Test doubles are TEST_ONLY; no DB/TLS/runtime/source proof.
Normal local commits; no shared PM work overwritten, no deployment/hook bypass.

Verified public code bundle29,487bytes:
`pm-registered-operators-c8871acf3.bundle`, SHA256
**8d694d164f5042305ffc126301f552dbadb0819604c58dddc04b42d8e967dbd5**.
Bundle requires `fad5e3fd876460f3aecfcf8ebd57a66610b6069c` and contains
`c8871acf3c5bcbd8c5ddad10eaa4a5294616a7a2` HEAD. Bobby explicitly approved this
exact public-code artifact, destination and fast-forward; the previous transfer
denial was not bypassed and this approval does not authorize credential transfer.

**DONE:** copied to HK
`/home/bobby/.local/state/portal-integrations/20261027/pm-registered-operators-c8871acf3.bundle`,
verified the same SHA256 and bundle prerequisites, fetched its local HEAD and
fast-forwarded only
`/home/bobby/.worktrees/pm-core-financial-assembly-20261024`, branch
`feat/core-financial-assembly-20261024`, from `fad5e3fd…` to `c8871acf3…`, clean.
The three delivered commits (existing factory plus two new operators) total
7files,+1,860/−1; only the two operator commits/+956 are new this round.
Owned Edge candidate remains clean at
`86178d694abf156453cdf450553fa80bdd9becab`; peer Edge worktree/WIP untouched.
**Cold source only on HK:** no PM runtime, image, DB, private trust/config,
registration, original or new entitlement was installed by that transfer.

### Request two-way / exact next work

- Core: the first-backup comparison and code-image installation are complete
  within the scope above. Continue actual private runtime compatibility,
  genuine source-original discovery and official registration/writers, not
  another duplicate build. The newly delivered operators must still pass
  owning preflight on real source/config before serving.
- Source through Edge: first inspect existing genuine SET_MEMBERSHIP originals
  for exact Research issuer/subject/current immutable head; only if none fits,
  official management preview/apply/status with real delegation/CAS/coordinator.
  Pin exact census and reviewed Core root into correspondence, then register
  ROOT and CURRENT independently. Old trust/window expired25Oct, cannot reuse.
- Claude: no public DTO/enum/layout change from the operator/config package.
  Keep accepted Account360 reader/fixtures. Actual browser acceptance follows
  the qualified source install; old/historical synthetic tests do not close it.
- Independent STREAM/cache/cursor/SSE/revoke/restart/recovery remains separate;
  READ does not confer STREAM. Financial, calibration/G2 and fullR2/browser gates
  are not excused by a successful bounded AccountsCURRENT lane.

Three reused agents, zero new spawns; primary alone schedules heavy jobs and
owns shared docs/deployment. Correctness cells removed by exact traps; backups,
rollback/newimages and evidence retained. No broad cleanup. ELP2-10 remains OPEN.

## Pins, receipt locations and closeout

Private state/evidence (no secret values in this packet):
`/home/bobby/.local/state/portal-execution-accounts-native-egress-20261027/`.
The real build uses Node image
`sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`;
runtime base
`sha256:50939bb5784b58b0bc68121c4920c703abf208da7dfba74541934fe53e48e9b2`.
PM unit cell uses Python3.12.14 image
`sha256:cd7c412d000912f29075a1b8803e43cb2f38bb67f104019df526df5ceaf30569`.

| Evidence | SHA256 / outcome |
| --- | --- |
| `native-independent-ca-tests.log` | `0a19d92ae87dd36ec61405e8d993b76df25140a6ea1ac69495e258b49ae22034` /52PASS |
| `independent-ca-checked-emit-final.log` | `c30e8a774e03bcacd2b574486baf4dc3c47aa9ce07a09d3527c53df43fc1b1a1` /checked emit PASS |
| `independent-ca-install-retake.log` | `51824bdcb85da35699975d2e9b24101ed9a371319a47224cfab1645961a3358d` /completed=1 |
| `pm-operators-unit.log` | `67fbc413450afa9a6bc3d00cb369185eb8aa764571e7733b6328941a8d50f1c9` /62PASS |

Rollback images remain available: original `01692fc5…` and first candidate
`05b6cd3f…`. Revert only the selected Research API tag/config after resolving any
native originals; no rollback of immutable source receipts/forward migrations.
No current original was admitted during this code-only installation.

Core changes this round: **2 commits,7files,+269/−11**; PM new operator changes:
**2 commits,4files,+956**. Documentation is committed separately as R0;
`scripts/execution-tracking-test.sh` and diff checks PASS. Locator/staged-path
checks precede that explicit Markdown-only commit; full R2/browser and actual source qualification
remain open. No public contract regeneration or Claude component change needed.
Backend next-ready: legitimate ROOT/CURRENT source registration and independent
READ/STREAM commissioning. Claude next-ready: keep accepted reader/fixture, then
take real-API/browser receipt on the exact qualified source. ELP2-11 not entered.
