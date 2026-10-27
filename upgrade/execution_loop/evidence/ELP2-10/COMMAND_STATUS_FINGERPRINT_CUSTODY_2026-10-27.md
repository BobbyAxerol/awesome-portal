# Command STATUS source fingerprint custody — 27 October 2026

Status: **SOURCE LANDED; NOT CONNECTED QUALIFICATION**.
This source slice does not commission a gateway, activate commands/Live, or
create/resolve/ACK an Edge attempt. Edge remains owner of original wire bytes
and full outcome custody; Core remains owner of its existing command records.

## Problem and implementation

The prior STATUS transport permanently retained up to 128 originals in its
process map. Even acknowledged entries never left that map. A running process
would eventually refuse unrelated later originals. Simply evicting entries
would lose substitution detection, and expiry does not resolve UNKNOWN.

Migration 155 adds an append-only comparison fingerprint, keyed by FK to the
existing immutable Core command. The repository checks the workspace/key,
actor, exact intent and exact source authorization against that command before
inserting. It stores only digests of the source binding/original, exact status
UTF-8 bytes and PM request digest: no source bytes, credentials or economic
outcomes. The one-to-one FK bounds fingerprint count by the existing retained
command census; its trigger rejects update/delete. Retention does not discard
UNKNOWN or recycle a source key. Owner-approved long-term retention and storage
qualification remain separate.

The transport keeps only a bounded expendable original-byte cache. After cache
eviction it reads the original from Edge again and checks the durable digest;
pending/UNKNOWN prepared deliveries remain in their existing custody and are
not evicted or replaced. Restart reconstructs the byte cache from Edge, while
the PG comparison detects changed bytes. PG unavailability fails closed.
This is a comparison fence, not a replacement for the existing source terminal,
current-human revocation, outcome ACK or recovery protocol.

## Tests and status

- Real loopback TLS transport/composition on the final UTF-8 source: **44/44
  PASS**; includes exact UTF-8 rejection, 140 source
  originals with cache capacity four, restart/substitution, and an UNKNOWN
  delivery surviving cache eviction without source retry or false ACK.
- Persistence ledger: **22/22 PASS**.
- Pre-UTF-8-hardening source disposable cell `scripts/control-api-test.sh` with the
  `command-status-original-fingerprints-pg`, `edge-command-status-transport`
  and `command-status-composition` specs: **build + migrations PASS, 45/45
  tests PASS, PostgreSQL restore drill PASS**, exit 0. PG uses synthetic
  commands and source, and tests 150 originals, reconstruction, conflicting
  concurrent pins, exact binding, immutable UPDATE/DELETE and invalid scope.
  Its 43 loopback cases overlap the retake above; do not add their counts.
- An earlier intermediate TLS fixture failed one test because its synthetic
  response used the wrong original digest; corrected fixture retake passed.
  An earlier PostgreSQL build and standalone typecheck were deliberately
  interrupted after the source changed; neither is a pass on this candidate.
- The first normal hook was interrupted before completion to harden exact UTF-8
  validation found during review. Its initial PASS checks are not a complete
  hook receipt. The added UTF-8 check passed in the final focused retake above.
- The final normal hook passed and source landed at
  `4e3199bd009b4d7205ab6865acf9b545fa0a3c53`: contract suite **1,898
  passed**, Control API **11,681 passed / 8 skipped** (567 passed / 4
  skipped files), monorepo verification and tracking passed. The final
  source ran both the fingerprint PostgreSQL spec (**2/2**) and transport
  spec (**18/18**) inside that same cell; these overlap the focused tests
  above. The full hook took 4,164 seconds for Control API; no skipped test is
  counted as a pass.
- Runtime installation and connected qualification: **NOT YET**.

Rollback: leave the optional STATUS composition unmounted or revert code only;
preserve fingerprint rows, the immutable command, unresolved source custody
and all prior audit. Migration down is deliberately non-destructive.

## Remaining

Connected READ/STREAM, real gateway STATUS/recovery, financial/ownership
carrier, Calendar, calibration, G2 and browser acceptance remain open. The
separate [FE-069 handoff](CLAUDE_FE069_PAGINATION_HANDOFF_2026-10-27.md) awaits
Claude's integration and receipt. No UI changed or remote pushed in this slice.
