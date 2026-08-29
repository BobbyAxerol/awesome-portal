# Codex → Claude: N02 Incremental Source Contract Handoff

Status: `CONTRACT_SHAPE_AVAILABLE / OWNER_PUBLICATION_PENDING / LANE_B_DARK`

Date: 2026-08-25

## What Claude may use now

Claude may implement and test typed UI states against the request-only fixtures in:

`services/portal-execution-edge-rs/contracts/d4-paper-read-v2-request/`

The UI may represent:

- `CURSOR_AHEAD`, `CURSOR_EXPIRED` and `GAP_DETECTED` as explicit recovery states;
- retention floor and earliest recoverable cursor without exposing raw hashes;
- `EVENT_SOURCED`, `POLL_BOUNDED` and `UNKNOWN` per entity;
- the bounded poll/freshness description for `POLL_BOUNDED` entities;
- lease expired, source unavailable, rate limited and response-too-large states;
- resync as a new BUILDING epoch, never as silent continuation.

Prefer concise operator language. Contract revisions, cursor IDs and digests belong in
an inspector/copy surface, not primary screen hierarchy.

## What Claude must not claim

- The examples are not Trading-System-published facts.
- `d4.paper-read.v2` is not accepted or active.
- Lane B must remain fixture-backed or honestly unavailable.
- A gap must never render as an empty/healthy result.
- `UNKNOWN` completeness must never render as complete.
- No control may imply source, command, Sandbox, Canary or Live authority.

## Coordination gate

Codex will publish a second handoff only after the Trading System owner returns the
exact four-file package and `execution-n02-contract-verify.py --mode acceptance`
passes. Until then Claude can finish state composition and tests, but must not switch
the registry delivery profile or connect the frontend to a live reader.

Backend evidence:
[`EX_BE_02_N02_INCREMENTAL_SOURCE_CONTRACT_REVISION.md`](../../../backend/EX_BE_02_N02_INCREMENTAL_SOURCE_CONTRACT_REVISION.md).

