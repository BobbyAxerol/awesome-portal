# P16 current-source capability matrix

| Required generic Freeze capability | Current P04/P10/P11/P14 fact | P16-A result | Required future source contract |
|---|---|---|---|
| compiled adapter binding | P10 retains adapter digest | exact retained comparison | none for P16-A |
| producer ↔ split manifest binding | P10/P14 retain matching immutable manifest digests | exact retained comparison | none for P16-A |
| fixed parameter bundle binding | P04 declaration + P14 bundle digest | exact retained comparison; static table only on match | none for P16-A |
| artifact bytes / expected digest | P14 physical I/O `NOT_ATTESTED` | `NOT_ATTESTED`, never PASS | versioned source artifact identity, byte digest/size/algorithm and immutable receipt reference |
| candidate population / selected trial | P04 `FIXED_PROFILE_NO_SEARCH` | `NOT_APPLICABLE`, all refs null | bounded study/evaluation population, selected artifact/trial identity and immutable selection record |
| causal wall-clock ordering | only data-time windows; no source method clocks | `NOT_ASSERTED`, no causal verdict | source-emitted UTC method events with event identity/order semantics and clock provenance |
| exact what-if grid | P04 publishes none; admission rejects overrides | `NOT_APPLICABLE` | immutable evaluation identity + objective convention + bounded precomputed grid/reuse semantics |
| diagnostic evaluation / cancel | no source job relation | `may_submit=false` | separately authorized idempotent diagnostic intake, bounded resource/cancel/audit contract |
| sibling draft | no source relation/admission | `may_create=false` | versioned draft/provenance contract and explicit scoped authorization |

No cell in this matrix authorizes Portal to bypass the missing fact via a
direct database, artifact path, Parquet scan, worker journal or browser
fixture. P16-B begins only with a new installed source version and a separate
reviewed integration phase.
