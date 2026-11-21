# C2 bidirectional original census — 2026-11-05

**SOURCE ONLY / NOT CUTOVER.** Shared uncommitted WIP at committed base
`2faa8968fddbde59b2e59525e334ba3d83886144`. No runtime, DB, protected source,
credential, Edge authority or frontend changed by this slice.

## Gap and implementation

The existing independent-custody comparison started with original events in
the independent chain and looked for matching Core leases. A crash between the
committed Core lease and independent append could therefore leave a Core lease
bound to this custody while an empty chain reported no originals at all. That
observation was incomplete, not proof of a production incident.

The bounded source query now also selects leases with the exact configured
custody binding and reports a lease absent from the independent chain as
`CUSTODY_ORIGINAL_MISSING`. Retained originals still get their existing exact
Core/assertion/terminal comparison. Different custody bindings do not enter
the reverse selection; the total union is capped by `maximumOriginals`, and
an oversized result fails closed. This diagnostic never fabricates an
assertion, source terminal or ACK and cannot authorize restore.

## Verification

- `bash scripts/test-elp2-independent-custody-pg.sh`: **5/5 PASS**, final
  retake on two disposable PostgreSQL clusters with synthetic keys/data and
  test-only mTLS. On a real candidate-issued lease, the new assertion detects
  the empty independent chain; after append it reports the existing
  `SOURCE_TERMINAL_NOT_RETAINED` state, and another custody's lease is not
  mixed in. The suite also retakes the pre-existing restored template,
  concurrency and retained-original negative cases. This is not a historical
  backup restore or a connected source ACK.
- Strict source-only TypeScript check of the changed file and dependencies:
  **exit 0**. `git diff --check`: **exit 0**; neither is a full candidate gate.
- Two disposable PG containers and their network are removed by the runner's
  cleanup trap. Declared ceilings: each PG 0.4 CPU/320 MiB, Node 1.2 CPU/896
  MiB; peak resources not measured.

| Input | SHA-256 |
| --- | --- |
| `restore-independent-custody-candidate.ts` | `69fe43c2a541107af740c04aec139847f38353b5122e391abab375cda7a4f2df` |
| `restore-independent-custody-candidate-pg.spec.ts` | `10f7b6f14b00502c102c667f3d236d31f0b54e9dd70c56c04973cdb35e3bb24e` |
| `test-elp2-independent-custody-pg.sh` | `83a59ce01c88d510b8a9aa90163b395fc5f8de3c498f457ff743c8eb269522d6` |

## Remaining

This checks only the selected bound Core rows visible in one snapshot. It
does not discover an entirely missing or altered binding, post-snapshot writes,
external source/recipient ACKs, or fence a former process or privileged
writer. A matching result is explicitly `OBSERVED_NOT_CUTOVER`. Keep the V2
restore guard, finish independent authority/fencing and actual terminal/ACK
reconciliation, then rehearse the frozen integrated candidate. No Claude
consumer action or contract change is required.
