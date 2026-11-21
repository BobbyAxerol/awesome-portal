# C2 recovery client TLS snapshot — 2026-11-05

**Source change only; not deployed or connected acceptance.** The recovery
client previously shallow-copied its TLS options, retaining caller-owned key,
certificate and CA buffers. A later mutation could change the material used by
a future recovery request after constructor validation. It now snapshots
strings/buffers, bounded arrays, and Node's key-array `{pem, passphrase}`
form before validation/use; invalid or oversized input fails closed with the
existing sanitized configuration error. Deadline, origin, peer pin and byte
budget are also captured once. No credential bytes are logged.

## Verification

- Focused recovery/transport/bootstrap suite: **75/75 PASS**, including real
  loopback TLS 1.3/mTLS after the original input buffers are overwritten and
  a separate array/passphrase-object snapshot test. The loopback uses ephemeral
  test keys and mocked candidate operations: it is not Edge acceptance.
- Targeted strict TypeScript check: **PASS**. No DB, runtime, or remote service
  was changed. Normal integration hook has not run.

| Source/test input | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/current-human-recovery-client.ts` | `346d51abdf50b2f0a3e0cfcf7f34fbf249e7e0ada1fee88f8e2789292678ec00` |
| `apps/control-api/test/elp210-current-human-transport.spec.ts` | `36fbbed34d431c45f5a97f955563fab73fba52dd7fa1d9df5b556c82394cb425` |
| `apps/control-api/test/elp210-recovery-failure-boundaries.spec.ts` | `102cbe00462344186f246a885af90aa87c5e12435e89d251089f3a36ce5ddf6d` |

The independent authority checkpoint, old-holder fencing and full
post-snapshot original/terminal/ACK census remain incomplete. A2 remains
NOT_READY; B2 remains unsigned; actual Research trust and source are not
commissioned by this fix.

## Follow-up: pin the runtime instance binding

The earlier input-buffer snapshot was insufficient: its TypeScript `private`
`url` and `config` were still ordinary writable JavaScript properties. A
TEST_ONLY mocked transport reproduced replacement of the selected recovery
origin before this follow-up (one expected failure, exit 1). The recovery
client now stores the validated URL and copied TLS/pin/limits in ECMAScript
private fields. This corrects the earlier description that those properties
were unconditionally captured against subsequent instance replacement.
It does not establish isolation from a compromised process, replace real
credential custody or qualify the selected source.

- Two focused suites: **47/47 PASS**, including an isolated TLS 1.3/mTLS
  test that shadows the public-looking properties with another CA-valid peer
  and verifies the selected peer receives the one request while the other
  receives zero request/attempt bytes; the negative reproduction used mocked
  HTTPS, not an actual leak of production data.
- `bash scripts/test-elp2-restore-inventory-rls.sh restore-original`:
  **8/8 PASS**, exit 0. `bash scripts/test-elp2-independent-custody-pg.sh`:
  **5/5 PASS**, exit 0. Both use disposable PostgreSQL and synthetic identities;
  the test cells were cleaned. Neither proves Edge or restore acceptance.
- Strict source-only `tsc --noEmit` with 1024 MiB Node old-space and a
  120-second timeout: **exit 0**. The full/test-inclusive check is separate.
- Command STATUS bootstrap and C2 observation unit retake: **14/14 PASS**;
  these do not enable dispatch or prove upstream STATUS/ACK.
- Current source SHA-256 `3c9c03f88cce567e9411acd83a37095f3d96b401e985f16e84b5124bcd86e239`;
  transport test `32774695e96bddb4947c985b8925ff45f74713f879bb04361bf11de1646e7010`;
  failure-boundary test `d65652c4e80f0d89853b2f17c791a31ca84401d3ee0675aebe39eae849c3ddba`.
  These supersede the corresponding pins above; do not blindly reuse the old
  75-test receipt for the new selection. No normal hook or runtime install.

Full source/owner qualification, independent checkpoint, old-holder/HTTP
fencing, terminal/ACK census and representative recovery remain open; the
candidate remains source-only. No frontend contract or consumer action.
