# Financial parent to test HTTP custody — 2026-11-06

**SOURCE/TEST ONLY; NOT INSTALLED.** Checkout `docs/research-loop-plan` at
`2faa8968fddbde59b2e59525e334ba3d83886144` plus shared WIP. This does not
constitute a real source or Edge ACK, A2 readiness, V2 restore or phase PASS.

## Change and boundary

The previous synthetic HTTP test constructed the financial authority directly;
it did not exercise the coordinator that saves an encrypted parent before
ISSUE. The test-only coordinator now supplies a scoped transport adapter, so
the mTLS test uses parent-save → authority → restricted reader → committed
HTTP custody. A callback exposes the opaque context only within its scope;
wrong principal, concurrent reuse, released scope and shutdown refuse. The
adapter always refuses completion: source terminal or socket finish is not a
recipient ACK.

A focused race test found an in-flight assertion could return after the
callback scope had closed. The adapter now checks the same scope identity
after issuer/revalidation I/O. Separate scope identity also prevents an old
in-flight result from being accepted when the same operation is reopened.
This protects the test bridge's return boundary; it does **not** prove the
entire HTTP response remains fenced if a scope closes after that return.

## Verification

- Before the fix, the focused test reproduced the scope-exit issue: **1
  failure, 2 passes**. After adding the post-I/O and scope-identity checks,
  financial parent transport plus financial assertion unit suites passed
  **64/64**, including scope exit, reopen, release and shutdown during an
  in-flight operation. The issuer and storage in this focused race are mocks.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: final **9/9 PASS**,
  exit 0, two disposable PostgreSQL clusters, duration 100.92 s. It exercises
  the new coordinator with the existing synthetic loopback mTLS/restricted
  reader/custody test, including wrong principal, concurrent callback,
  changed assertion, exact original, scope exit and refused completion. A
  separate existing scenario recovers a synthetic same-original after
  SIGKILL; this run does not establish a single restart-to-HTTP or live-old-
  holder egress proof. Counts overlap previous runs and must not be added.
- Focused strict source **and new test** TypeScript check, and tracked
  `git diff --check`, exited 0. A sandbox-only PG attempt failed because it
  could not use Docker/sudo. The initial outer `flock` attempt also failed
  because the script itself takes the same lock; the successful run invoked
  the script directly. These are not passing test runs.
- The test script's own cleanup trap ran. Resource ceilings were 2 CPU and
  1.5 GiB combined; peaks were not measured. No UI, real source, database,
  credential, Edge runtime or production setting was changed. Normal hook was
  not run because the shared candidate is not frozen.

| Working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-financial-parent-orchestrator-candidate.ts` | `a9d3e89ef5e2ecca9ac7e31423dd80665d68e0c35283bf22b61a2a0adc2b1799` |
| `apps/control-api/test/c2-financial-parent-transport-candidate.spec.ts` | `a2b8be6a2beda041b69275246ace6089dde20768174003ed1cd4032bb970a4d7` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `202b3b4208acb3b49a2eaedd3a1a061fc4da382b3d230dde3433cc53affa39eb` |

These are WIP file hashes, not a commit, image or applied schema.

## Remaining and handoff

The real coordinator must durably retain its operation ID; independent
owner/key/role and source-field authority must be qualified. The test bridge
is not sole production egress: HTTP write/abort, active old-holder fencing,
rollback and process recovery must be composed and tested together. Genuine
source terminal and recipient ACK, durable completion/sequence, and V2
restore still need proof. P7/A2, Edge READ/STREAM, financial publication,
G2 and browser qualification remain open. No frontend contract or Claude
action is introduced. Rollback: leave the candidate and test seam unmounted.
