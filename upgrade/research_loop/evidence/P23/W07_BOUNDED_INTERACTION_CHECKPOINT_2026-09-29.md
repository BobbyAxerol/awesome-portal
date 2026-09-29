# P23 W07 — bounded export/seek/projection checkpoint

2026-09-29 · Codex · `docs/research-loop-plan` · owned
`portal-research-p23-ol12` only. **W07 scoped PASS; P23/P24 OPEN.**

The committed `w07-bounded-interaction.mjs` is a companion to a real WFO producer (the existing mixed workload or one public single-run intent). It requires an actual HEAVY WFO with positive
source sequence, an already READY <=512-KiB report export owned by a P23 test
reader, an opaque deep replay cursor returned by the named API, four real
reader identities, eight deep-replay/Evidence GETs, exact job-count parity,
and at least two strict seven-service cgroup samples under 5 GB. It leaves
the download body unread for >=2.5 s while companion reads run, then
verifies byte digest. This tests a stalled **bounded** client, not an
unbounded streaming-file or TCP flow-control guarantee. It requires
Evidence `AVAILABLE` with a revision, not HTTP 200 alone.

Source-only gate: `node --test scripts/research-p23/w07-bounded-interaction.test.mjs`
PASS 2/2, including negative overlap/body/digest/cursor/projection/job/resource
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

## First measured retake — W07 FAIL, source mapping corrected

After the manifests expired naturally (active count 0), a fresh exact mixed
run passed: 20 users × six GETs = 120/120 HTTP 200, one real WFO completed,
four queued intents cancelled through the public API, seven-service peak
606,150,656 bytes. Library/Evidence p95 were 356/410 ms. Private W06 receipt
SHA-256: `31abb907064ca11ebfc6982f410fb7933a032cbe7b4d09ff2432d6a0d0688c04`.
That WFO completed before a manually launched W07 companion could overlap;
it is **W06 evidence, not W07**.

A separate single public WFO then published RUNNING source progress. The
pre-armed W07 companion observed RUNNING again at read onset; its existing
READY export was 10,818 bytes and held unread for >=2.5 s with a matching
SHA-256. Deep replay reached source ordinal 1650, all eight named GETs were
200, the job count stayed equal, and strict seven-service samples peaked at
599,617,536 bytes. The **projection check failed**: the chosen historical
WFO's Evidence Hub correctly returned `NOT_PUBLISHED`/no revision for all
four readers. This is typed source absence, not an HTTP or retention lie.
Private W07 receipt SHA-256:
`3bf3686985ae8b5715ff83e4acc1305ed8e0679ac11fe9093c8e77e678523cdf`.
The single WFO ended `COMPLETED/READY`; zero jobs remain active/queued.

The tested harness now binds deep replay to the sealed WFO **and** the
Evidence projection to the distinct, already sealed P04 run named in the
owned reader-authority manifest. A GET against that P04 Hub returned
`AVAILABLE` with revision before this change. Both IDs are recorded
separately; no source data or API is altered. The focused guard test now
checks this mapping and the negative `NOT_PUBLISHED` case. **Runtime
retake on the corrected committed harness is still required.**

## Corrected runtime retake — scoped W07 PASS

Commit `f6af8284` passed the full repository hook. The owned P23 cell was
restarted from its pinned seven images with clean source identity. Actor
preflight count was **0** (natural expiry); existing test sessions were
checked/refreshed through normal login and the private reader manifest was
regenerated. No admission cap, token expiry, account, business row or
application image was changed.

One Advanced WFO, `rrun_4e6c52d2171e86e734a7519bc3bfe2f5`, was admitted
through the public API and published real `RUNNING` progress with positive
source sequence; it later ended `COMPLETED/READY`. The pre-armed companion
observed it still RUNNING at read onset. Deep replay used the sealed WFO
`rrun_90578b81460c44f1a2729b717b3c2c8b`; Evidence used the distinct
sealed P04 run `rrun_d8e174e6268aedbf868de56edd062b29`, named by the
existing reader-authority manifest. All four readers received two 200 GETs
each; all four Evidence responses were `AVAILABLE` with revision, with
deep-replay reads returning the selected source ordinal. Maximum named read
was **280 ms**. The owned 10,818-byte export was left unread for **3,046 ms**
while these reads ran, then matched its stored SHA-256. Job count was
unchanged. Strict seven-service cgroup samples peaked at **550,375,424 B**
under the 5-GB cell bound. `assessW07` reported all **7/7** checks true and
`scoped_passed=true`; private receipt SHA-256:
`1379cfceb33aa852b356eb46b688efc054b8e3b7969e921de39b59117ca0ef71`.

Read-only post-run check showed **zero RUNNING/QUEUED jobs**. The exact P23
Compose project was stopped with `cell.mjs down`, not `-v`; named volumes,
images and private receipts remain. This is a bounded download-stall and
named-read result, **not** an unbounded streaming-file/TCP guarantee. The
receipt itself keeps `full_p23_passed=false`: T02, T07/T13, T12, T14, T15,
broader recovery/BR/GX and P24 remain open.
