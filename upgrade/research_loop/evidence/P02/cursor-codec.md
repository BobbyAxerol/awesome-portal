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
