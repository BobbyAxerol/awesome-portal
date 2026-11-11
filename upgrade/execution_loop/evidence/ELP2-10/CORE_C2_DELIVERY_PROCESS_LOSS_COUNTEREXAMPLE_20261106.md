# C2 delivery — process loss after HTTP finish

**TEST-ONLY COUNTEREXAMPLE; NOT A FIX, RUNTIME MOUNT OR CONNECTED RECEIPT.**
`docs/research-loop-plan@2faa8968fddb` plus shared uncommitted WIP. This test
uses an isolated PostgreSQL, synthetic owner/source/lease and local HTTP;
it does not involve a genuine Edge ACK, owner approval or V2 restore.

## Finding

The restricted test procedure commits `RESERVE`, then performs `SENDING` in
the transaction held during the HTTP write. A separate child process sent a
128-byte synthetic payload to a loopback client and was killed **after the
client received all bytes and the server's HTTP finish event**, but before
that transaction committed. PostgreSQL rolled back `SENDING`: both the
remaining obligation and its only committed event read `RESERVED`.

The test then demonstrated that the restricted test caller can transition
that same binding from `RESERVED` to `SENDING` again. This demonstrates a
missing process-loss fence in this **unmounted candidate**. The test did not
send a second HTTP payload and did not prove behavior of an installed service.
The initial `RESERVED_NOT_DELIVERED` response only describes the instant of
reservation; a persisted `RESERVED` after a crash must not be interpreted as
proof that no bytes escaped.

For the test, the same original was subsequently marked `UNKNOWN`; another
`SENDING` was refused and the STATUS ACK count stayed zero. `UNKNOWN` is not
proof of delivery, source terminal, quiescence or permission for a new lease.
Neither duplicate reservation denial nor this manual transition is a complete
restart/recovery mechanism. Keep this delivery path unmounted and fail closed.

## Verification and resources

- `bash scripts/test-elp2-restore-inventory-rls.sh c2-delivery-procedure`:
  final **5/5 PASS**, exit 0, including the counterexample and pre-existing
  restricted-caller, lock-order and revoke cases. An earlier 5/5 run proved
  the crash rollback without checking the additional SENDING counterexample.
- Test-only capacity changed from 8 to 10 in this disposable cell to make room
  for the additional retained obligation; no runtime budget was changed.
- Focused strict `tsc --noEmit` for the delivery helper, `node --check` for
  the child and tracked `git diff --check` exited 0. This is not a full
  test-inclusive typecheck or normal integration hook; `git diff --check`
  does not check untracked files.
- The script's configured aggregate limit was 2 CPU / 1.5 GiB. Actual peak
  resources were **not measured**. The isolated script completed its cleanup;
  read-only checks found no matching test container or network. A first
  unprivileged cleanup inspection was denied by the sandbox; the subsequent
  explicitly authorized read-only inspection passed.

## Pins and next action

| WIP file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-p7-http-delivery-candidate.ts` | `3e6afd15a0622c6322a64d527e5ceabcfe5d1b35f351bca356db30a8a72d7b20` |
| `apps/control-api/test/c2-delivery-procedure-pg.spec.ts` | `73bf91e2758dc239cb0fa5aa68773829c9d1f6a08a5163023b32a7d9919c27fd` |
| `apps/control-api/test/fixtures/c2-delivery-kill-child.cjs` | `ce6a5969dccc2a816ee3ab642768b3ef816b053e6bf4a44813efe07dfccf80f6` |

Core must design and test a durable pre-egress state and exclusive same-attempt
ownership/fencing that survives process death, while rechecking current
authority through actual HTTP delivery. It must handle both crash-before-send
and crash-after-send conservatively, never issue a second original or infer
an ACK. The design must also account for races with revocation and old holders;
simply making `SENDING` durable or recording `UNKNOWN` is insufficient on its
own. Actual Edge terminal/ACK, independent recovery authority, A2 and the
integrated gate remain open. No frontend contract or Claude action in this
slice. Rollback is to leave the test-only composition unmounted.
