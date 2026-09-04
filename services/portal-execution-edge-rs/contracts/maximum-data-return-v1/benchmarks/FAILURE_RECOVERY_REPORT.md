# Failure and recovery evidence

E7 validates the already-present Rust boundaries rather than introducing an
unconnected recovery pipeline.

| Boundary | Tested evidence | Result | Limit |
| --- | --- | --- | --- |
| `manager-v2-client` | mTLS/profile binding, fixed request, queue bound, frame/redirect failure, typed 503/no automatic retry | Pass | does not create an event replay source |
| `maximum-data-adapter` | fixed E5 operation, catalogue/relation/profile/key binding, opaque continuation handling | Pass | current page semantics only |
| `realtime-sse` | bounded fanout, slow-consumer terminal gap, dedupe/gap, epoch restart local tests | Pass | separate Projection/SSE component; not a Manager current-page stream |
| `paper-source-ingestor` | checkpoint/restart/cursor-expiry local tests | Pass | D4 Paper event-source boundary only; not evidence for this Manager page |
| same-host source probe | typed 503 observed under one Paper and one Sandbox concurrent peer; no automatic client retry | Pass/fail-closed | no induced source outage or cross-cell test |

No 1/5/30-minute outage, retained event replay, live tail, correction recovery
or independent-cell SGP exercise was induced in E7. Those need the explicit
owner window listed in `e7-resilience-capacity.v1.json`; absence of that
window is reported as an external evidence requirement, not converted into a
passing resilience claim.
