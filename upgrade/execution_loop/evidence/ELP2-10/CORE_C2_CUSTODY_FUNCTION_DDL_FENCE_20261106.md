# C2 independent custody — function DDL fence, 2026-11-06

**UNCOMMITTED SOURCE/TEST ONLY.** Checkout `docs/research-loop-plan` at
`2faa8968fddbde59b2e59525e334ba3d83886144` with shared WIP; not a frozen
candidate, installed schema, independently qualified authority, restore
permit, A2 acceptance or connected source proof.

## Finding and implementation

The [checkpoint function fence](CORE_C2_RECOVERY_FUNCTION_DDL_FENCE_20261106.md)
did not cover the separate original/source-proof custody writer. A table lock
and observed trigger OID alone do not block a concurrent `CREATE OR REPLACE
FUNCTION` against the trigger function after verification. The custody
candidate now checks that its writer may execute a separately provisioned
helper before new issuance, then in the actual serializable append obtains and
independently checks its own `pg_proc` SHARE lock before checking guards. It
holds the lock through commit, including exact-original replay. The authority
transaction has a five-second idle-in-transaction timeout. Preflight remains
advisory and does not authorize release or replace the held transaction.

The fresh candidate schema creates the fixed, SECURITY DEFINER helper with
PUBLIC EXECUTE revoked. A separate **unmounted** forward candidate handles the
older helper-absent schema only when the current operator owns its schema and
three selected tables; it is idempotent on the expected helper and refuses
function-body/security/owner drift or PUBLIC EXECUTE. It never grants the
application writer automatically. This is not a numbered Portal migration.

The catalog lock blocks function DDL across the authority database while held;
privileged operator role, actual schema/ACL, lock ordering, stale-client and
availability impact must be qualified before any installation. A privileged
actor that terminates a holder or rewrites/restores the authority is not
fenced. This change does not give the source transaction an independent
old-holder fence, provide a monotonic authority, qualify the MAC key's custody,
or prove the complete terminal/ACK census. V2 restore remains refused.

## Actual verification and cleanup

- Initial disposable two-PG suite: **6/7**, with the new concurrency and
  no-op-helper test passing but a later capacity-race test failing because
  the new synthetic lease had remained active. It is not a passing run. The
  test now retires only that synthetic lease inside its disposable source DB.
- `bash scripts/test-elp2-independent-custody-pg.sh`: completed retake
  **8/8 PASS**, including old-helper upgrade/idempotence/drift, no PUBLIC
  execution, restricted writer grant, actual concurrent function DDL timing
  out with `55P03`, no-op helper refusal and same-original replay. This is a
  synthetic two-cluster test, not a live Edge or restore qualification.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS** on separate
  disposable PG clusters, including restricted logins and P7 candidate paths;
  it does not create an authenticated real owner acceptance.
- Focused strict typecheck was stopped by the operator (exit 130) after its
  process reached approximately 2.3 GiB RSS, exceeding the intended resource
  budget; **not PASS**. TypeScript `transpileModule` syntax checks for the
  affected source and test exited 0, but are not semantic typechecking.
  Tracked `git diff --check` and `scripts/execution-tracking-test.sh` passed.
  No normal hook, integrated build, live
  migration, connected source, G2 or browser test ran.
- Both scripts cleaned their own named disposable containers/networks;
  subsequent name-filtered read-only Docker checks found none. Tests were
  configured within 2 CPU / 1.5 GiB aggregate; peaks were not measured.

## Source pins

| Input | SHA-256 |
| --- | --- |
| `restore-independent-custody-candidate.ts` | `50b9f49e9e6947d09034ef9a883d7d3f16a22b6f8f440950788e30eebebf96df` |
| `restore-independent-custody-candidate.sql` | `dd708bd01550f71d08869e064f03d21c0896fede4dceee3fa4b0f5fab554e0f8` |
| `restore-custody-catalog-lock-upgrade-candidate.sql` | `4fbf2792ed5f5687ddb82510ba657d67af6fb0c3c19a0aed913dc42c81c4e57e` |
| `restore-independent-custody-candidate-pg.spec.ts` | `3d4bbf481eefe0fb37d3cd2851f921973b0637dfbff3cdc5da359d8c896f2b62` |
| `scripts/test-elp2-independent-custody-pg.sh` | `83a59ce01c88d510b8a9aa90163b395fc5f8de3c498f457ff743c8eb269522d6` |

## Next and rollback

Core: complete P7 owner/issuer composition and STATUS on exact authority,
independently held monotonic recovery authority, old-holder/source fences and
genuine post-snapshot terminal/ACK reconciliation; review and integrate WIP,
run a resource-bounded semantic typecheck, and qualify the final migration and
replay tests before the normal hook. Edge is
the upstream coordination point for actual authority and source ACK; this
slice publishes no new frontend field or Edge-ready runtime. Claude may
continue consumer/fixture work. Rollback before installation is to leave this
candidate unmounted; do not erase the original custody, keys or audit data.

## Follow-through: bounded source checks and Edge observation

At 2026-11-06 about 05:00 UTC, separate strict TypeScript checks of the
custody source and its imports, and of the C2 issuer composition and its
imports, both exited **0** with a 768 MiB Node heap cap and 90-second timeout.
The issuer check used `--experimentalDecorators --emitDecoratorMetadata`;
its first invocation without those required compiler options exited **2**
with TS1206, and is not a passing run. Both used `--noEmit --strict
--skipLibCheck --esModuleInterop --module commonjs --moduleResolution node
--target es2022`. These are selected source checks, **not** a full project or
test-inclusive typecheck, hook, installed image or runtime qualification.
The separate full build-config source check attempted with a 1 GiB Node heap
cap exited **134 (heap exhausted)**; it is not PASS. The earlier successful
full typecheck in the plan predates subsequent WIP and cannot be transferred
to this changed candidate without impact analysis. Source hashes remain
`50b9f49e9e6947d09034ef9a883d7d3f16a22b6f8f440950788e30eebebf96df`
for custody and
`50d84886c8e24b63ba3f1045c7f978168541406b52a66204c86550da051d8e73`
for issuer composition.

Read-only SSH to the Edge worktree observed HEAD
`636d58a7c4368a617903734ab1d0ce933d2804ca`; the checked TS status still
ended with the 2026-11-05 static verification and asks, not an A2 acceptance
or a newly qualified binding. This is a point-in-time mailbox observation,
not proof of all external state. The two local public candidate certificates
were within their stated validity windows at 2026-11-06 04:59 UTC (server
expires 2027-05-04 05:33:46 UTC, client 05:33:53 UTC); this does not prove
that either is installed, trusted, reachable, unrevoked, or authorised.
No service, database, identity, secret, UI, container or remote file changed.
P7-gated positive STATUS/custody composition, real A2, independent restore
authority and source ACK remain open; do not issue B2 from this observation.
