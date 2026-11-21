# P11 contract amendment — source-owned Screen-03 display facts

Status: **published in the P11 source journal, Control validation and generated
Research Progress contract; feature-dark.** This closes `CG-P11-01` and
`CG-P11-02` at the contract boundary. It does not claim that the current P04
qualification has emitted either fact.

## Why this is a separate fact lane

Screen 03's HIFI contains two visually useful details that cannot be derived
from the existing whole-fold lifecycle projection:

1. A fold may show real `search` → `oos` → `freeze_tick` segments only when
   the source has published the start/completion facts for those segments.
2. A methodology grade (`A`–`D`) is a run certificate fact, not an engine
   capability (`L0`–`L4`), a preflight ceiling, or a string token embedded in
   a claim.

The current P04 Delta qualification emits a bounded whole-fold lifecycle and
an optional claim. It does not emit either a per-fold methodology timeline or
a methodology certificate. Splitting its whole-fold timestamps in the Portal
would falsely describe a method the source did not observe; parsing an issued
claim would similarly fabricate a certificate.

## Published fields

### Fold timeline

Every newly materialised source snapshot contains:

```json
{
  "fold_timeline": {
    "state": "NOT_PUBLISHED",
    "reason_code": "SOURCE_DID_NOT_PUBLISH_PER_FOLD_SEGMENT_FACTS",
    "segments": []
  }
}
```

The source may change that only by appending an exact
`fold_segment_observed` event:

```json
{
  "fold": 1,
  "kind": "search",
  "state": "DONE",
  "started_at_utc_ms": 1725000000000,
  "completed_at_utc_ms": 1725000000120
}
```

`kind` is exactly one of `search`, `oos`, `freeze_tick`; each kind occurs at
most once per fold. `PARTIAL` means at least one source fact exists but does
not permit filling the missing segments. `COMPLETE` means all three source
facts are `DONE`; only then may a client present a fully segmented Gantt.
The source journal rejects contradictory timestamps, a terminal-to-running
regression and post-completion segment facts.

### Methodology certificate

`claim.methodology_certificate` is now a separate strict object:

```json
{
  "state": "NOT_PUBLISHED",
  "grade": null,
  "issued_at_utc_ms": null,
  "reason_code": "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE"
}
```

Only `state: "ISSUED"` with a real grade `A`–`D`, UTC issuance timestamp and
`reason_code: null` authorises a certificate chip. `NOT_ISSUED` is also
explicitly representable when the source publishes that outcome. Neither
state may be inferred from claim prose, from the engine Atlas, or from any
methodology/capability ceiling.

## Compatibility and consumer rule

The OpenAPI fields are optional only so persisted snapshots produced before
this amendment remain decodable. Their exact documented meaning is
`NOT_PUBLISHED`; an absent field is **not** a client licence to synthesize a
timeline or certificate. The P11 source journal writes explicit objects for
all new records. During a bounded source/Control rolling deploy, private
Control ingress normalises a preceding-source snapshot's absent fields to the
same explicit `NOT_PUBLISHED` objects *before* persistence or public fan-out.
That preserves recovery without inventing facts or making the browser carry a
version-skew workaround.

Screen 03 therefore keeps its current truthful presentation for the active
P04 source: one whole-fold band and no certificate chip. When the source later
emits facts, it can enrich the same generated contract without a new UI state,
without parsing text, and without changing the P11 private/public boundary.

## Proof

- Source journal tests prove that ordinary `trial_completed` and
  `fold_completed` leave `fold_timeline` `NOT_PUBLISHED`, while an exact set
  of three source events becomes `COMPLETE`.
- Source and Control tests reject an invalid running timestamp and an issued
  certificate without a grade.
- Generated-contract tests pin both the discriminated
  `fold_segment_observed` event and the `ProgressMethodologyCertificate` type.

No source adapter, runtime flag, deployment, direct QuantBT connection or
browser-side inference was added by this amendment.
