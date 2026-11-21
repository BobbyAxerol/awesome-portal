# C2 P7 original-intent recovery — 2026-11-05

**Status: SOURCE_ONLY / NOT_AUTHORIZED / NOT MOUNTED.** This is recovery of
P7 *preparation*, not an acceptance, a grant, an issuer, HTTP token custody,
an Edge acknowledgement or a complete V2 restore barrier. No runtime, shared
database, identity, source authority or secret was modified.

## What changed

P7 confirmation currently crosses separate owner-intent, registration and
record transactions. If the response or the record step is lost after the
registration commits, the candidate can now recover the **same** recorded
REGISTER intent, either by its ID or by the client's original idempotency key.
It does not re-create or return the one-view proof, re-register a source, or
mint another intent. An intent by itself cannot recover a missing registration.

Both candidate-only HTTP endpoints retain session, origin, CSRF, no-store and
strict body controls; the key-lookup endpoint additionally requires the original
idempotency key. A lookup is only a locator. The record transaction rechecks
the authenticated owner/session and step-up, active registration and exact
source proof, authority revision, expiry and intent revocation. It locks the
original intent and checks that its recorded decision matches the B1/source,
registration, session generation, **cycle and reviewed confirmation digest**.
The preparation record binding also includes that exact intent and digest;
a prior diagnostic or different intent cannot satisfy the resumed write.
The revocation check is a fresh statement after the intent lock. Historical
intents without that exact review binding fail closed and require a new
explicit review. The dark composition remains dark for the recovery methods too.

The three writes are still not one atomic transaction; the recovery path only
covers a recorded intent **and a committed matching registration**. Ambiguous
commit before registration needs independent reconciliation, not proof replay.
Actual source registration, legitimate human acceptance, audit/ACL and HTTP
boundary custody must be commissioned before any real P7 or A2 claim.

## Verification

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **4/4**, exit 0. Bounded,
  disposable PostgreSQL and synthetic owner/session/step-up/attestor; exercises
  failed record then fresh service + original-key recovery, replay of the same
  record, rejection of another cycle/session/key and revoked intent, and
  refusal when registration never committed. Uses pinned public B1 bytes.
- Focused candidate unit/Nest-Fastify HTTP tests: **27 passed**, exit 0; one
  three-test public-B1 codec suite was skipped without its input. It was then
  run separately with the pinned B1: **3/3**, exit 0. HTTP identity/repository
  and downstream services are synthetic, not connected browser acceptance.
- Strict semantic TypeScript check of the P7 review-service root and transitive
  imports: exit **0**, Node heap bounded at 1024 MiB. This does not establish
  full project typecheck; the separate controller-root check previously OOMed.
- Read-only Edge mailbox check found no newer C2/A2 acceptance packet after the
  static return at 08:19 UTC. Static material was already relayed, not a full A2.
- Cell cleanup is performed by its exact-name trap. No full hook or deployment
  was run; code remains uncommitted alongside existing shared WIP.

## Source/test SHA-256

| File under `apps/control-api/` | SHA-256 |
| --- | --- |
| `src/execution-v2/c2-p7-acceptance.ts` | `6ea10f257baae7b10d11ce0539e6b11423f521ad1897da819d5d345662ecfd35` |
| `src/execution-v2/c2-p7-owner-intent-candidate.ts` | `18ff2a91945b8f4ad20792b7fe978034d320691af640b07dfce740d3b22fb5a3` |
| `src/execution-v2/c2-p7-review-candidate.service.ts` | `0ea0165bc7ef26a70fca203b550bfb9ab928c08e11ea6a9fe6883959273df6e2` |
| `src/execution-v2/c2-p7-review-candidate.controller.ts` | `218e1f1a9ca8425c00d8afd63daf4f63a1b3e2738c10060a57054b4e11052da4` |
| `src/execution-v2/c2-p7-review-candidate.composition.ts` | `2cb48adacf54c3c4b49b9eacd49f6a447108ac10995920af052f572d8f724c13` |
| `test/c2-p7-owner-intent-candidate-pg.spec.ts` | `05acd7a5e557195ae0e63cae6e330b2e752297655f39bcef14282fd940f0e79f` |
| `test/c2-p7-review-candidate.spec.ts` | `ec9e27588c63a8d1af735a5dfb05a34b167ce8da9275cab6fd63d449277f96c1` |
| `test/c2-p7-review-candidate-http.spec.ts` | `1b9b8db30d7edc1d8e53bf6cabbf689d4c06990e4ec3ff6358a136d4cc2a32ea` |
| `test/c2-p7-review-candidate-composition.spec.ts` | `94a1ed7779fc24380f8df9699220b01730d81af41bcc9b6b932f72bc5319883b` |

## Next owner/action

Core: qualify owner/session and source registration, assemble and install the
Research-only issuer/listener, produce real acceptance/delegation and P8 pins,
then gather runtime A2 evidence. Core/Edge: independently establish actual
recipient acknowledgement and post-snapshot terminal coverage before recovery
cutover. Edge may screen the existing static packet; B2 remains unsigned until
both A2 acceptance and all sealed-contract prerequisites are actually met.
