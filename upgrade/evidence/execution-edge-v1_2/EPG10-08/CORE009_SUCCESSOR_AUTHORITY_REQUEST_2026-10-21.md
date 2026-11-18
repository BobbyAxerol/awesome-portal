# Core009 successor authority — ACT_NOW backend request, 21 October 2026

**ELP2-REQ-10-010 · Codex → Claude backend · OPEN / source-confirmed.**
This is an existing C7 commissioning gap, not a request for new product rights
or a reason to alter stable/dev/main. Bobby already approved finite Research
READ/STREAM commissioning for the exact Research identity. Do not request the
same generic approval or broaden the scope to resolve this implementation gap.

## Finding and impact

At qualified Core `9d88e40a963f4eb2245f8ec0343c2c511a98bd68`, the official
manager-domain policy installer is **first-install only**:

- `apps/control-api/src/execution-v2/access.service.ts:618–625,650–659`:
  identical policy revision/artifact replays the immutable old ACK; an existing
  policy or stored grant rejects a new installation with
  `409 POLICY_REVISION_CONFLICT`, even when old grants are expired/revoked.
- The generic legacy installer refuses manager-domain artifacts. Official
  `execution-native-revoke` only narrows/removes; it cannot renew authority.
- The same first-install fence remains in frozen integration `432da03d` at
  `access.service.ts:694–709`; no official successor writer was found there.
- Old runtime `f3fe876df8c47acdf82da46a2046cc9878362614b47339ad888f67b9457863b9`
  can construct for original recovery (`current-human-candidate.ts:790–792`),
  but fresh sends correctly fail expired installation/source checks at
  `:547–551`, `native-business-read-selected-source.ts:76–80` and
  `native-manager-consumer.ts:315–320`.

Consequently a simple image swap to qualified image05ae is **not fresh READ
READY**, and another first-install invocation cannot open the new window.
Startup200, replayed historical ACK or an expiry NOOP is not renewal proof.
No installer, SQL repair, policy deletion, session or grant was dispatched to
try to bypass this fence. Existing recovery is DONE and is not reopened.

## Smallest safe implementation — Claude owns source

Reserve a successor slice outside the running integration freeze. Reuse the
official private owner-maintenance boundary and the same current-human
mutation/drain coordinator, not an HTTP shortcut or an uncoordinated DB write.

1. An explicit successor artifact binds exact target database/system/role,
   protected owner/principal/workspace and selected domain/field-policy seals.
   Include expected-current policy revision **and digest**, plus expected
   predecessor grant revisions/digests. Check them under the existing workspace
   lock in both authorization and write phases.
2. Preserve old policy-install/audit facts and all old grant rows. Create new
   finite, separately identified READ and STREAM grants; do not extend,
   resurrect or overwrite expired/revoked grants. Retain immutable successor
   lineage and a replayable receipt. Keep READ and STREAM independently gated;
   source-set availability is not manufactured by commissioning a grant.
3. Do not broaden the approved domain, field policy, actor or environment.
   A successor policy revision may be necessary for the finite seal window;
   constrain it to the approved predecessor/successor and exact explicit
   artifact, not arbitrary replacement. Validate ≤2h and actual trust/source
   expiry. No command/Live capability, stable grant copy or account reset.
4. Exact artifact/idempotency replay returns the original receipt without
   reactivating old authority; stale CAS/different bytes/concurrent successor
   conflict fail closed. UNKNOWN/unsettled native custody retains drain and
   recovery ownership. Reuse the existing revoke/session tools and safe cleanup.
5. Fill the fresh native runtime only from the official source return, actual
   new acceptance receipt and selected authority. Keep old recovery material
   when required, without treating it as current read authority.

**Minimum tests:** first-install and old exact replay unchanged; one successful
successor after genuine terminal cleanup; stale policy/grant CAS409; different
artifact same key; concurrent successor; READ/STREAM separation and expiry;
no resurrection through old ACK; unresolved custody refusal; normal sessions,
protected owner, grants/audit/history preserved. Focused tests first, then one
normal gate on the new source/image; no rerun of unrelated finished receipts.

## Coordination and current source proposal

Edge's public §7 at16:08 has already been superseded by its public §8 at16:12:
its old acceptance CAS4→5/5→6 was **not executed**. The actively prepared
successor uses fresh acceptance `d0a7b78a-a5ce-497c-b244-b7aab2ed74bf`, CAS0→1
and retirement1→2, proposed16:30–17:00UTC. Independent read-only hash review
matches §8's actual file bytes: manifest `3fd0632c2d3a9e60a2d96eab6b97036ee178dd3dba1915d2a57e6128d7b3180d`,
retirement `24f4f7865863624a6a00675a5b6139263040c0284b459ab71b6bed1782dbb3c9`,
runtime `9bb5d5aefd6a99beb16f74401fae16c61d835b1174d79d45f12420f666b6b0eb`.
File-byte SHA256 and SDK document digest are separate pins, not interchangeable.
Actual installed owner authority/READY and filled source pins are still required.
No ACK is issued against the superseded
manifest, and no session is minted while waiting. New source preparation can
continue independently; do not install a short-lived source merely to wait for
this Core writer. **Core return16:18: NOT_READY; do not arm/install the finite
source for this proposed slot while the successor writer is absent.** This is
not a source-commissioning ACK. Availability was acknowledged; traffic was not.
The image05ae choice is qualified transport code, not a qualified successor
authority writer. Return a new concrete slot after the successor source/image
is ready; preserve current drafts as unexecuted history, not an extension or
retired-head renewal. A missed window is NOT_STARTED, not silently extended.

**Handoff:** Claude implementer, Codex independent reviewer/integrator/operator.
Source ownership must be acknowledged before edits to shared access/runtime
files. Do not edit the currently running `432da03d` freeze. No source TS/PM/Edge
changes are requested to work around the missing Core successor writer.
This packet is review/delivery, not implementation or runtime acceptance.

**Exit:** source/interface + focused/normal receipt, immutable image pin,
reviewed fresh configuration and official successor ACK/readback. Then native
READ and eligible STREAM can be accepted on a genuinely matched finite window.
Manager issuer, financial source, calibration and load remain independent.
