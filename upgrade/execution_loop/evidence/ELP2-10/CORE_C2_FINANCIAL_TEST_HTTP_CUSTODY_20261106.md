# Financial assertion — test-only HTTP custody composition

**SOURCE/TEST ONLY; NOT INSTALLED, CONNECTED OR PHASE COMPLETE.**
`docs/research-loop-plan@2faa8968fddbde59b2e59525e334ba3d83886144`
plus shared WIP. This is not owner/source qualification, a genuine Edge ACK,
an operational restore or authority to enable command/Live.

## Scope and change

- Added an explicit unmounted TEST_ONLY seam in the financial mTLS transport,
  following the existing STATUS test pattern. Validated assertion bytes pass
  through a supplied custody callback; an incomplete callback fails closed,
  and a timed-out or partially written response is destroyed. In-flight
  capacity remains held until the underlying callback actually settles.
  Completion remains a separate operation; no ACK is inferred from HTTP finish.
- Added a disposable-database restricted financial reader and test delivery
  composition. It derives the exact delivery locator from the private parent
  and checks the stored lease, actor/session, workspace, binding, request,
  assertion digest, source workload and expiry before using the existing
  committed SENDING/HOLD delivery procedure. The test reader is not a field
  authority; its two DB endpoint names alone do not qualify a pool or role.
- The shared candidate procedure's unsafe-role census omitted the new
  `elp210_c2_financial_candidate` schema. Its census now includes that schema,
  and the test reader separately rejects direct or inherited authority on the
  original table/schema. A test grants the synthetic caller INSERT and checks
  that both reader and exact-original UNKNOWN replay refuse until revoked.
  This is a source-level finding plus regression, not a claim of a live exploit.

## Verification

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: final **9/9 PASS**, exit
  0, two disposable PostgreSQL clusters. The changed integrated scenario uses
  the unmounted Core/P7 financial authority, restricted reader/writer and
  loopback mTLS. A changed assertion is refused before an obligation is made;
  the valid response creates one `UNKNOWN` obligation and zero STATUS ACKs.
  Fourteen changed original/binding/actor/session/expiry/revision fields each
  return no row; granting INSERT on financial originals makes reader and replay
  reject. Prior positive/negative restart, P7 and STATUS cases remain included.
  Two earlier 9/9 runs were superseded by added tests/ACL changes; counts are
  not additive.
- `bash scripts/test-elp2-restore-inventory-rls.sh c2-delivery-procedure`:
  **5/5 PASS**, exit 0, disposable PostgreSQL; checks the affected shared
  procedure and STATUS/revoke behavior. This is not a full integration gate.
- Focused financial transport/assertion and STATUS transport suites: **184/184
  PASS**, exit 0, synthetic loopback TLS. This includes invalid output before
  custody, incomplete delivery, partial-response destruction, timeout and
  bounded in-flight behavior. Focused strict source typecheck and
  `git diff --check` exit 0. No normal hook or full test-inclusive typecheck.
- Test scripts used their isolated resource ceilings (maximum 2 CPU / 1.5 GiB);
  peaks were not measured. Their cleanup traps ran; read-only inventory found
  no matching named test nodes/networks. No runtime, UI, live DB, account or
  credential changed.

| Working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/financial-source-assertion-transport.ts` | `a63a2df76a2ad3151d60ffa6eda90b21d0df353a66e33d85bd91460a4e57a418` |
| `apps/control-api/src/execution-v2/c2-financial-http-delivery-test-candidate.ts` | `205d030f812b7a76e8bc573144740f67f9bdaa26d3b9b71f1bb40437cae65c32` |
| `apps/control-api/src/execution-v2/c2-financial-reader-acl-candidate.sql` | `a2b750a0587c65ccacfc8dacb44822fde18074d9f01e2eff04963b3d46206272` |
| `apps/control-api/src/execution-v2/c2-delivery-procedure-acl-candidate.sql` | `f35aea338213d5f2af3bbc0169483b446940e0bd62d3f857139dbc0211be44a4` |
| `apps/control-api/test/financial-source-assertion-transport.spec.ts` | `ee11c2b65002ff8a10889d681bf1af589ec919da5d1d36c817a5e90e80637e9a` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `e02b80390e78576d793556c53b4c5e55e89d84c5283b98d5edfefa4584858b23` |

Working-tree hashes are not commit/image/schema pins. This supersedes older
hashes only for these changed files, not their historical test results.

## Remaining / handoff

The real system still needs qualified source and field authority, atomic and
role-qualified reader/egress composition, protection against a still-live old
holder and rollback, persistent operation ID, genuine source terminal and
recipient ACK, and delivery-sequence recovery. A2/P7, V2 restore, Edge
READ/STREAM, G2 and browser gates remain open. Generic financial composition
must continue to refuse C2; do not mount this callback merely because the
synthetic test passed. Rollback is to leave candidate components unmounted.
No frontend contract or Claude action is introduced by this test seam.
