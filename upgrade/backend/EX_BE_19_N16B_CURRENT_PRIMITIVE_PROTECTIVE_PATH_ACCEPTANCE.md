# N16B — Current-primitive protective-path acceptance

Status: `N16B_CURRENT_PRIMITIVE_COMPATIBILITY_ACCEPTED / LIVE_EMERGENCY_CLOSE_ONLY / PRODUCT_RUNTIME_DARK`

Date: 2026-08-29  
Owner: Portal backend  
Accepted source: current Trading System Gateway primitive  
Trading System mutation: none

## Goal and decision

N16B adapts what the current Trading System actually supports instead of
waiting for an ideal N12 command service. The sanitized current-source pack
proves only one primitive with a complete protective lifecycle:

1. `GET /v1/admin/ops/emergency-close/plan`;
2. `POST /v1/admin/ops/emergency-close`;
3. `GET /v1/admin/ops/emergency-close/{operation_id}`;
4. `POST /v1/admin/ops/emergency-close/{operation_id}/verify`.

The accepted compatibility slice is deliberately narrower than the future N12
shape:

- Portal capability `live.emergency-close`;
- source key `ops/emergency-close`;
- environment `LIVE_FULL` only;
- target type `ACCOUNT` only;
- profile `live / BINANCE / USD_M`;
- separate identity `portal-execution-command`;
- mTLS plus one-operation delegated JWT with maximum TTL 60 seconds;
- WebAuthn step-up and two distinct approvers;
- Portal-owned idempotency journal, zero automatic retry after dispatch;
- HTTP 200 is acknowledgement only, never terminal truth.

This phase accepts compatibility, not a Live source call. No account/change
window was named and Bobby's exact Live-mutation acceptance remains a required
N17B authority. Runtime flags, public route and source-call authority therefore
remain false.

## Exact capability classification

| N12 capability | Current-source result | Reason |
| --- | --- | --- |
| `paper.halt` | `SUPPORTED_BUT_NOT_ACTIVATED` | current state mutation lacks plan, verify and target-version semantics |
| `paper.cancel-open-orders` | `SOURCE_DOES_NOT_CURRENTLY_EXIST` | reconciliation is not cancellation |
| `sandbox.halt` | `SUPPORTED_BUT_NOT_ACTIVATED` | current state mutation lacks plan, verify and target-version semantics |
| `sandbox.cancel-open-orders` | `SOURCE_DOES_NOT_CURRENTLY_EXIST` | reconciliation is not cancellation |
| `live.halt` | `SUPPORTED_BUT_NOT_ACTIVATED` | current trading-state mutation lacks plan, verify and target-version semantics |
| `live.reduce` | `SOURCE_DOES_NOT_CURRENTLY_EXIST` | no exact bounded reduce primitive |
| `live.emergency-close` | `ACCEPTED_CURRENT_PRIMITIVE` | complete plan/apply/operation/verify chain exists |
| `live.resume` | `SUPPORTED_BUT_NOT_ACTIVATED` | R4 cannot inherit protective break-glass |
| `live.scale` | `SUPPORTED_BUT_NOT_ACTIVATED` | R4 cannot inherit protective break-glass |

This is an availability contract, not a request for Trading System to add the
missing operations. Unsupported actions remain absent or typed unavailable and
do not become dead enabled buttons.

## Delivered architecture

### Strict contract and source evidence binding

`portal.execution.protective-path-current.v1` binds the exact command catalogue,
sanitized OpenAPI, extracted request contracts, extracted response shapes,
N15B Query acceptance and N16A emergency profile by SHA-256. It also pins the
captured Trading System source commit and running Gateway image digest.

The fixture contains no source credential, internal hostname, DSN or business
payload. A static gate re-derives every digest and route and fails on target,
identity, R4, runtime-authority or secret-shape widening.

### Rust Edge authority

`command-relay::current_primitive::CurrentProtectiveAcceptance` is the canonical
compatibility authority. Edge startup loads it and rejects evidence drift before
serving. `authorize_transport` validates the exact capability, environment,
target, mode, venue, product and dedicated command identity. The checked-in
canonical contract then returns `RuntimeInactive`; no transport can be built.

The existing durable relay journal remains the operation truth boundary:

- request-key/payload conflicts fail closed;
- dispatch removes automatic retry authority;
- 202/200 acknowledgement is non-terminal;
- `VERIFIED`, `FAILED` and `PARTIAL` are terminal observations;
- ambiguous outcomes become `UNCERTAIN` and survive restart;
- R4 and unsafe repeat protection remain blocked on an uncertain target.

### TypeScript control-plane gate

The ADMIN/workspace command catalogue now annotates only
`ops/emergency-close` as `CURRENT_PRIMITIVE_CONFIRMED`, while retaining
`portal_reachable=false` and `runtime_active=false`. The planner accepts only
the exact Live Account envelope and returns immutable blocker
`N16B_RUNTIME_ACTIVATION_PENDING`. Widened targets and malformed source intent
return `N16B_TARGET_SCOPE_UNSUPPORTED` or
`N16B_CURRENT_PRIMITIVE_PLAN_INVALID`.

Plans remain hash-only, immutable and outbox-free. The BFF returns sanitized
capability metadata but never source paths, credentials, hostname or an apply
token. Apply remains denied by `COMMAND_RELAY_DISABLED`.

## Evidence and tests

- N16B static security/contract gate: passed; six immutable evidence hashes,
  four-route source chain, nine capability classifications, one accepted
  primitive, exact target/identity, runtime-dark state and secret scan verified.
- Shared contracts: 83/83 passed, including target widening, premature runtime
  activation and R4 inheritance negative cases; all generated contracts remain
  current.
- Control API: 22 suites / 203 tests passed against fresh PostgreSQL; N16B
  catalogue, exact/malformed/widened plan, zero outbox, build and dump/restore
  signature passed.
- Rust: all workspace tests passed, including 14 command-relay tests and three
  N16B tests; `cargo fmt`, Clippy `-D warnings`, six-month replay and PostgreSQL
  projection dump/restore passed.
- No source/network mutation test was executed: `source_mutations=0`, runtime
  probe false and every command authority false.

The lifecycle tests prove local plan/apply/verify mapping, idempotency,
restart-safe uncertainty, partial failure and reconciliation semantics. A real
Trading System acknowledgement/terminal result is intentionally a named N17B
Live acceptance action, not fabricated N16B evidence.

## Runtime truth and rollback

At closeout:

- compatibility contract accepted: true;
- command transport/source call/public route/Live mutation: false;
- read identity cannot dispatch Command;
- product/stable/dev runtime unchanged;
- Trading System unchanged.

Rollback requires no database restore: disable the future Live protective flag,
revoke the command delegation issuer, restore the prior Edge digest and verify
typed unavailable with zero source call.

## Next phase

The next backend phase is **N17B — exact-set production acceptance**. It may
activate bounded Paper/Sandbox/Live read slices independently. For the one Live
protective command it additionally requires the exact Account target, a bounded
change window, rollback/abort owner and Bobby's final mutation sign-off before
the first plan call. N17B must then observe source acknowledgement and terminal
verification or roll back to the N16B runtime-dark contract.

Claude handoff:
[`CODEX_TO_CLAUDE_N16B_CURRENT_PROTECTIVE_HANDOFF.md`](../upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_N16B_CURRENT_PROTECTIVE_HANDOFF.md).
