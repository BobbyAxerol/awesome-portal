# Codex → Claude — N12 Command Relay Handoff

Backend status: `PORTAL_COMMAND_GATE_COMPLETE / OWNER_PUBLICATION_PENDING / PRODUCTION_INACTIVE`.

N12 defines the canonical command presentation boundary; it does **not** make
any command clickable in the product runtime yet.

## Consume now

1. Render capability availability from the canonical catalogue, never from a
   screen-local command list or from observed read health.
2. Keep unpublished entries disabled/unavailable with a compact reason. Do not
   hide a safety-critical protective action merely because projection/source
   state is degraded; show its disabled or separately gated state honestly.
3. Separate R3 protective actions from R4 risk-increasing actions visually and
   in component state. R4 can never inherit an emergency/protective bypass.
4. The first terminal line after apply is `202 · ACCEPTED — not success yet`.
   Only verified `SUCCEEDED` is success; `PARTIAL` and `UNCERTAIN` never render
   green.
5. For `UNCERTAIN`, remove retry. Show reconciliation/incident continuation and
   the same-target lock. Only a server-published safe monotonic protective plan
   may become available; the browser never decides that rule.
6. Surface step-up, distinct dual approval, plan expiry, target-version conflict
   and command kill switch as typed states; never infer them from button state.
7. Do not expose hashes as primary UI. Keep operation/request/evidence hashes in
   a copyable audit/details disclosure only.

## Nine requested capabilities

- Paper: halt, cancel open orders;
- Sandbox: halt, cancel open orders;
- Live protective: halt, reduce, emergency close;
- Live risk-increasing: resume, scale.

Until owner publication and N13 promotion, all nine remain runtime unavailable.
The 64-entry F0 catalogue is still useful for the Admin Drawer inventory but
does not grant reachability.

## Parallel frontend task

Build/test one reusable `CommandTerminal` state mapper for:

`BLOCKED`, `PREPARED`, `DISPATCHED`, `ACCEPTED`, `ACKNOWLEDGED`, `SUCCEEDED`,
`FAILED`, `DENIED`, `PARTIAL`, `UNCERTAIN`, `EXPIRED`.

Add explicit tests that 202 is non-terminal, PARTIAL/UNCERTAIN are not success,
retry is absent under UNCERTAIN, R3/R4 are separated, unreachable actions stay
disabled and no read/SSE availability flag enables a command.

Canonical references:

- `services/portal-execution-edge-rs/contracts/n12-command-relay-v1-request/README.md`;
- `services/portal-execution-edge-rs/crates/command-relay/src/lib.rs`;
- `upgrade/backend/EX_BE_05B_N12_LIVE_COMMAND_RELAY.md`.

Do not call owner paths, remove fixture/profile labels or enable product
mutations until Codex imports an accepted pack and N13 promotes that exact
capability/environment lane.
