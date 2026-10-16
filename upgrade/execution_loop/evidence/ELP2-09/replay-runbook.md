# ELP2-09 — scoped notification/recovery runbook

This is the runbook for an **unmounted backend candidate**. It grants no
activation/credential/rollout authority. Read phase README, exact source audit
and coverage handoff first. NOTIFICATION_ONLY is not authoritative event replay.

## Before any integration/activation

- Pin actual source/deployed image/schema/profile/config, app identity/policy,
  source-set/epoch/generation/model/field policy and data window separately.
  Branch/HTTP200/fixture success is insufficient. Current missing EPG10-03
  coverage/fence and EPG10-08 trust/TLS remain existing05/07 blockers.
- Verify the exact named snapshot adapter and barrier, qualified private
  `ScopedNoticeSource`, current-policy bridge and inner token≤2048byte
  compatibility. No public relation, source cursor, JWT/key or authority input.
- Approve cadence, active+pending cap, per-client/global bytes, source slots/
  deadlines, token key custody/TTL and resource/SLO budget. Use ELP2-10 measured
  workload, not synthetic constants. Preserve source TS/DL measurement locks.
- Mount only the specifically commissioned named/profile slice, not a legacy
  raw-byte stream or all environments. Retained review remains no-stream.

## Normal snapshot → notice → read

1. Authenticate current Portal identity/session/workspace and exact read grant.
2. Read qualified named snapshot with its own consistent barrier. Retain source
   continuity epoch separately from local projection generation and Quality.
3. Subscribe after that barrier; reconnect may use only a still-valid encrypted
   Last-Event-ID bound to the same complete server context. Reject missing,
   expired, foreign, altered or unsupported cursor before allocating a source
   read. Never start at source head to conceal a missing baseline.
4. Coordinator polls bounded authorized cohorts. Source verifies full dense
   receipt coverage before filtering; hidden-only scans advance privately.
   Idle and hidden-only public heartbeat tokens are both randomized fixed-size.
5. Before every protected event, freshly authorize business data and separate
   stream capability, then synchronously enqueue under app DB authority fence.
   Revalidate named BFF after notice; never apply amount/event deltas in browser.

## Failure and recovery

| Condition | Required action | Never do |
| --- | --- | --- |
| App revoke/session expiry/permission or linkage change | Stop/purge client queue; data-free access_revoked; new snapshot only if current authority independently permits | Continue through cached grant, old cursor, role/name heuristic or legacy stream |
| Epoch/generation/query/field/model/schema mismatch, token expiry, retention floor loss | Terminal resync; discard continuation; obtain new authorized barrier and current source proof | Guess epoch from old source_generation, MAX(id), visible sequence or source timestamp |
| Missing/mutated local receipt membership or coverage uncertainty | Stop, report typed resync/unavailable and source dependency; preserve original evidence | Turn filtered empty page/caught_up into COMPLETE |
| Slow client/global budget/reconnect storm | Finite active+pending admission; close/reset slow client and clear queued bytes; preserve healthy peers | Unbounded queue/retries/pending DB authorization/source jobs |
| Provider timeout/abort ignored | Stop protected sends; underlying flight keeps occupied slot until true completion; bounded coordinator stops admitting excess work | Release a fake slot at timeout and launch unlimited replacement calls |
| Client/hub stop while authorization/source awaits | Latch stop; no new registration or late output; finite owned work winds down | Revive on completion or send to a removed client |
| DB persist fails/COMMIT is ambiguous | No local ACK; inspect/retry original revision idempotently after current generation validation | ACK before durability or reconstruct old facts from a new sample |
| ACK response lost after COMMIT | Release DB connection; retry same receipt/current revision, one retained effect | Roll back an already committed fact or replay historical A after B |
| Human revoked after accepted command | Continue service-authorized lookup/late receipt ingestion; public status still reauthorizes | Drop obligations, impersonate revoked user or resend with a fresh key |

Bytes accepted before a revoke's serialization point cannot be recalled.
Portal app DB locking does not prove instantaneous TS membership propagation;
measure actual cross-host source/current-policy boundary independently. No
production revocation SLA or unlimited retention guarantee is declared here.

## Rollback and cleanup

Stop realtime/dispatcher sends, retain safe currently authorized named
snapshots with explicit source freshness. Preserve immutable revisions,
head/checkpoints, audit and known/unknown command receipts. Do not restore old
permissions, delete financial facts, auto-reverse capital or enable a raw feed.

For local tests use existing isolated script traps; remove only invocation-owned
containers/network/tmp dependency trees. No production volume, image or cache
prune. Record candidate/source pins, exact tests/measurements, exceptions and
remaining source/browser debts in the09 packet and Unified before handoff.
