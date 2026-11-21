# C2 issuer/custody source pool binding — 2026-11-05

**SOURCE_ONLY; NOT COMMISSIONED.** Branch `docs/research-loop-plan`, base
`2faa8968fddbde59b2e59525e334ba3d83886144` plus shared uncommitted WIP.

The C2 issuer coordinator now rejects a custody candidate unless both use the
exact same Core pool object. This closes a source-pool substitution within that
composition. It does **not** pin the independent custody ID/authority to each
lease across process restart, qualify that pool's endpoint, prove an independent
failure domain, or authorize HTTP delivery. Those remain necessary before use.

`scripts/test-elp2-independent-custody-pg.sh` exited 0, **4/4** on two
disposable PostgreSQL clusters and test-only mTLS; it covers wrong source pool,
correct source pool, and revocation after the custody write. Focused strict
TypeScript checking of the changed issuer/recovery imports exited 0. No full
hook or connected source test was run. The runner cleans its own containers.

| Input | SHA-256 |
| --- | --- |
| `current-human-candidate.ts` | `bab741787c8e040e11310059916bdc7b614cdc08a194895a5d33cff8ceba3f27` |
| `c2-custodied-issuer-candidate.ts` | `4fd3b1c566f902e11690f56ee8e12d6ae8488944068f69106a6e82f16335e828` |
| `restore-independent-custody-candidate-pg.spec.ts` | `db6b73fbd190acde9187d78e3f2972f2cf68b6f6db85ca2f4f702f92bc891618` |

Hashes supersede matching earlier receipts; the 110-test receipt applies to its
recorded source hash and is not a run on these new bytes.

## Edge observation

A read-only strict-host-key SSH attempt to the sole address found in the local
shell history failed because its presented key differs from `known_hosts`.
This address has **not** been independently identified as the HK Edge host.
No key was accepted, changed or bypassed; no remote connection or mailbox read
occurred. An independently verified HK host and host-key fingerprint are needed
before using that route. A2, real P7, independent recovery fencing and terminal/
ACK census remain open; no B2, runtime install, push or landing is claimed.
