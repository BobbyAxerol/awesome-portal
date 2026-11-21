# P02 cursor codec

The codec is an inspection-state codec only. It does not mint a backend cursor,
authorize a resource, read an event stream, or command a run.

Allowed ordered fields:

`fold`, `study`, `trial`, `pick`, `params`, `trade`, `seq`, `event_seq`,
`mode`, `schedule`, `route`, `playback_ordinal`.

Rules:

1. Duplicate or unsupported fields are typed errors.
2. Values are bounded opaque identifiers, never JSON/object payloads.
3. `seq` and `event_seq` may coexist only if equal.
4. A trial known to be ambiguous requires `study`; P02 never guesses one.
5. `pick` is inspection state and is not equated with a trial, promotion,
   execution target, or command.

Canonical example:

```text
fold=3&study=s-west&trial=42&pick=best&trade=tr-7&event_seq=91
```

## p02-cursor.v2 — RF01-B4, 2026-09-23

The rules above stand; v2 adds one key and states one rule that v1 left
implicit. The codec name is `p02-cursor.v2`; the journey read reports it as
`inspection.codec`.

Ordered fields in v2:

`stage`, `fold`, `study`, `trial`, `pick`, `params`, `trade`, `seq`,
`event_seq`, `mode`, `schedule`, `route`, `playback_ordinal`.

6. `stage` is presentation-only. It names the evidence tab that is open —
   one of `summary`, `split`, `search`, `freeze`, `execute`, `claim`,
   `atlas` — and never selects, filters or authorizes a resource. It is the
   only key with a closed value set; any other value is a typed
   `CURSOR_VALUE_INVALID`.
7. Every other value on the wire is an opaque identifier. A screen may read
   `fold`, `trial` or `seq` as a number only after matching it against the set
   its own contract published (for example the fold list of the split read);
   the codec never coerces, and a value that is not in that set is a notice on
   the screen, not a silently dropped key.

Canonical v2 example:

```text
stage=search&fold=3&study=s-west&trial=42&pick=best&trade=tr-7&seq=91
```

Reference implementation: `scripts/research-loop-v11/p02-contract.mjs`
(`CURSOR_CODEC`, `CURSOR_STAGES`); server: `apps/control-api/src/research/foundation.contract.ts`
(`RESEARCH_CURSOR_CODEC`, `RESEARCH_CURSOR_STAGES`); published contract:
`packages/contracts/openapi/research-foundation.openapi.json` (`CursorStage`,
`InspectionCursor.codec`). The browser codec follows in RF01-F5.
