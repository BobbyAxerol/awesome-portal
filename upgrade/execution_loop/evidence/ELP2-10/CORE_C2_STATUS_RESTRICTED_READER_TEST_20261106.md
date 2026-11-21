# STATUS restricted reader test — 2026-11-06

**TEST ONLY / UNMOUNTED.** The preceding custody test used a privileged PG
reader. This follow-through replaces it in the disposable cell with a reader
function owned by the existing NOLOGIN test definer; its caller has EXECUTE but
no direct SELECT on context links or leases. It returns only the original
digest and expiry for the exact 14 supplied context/lease bindings. HTTP
delivery still reserves and fences using the separate restricted procedure.

The new SQL refuses installation outside `portal_restore_rls_<8 hex>` and
rejects caller membership, including reachable NOINHERIT roles, with broad
SELECT on the two tables or elevated database attributes. This is **not a
production field-authority design**: the disposable function does not itself
authenticate a real human, establish the caller's authorized workspace or
qualify a source. Neither the SQL nor test transport is mounted. The earlier
[HTTP custody test](CORE_C2_STATUS_HTTP_CUSTODY_TEST_COMPOSITION_20261106.md)
remains a historical record of the previous privileged-reader run.

## Checks

- `bash scripts/test-elp2-restore-inventory-rls.sh c2-delivery-procedure`:
  final **4/4 PASS**, exit 0. Direct SELECT on links/leases is denied; valid
  lookup and mTLS/custody delivery work with the restricted caller. All 14
  individual binding mismatches return no row. A reachable NOINHERIT role with
  table SELECT is refused. The previous exact-original, revoke, lock-order and
  no-ACK checks remain in that suite. Issuer, identities and certificates are
  synthetic; there is no real Edge ACK.
- Strict selected source TypeScript check with a 768 MiB Node heap: **exit 0**.
  `git diff --check`: **exit 0**. No full-project typecheck or normal hook
  was run in this follow-through.
- The first test attempt in the sandbox exited 1 because sudo could not elevate;
  it did not run the test. The authorized disposable-cell test and subsequent
  retake both exited 0. Afterward, read-only Docker queries found no matching
  `elp2-restore-rls-` container or network. No runtime or live DB changed.

## Working-file pins

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-status-reader-acl-candidate.sql` | `28ff238d569f1f6f8a1722878d19c8b0041a94e785769247c6fef65fc68ae824` |
| `apps/control-api/src/execution-v2/c2-status-http-delivery-test-candidate.ts` | `550a956c39c5322fd2f48b314c80f0bd9ac8ba7166acdbf09e5e8ea818552a0e` |
| `apps/control-api/test/c2-delivery-procedure-pg.spec.ts` | `aeba5f3d8749a0a7f207a73f5d2480d74c55c3a5d5a02156f70df149ff0c49bf` |

These pins supersede the corresponding test-only pins in the earlier receipt.
Next: combine actual Core authority and P7 with this path; design and qualify
real principal/workspace/source authority and production reader roles; then
retest recovery with a genuine terminal and Edge ACK. Independent V2 restore,
A2, connected acceptance, candidate review and final gate remain OPEN.
