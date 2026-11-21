# Core009 native observation review — 21 October 2026

## Scope and disposition

Independent source review: **ACCEPT existing custody/egress/authority; CHANGE
the observation claim, not the public response**. This is part of existing C7
and Edge08/read09 acceptance, not a new source implementation or permission.
Source comparison covers installed `734353113d8bec85f78b35ab81c9c1a40e93a67e`,
qualified `9d88e40a963f4eb2245f8ec0343c2c511a98bd68` and integration
`432da03d916166a95cdd10c6f430d6d8daf6374d`. Relevant native observation files
are byte-identical at these pins. This review ran no DB/test/runtime command.

The [finite-window proposal](CORE009_NATIVE_FINITE_WINDOW_1630_PROPOSAL_2026-10-21.md)
is scheduling only. Its READ lane must not wait for Manager PKI, financial
publication, whole-Fleet STREAM or this optional observation improvement.
Missing prerequisites for a particular case remain explicit NOT_RUN.

## Existing proof and its actual limits

Paths below are relative to `apps/control-api/src/` at the pins above.

| Observation | Existing source | Receipt semantics |
| --- | --- | --- |
| Genuine scoped READ | `execution/maximum-data-operation.controller.ts:38–58` | Authenticated `/api/v1/execution/manager/deployments`; workspace/native consumer, not fixture BFF4100. |
| Independent STREAM | `execution-v2/native-manager-consumer.ts:189–230`; `execution/realtime.controller.ts:173–185,213–228` | Real source-set/generation and current separate STREAM grant required; READ does not grant STREAM. |
| Actual cache HIT | `execution/current-source.proxy.ts:1037–1044,1191–1196` | Proxy records actual HIT/MISS/COALESCED and cache metadata. Safe DTO construction in `execution/maximum-data-operation.service.ts:333–370,427–466` omits it. Repeated GET is not a HIT receipt. |
| Revoke invalidation | `execution/maximum-data-operation.service.ts:70–80`; `execution/shared-read.repository.ts:748–761` | Authority fingerprint participates in native epoch/cache identity: **logical invalidation**, not physical eviction of old bytes. |
| Old continuation | `execution/maximum-data-continuation.repository.ts:142–150` | Epoch mismatch refuses old cursor. A cursor refusal alone does not prove the cache path used by the request. |
| Final server egress | `execution-v2/native-read-egress.ts:40–73`; `execution-v2/current-human-candidate.ts:1185–1198,1247–1275` | Actual bounded write witness; `FINAL_HTTP_SEND_COMPLETED` / `FINAL_SSE_FRAME_WRITE_COMPLETED`. `LOCAL_CORE_HTTP_EGRESS_ONLY`, never browser ACK. |
| Durable correlation | `execution-v2/current-human-candidate.sql:40–79,177–185`; `execution-v2/current-human-candidate.ts:1279–1306` | Lease/attempt, authority/session revisions, fingerprint, scope/source/body digest, terminal receipt and original source ACK. Event timestamps are DB phase timestamps, not precise socket-write timestamps. |
| Official revoke/audit | `cli/execution-native-revoke.ts:46–65`; `execution-v2/manager-domain-revoke.ts:154–162`; `execution-v2/access.repository.ts:104–115` | Immutable genuine decision; `NOOP_EXPIRED` does not prove active cutoff. |

Before traffic, the operator can collect a **bounded read-only projection** of
the existing obligation/event/audit fields. Never export `base_body`, cookies,
session tokens, source-terminal JWTs or private signing/TLS inputs. Keep source
ACK, Core server-egress proof and client-observed body as distinct evidence.

## Small request to Claude — private observation only

**Owner:** Claude backend; Codex reviews/integrates. **Status:**
`AWAITING_CONSUMER_REVIEW / NOT_IMPLEMENTED`; it is not a published new field.
Primary read-only reviewer: `backend_cr02_b1_review`; Codex checked its locators.

If the next acceptance needs an exact cache-HIT correlation, add the smallest
operator-only observation at native preparation → delivery:

- Correlate actual `cache_state`, hashed cache identity and native epoch with
  the existing lease/attempt and body digest. Do not expose raw cached data,
  identity secrets or a new browser field merely for this measurement.
- Reuse the existing egress witness. Retain bounded byte count and physical
  write timing only if the named acceptance case requires them; do not call a
  DB phase timestamp the time of the physical write.
- Keep the safe DTO, auth/authority checks, grants, cache keys, source custody
  and financial semantics unchanged. No broad diagnostic endpoint or new
  permission. Agree one-writer ownership before editing shared source files.
- Focused proof must include genuine HIT vs MISS/COALESCED distinction,
  observation isolation and absence of secrets. A synthetic fixture can prove
  the observer logic, not connected source acceptance.

**Done-when:** a request-specific private receipt identifies the actual cache
branch and epoch, and the matching durable custody/egress record; current READ
continues independently. Existing egress/authority fields are reused rather
than duplicated. Physical cache deletion is not an acceptance requirement.

## Next work and exclusions

Codex continues reviewed Research target/config readiness and exact owner
window coordination. Claude continues dark-Fleet refresh cancellation and the
[financial producer review](C5_FINANCIAL_PRODUCER_REVIEW_AND_CLAUDE_HANDOFF_2026-10-21.md).
No source mutation, session/grant issuance, UI change, build, gate rerun,
production/dev/main change or ELP2-11 assignment follows from this record.
The actual connected acceptance remains open until its real receipts exist.
