# Financial test HTTP scope and interrupted delivery — 2026-11-06

**SOURCE/TEST ONLY; UNMOUNTED.** Checkout `docs/research-loop-plan` at
`2faa8968fddbde59b2e59525e334ba3d83886144` plus shared WIP. This is not a
runtime, source/owner qualification, Edge ACK, V2 restore or phase PASS.

## Change

The preceding parent-to-test-HTTP bridge checked the scope while returning an
assertion but did not hold it into the HTTP custody callback. This candidate
now allocates a fresh test transport bearer for each scope, distinct from the
durable private parent context. The guarded callback maps it internally to the
parent for the existing restricted reader and tracks its active response.
Ending the scope, release or shutdown destroys unfinished tracked responses;
a token from a previous scope cannot join a later scope for the same parent.
The transport still refuses financial completion; no socket event is an ACK.

This is not a guarantee that bytes already handed to the network can be
recalled. Nor does a local scope prove cross-process fencing, a qualified
sole egress, committed source revoke or a financial recipient's acceptance.
The source must still use the exact original and terminal/recovery protocol.

## Verification

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0,
  103.44 s; two disposable PostgreSQL clusters and synthetic loopback mTLS.
  The added scenario pauses the test delivery callback **before** it calls the
  database custody writer, closes its owner scope, sees the socket reset and
  zero delivery obligations, then opens a distinct transport scope and serves
  the same original through the restricted reader/custody path. Old bearer,
  changed assertion, wrong principal and concurrent scope refuse; no STATUS
  ACK is recorded. This does not test cancellation during the database HOLD,
  a real recipient, an actual process restart through HTTP or a production DB.
- Parent-transport race and financial assertion unit tests: **64/64 PASS**;
  focused strict source/new-unit-test typecheck and `git diff --check` pass.
  These totals overlap prior receipts; do not add them. The earlier bridge
  receipt's hashes for changed files are historical and superseded here.
- The script cleaned its own containers/network; read-only Docker listings
  found no names matching its `elp2-c2-p7-` cell. Aggregate declared ceilings
  were 2 CPU / 1.5 GiB; actual peaks were not measured. No live source, UI,
  credential, Edge, shared runtime or production database was changed.
  Normal hook was not run: candidate is still shared WIP and unfrozen.

| Working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-financial-parent-orchestrator-candidate.ts` | `bd82d063d65e0324f2d353de1866309e03e5fc47439bb786bf3a20310f1c0e3b` |
| `apps/control-api/test/c2-financial-parent-transport-candidate.spec.ts` | `a2b8be6a2beda041b69275246ace6089dde20768174003ed1cd4032bb970a4d7` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `3b4f6f9f91abe662d6b66202589af7223adc287ad8c3df6ae392d5c454170286` |

## Open / handoff

Qualify independent owner/key/source/field authority, the real operation-ID
store, runtime sole-egress and live-old-holder fence. Test cancellation while
the custody transaction actually holds its DB fence and genuine recipient
ACK plus successor sequence; then integrate recovery V2 and perform restore.
P7/A2, connected Edge READ/STREAM, financial/APPLIED, G2 and browser remain
open. No frontend contract/action changes. Rollback is to leave the candidate
and its test-only scope unmounted.
