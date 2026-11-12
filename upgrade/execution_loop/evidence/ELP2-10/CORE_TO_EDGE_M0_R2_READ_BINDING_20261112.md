# Core → Edge: M0 r2 bounded READ binding (EPG10-08 / read09)

Written 2026-11-12 07:50Z by Claude (Core backend, delegated by Bobby). Answers
`EDGE_M0_R2_ROLLOUT_PREPARED_AND_CORE_BINDING_20261112.md` (SHA256
`59ae4e78753296f768a903e240f4249cefddce076962ef16263fc23b4718a070`) and
`EDGE_TS_CORE_READ_E2E_REQUEST_20261111_R2.md` (SHA256
`d3bffb7912e180071e859554a7e8a54a73dfbcafbfda4906a96b260bc940c165`); both
verified byte-for-byte before this return. Bobby chose the shape of this reply
(question tool, 2026-11-12): **ACK the Edge-only steps, CHANGE the steps that
need Core.**

**No secret is in this file. Nothing here is a connected PASS.** No stable, dev,
provider 28445, command or Live setting was touched. Delivery is not READY.

## 0. Summary

| # | Item (packet §6) | Status | Owner | Next UTC |
| --- | --- | --- | --- | --- |
| 1 | Exact packet ACK, slot, caps, operators | **PARTIAL**: ACK steps 1–5 (Edge-only); CHANGE steps 6–7 (need Core) | Core / Bobby | slot below |
| 2 | Core commit/image/config/route/trust on research-portal | **NOT_READY** (facts stated in §3) | Core + Bobby | 2026-11-13 |
| 3 | Current-policy wire, field-policy hash, mapping, READ grant revision | **NOT_READY** | Bobby (owner policy) + Core | 2026-11-13 |
| 4 | Native identity/acceptance + private manifest | **NOT_READY** | Bobby (protected owner), TS via Edge | 2026-11-13 |
| 5 | Private `{path,sha256}` ready doc + session | **NOT_READY** (only after installed Edge READY) | Core | after Edge READY |
| 6 | Baseline ownership | **ACCEPTED** (division of work only) | Edge runner; Core grant/session/custody/ACK/revoke | — |

## 1. Packet ACK (item 1)

**ACK** (exact bytes, Edge-only; these need no Core input and Core adds no
objection): the release identity, images, source incarnation, catalogue and
rendered configs of §2; Paper-only scope and blast radius of §4; caps
(200 rows / 1 MiB per response, Manager 0.5 CPU / 512 MiB / pool 2, worker
1 CPU / 1 GiB, ≤ 2000 materialised records, M1 off, `absence_authority=false`);
install steps 1–5 of §4 (recheck pins, backup, migrate 18→28, serving decoder,
Manager repoint and route qualification, `rebuild-once` with fresh epoch);
rollback overlap 900 s from actual epoch activation and the rollback procedure.
Pins acknowledged by value:

- shared Rust image `sha256:2b929dff6d31036b6dd94fa8b5d6f941e4e7f662d94c4882921a334009db13d6`
- Manager image `sha256:263db8dd8c940a32833fee1127f72c56675eeb1d2c6b29d5a0215bcec56204ec`
- catalogue `sha256:6d4c4a6505c02f58d32f0be70a3a80c7073dfbd5666ce9a5490fba645c049142` (49 relations / 13 feed bindings)
- source incarnation `sha256:f976491370b16026b2f8fc38368ceb9c1e58abfcf33cfeefab85c186ed208a9e`
- Edge rendered config `edf9f7ee…0d1e`, Manager rendered config `cf826a6e…7462`
- Compose manifest digest `d8d068bf…69ad` (file SHA256 re-checked on Core's copy: matches)

Caveat Core states honestly: ACK here means Core does not object to Edge
installing these bytes. It is **not** a Core claim that the pins are bound into
Core (see §3), and **not** Edge READY.

**CHANGE** for steps 6–7 (Core issues a real grant and session, Edge runs the
runner, then the worker and specimens). They cannot happen in today's
07:15–09:15Z window because Core prerequisites 2–5 are not ready and the
inputs below are owner-prepared. Proposed Core-dependent slot:

- **2026-11-13 07:15–09:15Z.** Core inputs (items 2–4) returned by 2026-11-13
  04:00Z; Edge installed READY (steps 1–5) any time before that, including
  today.
- Steps 1–5 may run today inside the existing window if Edge wants; the 900 s
  rollback overlap then runs from the actual activation. Core does **not**
  require Edge to wait for Core for those steps. If Edge prefers one window,
  move everything to 2026-11-13.

Operators: install/rollback = Edge; revoke of the temporary Core grant/session =
Core via its official path, with a receipt (item 6). Operator names are
Bobby's to supply; Core has no authority to name a person on his behalf.

## 2. Contract gaps found (one return, owner and action each)

| ID | Gap | Evidence | Owner | Action |
| --- | --- | --- | --- | --- |
| G1 | Core does not pin Edge's r2 contract (`81a3c328…`), catalogue `6d4c4a65…` or source incarnation `f9764913…` | searched `apps packages services deploy scripts`: no hit for any of the three prefixes; Core pins only manager pack `manager-v2-paper-read-v1` (owner publication manifest `cd304194…`) | Core | pin r2 after Edge READY by an owner-approved pack lock; no silent re-pin |
| G2 | Core Research runs `retained_review_v1`, not the native review profile | live container env: `EXECUTION_READ_PROFILE=retained_review_v1`, `FEATURE_EXECUTION_EDGE=false`, `FEATURE_EXECUTION_COMMAND_RELAY=false`, `FEATURE_EXECUTION_CURRENT_SOURCE_PAPER=false`, `AUTH_MODE=dev` | Core + Bobby | native activation needs `compose.native-review.yaml`, marker `execution-native.enabled` and owner private materials (§3) |
| G3 | No Core code mentions the `portal.execution.connected-read-ready.v1` receipt | repo search for `connected-read-ready`: no hit | Core | add a producer after item 5 inputs exist; schema must come from R2 §6, no new schema |
| G4 | The field-policy hash is not a static Core value: it is a field of the manager domain (`catalogue_sha256`, `profile_sha256`, `field_policy_sha256`) supplied by the owner's grant | `access.contract.ts` (domain object), `native-core-runtime.ts` | Bobby / TS policy owner | name the approved policy and hash; Core will not mint one |
| G5 | `RESEARCH_NATIVE_*` inputs and secrets dir do not exist | `~/.config/portal-research-preview/execution-native` absent; no marker | Bobby | prepare privately (item 3 of §3); Core never creates the protected owner or the Edge signing key |
| G6 | Real-session TTL and test deadline unspecified | R2 §6 gives no number | Edge | state the deadline (Edge runner uses 30 s per call); Core will mint TTL ≥ deadline + 10 min |
| G7 | Trust window of Research preview expired | prior finding: expired 2026-10-28 | Bobby | needs a new window before any native review activation |
| G8 | Mirror to HK cannot be done from this host | `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/` does not exist on this machine | Edge | copy this file; SHA256 below |

## 3. Items 2–5 in detail

### Item 2 — Core integration on research-portal: NOT_READY

Actual facts (read from the running container, 2026-11-12 07:38Z, no secret):

- Public origin `https://research-portal.primusspark.com`, port 8095 behind nginx.
- control-api image `sha256:d15e8e21bdebacd9c972b9350ef38a7a07509c61a9231f157b898b3c2c78410a`,
  revision label `2e31b74daec809833339a5569f892775b113c5b0`, started 2026-11-11 09:24:30Z.
- Read profile `retained_review_v1`; projection workspace
  `ws_06G19F61YB8CFR7TEWMS7HQ660`; Edge paper profile id `PAPER_BINANCE_USDM`.
- Edge, command relay, current source paper and realtime SSE flags: all false.
- Repo: canonical `docs/research-loop-plan` at `6b28655e0093700736df851dc7efdafd8331dd79`,
  not pushed. Last full gate hook green at `9c39f5010`.
- Not bound to Edge's catalogue or source set (G1). Not an installed native review (G2).

Action: after Bobby prepares the private materials and approves the window,
Core builds and deploys a native-review image, re-pins G1, and returns the
digests. Owner: Core + Bobby. Target: return by 2026-11-13 04:00Z.

### Item 3 — Current policy, field-policy hash, mapping, grant revision: NOT_READY

Core has no policy wire to report: the policy is owner-approved data, not code.
Bobby (policy owner) must name the intended subject, workspace, profile and the
source set (`paper / PAPER_BINANCE_USDM / BINANCE`); TS must name the approved
field-policy hash (G4). Core will not infer rights from workload mTLS/JWT and
will not use fixture authority. Grant revision exists only after the grant is
issued, so it is not available today.

### Item 4 — Native identity/acceptance: NOT_READY

Core will not reuse pre-reset receipts (`608dcbd6…`, `a72b0e8c…`) and will not
create a protected owner. What Core can do once Bobby names the intended
protected owner and workload/human identities: prepare the SDK identity ACK and
the private manifest reference, and list the exact live write and rollback for
Bobby's approval before anything is performed. Source installation stays
TS-owned, through Edge. Owner: Bobby (identity) then Core. Target:
2026-11-13 04:00Z for the prepared ACK and manifest reference.

### Item 5 — Private ready document and session: NOT_READY

Mint only after Edge returns installed READY (actual new epoch UUID, previous
retained UUID `01a05c70-81ec-7380-801d-45c706f937c0`, source/catalogue pins).
Core will return only `{path,sha256}` references to the private
`portal.execution.connected-read-ready.v1` and to the session document, with
TTL ≥ test deadline + 10 min, never values. Nothing exists today.

## 4. Item 6 — baseline ownership: ACCEPTED

Edge runs `connected_read.py` (limit 5, 1 MiB, deadline 30 s, `probe_stream=false`).
Core owns: grant and session, producer and custody references, source→Core ACK
correlation, temporary revoke and cleanup receipt. Core will not run a duplicate
specimen. READ does not imply STREAM: `stream_authorized` stays false.
Empty data is reported as empty; no nonempty or multipage R03 PASS from old
counts, fixtures or HTTP 200.

## 5. Things Core is not doing

- Not asking Edge to wait for A2/B2, event/history, P22 or STREAM.
- Not claiming connected PASS, R02, R03 or recovery.
- Not touching TS DB, issuer, Source Proxy, stable/dev, provider 28445,
  Sandbox/Live or command relay.

## 6. What Bobby has to provide (owner list)

1. The protected owner and identities (item 4) and the approved policy and
   field-policy hash (item 3).
2. Private materials for native review: Edge signing key, CA, client cert and
   key, `runtime.json`, pinned `runtime.env` (0600), workspace id, Edge origin.
3. A new trust window for Research (G7).
4. Approval of the slot 2026-11-13 07:15–09:15Z (or a different one) and names
   of the install/rollback operators.

## 7. Integrity

Mirror target on HK: `upgrade/evidence/execution-edge-v1_2/EPG10-08/CORE_TO_EDGE_M0_R2_READ_BINDING_20261112.md`.
Core's SHA256 is recorded in `CORE_TO_EDGE_M0_R2_READ_BINDING_20261112.sha256`
next to this file; Edge verifies on arrival.
