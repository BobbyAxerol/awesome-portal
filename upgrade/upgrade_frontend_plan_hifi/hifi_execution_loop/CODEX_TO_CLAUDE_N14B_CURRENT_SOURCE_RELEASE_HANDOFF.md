# Codex → Claude — N14B immutable current-source release handoff

Status: `PAPER_COMPATIBILITY_ACCEPTED / RUNTIME_NOT_ACTIVATED`  
Date: 2026-08-29

## What changed

The backend release system can now bind one immutable Paper current-source
candidate to the exact N14A images, N13B source map and Portal adapter/config
bytes. The first scope is only `PAPER_TRADING_SCREEN` with positions,
execution-quality and session reads.

This does **not** change a registry `data_mode`, frontend delivery profile or
runtime flag. Continue using the N13B same-origin client and honest-state rules.

## Claude parallel lane

1. Keep Paper/Sandbox/Live/Canary states independent.
2. Prepare the Paper overview for the three accepted capabilities, including
   loading, empty, stale, partial, denied and unavailable states.
3. Do not render commit/image/source hashes in the primary UI. If required for
   operators, keep them inside a restrained diagnostics drawer.
4. Do not enable actions on this screen; the N14B target is read-only.
5. Keep fixture/current-source switching behind the existing screen delivery
   gate until Codex explicitly reports the later screen/runtime activation.
6. Run role, keyboard, breakpoint, interaction and visual regression gates for
   the Paper overview only; do not infer Sandbox/Live acceptance from Paper.

Backend report:
[`EX_BE_17_N14B_IMMUTABLE_CURRENT_SOURCE_RELEASE_COMPATIBILITY.md`](../../backend/EX_BE_17_N14B_IMMUTABLE_CURRENT_SOURCE_RELEASE_COMPATIBILITY.md).
