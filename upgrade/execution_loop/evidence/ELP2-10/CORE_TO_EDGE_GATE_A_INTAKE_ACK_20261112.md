# Core → Edge (for TS): gate (a) pre-install intake ACK — READY

Written 2026-11-12T12:40Z by Claude (Core backend, delegated by Bobby). Public text only: hashes and references, no key,
no token, no private file bytes. This is **gate (a)**, the pre-install intake ACK. It is **not** the genuine post-trust SDK ACK (gate c),
not a native acceptance, not a subject mapping, not a grant or session, and not a connected PASS. 08 OPEN, read09 NOT_MET.

## 1. What is acknowledged

| Item | Value |
| --- | --- |
| Reviewed owner artifact | private file (Core host, mode 0600, compact JSON, 2,655 bytes), plan `READ_ONLY` |
| **Owner artifact SHA256** | `191d5a09bfd577347dc5689df6c6afade4033bfc3fe1a44c7840358ca2fee761` (recomputed by Core's validator) |
| Policy revision | `policy-m0r2-read-20261113-01` |
| Policy digest | `sha256:fa81b92b5b25093b5d3287cf41ce770671e942b849a6b0c8140b2a4b14ca94b9` = SHA256 of `POLICY_REVIEW_M0R2_READ_20261113.md` |
| Approval reference | `OWNER_APPROVAL_M0R2_READ_20261113.md#sha256:5ba5ab62aea3ce44ce8eab6b8698209ff052e33807b442425e90c4864d284018`; Bobby approved the review in session on 2026-11-12 ("Duyệt đúng tài liệu này") |
| Provenance reference | the policy review above, reviewed by the owner in that approval file |
| Grant | one `business.read_all` ALLOW, id `grant-m0r2-read-20261113-01`, revision `rev-1`, `usr_5a38d5dfb08b44748f5776fbe04a1434`, paper, `PAPER_BINANCE_USDM`, `ws_06G19F61YB8CFR7TEWMS7HQ660`; `valid_from` 2026-11-13T07:15:00Z (`1794554100000`), `valid_until` 09:15:00Z (`1794561300000`) = exactly 7,200,000 ms |
| Domain seals in artifact and in the manifest | catalogue `aac7f93e…b353`, profile `c8fb4344…d7aa`, field policy `bee80b18…f7dbc` (TS-ACCEPTED tuple); no unapproved or superseded digest |
| STREAM / DENY / root grants | none / none / none |

## 2. Evidence

Core's own offline inspector (`inspectCore009Preparation`, plan `read-only`) on these exact artifact bytes, with a throw-away manifest whose not-yet-known
fields held format-valid TEST values, at the intended install instant 2026-11-13T07:20Z: **ok, 0 errors**; 1 READ ALLOW, 0 STREAM, 0 DENY; one warning
`GRANT_ENDS_BEFORE_INSTALLATION_SCOPE` (scope to 10:00Z, grant to 09:15Z, harmless). Copies deleted. It proves shape, pins and windows, not truth of the open fields.
The manifest draft now carries this artifact SHA256; the artifact path stays open, because the installer needs a root-owned 0600 file in a root-owned
directory, which Core places at install time under the Core agent's operator role.

## 3. What gate (a) now permits and what it does not

Permits, per TS's table, together with the owner's Q1 record held by TS: gate (b) exact-hash approval of the pre-install envelope (signing run for CSR `ab617483…7930`,
re-grant SQL, intake record, listener runtime config) and the steps it gates. Core did not receive or verify Q1 itself; it relies on TS's record of it.
Does **not** permit: the native acceptance append (needs (c) and (d)); any business read; any session or grant issuance by Core, which waits for installed Edge READY and
the acceptance; any epoch before 13Nov07:15Z.

## 4. Still open (unchanged owners)

Manifest: 20 fields (human audience, workload id, source origin, PM leaf SHA256, TLS CA and client leaf path+SHA256, source fingerprint, owner artifact path,
subject TS user and mapping revision, eight native-acceptance fields). Question to TS for gate (d), repeated from the previous return §5: which exact manifest bytes (d)
approves, given the native fields exist only after the append. Core needs it before 13Nov04:00Z.

SHA256 in `CORE_TO_EDGE_GATE_A_INTAKE_ACK_20261112.sha256` (this ACK and the owner approval record); mirrored to HK EPG10-08.
