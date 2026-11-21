# STATUS C2 inner assembly — 2026-11-06

**SOURCE/TEST WIP ONLY.** Base `docs/research-loop-plan@2faa8968f` plus shared
uncommitted work. This is not an installed listener, real P7 acceptance,
authenticated external ACK, V2 restore authorization, or ELP2-07/10/11 PASS.

## Change and boundaries

`createC2CommandStatusInnerCandidate` constructs the real STATUS assertion
authority, its C2 adapter, and reverse terminal around the same newly created
current-human candidate, P7 fence and custody instance. It rejects a different
workspace, owner, source or issuer public key, missing authenticated custody,
unconfirmed P7, non-Paper or expired scope and changed fence methods during
asynchronous setup. It checks exact Ed25519 SPKI, not just matching `kid`.
The generic `CommandStatusComposition.create` now refuses a C2-configured
candidate instead of binding it to the older non-custodied reverse transport.

This assembly is deliberately **unmounted**. The integration test exercises
its actual adapter and terminal over two disposable PG systems and loopback
mTLS, but supplies a test access object and does not run the full STATUS
authority prepare/issue/complete path, outer listener lifecycle or an HTTP
delivery fence. Merely constructing an authority is not proof of current
owner, source registration, field authority or Edge. Never mount the raw
authority as the production HTTP delivery path on the strength of this test.

## Verification and cleanup

- `vitest run test/command-status-composition.spec.ts --maxWorkers=1`:
  **28/28 PASS**, including rejection of C2 on the generic transport. An
  initial invocation supplied unsupported `--minWorkers`; it exited before
  running tests and is not counted.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: final **9/9 PASS**,
  exit 0, after adding same-`kid` wrong keys and a changed-fence setup race.
  This is one suite; it is not nine connected product runs. The two isolated
  PostgreSQL systems and loopback TLS peers are synthetic.
- Strict selected source `tsc --noEmit` with a 768 MiB Node heap: exit 0
  on the final inner-assembly source. The revised large PG test is not part of
  that selected typecheck. No full typecheck or normal hook was run.
- The cell's configured resource bound is 2 CPU / 1.5 GiB; measured peak was
  not captured. Script cleanup completed, and privileged read-only prefix
  checks found no `elp2-c2-p7-` containers or networks. The initial sandboxed
  checks could not use sudo; the subsequent authorized checks returned exit 0.

## Working-file pins

| File under `apps/control-api/` | SHA-256 |
| --- | --- |
| `src/execution-v2/c2-command-status-inner-candidate.ts` | `ef758f2d4eec988957b255d36058305a84fee6f7220fd99a9f36518d9bdd6a76` |
| `src/execution-v2/command-status-composition.ts` | `0dee7ba1fc6489631ebf480add076f62559ba02a2aa9532c75e236498dfc0a6e` |
| `test/command-status-composition.spec.ts` | `a7f543842f362b2cf7cfbf8c958f877a499c2c41e848ca020c32dbc2a24366f0` |
| `test/c2-p7-owner-intent-candidate-pg.spec.ts` | `e5ecbf3833d72f8c4e91838463533e7b391cd932ca07c3497ada22d605e696fb` |

## Next and rollback

Core must integrate and test the real access/preparation/authority path,
authenticated HTTP delivery custody and restart recovery without releasing a
bearer outside its P7 fence; preserve same-original obligations on loss.
Actual source and recipient ACK require Edge. Independently held monotonic
recovery authority, fencing, terminal/ACK census, integrated candidate and
normal hook remain open. No frontend contract/action was introduced; Claude
can continue on the existing contract. Rollback before commissioning is to
leave the new assembly unmounted and preserve custody and the restore refusal.
