# Codex → Claude — N16B current protective-path handoff

Status: `COMPATIBILITY_ACCEPTED / RUNTIME_DARK`  
Date: 2026-08-29

## What frontend may rely on

The current Trading System has exactly one complete protective lifecycle that
Portal can adapt: `live.emergency-close`, restricted to `LIVE_FULL`, target
`ACCOUNT`, profile `BINANCE / USD_M`. Backend exposes this as sanitized
capability metadata in the ADMIN command catalogue and blocked plan response.

The capability is **not active**. `portal_reachable=false`,
`runtime_active=false`, apply token is null and the source side-effect flag is
false. Do not expose an enabled emergency-close control until N17B changes the
delivery authority for an exact owner-approved target/window.

## Required UI behavior

- `ACCEPTED_CURRENT_PRIMITIVE + runtime_active=false`: render a concise
  “compatible, not activated” state in diagnostics/availability context; no
  clickable command button.
- `SUPPORTED_BUT_NOT_ACTIVATED`: typed unavailable, never “coming soon” if the
  user is in an operational incident flow.
- `SOURCE_DOES_NOT_CURRENTLY_EXIST`: omit the action or explain that the source
  has no equivalent; do not map reconciliation to cancellation.
- Never show source paths, hashes, image digest, operation internals, hostnames,
  tokens or raw evidence in primary UI.
- Never let `live.resume` or `live.scale` inherit the emergency break-glass
  modal, styling, approval or session.
- Query/read health must not make a Command button look available.

When N17B activates the exact Account path, the interaction must remain
plan-first and display WebAuthn, two distinct approvals, reason, expiry,
operation status and terminal verification. HTTP acceptance is not success;
`PARTIAL` and `UNCERTAIN` need persistent, high-salience containment states and
must not offer blind retry.

## Current response fields

Catalogue annotation for `ops/emergency-close`:

- `current_primitive_state=ACCEPTED_CURRENT_PRIMITIVE`;
- `current_capability_id=live.emergency-close`;
- `accepted_environments=[LIVE]`;
- `accepted_target_types=[ACCOUNT]`;
- `runtime_active=false`;
- `blocked_reason=N16B_RUNTIME_ACTIVATION_PENDING`.

Blocked plan adds `current_primitive` with capability ID, source environment,
accepted target types and false runtime/side-effect flags. Widened target or
malformed intent is classified by stable blocker code.

## Claude parallel lane

Claude can now update availability/diagnostic mapping and prepare the inactive
Emergency Account component states. Do not wire a mutation, source route or
fixture-success path. N17B will provide the exact activation record and final
state contract before the command control becomes interactive.
