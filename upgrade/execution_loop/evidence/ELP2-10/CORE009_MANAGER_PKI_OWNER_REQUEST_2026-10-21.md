# Core009 Manager data trust — issuer/target owner request

**PREPARED / INACTIVE / NOT_CONNECTED**. This request does not authorize TLS,
JWKS, grant, profile or traffic reconciliation on an existing listener.

## Exact public inputs already staged

- HK public directory:
  `/home/bobby/secure/edge-core009-manager-data-public-20261021-c185ee3d/`.
- Proposed Research-only signer kid: `research-20261021-c185ee3d`.
- Public JWK682bytes, SHA256
  `a8b44aad` (full digest is in the staged public manifest; the prefix here is
  a locator only, not a pin suitable for installation).
- CSR1427bytes, public-key625bytes; full hashes and all filenames are in that
  same public manifest. Core private signer/client keys remain on SGP and must
  not be copied to HK, Git or chat.
- CSR requested identity: URI SAN
  `spiffe://primusspark/portal/control-api/paper`, EKU clientAuth, CAfalse.
  A Paper-named workload identity is not by itself an all-environment grant.

## Concrete owner return required

The genuine Research trust/PKI owner returns the signed **public** leaf and
chain plus issuer/target reference, validity, SAN/EKU/SPKI verification and
their SHA256 pins. Existing public CA certificates establish trust only; their
presence is not access to a signing key or an issuance authorization. Do not
copy a stable workload credential or invent a test CA and call it connected
qualification. If the real owner requires a different reviewed workload SAN,
return that contract before issuing rather than silently changing it.

The target owner separately supplies the approved old/new TLS/JWKS pins,
rollback references and an explicit operating window for the listener changes.
Bobby's all-mode read direction covers preparation/integration for
Paper8443, Sandbox8444 and Live8445 (Canary is governed Live); it does not
implicitly authorize the three running-listener reconciliations. The native
28446 original-custody recovery window is a different authority boundary.

After those inputs: Core validates the inactive versioned bundle, target
owner reconciles only the agreed listeners, then Core/Edge take finite/read,
separate STREAM, revoke/restart/recovery and six off-diagonal deny receipts.
Exact Research subject/workspace and current ROOT scope remain required;
READ never grants STREAM. No command, capital or Live-trading activation.

## Routing

Edge/PM owner: name the actual Research issuer/target owner or return their
public issuance reference. Core owns installation/verification of its received
bundle, not an assumed TS/PM PKI authority. Partial returns are welcome; do not
hold the currently independent R3/BUSY repair or original-key cleanup for this
Manager-data trust request.
