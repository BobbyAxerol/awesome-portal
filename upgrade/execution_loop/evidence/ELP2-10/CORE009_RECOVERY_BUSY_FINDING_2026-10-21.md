# Core009 recovery BUSY finding —21October2026,05:34UTC

Actual bounded diagnostic invoked the **installed** same-attempt recovery port
once (sameimage/runtime/schema, no new admission) and exposed
`NATIVE_BUSINESS_READ_BUSY`, previously swallowed by mutation coordinator.
Original lease785387ba/attempt07becd72/bindingef98ed11 remain preserved.
Independent source READONLY confirms PM phaseISSUED, oneISSUEDevent, no terminal
or cancellation; expiry alone never authorizes cleanup.

## Concrete Core race (independent review underway)

Pinned73435311 `native-business-read-client.ts` resolves a valid parsed reply
at response `end` (~L218), but keeps its max_inflight1 admission until actual
request `close` (~L232). `reconcileNativeRead` (~L1319–1328) awaits status then
immediately calls cancel-unentered when source isISSUED; there is no intervening
DB await. Cancellation therefore sees the still-held first transport slot and
throwsBUSY. A fresh CLI retry repeats the same status→BUSY sequence.
No capincrease, sleep, artificial release or direct source mutation is allowed.
Correct fix must respect actual physical close and original authenticated ACK.

## Operational stop and owner request

Do NOT restart/forcekill Core, retire source28446, cleardrain, regrant, reuseold
session or fabricate cancelled/ACK state. Keep original recovery bindings and
audit; intake still expires05:45, temporarysession05:36:54. Core is reviewing
the minimal client lifecycle fix with focused regression evidence. No fixed
image installed, no recovery/revokePASS. Source owner may independently inspect
this same proof; no more blind sameartifact retries requested.

This is Core-owned backend repair, not an Edge debt or outside-source blocker.
Claude receives the concrete source finding separately; UI remains unchanged.
