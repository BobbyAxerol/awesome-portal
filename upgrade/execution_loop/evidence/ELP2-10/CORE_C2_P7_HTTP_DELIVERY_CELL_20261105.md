# C2 P7 bounded HTTP delivery cell — 2026-11-05

**TEST ONLY / NOT MOUNTED / NOT COMMISSIONED.** The new delivery wrapper is
restricted to a procedure which itself refuses a non-disposable database.
It does not authenticate a human or prove the source original. It is not a
product issuer, source terminal, acknowledgement or restore authorization.
All files are uncommitted at `docs/research-loop-plan` HEAD `2faa8968f`.

## Candidate behavior

The cell captures the provided binding and payload bytes, durably reserves
the original, then starts a bounded transaction and takes the delivery/P7
authority fence before writing to the response. It holds that transaction
until Node reports `finish`, writes `UNKNOWN` and commits; `finish` is only a
local transport event, never proof that the peer received or accepted bytes.
On a detected DB connection loss it destroys the response. It never creates a
replacement original or sends a second time automatically; an ambiguous
reservation or commit is a same-original recovery obligation. Its timeout
and SQL checks are test bounds, not approved runtime limits.

This reduces the unguarded interval around the local HTTP write but does not
solve distributed quiescence: bytes may already be buffered elsewhere when a
process or DB connection is lost, and the receiver must still enforce its
current ENTER fence. No claim is made that HTTP custody or revoke is fully
qualified. The caller is responsible for authenticating the owner and
verifying the binding; this test passes synthetic values only.

## Validation

- `bash scripts/test-elp2-restore-inventory-rls.sh c2-delivery-procedure`:
  **4/4 PASS** in a disposable PostgreSQL cell. Within the P7 test a real
  loopback HTTP response carries a synthetic non-bearer and leaves its exact
  obligation `UNKNOWN`. After synthetic revoke a new request is reset with
  zero response bytes and creates no obligation. The independent database
  race still covers a competing revoke and a rolled-back `SENDING`; it is not
  a test of revoke during an in-flight HTTP write or a remote ACK.
- Focused strict TypeScript check of the new source passed. This is not a
  full project typecheck or the normal hook. `git diff --check` passed for
  tracked changes. The runner cleaned its disposable container and network;
  a follow-up container-name check found none from this runner.
- The machine had other independent test workloads running; no other process,
  container, cache or database was stopped or removed.

| File | SHA-256 |
| --- | --- |
| `c2-p7-http-delivery-candidate.ts` | `a84841f492446d4a3472e912e9570982ef85a9500517c4f7a768eddef0f9ccaa` |
| `c2-delivery-procedure-pg.spec.ts` | `53e03308468701d90790b04d3cc8c2798cd7e5e6d101b1d1f60be71a8697376c` |
| `c2-p7-delivery-fence-candidate.sql` | `d150a7d3cc36643a0e802de46bff9c2e244cc27aeeaebae7ffe1b3cda1b5be7d` |
| `c2-p7-delivery-definer-candidate.sql` | `887dc98c851ae681316ff4f0123bfeaabbbccbd0166799ab229f36f5aff2aee9` |
| `c2-delivery-procedure-acl-candidate.sql` | `04c82994c7ac37c1af7ee3fcbfe47b0f67cc28c3b90bc1fa73a7e0784e6e1e6a` |

The preceding procedure receipt remains historical for its then-current test
hash; this receipt pins the extended test. Before use, review product
authentication, bounded DB pool/timeout and exclusive response ownership,
all source and endpoint pins, in-flight disconnect/DB-loss cases, role/ACL
drift, migrations and recovery against the final candidate. P7 acceptance,
issuer and V2 restore remain fenced. No frontend contract change is made.
