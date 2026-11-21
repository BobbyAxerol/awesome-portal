# C2 UNKNOWN custody before acknowledgement — 2026-11-05

**SOURCE_ONLY; NOT COMMISSIONED; NOT A2 OR RESTORE CUTOVER.** Core branch
`docs/research-loop-plan`, base `2faa8968fddbde59b2e59525e334ba3d83886144`
plus shared uncommitted WIP. No installed runtime, TLS, source registration,
database, grant, stable/dev/main or command/Live state was modified.

The candidate independent journal now has a distinct `SIGNED_SOURCE_UNKNOWN`
event. The C2 reverse transport records the signed UNKNOWN against the exact
source-pinned lease, workspace, request and attempt before Core acknowledges
it. A terminal for that same attempt may follow after revoke/drain; UNKNOWN is
never treated as a terminal, source COMMIT, or a release of custody. Retries
use the same operation identity and may use a fresh signed envelope only for
the same semantic observation. An attempt mismatch and a changed receipt are
rejected. The candidate SQL is an isolated installer, **not a migration**; no
installed schema was upgraded.

`bash scripts/test-elp2-independent-custody-pg.sh` exited 0 with **4/4 tests**
on two disposable PostgreSQL clusters and test-only mTLS. The combined case
tests wrong-attempt UNKNOWN rejection; a lost independent commit response
returns HTTP 503 and leaves the same Core lease ENTERED; a refreshed proof for
the same UNKNOWN is recorded once and Core quarantines it; a terminal commit
response is also lost, a different receipt is refused, and the same terminal
is later ACKed and replayed with one terminal event. The original was entered
before drain/revoke. Tests use synthetic keys and source assertions, not actual
Edge/TS receipts. Focused strict TypeScript checking of the issuer composition
and imports exited 0. The runner cleaned its cell; a read-only inventory found
no `elp2-custody-*` containers.

| Input | SHA-256 |
| --- | --- |
| `c2-custodied-terminal-candidate.ts` | `53cfc50c9d34051090445c0c95f046bd2c28bbfc3b4efff294a9115feb41a187` |
| `restore-independent-custody-candidate.ts` | `5f0781f3991fc39e5fe0c92e787b52df4b2e17c5d493e4964ea817ec1e112a6d` |
| `restore-independent-custody-candidate.sql` | `5e5d8c2810d7e6365625d31a9f97a6f01638ec8f01bb78e0c4d10a67715e1824` |
| `restore-independent-custody-candidate-pg.spec.ts` | `12c072755d38c9c64e5a05f0ea15951f1440e78c5cf0c79b47c715028d8280f9` |

This supersedes the matching hashes and the `UNKNOWN` limitation of
`CORE_C2_CUSTODIED_TERMINAL_TRANSPORT_20261105.md`; other limitations remain.
The candidate chain is not yet an independently qualified immutable authority,
an exclusive issuer path, a writer/old-holder fence, an authenticated complete
post-snapshot census, a real source ACK, or a tested restore/cutover. Real P7,
source revocation fencing, P8, listener and A2 remain uncommissioned; B2 stays
unsigned. Final integrated review, normal hook and landing remain open.
