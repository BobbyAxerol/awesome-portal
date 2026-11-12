# Core public CSR for the finite M0 r2 READ candidate (A2) — PREPARED_NOT_INSTALLED

Prepared 2026-11-12T10:48Z (the TS PKI rules reached Core at 10:05Z, so the 2 h turnaround is met with
about 1 h 17 min used). Public bytes only. **A proposed CSR name is not an approved workload, a
grant, an installed leaf or a connected PASS.**

| Item | Value |
| --- | --- |
| Public CSR file | `CORE_PUBLIC_CSR_FINITE_M0R2_20261112.csr` (PEM, 664 bytes) |
| CSR SHA256 (file bytes) | `ab617483b2ad0ea11f2f5fc5c5c32607f2e653815fda7a4de4c52f1fe4c17930` |
| Public key | ECDSA P-256 (prime256v1); SPKI DER SHA256 `e32c21ac941e51f8b04bc9ff62b30c5e38f717346aede19262fecc284be8bae2` |
| Signature | ecdsa-with-SHA256; self-signature verified (`openssl req -verify` OK) |
| Subject | `CN=portal-control-api.native-manager-read.finite-m0r2-20261113` |
| SAN | exactly one URI: `spiffe://primusspark/portal/native-manager-read/core/finite/epg10-08-read09-m0r2-20261113` |
| Basic constraints | `CA:FALSE` (critical) |
| Key usage | `digitalSignature` only (critical) |
| Extended key usage | `clientAuth` only |
| Private key | stays on Core SGP, 0600, directory 0700, outside Git; sha256 of the key file is already in Core's private draft; no key byte, token or runtime.env is in this mailbox |

Differences from the existing global leaf on 28445 (`CN=portal-control-api.native-manager-read.v1`,
URI `.../core`, SPKI `9fb20852…`): new name, new key, finite candidate; **that leaf is not touched,
replaced or re-issued.**

**Requested validity (finite window plus margin, not the 6-month default):**
`notBefore` no earlier than 2026-11-13T06:30:00Z; `notAfter` 2026-11-13T10:00:00Z (grant ends 09:15Z, so
the client leaf outlives the last possible read by 45 min). Core accepts a shorter `notAfter` only if it
is still later than 09:15Z; a leaf that expires earlier cannot serve the slot.

**Workload correlation:** the SAN names the candidate; the PM `workload_id`, audience and listener
origin do not exist yet (N1/N3) and stay **NOT_READY**. Core will not put any of them in the CSR. When TS
mints the workload id, the same string is placed in `selected_source.pins.workload_id` and
`expected_workload_id` of the private manifest; the CSR does not need to change.

**Next:** TS verifies the CSR fields above and asks the owner to approve the exact CSR SHA256; the host
operator signs with the approved finite CA (TS recommends a new finite-candidate CA, CA choice is the
owner's). Core installs the returned leaf next to its key and records its fingerprint and expiry. If TS
requires a different subject or SAN, send the exact rule and Core regenerates within 1 h; the key is
reused, so only the CSR hash changes.
