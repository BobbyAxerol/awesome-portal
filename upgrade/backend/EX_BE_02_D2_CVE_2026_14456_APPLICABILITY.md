# EX-BE-02-LIVE — D2 CVE-2026-14456 applicability checkpoint

> Status: `TRIGGER_NOT_REACHABLE / OWNER_ACCEPTED_D2_DARK_NO_QUIC`  
> Evidence time: 2026-08-24T10:24:18Z  
> Runtime impact: accepted D2 dark configuration only

## Outcome

The signed D2 images were inspected by immutable digest after the publication
evidence reported one HIGH finding for `CVE-2026-14456`. The earlier scope
label `UNLINKED_DISTROLESS_LIBSSL_QUIC_SERVER_CODE` was incomplete: it is true
for the Rust Execution Edge, but not for the Nginx Source Proxy.

The exact Rust Edge binary uses `rustls` for inbound TLS, outbound HTTP and
PostgreSQL. Its ELF dynamic section needs only `libgcc_s`, `libm`, `libc` and
the loader; it does not need `libssl` or `libcrypto`. The Distroless base still
contains OpenSSL 3.0.20, but OpenSSL's advisory explicitly says the 3.0 branch
is unaffected. The Edge is therefore not affected by this CVE.

The exact Source Proxy image is Nginx 1.31.4 linked with OpenSSL 3.5.7 and
compiled with HTTP/3 support. OpenSSL 3.5.7 is within the affected version
range. However, the reviewed Portal configuration has exactly one
`listen <private-bridge-ip>:8444 ssl` TLS/TCP listener and has no `quic`,
`http3` or `Alt-Svc` directive. The OpenSSL issue requires a QUIC server
listener receiving Initial packets; that trigger is not reachable in D2.

This is a mitigation, not a claim that affected code is absent. The current
Alpine 3.24 repository still publishes `libssl3 3.5.7-r0`, and the pinned
official Source Proxy tag still resolves to the reviewed digest, so there is
not yet an upstream patched 3.5.8 base to repin.

## Added fail-closed gate

`execution-d2-preflight.sh` now rejects a runtime Source Proxy configuration
unless it contains exactly one expected TLS/TCP listener. It also rejects any
`quic`, `http3` or `Alt-Svc` token. The offline D2 integration test mutates the
listener to QUIC and proves that preflight fails, restores the safe listener
and proves the full D2 gate still passes.

This gate does not authorize D2, change AWS, start a service or contact the
Trading System. It prevents a later config drift from silently turning the
present-but-dormant QUIC code into a reachable listener.

## Evidence

- Execution Edge digest:
  `sha256:c67dc1dcb938fc1fa64070ac72d4e1dcc5cace2355ce813e2a3dfc89ba7a480b`;
- extracted Edge binary SHA-256:
  `ff6a67a2434033f4a7457015876224141c0958ed2419adc798511fab92760395`;
- Edge ELF `NEEDED`: `libgcc_s.so.1`, `libm.so.6`, `libc.so.6`,
  `ld-linux-x86-64.so.2`; no `libssl`/`libcrypto`;
- Edge base OpenSSL string: `OpenSSL 3.0.20 7 Apr 2026`;
- Source Proxy digest:
  `sha256:dafa9e70a3d90cd079147d149dbbaa8ac8a3a9db079b0cf8099892a7f1d5fbe7`;
- exact `nginx -V`: Nginx 1.31.4, OpenSSL 3.5.7, HTTP/3 compiled;
- reviewed runtime template: one bridge-only `ssl` listener, no QUIC/HTTP3;
- full offline D2 dark manifest/preflight/rollback integration: pass;
- private machine-readable evidence:
  `/home/bobby/secure/portal-execution-cve-2026-14456-applicability.env`;
- temporary stopped audit container and extracted `/tmp` files: removed.

Primary references:

- [OpenSSL advisory](https://openssl-library.org/news/secadv/20260813.txt)
- [Nginx HTTP/3 activation contract](https://nginx.org/en/docs/http/ngx_http_v3_module.html)
- [Alpine 3.24 libssl3 package](https://pkgs.alpinelinux.org/package/v3.24/main/x86_64/libssl3)

## Owner decision options

The repository did not silently convert this analysis into owner acceptance.
Before the D2 window, Bobby had to choose one of two paths:

1. accept the temporary non-reachability mitigation for dark D2, record the
   HIGH disposition, retain the QUIC-denial gate and repin/rebuild when Alpine
   publishes OpenSSL 3.5.8; or
2. keep D2 closed until a patched upstream Source Proxy base is available.

The following live record captures the selected first option. D2 remains
source-dark and command-dark. D3 and D4 retain separate windows and evidence.

## 2026-08-24 owner disposition and live proof

Bobby accepted the temporary no-QUIC mitigation for the bounded D2 dark
window. The live renderer/preflight proved one exact TCP/TLS listener, seven
dark 503 guards and no QUIC, HTTP3, Alt-Svc or protected UDP listener. The
15-minute soak plus rollback/redeploy completed with zero Source Proxy access
lines. D2 is therefore accepted for this exact dark configuration; any QUIC/
HTTP3 drift remains a stop condition, and the image must be repinned when a
patched upstream base is available. This disposition does not authorize D3,
D4, a source credential or any business route.
