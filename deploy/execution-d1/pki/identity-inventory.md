# D1 identity inventory

This is a naming and placement contract, not a key-generation script. Key
generation, certificate issuance and secret delivery occur only after explicit
D1 authorization and outside Git.

| Identity | Private material location | Public/trust material delivered to | Reuse forbidden at |
|---|---|---|---|
| SGP WireGuard peer | SGP root-only `/etc/wireguard/portal0.conf` | AWS peer public key | mTLS, JWT, SSH |
| AWS WireGuard peer | AWS root-only `/etc/wireguard/portal0.conf` | SGP peer public key | mTLS, JWT, SSH |
| Edge TLS server | AWS edge secret directory | SGP Control API server CA | Source Proxy, JWT |
| SGP Control API TLS client | SGP Control API secret directory | AWS edge client CA | Source Proxy, SSH |
| Source Proxy TLS server | AWS Source Proxy secret directory | AWS ingestor/proxy CA | public edge |
| Projection ingestor TLS client | AWS edge/ingestor secret directory | Source Proxy client CA | SGP client |
| Delegated-read RS256 signer | SGP Control API only | AWS edge JWKS snapshot | mTLS, SSH |
| Trading System read identity | AWS Source Proxy only | Trading System gateway | Edge, SGP, browser |

Required runtime filenames:

```text
SGP Control API
  delegation-private-key.pem      0640 root:portal-runtime
  edge-server-ca.crt              0644 root:portal-runtime
  sgp-client.crt                  0640 root:portal-runtime
  sgp-client.key                  0640 root:portal-runtime

AWS Execution Edge / ingestor
  edge-server.crt                 0640 root:portal-runtime
  edge-server.key                 0640 root:portal-runtime
  sgp-client-ca.crt               0644 root:portal-runtime
  control-api.jwks.json           0644 root:portal-runtime
  source-proxy-ca.crt             0644 root:portal-runtime
  source-proxy-client.pem         0640 root:portal-runtime
  source-proxy-admission-token    0640 root:portal-runtime

AWS Source Proxy
  source-proxy-server.crt         0640 root:portal-runtime
  source-proxy-server.key         0640 root:portal-runtime
  projection-ingestor-ca.crt      0644 root:portal-runtime
  trading-system-read-header.conf 0640 root:portal-runtime
```

`source-proxy-admission-token` only satisfies the current edge transport's
credential-present invariant. It is not the Trading System credential. The
Source Proxy discards the incoming `X-API-Key` and injects its own dedicated
Trading System read credential from `trading-system-read-header.conf`. Thus the
real source credential never enters the edge, SGP, browser, JWT or logs.

Rotation uses overlap: publish the new client CA/JWK `kid`, deploy the new
identity, prove both paths, retire the old identity, then record revocation.
Unknown `kid`, wrong SAN/EKU, expired certificates and TTL above 60 seconds
must fail closed.
