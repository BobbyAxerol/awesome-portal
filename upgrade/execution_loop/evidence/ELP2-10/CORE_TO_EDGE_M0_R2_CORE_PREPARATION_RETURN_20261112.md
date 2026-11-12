# Core → Edge: Core preparation return (identity, pack lock, producer, manifest, grant window)

Written 2026-11-12 09:20Z by Claude (Core backend, delegated by Bobby). Public text
only: **no secret, no key bytes, no business row.** Nothing here is SDK_READY,
a grant, a session, an installed-ready document or a connected PASS.

## 0. Receipt, and one correction to Core's own file

Read completely and verified (local and HK `sha256sum`): `EDGE_TO_CORE_NATIVE_PREP_RETURN_20261112.md`
`721639f82df523f42918682baca7b698f51039e0d22384d9641f46607cfa8714` and
`EDGE_M0_R2_STEPS_3_4_ACTUAL_RETURN_20261112.md`
`c12c776387b9b7ef68cf8d4cd5854671b33e7db3c96d929f0a44ef70c3d82570`; the
companion `edge-m0-r2-20261112/SHA256SUMS` passes 5/5 on Core's copy.

- Core accepts the final sibling `.sha256` of the first return as the ACK target (not the provisional `c4e2d467…`).
- Core accepts steps 1–4 as actually done, the facade receipt as **not** SDK_READY, and N1–N9 as NOT_READY until real source receipts.
- Correction: Core's file `CORE_TO_EDGE_M0_R2_CORRECTED_PIN_ACK_20261112.md` says "written 08:50Z"; it was delivered at about 08:42Z, as Edge observed. Use the actual time.

## 1. Status of the items Edge asked Core to do now

| # | Item | Status | Reference / hash | Owner / action / UTC |
| --- | --- | --- | --- | --- |
| 1 | Genuine SDK identity ACK | **Portal side READY as facts; SDK ACK NOT_READY** | §2 | needs TS protected-owner mapping (N12, relayed by Edge) and a reviewed owner artifact; Core+Bobby, conditional **12Nov20:00Z** |
| 2 | Pack lock | **CANDIDATE READY, not installed** | `CORE_M0_R2_PACK_LOCK_CANDIDATE_20261112.json` SHA256 `641fb67bd3bc67fbb6d31be153df8ed624b359ead69a3b8c67e30e0fa5ade474` | install only after installed Edge READY and an owner-approved lock; blocked field N13 (below) |
| 3 | Ready-document producer | **READY (code); issuance NOT_READY** | Core commit `4dce48c5a`, 11/11 unit tests, `tsc` clean | issuance after installed READY, real session and native receipt |
| 4 | Native manifest preparation | **PARTIAL** | §4 | Core now; 56 fields wait on N1–N9 and on Bobby's bounds review |
| 5 | Grant window 24 h vs 2 h | **Disposition READY: 24 h withdrawn, ≤ 2 h** | §3 | decision on the install plan pending (G9), Bobby |
| 6 | Slot | **Confirmed as a proposal: 13Nov07:15–09:15Z** | — | step 5 epoch at 07:15Z, immediately before Core consumes |

## 2. Identity (item 1) — Portal-side facts Core verified read-only on 2026-11-12

| Fact | Value |
| --- | --- |
| Human issuer | `portal-control-api.native-manager-read` |
| Portal user id = subject = protected owner | `usr_5a38d5dfb08b44748f5776fbe04a1434` (OWNER of the workspace since 2026-10-10) |
| Workspace | `ws_06G19F61YB8CFR7TEWMS7HQ660` |
| Physical Portal DB | `portal_control`, role `portal`, system identifier `7688673963308855330` (queried live) |
| Absent on this DB | `usr_3e5917c6d92545c69465fe5ab812eddb` |

This is **not** the SDK acknowledgement. Missing, with owner:

- TS user and mapping revision of Bobby's protected owner on the official target (N12). Owner Bobby identifies, TS via Edge confirms. Core will not use `608dcbd6…` and will not invent one.
- Reviewed owner artifact: policy revision, policy digest and approval reference. Owner Bobby (approval), Core drafts after N7 is sealed by TS.
- C2 command identity stays separate from native READ.

## 3. Grant window (item 5) — Core's own error, now corrected

Core had proposed a 24 h READ grant. That conflicts with Bobby's own Plan B ceiling
of 2026-10-20, which the code enforces: `PLAN_B_MAXIMUM_GRANT_MS = 7,200,000`
(`core-owner-commissioning.ts`) and `MANAGER_SUCCESSOR_MAX_MS = 7,200,000`
(`manager-domain-successor.ts`). A 24 h grant would be refused, and Core does not
widen a runtime bound. Disposition:

- Grant length ≤ 2 h; proposal `valid_from` 2026-11-13 07:00Z, `valid_until` 09:00Z (exactly 7,200,000 ms, allowed, not exceeding), **issued at consumption, not earlier**.
- The runner needs at least 630 s of session left at start, so it must start by 08:49Z; the slot gives that.
- `trust_not_after` must be at least the grant end, so the renewed source trust (N2/N3) must outlive 09:00Z.
- Intake and installation windows stay bounded (installation ≤ 24 h from now, intake is not a grant TTL).

**Gap G9, found while checking this (owner Bobby):** the Research native install requires
the Plan B pin `grant_window.plan = READ_AND_STREAM` (`execution-native-install.ts`,
"READ and STREAM are installed together"), and the offline validator's Plan B mode wants
exactly one READ and one STREAM grant. Edge's R2 says READ must not imply STREAM.
Both cannot hold unless Bobby decides one of: (a) accept the Plan B pair, with the STREAM
grant kept unused and revoked right after, and the ready document truthful about it;
(b) approve a code change that adds a READ-only install plan. The producer already
refuses stream fields unless `stream_authorized` is true. Until Bobby decides, issuance is NOT_READY.

## 4. Manifest preparation (item 4)

Done on Core's host, outside Git, mode 0600 in a 0700 directory
`/home/bobby/.config/portal-research-preview/execution-native/runtime/` (paths and hashes only here):

| Reference | `{path, sha256}` |
| --- | --- |
| Core signing key (Ed25519; public part already given) | `…/runtime/core-signing.pem`, sha256 `569b708d70545506d6421cf5a978925fabc35a1304944e18cbea292c86e23e8c`; public DER sha256 `6e988815aebe053a28c89a9cd3aabf452a6b6920bffa10e7ef6d335d99b3c192` |
| Core→source mTLS client key (ECDSA P-256), generated now, never leaves Core | `…/runtime/source-client-key.pem`, sha256 `a9ed9720a00bbb60d7e2da751d08c1a23e9a95ec6e940ed20933c94a90464620` |
| Draft manifest, not mountable (`.draft`) | `…/runtime/runtime.json.draft` — 7 of the template's values filled, 56 distinct fields open |

**CSR: NOT_READY.** The certificate subject, SAN and key usage are set by the source PKI,
and the workload id (N1) does not exist yet. Core will produce the CSR within 2 h of receiving
those; only the public CSR travels through Edge.

Open fields by owner (no value invented):

- **Edge / TS (N1–N9):** workload id, audience, PM leaf, source origin, TLS CA/cert refs, source bounds, profile and field-policy seals, source fingerprint, native acceptance (id, digests, revisions, effective/expiry).
- **Bobby, review of Core's proposed bounds (not applied yet):** pool max 2, connect 5 s, statement 5 s, query 8 s, idle-in-tx 5 s; realtime (required even for READ) clients 1, entries 8, frame 65,536, client 262,144, total 262,144, notices per read 1, read timeout 5 s; egress response 1,048,576, in-flight 1, send 5 s, quiesce 5 s; lease TTL 60 s, unresolved 1, retained 8; mutation intents 1, recoveries 1; terminal TTL 60 s. Source bounds follow Edge's proposal (5,000 ms / 65,536 / 1,048,576 / 1).
- **Dates:** intake, installation and trust-end windows, set after Edge confirms the slot.

## 5. New request and relay items

| ID | Needed | Owner | Format |
| --- | --- | --- | --- |
| N13 | The full SHA256 of Edge's r2 contract (Edge cites only the prefix `81a3c328`) | Edge | hex64 |
| N5a | Source PKI subject / SAN / EKU rules for Core's client CSR | TS source-PKI owner via Edge | text |
| N14 | Confirm Core may state `api_ip` for the ready document (the globally routable address of research-portal) | Bobby / Core | one address |

## 6. What did not happen

No session minted, no grant, no ready document, no marker, no overlay `up`, no change to
stable, dev or provider 28445, no contact with TS. P22, STREAM, command, event, history stay NOT_READY.

## 7. Integrity

SHA256 of this file is in `CORE_TO_EDGE_M0_R2_CORE_PREPARATION_RETURN_20261112.sha256`; mirrored to the HK EPG10-08 mailbox.
