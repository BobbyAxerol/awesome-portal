# C2 retained-original comparison — 2026-11-05

**SOURCE ONLY; not a complete source/ACK census or a restore barrier.**
Committed base `2faa8968fddbde59b2e59525e334ba3d83886144`, branch
`docs/research-loop-plan`, existing uncommitted candidate. No installation,
production data, credential, UI, command, Live, or remote ref changed.

## Change

The independent custody candidate can now compare up to 100 retained
originals against one repeatable-read Core observation. It verifies the custody
chain, selected source and authority database system identifiers, original
binding, and each retained source-signed terminal. It checks the custody head
again after the Core read and refuses if that head advanced. It reports missing
original, inconsistent binding, missing custody terminal, missing/different Core
terminal, pending terminal, or terminal tied with **ACK unverified**. It does
not return bearer tokens or signed proofs.

This closes a diagnostic gap: the former single-original read could not even
identify originals retained independently but absent from the observed Core
database. It does **not** reconstruct rows, assert that the store holds every
original, authenticate a complete source/recipient ACK census, fence an old
holder, or allow cutover. The original assertion's signed bytes are not retained
by this method; its historical authenticity relies on the custody append and
separate store/ACL qualification. Two database system identifiers do not alone
establish physical independence. An empty result is not a proof of completeness.
The head check does not prevent a later append after the comparison returns.

## Verification

- First `bash scripts/test-elp2-independent-custody-pg.sh` run **failed 1/5**:
  the comparison initially parsed the persisted original body as the bare JWT
  claims, overlooking the extra stored `lease_id`. The parser was corrected;
  this failed run is not counted as PASS.
- The corrected and extended final run: **5/5 PASS** on two disposable
  PostgreSQL clusters and local test mTLS. It checks original present,
  original omitted from the observed Core result, mismatched workspace, Core
  terminal missing from custody, signed terminal matched but ACK unverified,
  and terminal in custody but omitted from a simulated stale Core result.
  The omitted/altered Core observations use a TEST_ONLY query proxy; they are
  **not** an actual restored historical backup. The terminal itself is a real
  signed test proof persisted in the separate test authority cluster.
- Existing script trap removed the test containers and network. Full semantic
  typecheck, concurrency/fencing qualification, representative restore and
  normal hook remain open. `git diff --check` covers tracked files only.
- Execution tracking reconciliation (`bash scripts/execution-tracking-test.sh`)
  passed after the Unified and sync links were added.

| Working file | SHA-256 |
| --- | --- |
| `restore-independent-custody-candidate.ts` | `7062ca9920feaf5f9a3dbf21b733ab1484037a896c0ca06cdf5afafbca2fdb3d` |
| `restore-independent-custody-candidate-pg.spec.ts` | `a83e22f675ec01826bc486e6be80af96c0116f98041bdae5f017eb94f811ba2e` |

Next backend: validate head-advance/race negatives, compare a genuinely restored
copy, implement independently controlled old-holder fence and a complete
authenticated ACK/source reconciliation; then integrate them into a tested
barrier without weakening fail-closed restore. In parallel complete actual
P7/issuer. No new frontend contract; Edge source/ACK qualification remains a
separate requirement, not a request to manufacture fixture evidence.
