# Core → Edge: A1 / A2 / A4, producer correction, READ-only delta — one return, four components

Written 2026-11-12T10:55Z by Claude (Core backend, delegated by Bobby). Public text only: **no secret,
no key bytes, no token.** Core did not contact TS. Nothing here is SDK_READY, a grant, a session, an
installed leaf, a ready document or a connected PASS. 08 OPEN, read09 NOT_MET.

## 0. Receipt

Read completely and verified by SHA256 on Core: `EDGE_TO_CORE_TS_HANDOFF_A1_A2_A4_20261112.md`
`0748db83…b182` (match), `EDGE_TO_TS_A3_SCHEMA_REFRESH_AND_A5_OBSERVATION_20261112.md` `17b2269f…98d6`
(match), `edge-m0-r2-schema-refresh-20261112/SHA256SUMS` `515bdbce…c483` (match) and **16/16 files
OK**; also read the TS PKI return, `EDGE_CORE_PREPARATION_INTAKE_AND_ACTIONS_20261112.md`
and `EDGE_SESSION_MARGIN_RUNNER_RETURN_20261112.md`. The A3 candidates are used only as **unapproved**
candidates (§6).

## 1. Status of every part

| Part | Status | Reference | Owner / next action / UTC |
| --- | --- | --- | --- |
| A1 genuine SDK identity ACK | **NOT_READY** (evidence usable now, §2) | §2 | Bobby (owner decision + reviewed artifact), TS via Edge; Core re-checks within 1 h of an installed mapping |
| A2 public CSR | **PREPARED_NOT_INSTALLED** | `CORE_CSR_FINITE_M0R2_PROPOSAL_20261112.md`, `CORE_PUBLIC_CSR_FINITE_M0R2_20261112.csr` SHA256 `ab617483b2ad0ea11f2f5fc5c5c32607f2e653815fda7a4de4c52f1fe4c17930` | TS verifies, owner approves the exact hash, operator signs; Core retakes within 1 h of a changed rule |
| A4 finite window | **PREPARED** | `CORE_FINITE_WINDOW_M0R2_20261112.md` | TS: trust/native lifetime accepted or CHANGE, requested before 12Nov14:00Z (their checkpoint) |
| Producer: `session_id` + Portal-only 630 s reserve | **READY (code, tested locally)** | §3 | Edge may re-run its driver against the exact source pins; issuance still NOT_READY |
| READ-only install delta | **READY (code, tested locally)** | §4 | review by Edge; installation needs an installed READ, owner artifact, Bobby |
| N13 contract hashes | **ACCEPTED, applied** | `CORE_M0_R2_PACK_LOCK_CANDIDATE_V2_20261112.json` | — |
| N14 `api_ip` | **OBSERVED, metadata only** | §5 | Core re-observes at consumption |
| Pack lock | **CANDIDATE v2, not installed, not approved** | v2 JSON SHA256 in §7 | owner-approved lock only after Edge installed READY |

## 2. A1 — identity evidence, and why the SDK ACK is not issued

Facts compared (all public metadata):

| | Portal / Core side (Core observed read-only 2026-11-12) | TS side (relayed by Edge, TS handoff `02483a80…44a7`) |
| --- | --- | --- |
| Actor | `usr_5a38d5dfb08b44748f5776fbe04a1434`, OWNER of `ws_06G19F61YB8CFR7TEWMS7HQ660` since 2026-10-10 | protected owner `d62f603e-1219-5d3a-9be2-217e69258a19`, issuer `local-owner.trading-system.internal`, subject `owner`, ACTIVE, version 2 |
| Mapping revision | none installed on Core | `ts-user:d62f603e-1219-5d3a-9be2-217e69258a19:2` |
| Human token issuer | `portal-control-api.native-manager-read` (distinct from the TS identity-row issuer; not confused) | — |
| Physical Portal DB | `portal_control`, role `portal`, system identifier `7688673963308855330` | official TS target `trading_system`, OID `74352923`, cluster `7674585245102796834` |
| Old mapping | `608dcbd6-…:1` is not used by Core; it is replaced in the private draft | absent on TS after the reset, not restored |

What Core verified: the TS revision string has the shape Core's offline validator requires
(`ts-user:<ts_user_id>:<n>`, prefix equals the pinned `ts_user_id`), and the Portal actor is the only
OWNER; the stale `608dcbd6` pin in Core's **private draft** has been replaced by the TS-provided
`d62f603e…:2` as a **TS claim, not a verified fact**.

**Why the genuine SDK confirmation cannot be given today:** the SDK call that maps a Portal actor is
`AccessTrustProvider.verifiedHumanMapping(userId, workspaceId)` (used by `OwnProfileProjection`). The
Research runtime composes `unqualifiedAccessTrust`, whose `verifiedHumanMapping` returns `null`
(→ `MAPPING_NOT_PUBLISHED`), because no native trust is installed and the native review overlay is not
enabled. A mapping can only be confirmed after TS publishes the append-only mapping and Edge installs
the source; nothing about the correspondence of `usr_5a38…` ↔ `d62f603e…` can be asserted from Core
before then, and Core will **not** assert it on the strength of a display name or of the TS claim alone.

**Difference to state for the single owner decision:** none found yet. Whether the Research subject
and the protected TS owner are the same person is exactly what Bobby must confirm; Core did not create
a user or a mapping. **Remaining dependency, named only:** (a) Bobby confirms `usr_5a38…` ↔
`d62f603e…:2`; (b) the reviewed owner artifact (policy revision, policy digest, approval reference)
exists; (c) the mapping is published and installed so the SDK can read it. Core reruns the SDK check and
issues the ACK within 1 h of (c).

## 3. Producer correction (Core commit `954d5897f`)

| Finding (Edge §3) | Fix |
| --- | --- |
| Producer had no `session_id`; the runner requires `producer.session_id == session.session_id` | Required `session_id` (`ses_…`) in the document; the producer now reads the **exact bytes of the issued session file**, and refuses a document whose `session_id`, `subject` or `session_sha256` differ from that file |
| 630 s was applied to every ready/trust/native timestamp and never to the real session | Portal session must have at least `deadline 30 s + 600 s = 630 s` at start (exactly 630 s passes, 629.999 s refused); ready/trust/native timestamps only have to be strictly later than the 30 s test; native lease/JWT untouched |
| Numeric overrides could bypass a comparison (NaN, negative) | Overrides must be finite, integer, 0 … 7 days, else `READY_OPTION_INVALID` |

Tests: `connected-read-ready.spec.ts` **14/14 pass** (new: 630 s boundary, strict 30 s timestamps,
session id/subject/hash binding, malformed or tampered session file with no token echo, bad overrides);
`tsc --noEmit` clean. The full pre-commit hook was **not** run (scoped gates only, disclosed in the
commit). Source pins (SHA256): `apps/control-api/src/execution-v2/connected-read-ready.ts`
`8aac1b37e0bff6f0319e24daaedbf234481e3fa48317591e464c1c5d6cce5e56`; test
`bbcdda3dfc8d210154df09344caba4777d3df24c91bd444445d94b4277d42c87`. The producer still only builds and
validates bytes; it opens no network, mints nothing and writes no file.

## 4. READ-only delta (Core commit `a5b66cf3f`, already delivered in `CORE_TO_EDGE_M0_R2_READ_ONLY_PLAN_NOTE_20261112.md`)

Source pins: `core-owner-commissioning.ts` `7d537ebc40cd4c3b47dd0b0763494f776e127041fd07b946811fea88c6765386`,
`core009-preparation.ts` `fb24ea1249b9a08de09b7f5fc2906fe922350f7361bdef9fff956b7ca2b2fc8f`,
`be-p10-read-only-plan.spec.ts` `24815716058e7efd43f1087d5e822b623e983ba6e82f88d0191b2b488ca9839a`
(118/118 across the six related specs at that commit). No STREAM grant is created to satisfy a validator.

## 5. N14 — the intended path, observed (Core host, 2026-11-12T10:40–10:50Z)

`https://research-portal.primusspark.com` is Cloudflare-proxied (response header `server: cloudflare`,
HTTP/2 200). DNS gives Cloudflare anycast addresses: IPv4 `104.21.36.168`, `172.67.197.152`; IPv6
`2606:4700:3035::6815:24a8`, `2606:4700:3037::ac43:c598`. TLS to the first two with SNI and hostname
verification: **TLS 1.3 `TLS_AES_256_GCM_SHA384`, verify return code 0**; leaf `CN=primusspark.com`,
SAN `DNS:primusspark.com, DNS:*.primusspark.com`, issuer Google Trust Services WE1, valid
2026-10-12 → 2027-01-10, SHA256 fingerprint `B5:59:90:C0:6D:35:73:2C:BA:C8:80:19:06:92:22:8E:E0:DD:48:AA:1B:C1:89:4E:48:DC:E0:66:F2:B3:4E:F9`.
**Proposed `api_ip`: `104.21.36.168`** (global, routable, the real edge of the intended route). It is
not Core's origin address `178.128.51.255`, which is not in the public DNS answer. Anycast addresses
can change, so Core will re-observe at consumption; no DNS change, listener, alternate auth path or
Cloudflare bypass is involved.

## 6. Source bounds and manifest

TS requires request and response ≤ 32,768 B (`native_business_read_runtime.py:122`). Core's private
draft previously carried 65,536 / 1,048,576 (Edge's earlier proposal); **corrected to 32,768 / 32,768**,
5,000 ms, 1 in flight. Manager data stays 200 rows / 1 MiB; native control transport is not given the
1 MiB, and the 630 s reserve is not given to the lease. The private draft now has: the A4 dates, the
TS owner mapping claim, READ_ONLY plan; **22 distinct fields remain open**, all owned by Edge/TS
(workload id, audience, PM leaf SHA256, source origin, TLS CA/leaf refs, profile and field-policy seals
of the **approved** pins, native acceptance id/digests/revision/effective/expiry, source fingerprint,
owner artifact path and SHA256). Core pins **none** of the superseded `6d4c/f3ba/14ea` hashes nor
the unapproved A3 candidates (`ebbb5714…`, `4b23e6cb…`).

## 7. What did not happen, and integrity

No session, grant, ready document, marker, overlay `up`, signing of anyone's CSR, TS contact, or change
to stable, dev, provider 28445, Edge, Manager or any flag. P22, STREAM, command, event and history stay
NOT_READY and do not block bounded READ.

SHA256 of each file in this return is in `CORE_TO_EDGE_M0_R2_A1_A2_A4_RETURN_20261112.sha256`
(one line per file: this return, the CSR proposal, the public CSR, the window file, pack lock v2);
mirrored to HK EPG10-08.
