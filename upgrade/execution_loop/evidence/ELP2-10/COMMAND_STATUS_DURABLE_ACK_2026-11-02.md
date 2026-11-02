# STATUS: durable same-original delivery fence — 2 Nov 2026

## Scope and state

Working-tree candidate on `docs/research-loop-plan`; **not committed, built,
installed or connected**. This changes the private Paper STATUS path only;
it does not submit an order/command, enable Live or change a browser contract.
The approved qualified Edge gateway and original are still needed for real
acceptance. No test result below is an Edge/PM economic receipt.

## Findings and change

The existing exact-request single-flight was keyed by full request bytes.
Two simultaneous requests for the same actor/original/call but different
bytes could each enter preparation before either published its context. A
synthetic regression failed before the fix: both were accepted. In addition,
after one request was prepared the same logical call and body with a different
contract input could get the old token; the negative regression reproduced
that behavior. Preparation now reserves the logical call and rejects any
non-identical pending input, and an existing context is reused only when the
full captured input and status body match. Exact concurrent retries still
coalesce; canceled callers cannot retire the shared original.

The previous issue/custody guard lived in a single authority process. A
reconstructed authority could not inspect its predecessor's pending lease and
could ask the current-human writer for another STATUS identity. The new
`issueCommandStatus` checks the persistent current-human leases under the
existing serialized authority transaction, by **workspace, Paper environment,
workload and exact source-request digest**, not just the browser session.
ISSUED, ENTERED, UNKNOWN, RETIRED and source-terminal-without-delivery-ACK
all refuse a replacement; a second process or another already-authorized
session cannot bypass the fence. The authenticated private endpoint maps this
to `409 COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED`. This specific
refusal is made before the lease INSERT under the authority lock, so its
in-memory failed attempt can be retried after the original has genuinely been
ACKed; ambiguous failures remain held and are not treated as definite refusal.

Migration `156_execution-command-status-delivery-acks` adds a local append-only
delivery-ACK table. Only the existing pinned Edge completion path can ask the
current-human writer to record an ACK, after it has received the exact Edge
response digest and rechecked the original persisted terminal receipt and
current human authority in the same serialized transaction. Exact lost-ACK
retries are idempotent; a different digest is refused. No token, credential,
source payload, intent, source transaction or invented terminal receipt is
stored. The existing generic `issue` path is unchanged. The ownership ledger
identifies the new table and notes its **cumulative** retention: a production
budget and approved archive/disposal policy remain necessary.

Old leases do not gain a fabricated delivery ACK during migration. A prior
matching lease without a matching durable ACK stays fenced, even if terminal;
commissioning must reconcile historical custody and actual Edge delivery
through an approved source-backed recovery path. On process loss, the old
in-memory context is not reconstructed and this patch does **not** implement
an authenticated cross-process continuation/ACK of that vanished context.
The safe outcome is recovery-required, not a replacement or successful replay.
The Edge gateway/owner must supply and qualify that continuation; the code
must not be enabled as a claimed end-to-end recovery solution in the meantime.

## Verification

- Before the first fix, the conflicting-body regression failed because both
  preparations resolved; after the fix the corresponding race and changed
  contract-input negatives passed.
- Five focused STATUS, assertion transport, Edge-status transport, gateway
  binding and current-requester suites: **175/175**, using synthetic sources
  and loopback-only TLS, before the final definite-pre-INSERT retry refinement.
  The final assertion suite passed **38/38**, including lost-ACK-after-commit
  retry on the same lease and a retry after the original's genuine ACK. The
  first version of the latter failed because the definite refusal was cached;
  ambiguous failures are still retained.
- `elp210-current-human-candidate.spec.ts`: **106/106** on PostgreSQL 16.15
  before broadening the SQL fence to cover another session. The additional
  final-source test then passed **1/1** (105 unselected): concurrent writers,
  reconstructed candidate, a second previously-created authorized session,
  UNKNOWN, terminal without ACK, idempotent exact ACK, mismatched ACK and
  next issue after ACK. The first version of that additional test tried to
  insert a session after issuing and correctly hit `CURRENT_HUMAN_DRAIN_REQUIRED`;
  the final test creates the second session before issuance.
- `command-source-assertion-pg.spec.ts`: **4/4** on the final source with
  real PostgreSQL, real Core auth/session/access/command persistence and
  ephemeral loopback mTLS. The source's terminal proof and identities are
  TEST_ONLY. One case reconstructs a second authority, proves the outstanding
  original is refused, checks the exact ACK persisted after source terminal,
  and retries the definite refusal successfully only after that ACK. This
  final-source run used a second socket-only cell after the first was cleaned.
  The Docker-only test guard was not removed: the additional explicitly
  requested Unix-socket lane independently checks a private owner-only cell,
  matching database/data-directory, and disabled PostgreSQL TCP **before**
  migrations or writers run.
- The DB cell was PostgreSQL 16.15 with a private Unix socket and TCP disabled.
  Its PGDG InRelease was signed by the pinned `B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8`;
  package/index SHA-256s were checked. A synthetic dump/restore into a second
  DB preserved **150 migrations and two ACK rows**, with matching row digest;
  UPDATE and DELETE were refused by the restored immutability trigger. The
  down migration was exercised on the restored DB and **safely refused** with
  `COMMAND_STATUS_CUSTODY_DOWN_REQUIRES_APPROVED_ARCHIVE`, leaving both ACKs
  and migration ledger intact. This is a preservation rehearsal, not an
  approved production rollback. The exact DB cell, synthetic data, packages
  and dump were removed after PostgreSQL was stopped; no shared DB was used.
- Persistence-ledger checks: frontend `r2Ledger.test.ts` **22/22** and
  contracts producer-ledger **1/1**. `git diff --check` passed. A Control API
  typecheck printed its diagnostics without TypeScript errors, but its exit
  status was not retained; it is **not a verified PASS**. The final integrated
  hook must capture the exit status.

Source SHA-256s at the PostgreSQL checkpoint:

- `current-human-candidate.ts`: `5c8f844b8f9e16aeb8f41bd73773d91b7d32ad2f2b2f4705e19e7a75e101aedd`.
- `command-source-assertion.ts`: `5e2a3eb2fdc74ac47241cdfa72b927563842326a9db6a548fba06f61bf06a3b0`.
- `command-source-assertion-pg.spec.ts`: `2aac126a38f89e2ce79041c55fdc68bc61e30109b5fb2f495ea712561df322c3`.
- Migration 156, including the verified fail-closed down: `c48d6e76f45928eaf186cfce445dd72051274cdf5ca422a9e3ea6b4c0b271a6d`.

For local preservation while the final integration gate is still open, a
mode-0700 backup cell was created at
`/home/bobby/.local/state/portal-research-backend-20261102-7rY0guq1`, based on
`73ef23caf70e084c8052fdc1a41c4968625fb772`. `tracked-working-tree.patch`
SHA-256 is `d9bca5355225b5d36437f9d76c3f914f4938a805d9b7fcfb85e759fae3466c5e`;
`untracked-scoped-files.tar` SHA-256 is
`279be7c7b967df79208decb14dd1d05ed3ec9cefaaef4d9e4837e175662b6272`.
The archive includes the pre-existing Edge mailbox files without modifying
them. This is a point-in-time local backup, **not** a commit, remote backup,
permission to overwrite work, or evidence of deployment.

## Handoff and remaining work

Claude: no new visual/component field is required for this private fence.
The separate [Alpha V1 nullable consumer handoff](CLAUDE_ALPHA_V1_NULLABLE_HANDOFF_2026-11-02.md)
still blocks an integrated frontend acceptance. Edge: when the gateway is
commissioned, handle the typed 409 as held custody; recover the **same**
original/lease and provide actual terminal and delivery proof. Do not retry as
a new identity, invent an ACK, or use a fixture as the real carrier.

Outstanding: cross-process completion of a lost context, historical custody
reconciliation, qualified Edge STATUS/original and real READ/STREAM, financial
carrier/ownership/census, calibration/G2, browser acceptance and normal hook
on the final integrated candidate. ELP2-10/11 remain open.

## Follow-through: recovery quota after a definite refusal

An additional test reproduced a local availability bug: a second authority
repeatedly polling an unacknowledged original exhausted its context's delivery
quota even though the serialized writer had explicitly refused each request
before INSERT. Once the first authority recorded the real terminal and Edge
ACK, the second authority could no longer retry. The pre-fix negative test
returned `COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED` instead of the
expected held-custody `409` after four refusals.

Only the exact `CURRENT_HUMAN_COMMAND_STATUS_RECOVERY_REQUIRED` pre-INSERT
refusal now releases that one reserved quota slot. In-flight work remains
bounded, actual issues still consume the lifetime quota, and ambiguous errors
are still retained on the original delivery rather than retried as new work.
No new source identity, source attempt or acknowledgement is synthesized.

- Six affected STATUS, gateway, composition and mTLS-loopback suites passed
  **205/205** on the updated candidate. An initial sandbox-only invocation
  had **68 loopback failures** because `listen 127.0.0.1` returned `EPERM`;
  the identical suite was rerun with local loopback permission and passed.
- The final PostgreSQL test passed **4/4** in a fresh isolated 16.15 cell.
  It checked six definite pre-INSERT refusals across two authorities against
  one UNKNOWN original, followed by authenticated TEST_ONLY terminal + ACK,
  then same-context retry; no extra lease appeared before that ACK.
  Package hashes matched the pinned PostgreSQL/client/libpq artifacts above;
  the DB listened on a private 0700 Unix socket with TCP disabled. The server
  was stopped and the exact disposable cell and synthetic data removed after
  the test. This is not evidence of an Edge-connected gateway.
- Updated source/test SHA-256s: `command-source-assertion.ts`
  `1e22f17cd7feb34c9876a06ce55045348d7f2324811dd826ab452695ae4100e5`;
  `command-source-assertion.spec.ts`
  `bbe9df552cb14659d071abb945d713431037ebf74464a41b669cc767de921bc1`;
  `command-source-assertion-pg.spec.ts`
  `8fa10128f79a0fab9c0552cf22be894fdebe512fa3c3e825b7bd1725c14b5f6e`.
- The same private backup cell now additionally contains the complete tracked
  diff `tracked-recovery-quota-20261102.patch` SHA-256
  `29226c9546450715728b4289cad85f079c10670566596f83cbe630de32f1581a`
  and five untracked backend files in `untracked-backend-20261102.tar` SHA-256
  `ce832c7364c9ac724828513b0c42948c0ae49dd33e1a7b3786d1ebbbe5336027`.
  This preserves working-tree code locally; it is not a commit or deployment.

The other limitations above are unchanged, including actual cross-process
continuation of an already-vanished context and the final integrated gate.

## Follow-through: writer capacity and drain refusals

After the quota checkpoint, two focused regressions also reproduced a stuck
context when the writer definitely rejected an issue **before INSERT** with
`CURRENT_HUMAN_CAPACITY_EXHAUSTED` or `CURRENT_HUMAN_DRAINING`. The previous
promise stayed cached even after the condition cleared. The earlier statement
that *only* the custody refusal returns its quota reservation is therefore
historical: the candidate now returns it for these **three specifically
identified pre-INSERT guards**. The original typed recovery-required response
is unchanged. Capacity and drain retain their existing sanitized transport
behavior; ambiguous SQL/COMMIT/signing failures are still cached and fenced.

- The two new isolated tests failed before this change and passed afterward.
  They exercise repeated pre-INSERT capacity/drain refusals beyond the quota,
  then a same-context retry; the drain error is synthetic, not a connected
  live-revocation proof.
- One final combined run of **7 suites / 211 tests passed**, including all four
  real-PostgreSQL STATUS cases. The extended PG case used a real
  one-unresolved-lease capacity limit across three authorities: six capacity
  refusals did not insert a second lease; after capacity cleared, the original
  still blocked on missing ACK; only authenticated TEST_ONLY terminal + ACK
  permitted each successive lease. This is synthetic source data on a real
  local database, not an Edge or PM authority receipt.
- The PostgreSQL 16.15 client/server/libpq hashes matched the pinned artifacts.
  The private 0700 cell had TCP disabled and was stopped and removed after
  testing, together with its synthetic data. No shared DB was changed.
- Final checkpoint SHA-256: `command-source-assertion.ts`
  `f066b82892f37c3f6dac9ccfb21838c535757c44d947971f2777e3e79d84896b`;
  `command-source-assertion.spec.ts`
  `11d9b77deae981d2e86144483a646676d23d4175254f881a3500f857dd41eca7`;
  `command-source-assertion-pg.spec.ts`
  `73959fefc0141845b3b1b80ba98655b251c48eb810c921c7b71b5c22d1e3aabc`.
  The newer complete tracked-diff backup is
  `tracked-recovery-capacity-20261102.patch` in the private backup cell above,
  SHA-256 `0daf3522c633db95ccb19bc019674d8568bbd42a53b5176d634e4e89aa0c2d03`;
  the previously recorded untracked backend archive remains applicable.

No production/runtime install, new UI contract, source qualification or
cross-process recovery of a vanished context is implied. The candidate remains
uncommitted and the final typecheck/hook still needs an exit-status receipt.

## Final source typecheck and coalesced-refusal test

An additional synthetic concurrency regression holds one definite pre-INSERT
capacity refusal while **16 exact callers** join the same delivery. They all
receive that refusal, one reservation is refunded, and the original limit of
four actual acknowledged issues still blocks a fifth. The complete focused
`command-source-assertion.spec.ts` suite passed **43/43**; this overlaps the
earlier combined 211-test run and must not be added to it as new coverage.

The candidate Control API source typecheck
`npm exec -- tsc -p tsconfig.build.json --noEmit --diagnostics` completed
**exit 0**, 1,481 files, 212.63 seconds, peak reported TypeScript memory
2,230,794 KiB. This supersedes the earlier unrecorded typecheck-status note,
but not the final integrated hook. The tracked `apps/control-api/src` binary
diff SHA-256 was
`41b451280fbfcf104ab22191f5ee2fc26523397856d85970d20f167e30757095`
both immediately before and after that typecheck; the untracked included source
`account-comparison-availability.ts` SHA-256 was
`bc504af8404e3ec06ee127d21c9aabb49a4ffde97d87728a95554e2d67aa7e4d`.
The test file SHA-256 after the extra concurrency case is
`61d74dafc735edf6eee3642cda1b55daa2edc576a4f4e32dac306b14ceaef5bc`;
the source and PG-test hashes in the preceding checkpoint are unchanged.

The latest backup in the same private cell separates code from Markdown:
`backend-code-recovery-final-20261102.patch` SHA-256
`191313c9f5df11bba5a264bda479ae0802ada61580297b0c360a486552fbf5dc`,
plus the previously listed `untracked-backend-20261102.tar`. It is local
preservation only; none of these results is an installed or connected source.
