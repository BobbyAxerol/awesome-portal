# Core009 transport-close recovery repair

## Actual bug / minimal change

The active STREAM revoke exposed one genuine unresolved ISSUED frame. The
native client resolved authenticated `status` at response-end while retaining
the single inflight slot until request-close. Immediate `cancel-unentered`
therefore failed with `NATIVE_BUSINESS_READ_BUSY` on every same-key retry.

Candidate `/home/bobby/portal-core009-integration`, branch
`chore/core009-connected-20261021`, base `734353113d8bec85f78b35ab81c9c1a40e93a67e`:
two files, **+43/−3**. Success now waits for real request-close, releases exactly
once and then resolves the private authenticated result. Deadline/error/early
close behavior remains conservative. No sleeps, capacity increase, new attempt,
fake ACK, changed grant or schema.

## Focused evidence — actual, not product recovery

Node 22.23.2 image `sha256:0557ac14e0d45d02ed563067b82856ca5e7aa3437fa28d98d4350ea9c3d9494a`;
vitest 4.1.11, one worker, network-none cell, 1 CPU/768 MiB/128 PIDs, read-only
source/deps and 128 MiB temporary filesystem. Exact
`test/elp210-native-business-read-client.spec.ts`: **54/54 PASS**, 3.95 seconds,
start 05:37:34 UTC. Added finite and scoped-notice immediate same-attempt
status→cancel tests without polling/drained/sleep. Existing BUSY, timeout, TLS
and tamper tests retained. Tool execution session49486/chunkccf7b8 is the stdout
receipt; no separate disk test log is claimed. Disposable container absent.

- Client SHA256: `65d3d8ff1585e6e1d6bdb11528a307bd0d23f6fa3044f1edc8367ef18ee3a15f`.
- Test SHA256: `054abcaad9e6f3ddd8e7db7a465875afc1354d4952e0d5dd205c0339b7465425`.
- Independent edge-case source review: ACCEPT, including timeout after complete
  body, early close, TLS/error, double-resolution/release guards.

Normal commit hook is running; commit/image/runtime recovery pins will be
appended only after actual completion. This focused receipt does not close the
original custody, restart, full ELP2-10 or browser acceptance.

## Operator and Claude handoff

Same-key recovery uses a fixed CLI after the normal hook/build, under
[Edge's actual recovery-only ACK](EDGE_RECOVERY_ONLY_WINDOW_ACK_2026-10-21.md).
No acceptance/source/grant/session date extension. Original installed service
stays pinned until a separately recorded safe swap. Claude has ACKed exclusive
Codex ownership of these two paths; carry only this reviewed delta when the
commit is returned, preserving all Claude additions. No frontend changes.
