# Original EPG10-08 — Core unused identity finish owner action

**Current publication entry:** the qualified operator/tests/receipts are now
mirrored in this Edge checkout; actual normal-hook/commit/push results live in
the [main journal](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#original08-operator-publication-and-connected-preparation--renewed-assignment19oct).
The overlay/unpublished observations below are dated provenance, not current
activation instructions. Core returned008 candidate a2bd8435/bootstrap cc6ae429
SOURCE_ONLY; it must land/install and resolve actual custody before issuance.
Do not treat the historical e997 bootstrap/READY observation as current health.

Status: REVIEWED CODE-PATH GAP; not an actual issued/orphan session.
Owner: Portal Core. Edge source/test work continues independently.
No new phase, schema, public endpoint, grant, command or release is requested.

## Installed inputs

- Core implementation f46439157fe25892fc4372dda532bd1f8bdc4773.
- Runtime image sha256:16bf254b5e8b9fb7781cd9f08379706f5a9c06577e48f8b5d2603dacabfdc5e5.
- Installed private bootstrap:
  /home/bobby/secure/portal-research-c7-20261019/reverse-runtime-v1/reverse-bootstrap.cjs
  SHA256 e997debdcbc0500dd91252f6ff5a79ad31f5571d3ddbd6caae077ec2fb298cea.
- Candidate source apps/control-api/src/execution-v2/current-human-candidate.ts
  SHA256 74aa99af7e02056dd5552185069b4ed5195a3f2f40ea8398d709f8d8102bedd3.
- Core installed handoff CORE_INSTALLED_EDGE_HANDOFF_2026-10-19.md and private
  transfer manifest15d94c6fae07e0cbb251d5193eb89bf74ca9682a2adebf43e1192955031eb4b2.
- No identity issuance, role opening, source attempt or business READ occurred
  during this review. Status13:33UTC was READY, unresolved0, callbacks0.

## Exact failure path

1. Bootstrap issue-identity175–191 creates exact temporary AuthService session
   and durable ISSUED lease before writing its IPC response234.
2. Lose that response before PM prepares its original attempt. There is no
   legitimate source attempt/receipt to recover or manufacture.
3. finish193–209 commits candidate.beginDrain. Candidate663–670 safely retires
   ISSUED so it cannot ENTER after drain.
4. ownedTerminal156–168 correctly rejects RETIRED/no-attempt/no-receipt unless
   a real SOURCE_ROLLED_BACK_UNENTERED event proves a physical source rollback.
   The separate unused case therefore gets SOURCE_TERMINAL_REQUIRED.
5. status cannot recover the assertion; issue again is forbidden. Exact logout
   cannot finish. This is not source UNKNOWN and not proof of rollback.

## Minimal Core repair

Keep ownedTerminal and every real source terminal/COMMIT/UNKNOWN predicate
unchanged. Add a separate strictly bound Core-unused-retirement eligibility
used ONLY by private finish:

- Genuine committed drain is DRAIN_READY for the original drain/revision.
- Exact original lease/session/revision/user/workspace/environment/workload/
  request digest match. Lease is RETIRED with null attempt and terminal receipt.
- No source ENTER/UNKNOWN/terminal/unentered-source-rollback event, unresolved
  obligation or callback is present. Missing/duplicate/inconsistent facts deny.
- Only exact temporary session logout and endDrain are enabled. Do not release
  a source mapping, READ grant, command, source receipt or alternate identity.
- Preserve drain/retry custody through lost logout ACK. Repeated finish must
  confirm the same exact revoked session, not mint or accept a replacement.

Existing lease RETIRED and IPC FINISHED states suffice. CORE_UNUSED_RETIRED may
be an internal reason only; never translate it to source ROLLED_BACK, create a
PM attempt/receipt or return a fake source ACK. No public terminal enum needed.

## Required focused proof and return

Exercise lost issue reply before prepare, normal unused finish, repeated finish,
logout-ACK loss/recovery, wrong lease/session/binding and missing facts. Refuse
the unused path for ENTERED/UNKNOWN/COMMITTED/ROLLED_BACK/source-unentered-event,
in-flight callback or unresolved obligation; test concurrent ENTER versus drain
on actual fenced transactions as appropriate. Existing Core source tests may be
reused only when unchanged and attributed; fixture/model proof is not installed
runtime acceptance.

Return reviewed implementation/patch and test pins/counts, actual installed
bootstrap/image/config/schema pins, original physical Core DB identifier,
READY/unresolved/callback state and exact operational blast radius/rollback.
Edge will not patch/restart installed Core behind its owner. Retain current
listener/custody until a reviewed no-session window or real obligations settle;
never erase audit or kill UNKNOWN. No assertion secret/cookie/private key goes
in this document, Git or chat.

## Current Edge operator input — 2026-10-19

Status: IMPLEMENTED / ISOLATED_QUALIFIED_NOT_PUBLISHED. This is the remote
public overlay, not a canonical commit, Core repair or connected acceptance.

- [Operator source](../../../integration/execution-native-read-v1/research-identity-intake/identity_operator.py):
  SHA256 `e108a0a740831a3905c6174597420888160097de7ff4edd682bf276965f42424`.
- [Affected tests](../../../integration/execution-native-read-v1/research-identity-intake/test_identity_operator.py):
  SHA256 `a9ea6d20d3574cc63ef30666d91143a8ccc1d20f938d57a6a3f99c856e4d47b5`.
- [Current exact qualification/cleanup receipt](../../../integration/execution-native-read-v1/research-identity-intake/operator-real-tls-qualification.json):
  SHA256 `108cd0ec4aeb532a7907c72fb3ee1ad9d16c0e4d4acaf00b117802d7c1e08be0`.

Actual run14:45:25–14:45:36UTC:67PASS,0FAIL/SKIP, including65 overlapping
regressions and2 new real CPython3.10 loopback TLS/socket lifecycle cases.
Callbacks remain TEST_ONLY; this is not actual PM SDK/Core/DB, operational mTLS
or production-capacity acceptance. Prior65 receipt stays historical; unchanged89
official-helper cases are retained by exact pin, not rerun or added to67.
Canonical `feat/execution-edge-upgrade-v1_2@6adc398b573e297b731863e5ed93f0f7f59ab2fd`
still awaits quiet-HK mirror, ordinary hook, commit and publication. Do not
execute an old operator/companion or treat this remote overlay as published.

Root's later read-only Core IPC observation14:54:56UTC was READY,
cookie_lost=false, unresolved0, terminal=null, with accepted/denied/in-flight/
timed-out callback counters0. No issue/finish was called. It does not close the
unused-finish repair, identity COMMIT/ACK or separate READ/STREAM authority.

## Edge continuation

Edge's owned operator preparation is implemented and isolated-qualified as
pinned above; canonical publication remains pending. Official helper5f1a0f293311f752d934de72666f8b2e9d671c899eec115d08d7ccd30265dec2
is unchanged. A qualified and published operator plus this owner repair precede
actual JIT identity issue. Then genuine same-attempt source COMMIT/Core ACK and
exact cleanup precede separate READ/STREAM/revoke/cache/cursor/SSE qualification.
Full08 remains NOT_MET;09 connected is NOT_STARTED.
