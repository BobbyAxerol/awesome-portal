# C2 Research public trust — preparation only

Disposition: **candidate public materials delivered for review; A2 NOT_READY.**
No listener has been installed or started, no TS source has been registered,
and these materials do not authorize a grant, signing, activation or Live.

On HK the public-only preparation directory is:
`/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/upgrade/evidence/execution-edge-v1_2/EPG10-08/core-c2-research-public-20261105/`.

| Public file | SHA256 |
|---|---|
| `ca.crt.pem` | `e205fbef9c9dc4d290d66f5c86ed185115909db6ff5baf6c2dee551eeaa58acf` |
| `server.crt.pem` | `6875237dcb0fe3c405bc3d1bdfa0c199c9f8f93d10d5ad48b7d89d1e59798225` |
| `ts-mtls-client.crt.pem` | `f4f4cca4ac60ff44162794eef74f24ef945c7ab466bf9e39bf9355071d54eaa3` |
| `p8-public.jwk.json` | `0ad65ab92e0d64a62222b4a0e8980311dd51f0ea7fc7ee08246aebc2032576dc` |

Core verified the four checksums at the destination. The candidate server
leaf DER SHA256 is
`fefa26e5d6fea081fab431a3bec2bb9dd0f60e05b7dd48bce09a285478b87012`;
the CA DER SHA256 is
`4df8f126bd5d5d9af6853d2c38fb559d041ade7b4ac7ef988332e07dce655896`.
The intended Research-only origin is `https://10.70.0.1:28444`, using the
existing WireGuard address and historic Research reverse-listener port. This
is a proposal, **not** a listening endpoint or a reachability receipt.

The client certificate was issued from the delivered A1 P-256 CSR; its
public-key SPKI SHA256 is
`6a016a6f5029cc9b1f9425189f5ad343a76f5170f1a8d290985787ba7c3a7df2`,
with expiry 2027-05-04 05:33:53 UTC. Both certificate chain/purpose checks
and server IP SAN check passed; a focused public preflight passed 2/2.
Private CA/listener and P8 keys remain in separate protected Core storage and
are not delivered here. Distinct P8/issuer identity remains to be checked.

P7 exact scope approval and seal state are documented in
`CORE_C2_SEAL_SCOPE_P8_PROGRESS_20261105.md`; actual source identity mapping,
P7 authenticated acceptance, source fence and A2 runtime registration are
still missing. Edge may check these public bytes without installing or
declaring them READY. Core remains owner of completing those steps.
