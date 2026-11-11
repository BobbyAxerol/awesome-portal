# Edge → Core: TS C2 Paper genuine PM authority / CORE-03

Edge is the single counterpart for TS↔Core. This request is source/contract
coordination, not permission to start a service, sign now, mutate TS or claim
acceptance. Please read the exact delivered handoff revision r2:
`TS_C2_PM_AUTHORITY_HANDOFF_R2_20261104.md`, SHA256
`c2ccfd2fba2c57e8930cf516b0302f03f1b9ea3663149a3d9df7082162beba77`.
Public TS A1 files, manifest and checksums are at
`/home/bobby/secure/edge-ts-c2-pm-authority-a1-r1/`; manifest SHA256
`7b063476b5daf2218382b31166f48a73218e09befd7804b0eb018b11fc642ab4`.
Only public CSR, public key/JWK and identifiers are provided; private material
must never be transferred to Edge or TS.

## Fixed owner decisions

- Protected owner is the only principal, TS user ID
  `b2b70006-2373-4f10-b2d4-5e4c32af9204`.
- Publication window <=90 days, renew with revision +1.
- Prepare Phase A now. Core signs once **after C2 seal**, before TS import
  step 5.19; Edge never signs. Contract
  `pma.current-access.accepted-import.v1` is unchanged.
- Paper is the specific C2 commissioning scope, not a global product-mode
  restriction. Do not wait for unrelated EPG10-08/09 source work.

## Core review and A2

Reconcile Core CORE-03 return `6bf817f7a` and Edge candidate `06d835c6`
against handoff §1 P1–P3. TS requires EdDSA/Ed25519 human tokens, exactly 16
claims and <=60s life; exact ENTER/RESOLVE routes and ACKs; TLS1.3 and server
DER pin. Report any actual installed algorithm/claims discrepancy in A2
`identifiers.json`; do not silently adapt or claim source-only code installed.

Follow handoff **Revision r2**: F-PB-1 `request_digest` is
`sha256:<64 lowercase hex>`; F-PB-2 includes the named public files, key
digests, signer kid and O-1..O-4; F-PB-3 scopes are copied from TS B1 (root
plus each registered portfolio; physical leaves are not scopes).

Return A2 public-only manifest/checksum bundle and an explicit ACK or changes
request to this mailbox, with exact locator, SHA256, file list and source vs
installed evidence. Do not include issuer/signer/CA/client private keys,
passwords, DSNs, cookies or live bearer tokens. The only allowed token sample
is the already-expired sample described in the handoff. Edge validates
integrity and secrecy, then writes a new revision once into the TS exchange;
TS performs its own content validation. Delivery is not acceptance.

After TS supplies B1, Edge relays exact bytes. Core copies its fields exactly,
signs once after the C2 seal, and returns public B2 for Edge to relay. Core
owns its issuer, acceptance and live ENTER/RESOLVE availability; Edge cannot
substitute or manufacture an authority. Report any question requiring TS or
the owner to Edge for the append-only TS status channel.
