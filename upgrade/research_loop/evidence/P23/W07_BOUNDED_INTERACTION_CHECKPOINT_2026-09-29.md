# P23 W07 — bounded export/seek/projection checkpoint

2026-09-29 · Codex · `docs/research-loop-plan` · owned
`portal-research-p23-ol12` only. **W07 NOT QUALIFIED; P23/P24 OPEN.**

The committed `w07-bounded-interaction.mjs` is a companion to the existing
real `mixed-workload.mjs`. It requires an actual HEAVY WFO with positive
source sequence, an already READY <=512-KiB report export owned by a P23 test
reader, an opaque deep replay cursor returned by the named API, four real
reader identities, eight deep-replay/Evidence GETs, exact job-count parity,
and at least two strict seven-service cgroup samples under 5 GB. It leaves
the download body unread for >=2.5 s while companion reads run, then
verifies byte digest. This tests a stalled **bounded** client, not an
unbounded streaming-file or TCP flow-control guarantee. It requires
Evidence `AVAILABLE` with a revision, not HTTP 200 alone.

Source-only gate: `node --test scripts/research-p23/w07-bounded-interaction.test.mjs`
PASS 1/1, including negative overlap/body/digest/cursor/projection/job/resource
cases. No application API, UI, threshold, admission, image, or shared service
was changed by this helper.

Two runtime setup attempts were preserved, **not counted as W07 samples**:

| Attempt | Actual refusal | Private receipt SHA-256 |
|---|---|---|
| `w07-mixed-20260929` | `IDENTITY_MISMATCH_OR_PREVIEW_AUTO_LOGIN`: reader manifest held cookies from before normal test-session renewal. All its queued intents were cancelled through the public API. | `68cb0cb10028488fea1c972099900517ca26ed5d102c9992b853877bdfde35d3` |
| `w07-mixed-retake-20260929` | `RESEARCH_PREFLIGHT_UNAVAILABLE`: owner had eight unexpired actor-scoped preflight manifests; no new workload admitted. | `19be0f89010668a6ac8f0648edd7333c25477f644873f75c9d1fb92e4d6ccc7b` |

The reader manifest was refreshed using `prepare-readers.mjs`; no
membership changed. Read-only DB check after the failed attempts showed
**zero active/queued jobs**. The exact P23 Compose project was stopped with
`cell.mjs down` (without `-v`); its volumes, images and private receipts
remain. No preflight expiry, quota, session, producer or SQL row was edited
to bypass the refusal.

Next: after enough manifests expire **naturally** for five new intents,
restart only the P23 cell, refresh test sessions and the private reader
manifest in that order, run one fresh-labelled mixed workload, then run
`w07-bounded-interaction.mjs --archived-run=<sealed WFO id>` while its source
is RUNNING. Retain actual HTTP/cgroup/job receipts and stop the cell. A
W07 PASS will not by itself close T02, T07/T13, T12, T14, T15 or P23/P24.
