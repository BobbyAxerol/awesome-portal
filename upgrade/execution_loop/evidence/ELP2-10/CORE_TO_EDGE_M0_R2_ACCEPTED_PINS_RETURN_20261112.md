# Core → Edge (for TS): accepted pins applied, owner artifact prepared, windows accepted, one correction of Core's own

Written 2026-11-12T12:50Z by Claude (Core backend, delegated by Bobby). Public text only: no secret, no key
bytes, no token. Core did not contact TS. Nothing here is SDK_READY, a grant, a session, a signature, an installed
leaf, a native acceptance or a connected PASS. 08 OPEN, read09 NOT_MET.

## 0. Receipt

Verified by SHA256 on Core, sibling `.sha256` files OK: prompt `009f2ecf…d80e`; TS finite-CA decision `06a16920…3abc`;
TS A3 option A return `26bd60e0…0727`; Edge staged pins `9fbc1045…d789bd475`; parent-scope bundle `SHA256SUMS`
`0e8cb95e…d271`, **17/17 files OK**. Read completely. The CA question is closed; Core asks nothing more about it.

## 1. Status of every item

| # | Item | Status | Reference | Owner / next action / UTC |
| --- | --- | --- | --- | --- |
| 1 | Pack lock refreshed to approved BINANCE tuple and staged source | **PREPARED_NOT_INSTALLED** | `CORE_M0_R2_PACK_LOCK_CANDIDATE_V3_20261112.json` | install only after installed Edge READY and an owner-approved lock |
| 1b | Private manifest draft refreshed | **PREPARED_NOT_INSTALLED** | catalogue `aac7f93e…b353`, profile `c8fb4344…d7aa`, field policy `bee80b18…f7dbc` now in both selector and pins; **21 distinct fields still open** (§5) | Edge/TS for the 21, Core for none |
| 2 | Owner-artifact reference and hash | **PREPARED (private draft); final hash NOT_READY** | policy review `POLICY_REVIEW_M0R2_READ_20261113.md`, SHA256 `fa81b92b5b25093b5d3287cf41ce770671e942b849a6b0c8140b2a4b14ca94b9` = policy digest; policy revision `policy-m0r2-read-20261113-01`; grant `grant-m0r2-read-20261113-01` / `rev-1` | Bobby approves the review; the artifact's own SHA256 exists only after `approval_ref` and `provenance_ref` are filled |
| 3 | Pre-install intake ACK, gate (a) | **NOT_READY, one input away** | needs the owner's written approval of the review above | Bobby, requested now; Core issues the ACK the same hour it exists, target before 12Nov20:00Z |
| 4 | Windows | **ACCEPT** | §3 | — |
| 5 | Public key, audience | **READY (key); NOT_READY (human audience)** | §4 | audience from the TS listener composition, owner TS via Edge |
| 6 | CA | **CLOSED**, recorded once | §2 | — |
| 7 | Identity recognition | **Condition applied, flagged to Bobby** | §2 | Bobby may object; otherwise stands |
| 8 | Genuine SDK ACK, gate (c) | **NOT_READY** by design | after the identity COMMIT | Core within 1 h of the identity COMMIT |

## 2. Decisions recorded once

- **CA:** the finite CA of TS's file `06a16920…` stands: CSR `ab617483…7930` unchanged, leaves `06:30–10:00Z`, key destroyed after two leaves, v1 and 28445 untouched, later validity changes are a parameter change. Core's earlier request for a 3-year retained-key CA (`ace22684…2eea` §4) is **withdrawn**. The operator split stands: TS-host signing, role, listener and rollback by the coordinator; install and rollback on the SGP side by the Core agent. (This is later than, and replaces, what Bobby told Core an hour earlier; Core has told him so.)
- **Recognition:** TS returned display name `Bobby (local owner)`, subject `owner`, issuer `local-owner.trading-system.internal`, ACTIVE, version 2. Bobby's condition was "if the display name is bobby, it is me". Core applies it: the name is Bobby's, with the suffix `(local owner)`; the exact string differs from the bare word and Core says so openly. This identifies only the **protected TS owner**. It is not the subject mapping and not an SDK ACK.
- **Correction of Core's own earlier work:** the private draft had pinned `d62f603e…:2` as the *subject* (`pins.human`) mapping. TS shows that is the protected owner, not the Portal human mapping. Fixed: `native.owner_mapping_revision` = `ts-user:d62f603e-1219-5d3a-9be2-217e69258a19:2`; `pins.human.ts_user_id` and `mapping_revision` are **open again** until the genuine identity step creates `ts-user:<new uuid>:1`. Core's A1/A2/A4 return §2 said the opposite and is corrected here.
- **Gate order accepted as TS states it:** (a) and (b) before trust/leaves/re-grant/listener/identity COMMIT; (c) and (d) before the native acceptance only. Core's SDK ACK is (c) and is not asked for before the listener exists.

## 3. Windows (ACCEPT; no earlier slot reused; no JWT/lease extension; no epoch before actual 07:15Z)

All on 2026-11-13, all in the future of this file: trust/identity intake 06:40–07:05Z; native acceptance before 07:10Z; leaves
06:30–10:00Z; **Core owner-artifact intake 07:10–07:50Z** (a Core-side installer window, distinct from TS intake; the native acceptance must
already exist); single READ grant **07:15:00Z–09:15:00Z** (`1794554100000`–`1794561300000`, exactly 7,200,000 ms); revoke about 09:20Z;
native 60 s JWT/lease and the 630 s real Portal-session reserve unchanged.

## 4. Keys and audience

Public key id `research-core-20261112-6e988815aebe`, public DER SHA256
`6e988815aebe053a28c89a9cd3aabf452a6b6920bffa10e7ef6d335d99b3c192`: **confirmed as intended**; one Ed25519 key referenced by both the human
and the terminal block of the private manifest (checked in the draft just now); no private bytes leave Core. Terminal audience in the draft:
`trading-system.native-business-read-terminal`. **Human audience: NOT_READY**, it is the PM audience of the TS listener composition; Core will not
invent it. Workload id, source origin, PM leaf SHA256 and the TLS CA and client leaf references also come from that composition.

## 5. Evidence for the owner artifact, and a question Core cannot resolve

Offline only: Core ran its own `inspectCore009Preparation` on throw-away copies of the manifest and the artifact in which the 23 not-yet-known fields held
format-valid TEST values, at the intended install instant 2026-11-13T07:20Z: **ok, 0 errors**, plan READ_ONLY, one READ ALLOW grant, zero STREAM, zero DENY;
one warning `GRANT_ENDS_BEFORE_INSTALLATION_SCOPE` (installation scope ends 10:00Z, grant 09:15Z; harmless overhang, Core may tighten it);
remaining at 07:20Z: installation 9,600 s, owner intake 1,800 s, grant 6,900 s. The same run showed the real files must be **compact** JSON (`JSON.stringify` form),
which the assembly step will produce. The copies were deleted; no TEST value is in any real file. This proves shape and windows, not truth.

The 21 open manifest fields: human audience, workload id, source origin, PM leaf SHA256, TLS CA path+SHA256, TLS client leaf path+SHA256, source fingerprint,
subject TS user and mapping revision, owner artifact path and SHA256, and the eight native-acceptance fields (revision, receipt id, receipt digest, document digest, policy
revision, semantic revision, effective_from, expires_at). The artifact adds two Core-owned ones: `approval_ref` and `provenance_ref`.

**Question to TS via Edge (gate d):** the manifest the owner approves at (d) "gates only the native acceptance append", yet that manifest must contain the
acceptance's own fields (revision, receipt id, digests, effective/expires), which exist only after the append. Which exact bytes does (d) approve: the manifest
without the eight native fields, with Core filling them mechanically from the receipt afterwards, or a manifest whose native fields TS fixes before the append? Core will
implement either, but needs the choice stated before 13Nov04:00Z.

## 6. Source of the staged Manager incarnation

`sha256:ec90a9e5…d7c43f` is recorded in pack lock v3 as STAGED only. It is not copied into `source_fingerprint` (N8); that field stays open until the real native observer returns.

## 7. What did not happen; integrity

No session, grant, ready document, signature, native acceptance, marker, overlay up, epoch, TS contact, or change to stable, dev, provider 28445, Edge or any flag.
SHA256 of each file of this return: `CORE_TO_EDGE_M0_R2_ACCEPTED_PINS_RETURN_20261112.sha256` (this return, pack lock v3, policy review); mirrored to HK EPG10-08.
