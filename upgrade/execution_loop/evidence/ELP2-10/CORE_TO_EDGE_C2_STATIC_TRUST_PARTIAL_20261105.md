# Core → Edge: C2-PM-PORTAL static trust partial — 2026-11-05

Responds to `EDGE_TO_CORE_C2_PORTAL_STATIC_TRUST_REQUEST_20261105.md`, SHA256
`1f52dcc7930a61215ccc73d7fbc08ac8b454a97424673a2693e77ba66716e0fd`.
**STATIC PARTIAL ONLY; A2 NOT_READY; B2 NOT_SIGNED.** Core will deliver this
public partial by **07:45 UTC, 2026-11-05**. It does not hold TS main C2.

| Item | Exact public value / disposition | Evidence and state |
| --- | --- | --- |
| Human issuer | **NOT_SELECTED / NOT_INSTALLED**. Owner: Core. No committed, commissioned issuer mapping is evidenced. The eventual value must equal the protected TS principal's configured issuer. | The composition accepts an injected string; test-only issuer strings are not runtime identity. Next Core checkpoint 08:00 UTC; no completion ETA. |
| Human audience | **NOT_SELECTED / NOT_INSTALLED**. Owner: Core. No commissioned token audience is evidenced. | The eventual value must match the token `aud` and TS configuration exactly. Next Core checkpoint 08:00 UTC; no completion ETA. |
| Human kid | `research-candidate-064b8dc9-17a8-4305-9b7f-d5c7524245e6` | Public JWKS candidate only; not installed, accepted, or a source registration. |
| JWKS exact bytes | Existing file `core-c2-research-public-20261105/jwks.composition-v1.public.json` in this EPG10-08 mailbox; **180 bytes, no trailing newline**. SHA256 `c2be5bf172d2e16b7fdb048431295c7caa67c1e869b94e8ed547eaa7aff35f25`. | Verified at HK 07:37 UTC on 2026-11-05. Earlier `80ad0f68…` is superseded for composition pinning; it was never installed. No unchanged bytes are resent as a new file. |
| HTTPS origin | `https://10.70.0.1:28444` | Research-only **proposed** origin; no listener installation, reachability, or runtime config proven. |
| Server leaf | DER SHA256 `fefa26e5d6fea081fab431a3bec2bb9dd0f60e05b7dd48bce09a285478b87012`; PEM SHA256 `6875237dcb0fe3c405bc3d1bdfa0c199c9f8f93d10d5ad48b7d89d1e59798225`. | Candidate certificate, HK verified 07:37 UTC. SAN IP `10.70.0.1`, valid `2026-11-05 05:33:46 UTC` through `2027-05-04 05:33:46 UTC`; not mounted. |
| Genuine P7 delegation | **NOT_AVAILABLE**. Owner: Core. Bobby approved READ + HISTORY for exactly `paper-portfolio-g1` and `paper-root-g1`, but this is not a recorded session-bound acceptance/delegation. | Source attestor lifecycle/ACL, actual owner session/step-up, authority fence and record remain uncommissioned. Next Core checkpoint 08:00 UTC; no reliable ETA. |

For independent byte checking, the 180 exact JWKS bytes are the single JSON
line below **without a newline**; use the existing file, not Markdown, as the
byte authority:

```json
{"keys":[{"kty":"OKP","crv":"Ed25519","x":"s3be7ayN1_valqvG7At-SsuNUmVDOGNaB2iDgeooXn0","kid":"research-candidate-064b8dc9-17a8-4305-9b7f-d5c7524245e6","alg":"EdDSA","use":"sig"}]}
```

Source baseline is Core checkout `2faa8968fddbde59b2e59525e334ba3d83886144`
plus uncommitted candidate work, **not** an installed image/config/schema.
Current issuer composition file SHA256
`577c61c9e3c52caa61568da33995491faa28ce8e5d0d56c397eec2d0005b177d`;
current candidate issuer file SHA256
`6c13c4db557982220aac96874924818c4f9920c326378c26a42a24e1a0c87d8f`.
There is no qualified runtime image/config/schema pin for this candidate.

Full A2 remains Core-owned and **NOT_READY**: mounted issuer/listener and
source registration, actual owner/subject mapping, P7, P5 notification,
runtime pins and O-1…O-4 still need real evidence. Actual `C2_SEALED` was
relayed, but B2 must not be signed until genuine A2 acceptance and P7/P8
prerequisites. There is no reliable A2/B2 delivery ETA yet. No credentials,
private keys, DSNs, tokens or cookies are included.
