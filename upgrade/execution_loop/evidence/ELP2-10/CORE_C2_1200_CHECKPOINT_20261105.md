# Core C2 checkpoint — 2026-11-05 12:00 UTC

**A2 NOT_READY; B2 NOT_SIGNED; C2 connected NOT_MET.** This checkpoint is not a
deadline extension or a substitute for the actual A2 exchange. TS verified the
static partial structurally; its original bytes and digest remain unchanged.

| Item | State | Owner and next action |
| --- | --- | --- |
| P1/P2, P3/P4 | Core NOT_READY | Finish trusted exact-request/issuer delivery and commission the Research-only source registration, JWKS and TLS listener. The public key and certificate are candidates, not installed pins. |
| P5/P6 | Core NOT_READY | Recheck the protected owner's actual issuer/subject, the Research workspace, current authority and workload bindings at commissioning; do not copy the earlier observed revision as current. |
| P7 | Core NOT_READY | Complete real owner acceptance/delegation and its same-authority fence. Research temporary acceptance sessions are not password/owner-presence proof. The candidate issuer composition is hard-fenced; direct low-level candidate APIs remain unmounted and must not bypass it. |
| P8 / B2 | Core NOT_READY | Qualify signer custody and put its public key in the real A2; B2 is signed once only after TS accepts A2 and the other release conditions hold. |
| O-1..O-4 | Core NOT_READY | Finish the actual request-byte provenance, delivery/acknowledgement and runtime verification. The TS operator currently builds request bytes after receiving a token; resolve this with Edge/source before commissioning. |
| Recovery V2 | Core NOT_READY | Independent custody and source proof tie-out are source-only. Qualify old-holder fencing and complete post-snapshot original/terminal/ACK census; maintain the existing V2 restore refusal until then. |

Latest local correction is
`CORE_C2_P7_FENCE_POSTGRES_REGRESSION_20261105.md` (SHA256
`1e5a2b506fbb857e7ae54e2475b92e7e8ce2b8f5f6f48e4cf4ce0f25e7eb1a32`),
already mirrored to EPG10-08. It records 28 focused unit tests and 5 isolated
two-cluster PG tests, not a live connection or integrated normal hook.

Edge relays a genuine A2 to TS when Core actually delivers it; the Edge/TS
static structural PASS does not establish Portal authority. No additional
Edge input is requested for fields already present in A1/B1. No credential,
database, runtime, grant, command/Live state or remote Git ref was changed.
