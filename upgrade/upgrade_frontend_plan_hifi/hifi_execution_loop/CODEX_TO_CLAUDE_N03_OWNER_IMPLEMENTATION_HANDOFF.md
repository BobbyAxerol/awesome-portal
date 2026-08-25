# Codex → Claude: N03 Owner Implementation Handoff

Status: `PORTAL_ACCEPTANCE_HARNESS_COMPLETE / OWNER_IMPLEMENTATION_PENDING /
LANE_B_DARK`

Date: 2026-08-25

N03 adds no new frontend endpoint or live data authority. Claude should continue the
N02 typed fixture/parity work only:

- lease expired/unavailable;
- cursor gap/expired → new BUILDING epoch;
- per-entity completeness and poll bounds;
- source loss and recovery without rendering a false empty state.

Do not select a live reader, render `EVENT_SOURCED` as an owner fact, or claim source
freshness from the request examples. The AWS-HK owner implementation is still v1 and
dormant. Codex will issue a new handoff only after N02 and N03 owner packages both
pass acceptance and N04 provides the Portal Rust consumer.

Backend evidence:
[`EX_BE_02_N03_TRADING_SYSTEM_INCREMENTAL_SOURCE_IMPLEMENTATION.md`](../../../backend/EX_BE_02_N03_TRADING_SYSTEM_INCREMENTAL_SOURCE_IMPLEMENTATION.md).

