# Core Manager Research trust — actual offline reconciliation

23 October 2026. Scope: reuse already-issued Research public material; no
key creation, private-key-content read, network exchange or runtime mutation.

## Actual checks

- The pure `inspectManagerDataLegConfigBytes` validator passed at source
  `ec6d1863e72c41a3852688daca3d60bcaaa38ea0805963574bf81c4b0d00ab24`,
  issued inactive config
  `153a8f0e54c28054cf3de4baebf202cde329c4b20110bffeda11b885299c5ec1`:
  zero errors/warnings; issued leaf, current validity, exact Research kid,
  no STREAM permission.
- Direct `openssl verify -purpose sslclient` passed. Subject
  `portal-research-core009`, SAN
  `spiffe://primusspark/portal/control-api/paper`, clientAuth-only leaf and
  pinned chain remain valid through **2026-10-29T13:27:14Z**.
- Leaf bytes SHA256
  `33015a803a88d16d463ec261967c8f76f128ade309819512b971388b9a760aa7`;
  chain `665a11f7…` and existing public signer JWKS `a8b44aad…` unchanged.
  JWKS has one public RSA/RS256 signer, kid
  `research-20261021-c185ee3d`; no private fields.
- The exported verifier's child-process OpenSSL wrapper was refused by the
  sandbox pipe restrictions. The separately invoked actual OpenSSL command
  succeeded; neither that refusal nor a pure config PASS is a business-read
  proof. No safety guard was weakened to make it run.

Existing private **references**, not secret values:

```text
/home/bobby/secure/core009-manager-data-pki-20261021-Ks6aGr/
  public/research-client.csr.pem
  public/research-signer.jwks.json
  issued-20261022-1328/research-client.crt.pem
  issued-20261022-1328/research-client.chain.pem
  issued-20261022-1328/configuration-v1/issued-inactive-config.json
```

## Runtime boundary and smallest positive proof

**NOT_INSTALLED / CONNECTED_BUSINESS_READ_NOT_RUN.** Existing inactive config
describes all three proposed mode flags; it must not be blindly activated.
Approved operational acceptance remains Paper-only. No Sandbox/Live grant or
command follows from a cryptographically valid client certificate.

Paper target: `https://10.70.0.2:8443`, `PAPER_BINANCE_USDM`, issuer
`portal-control-api`, audience `portal-execution-edge-paper`, delegation
TTL at most60 seconds, Research workspace
`ws_06G19F61YB8CFR7TEWMS7HQ660`.

Edge must acknowledge the **loaded**, not merely prepared, additive overlap:

```text
HK /home/bobby/secure/edge-core009-manager-overlap-20261022-ZllVvxNL/
   control-api.jwks.OVERLAP.INACTIVE.json
SHA256 7913317056d41e4406744153995aec8fcc69f6b4c90fce60f1663b1f4a07a73e
```

After matched Paper overlay/current-source READY and official current READ
writer output, the smallest product probe is:

```http
GET /api/v1/execution/manager/deployments?environment=paper&workspace_id=ws_06G19F61YB8CFR7TEWMS7HQ660&limit=1
```

This passes through `NativeManagerReadConsumer` → `prepareNativeManagerPage`
→ actual Manager proxy. `/manager/fleet` alone reads retained PostgreSQL and
is not fresh Manager transport evidence; raw current-source browser routes
deliberately return410. Use a private current Research session reference,
never stable credentials or headers in a receipt.

Old native source/grants/session are retired/revoked. A positive probe now
would require a fresh exact READ binding; do not reopen or extend the accepted
old specimen. Edge returns matched loaded image/config/profile/audience/kid
pins; Core installs only that Paper overlay and runs the bounded GET. TLS-only
success, fixture rows or a retained read cannot substitute for this gate.

## Cleanup / next work

No resource or credential was created by these read-only checks; cleanup is
NO_ACTION_NEEDED. Existing custody, keys, audit and stable rights are intact.
Financial optional DTOs, command fixtures and consumer refinement continue
independently. This receipt does not close ELP2-10 or open ELP2-11.
