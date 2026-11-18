# Core → Edge08 — actual active revoke and exact Core settlement

23 October 2026, 01:44 Asia/Saigon / 22 October 18:44 UTC.
**ACTUAL_SPECIMEN_OBSERVED / CORE_SETTLED / EDGE_RECONCILIATION_REQUIRED.**
Coordinator Codex. Sole HTTP/SSE operator Core; Edge owns physical source
drain and original native revoke/status. This is not full08/read09 PASS.

## 1. Exact accepted source and runtime pins

- PREPARED raw SHA256
  `99e775f3ec06cd5338fd2d2fc863e7de223e589979133a211960088c0c667935`.
- Immutable Core ACK raw SHA256
  `06ead936fe6465b44c7dbdb942a1e11ef003c966cc7dc1c44e6462d3934a3166`,
  actually delivered HK 22 October 18:06:29 UTC, before source install.
- Actual READY raw SHA256
  `59bc4568b8ddaacdfa2c624e481824930ad4eb3f933aaca9fc1241a632f21453`,
  source revision9 / policy1 / original install
  `4b9dce98-7e25-4f47-8962-c947c2a90737`, document `16dc7829...`,
  receipt digest `f027fb0f...`, semantic revision `d658ed35...`.
- Fixed source window 22 October 18:00–20:00 UTC / 23 October 01:00–03:00 VN.
  No source, grant, session or native-trust expiry was extended.
- Core source `3265ce18745560cfad391e81054b7aa46eac9097`, image
  `sha256:3cb7f24af12d8228406eca9f2b800b458067bbcd1616995f51438cfa9d58d069`,
  schema149 digest
  `826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728`.
- Actual finite serving config SHA256
  `764e617e76c76ecd6e1a6a757d4172a2b316b5ae3a37f18f22a005d7a016a95e`,
  tool config `4742d77b2a6849d58f93f42c3326a16aeb209171aacd61da980fa40698e905a0`.
  API 1.5CPU/1GiB; official CLI 0.5CPU/512MiB. Initial H16, zero pending/
  unresolved/unreconciled; `16+244+2+20=282 <=288`.

## 2. Actual missing-only specimen

One subscription, exactly two bounded finite controls, no completed READ or
restart gate retake, no Manager/P22/browser/load probe attached.

| Observation | Actual result |
| --- | --- |
| Original STREAM interval | 18:42:11.916–18:43:11.916 UTC, fixed60 seconds |
| Original grant | `core009-stream-74e7ae31-d8e7-40ab-8a51-3cdc8170e51f` |
| Original revocation ID | `core009-stream-revoke-74e7ae31-d8e7-40ab-8a51-3cdc8170e51f` |
| Original revoke bytes SHA256 | `af1be510252e665caf13b0d496e385fb3924f05ffb73558e7465839f91f5dbfb` |
| First writer | Known EXIT75, physically closed, unknown=false, typed `MANAGER_REVOKE_DRAIN_PENDING` |
| Continuation | Same artifact/hash/revocation ID; official recovery EXIT0, `REVOKED`, receipt `ace_063c3000898a4e028ec2dd31abdc93ea` |
| Decision time | 18:42:21.804 UTC, 50.112 seconds before original expiry; not NOOP_EXPIRED |
| Subscriber termination | 18:42:17.722 UTC, `REMOTE_READ_ERROR`, client_abort=false, local_failure=false; **not clean EOF** |
| API | Same PID during revoke; not stopped/restarted to make revoke pass |
| Current-cursor STREAM retry | 403 `EXECUTION_READ_SCOPE_REQUIRED`; retained20→20, no new native admission; custody settled before/after |
| Separate READ after STREAM revoke | 200; READ authority was not inferred from STREAM or removed by STREAM-only revoke |

The remote read rejection is recorded literally, not relabeled graceful EOF.
Please correlate against Edge's exact source-terminal/leave events and custody.
The existing tested closure semantics accept a remote-side read error only
with the independent official REVOKED receipt and authority-denial witnesses;
this return does not replace that correlation with an invented terminal ACK.

Sanitized scenario receipt SHA256:
`d308cf60fd0891d306067ac10d045a36f534735c7b36f2b72961173c912e869c`.
Private SGP locator (no credentials to publish):
`/home/bobby/secure/core009-core-first-20261023-Ig8Gqs/root/stream-scenario-result.json`.

## 3. Core cleanup actually complete

Core settlement completed **18:42:41.128 UTC / 01:42:41.128 VN**:

- Exact original STREAM revoke/recovery reused; no new removal intent.
- Exact READ grant and temporary acceptance session revoked by official CLI;
  token file removed. Other sessions touched0; no reset/account change.
- Retained21 (initial16), pending0, unresolved0, unreconciled0. Historical
  attempts, mutations, receipts and audit remain; no quota-counter reset.
- API restored to the same mapper image3cb, expired/inactive runtime SHA256
  `a8142e41fd134907251497035124cf7ad8fefe7296ac08b466a4244fd49ec168`,
  running/healthy, restart0. Current READ/STREAM and acceptance sessions0
  were checked by the official settlement before restoring inactive config.
- No active subscriber, CLI or competing cleanup is left by this specimen.

Settlement receipt raw SHA256
`9aa3f85dee35761db9ae92a2bafe7b293247ded27ac76451dea7df918ac17eaa`;
private locator `.../Ig8Gqs/root/settlement-result.json` as above.
This does **not** claim HK source pools/socket/container are already removed.

## 4. Runner defect found and repaired transparently

Original frozen manifest remains byte-identical:
`eb5e9515167c1e6921dbda43799a1b222e9374700fe67c5209872ed0ab49c539`.
Its `accept.mjs` completed preparation at18:38:47.035 UTC then failed before
the first official dispatch: an absolute expectation path entered a log
filename, causing ENOENT. No authority had been issued at that point.
Original preparation retained byte-for-byte, raw SHA256
`487fc4a03cffb6df5307e766bbdb3ec44c500a6695182998b3b92443951c89e3`.

An **additive**, independently reviewed `continue-prepared.mjs` revalidated
all original manifest bytes, preparation, READY/expectation hashes, fixed60s
scope/window and absence of any prior operation dispatch. It did not call
prepare again, rewrite the frozen runner or create replacement intents.
It ran the original operate/probe/settlement sequence once with safe log tags.
Continuation raw SHA256
`d002dd31b576d1685ba4d32f1d4f6f0fc70e73d41d54fdd22123cab658a93c29`;
32/32 synthetic offline tests PASS, test hash
`87be15d7c939324747534d030c45ba718fc086ffb31c6ddcd9a3c12c4305a0b5`.
Those tests are not counted as source acceptance. Original failure retained.

## 5. Edge action now — same originals, no new window

Core is **SETTLED / READY_FOR_EDGE_SOURCE_RETIREMENT**. Please:

1. Correlate exact grant/revocation interval and source leave/terminal/custody
   facts with the actual remote read rejection above; return ACCEPT/CHANGE.
2. Guarded physical drain of the exact container
   `ee7e2e752ad1f151ab2121033b6d32c4a6a90ed62259776335ab54c637ceb639`:
   pools0, exit0, die/destroy and socket28446 absent under your existing recipe.
3. Execute/reconcile original native revoke
   `4c1c3dbd-6f29-488e-9eff-6575ae709a4c`, CAS9→10 and same-original STATUS.
   Preserve custody/UNKNOWN fences; do not reopen native8, issue new attempts
   or extend any source/grant expiry.
4. Return sanitized physical/native disposition and remaining full08/read09
   cases. Independent native control, P22/cache, Manager/financial and G2
   remain their own gates, not claimed by this missing-only specimen.

No production/stable/dev/main/provider28445/command/Live change, no remote Git
push, no full-phase or browser acceptance. Private raw captures/cursors and
session data stay outside Git/chat. Public delivery/readback recorded later.
