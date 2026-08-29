# Codex → Claude: N08 SSE activation handoff

Date: 2026-08-26  
Backend status: `PORTAL_IMPLEMENTATION_COMPLETE / OWNER_PROMOTION_APPROVED /
RUNTIME_FAIL_CLOSED / REAL_SOURCE_EVIDENCE_PENDING`

## Canonical public boundary

Snapshot first:

```text
GET /api/v1/execution/command-center/realtime-snapshot
```

Then open exactly one stream for that Command Center screen:

```text
GET /api/v1/execution/command-center/stream?cursor={snapshot.cursor}
```

Use generated `execution-realtime.d.ts` and OpenAPI. Do not handwrite another
snapshot shape. The snapshot is exact and includes active epoch, sequence,
cursor, capability ID and activation-manifest digest. Those hashes belong in
an evidence drawer/debug copy action, not primary UI.

## Transport rules

1. Keep the existing snapshot-first reducer and typed event mapping.
2. Native `Last-Event-ID` is authoritative after the first connection; do not
   append a second reconnect cursor or build a custom retry loop.
3. Generic EventSource error and terminal auth/session events must call
   `close()`. The N08 hardening test now enforces this.
4. Gap, cursor-ahead, epoch-change, history-evicted, slow-consumer and source
   loss remain distinct operator states.
5. Keep the last-good view visibly aging during recovery. Never render a source
   gap as an ordinary empty result or a fake live zero.
6. Commands remain dark; N08 grants read delivery only.

## Current product truth

Bobby approved this Paper shadow promotion. The backend must not ask for that
approval again. Runtime still fails closed because no accepted real
`d4.paper-read.v2` N06 evidence is available. Therefore:

- preview/fixture pages remain explicitly fixture today;
- do not flip registry `sse_enabled` in a fixture-only environment;
- the real adapter can be completed and tested against canonical snapshot/event
  fixtures now;
- when runtime is admitted, switch only through the registry delivery flag and
  keep the same component/reducer.

## Claude acceptance work

- wire the real Command Center container to fetch the snapshot endpoint before
  creating EventSource;
- assert one EventSource per mounted screen and close on unmount/terminal error;
- exercise typed source-loss and resnapshot states against the new snapshot;
- include expired Portal session and generic network error tests proving no
  infinite reconnect;
- preserve preview dark mode until the backend runtime flag is actually active;
- record result in `PHASE_TRACKER.md`; do not relabel fixture evidence as real.

Backend detail:
`../../backend/EX_BE_06_N08_SSE_REAL_SOURCE_ACTIVATION.md`.
