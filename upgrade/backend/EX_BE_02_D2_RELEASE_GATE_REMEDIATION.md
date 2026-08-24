# EX-BE-02-LIVE — D2 Release Gate Remediation

Date: 2026-08-24  
Status: `D2_RELEASE_CANDIDATE_REMEDIATED / LIVE_D2_UNAUTHORIZED`  
Runtime impact: none

## Outcome

The exact `2cef9c8` main publication exposed two independent release-gate
failures before any AWS-HK deployment:

1. GitHub `setup-python` followed the floating `3.12` channel from 3.12.13 to
   3.12.14 while the BAR-05 environment report still froze 3.12.13.
2. The Rust Execution Edge binary needed only glibc, libm and libgcc, but its
   Debian-slim runtime carried unused `perl-base` and `zlib` packages. Trivy
   rejected four CRITICAL findings before signing.
3. The first remediated main publication then exposed two fixed OpenSSL
   CRITICAL findings in the old Source Proxy base before signing.
4. A proactive scan of the exact published D3 Control API image found one
   CRITICAL `node-tar` dependency shipped only through the runtime copy of npm;
   the application dependency tree itself was clean.

The candidate now pins Python 3.12.14 in CI, the BAR-05 report and both Python
runtime images. The Python image is also pinned by digest, and a regression test
requires all four surfaces to remain aligned.

The Execution Edge runtime now uses pinned
`gcr.io/distroless/cc-debian12:nonroot`. It remains UID/GID `65532:65532`, has
no shell or package manager and contains only the C runtime boundary required
by the compiled Rust binary. The D2 harness no longer assumes a shell inside
the Edge image; fixture staging uses the isolated PostgreSQL utility image and
the real Edge still proves migration, projection-check and source-dark startup.

The Source Proxy now pins official NGINX unprivileged 1.31.4 on Alpine 3.24
slim by digest. Its exact base has 21 OS packages rather than 67 and the same
offline Trivy CRITICAL rejection scan reports zero findings. The mTLS/TLS 1.3,
GET-only route guards and non-root runtime contract remain unchanged.

The D3 Control API now pins Node 22.23.2 / Alpine 3.24 by digest. npm, npx,
Yarn and Corepack remain available in the build stage but are removed from the
final image because runtime executes only `node dist/main.js`. This removes the
unrelated package-manager dependency graph without changing application
dependencies or migrations.

## Evidence

- exact Python 3.12.14 BAR-05 tests: 10/10;
- full Portal Research backend under Python 3.12.14:
  401 passed, 1 skipped, protected strategy hash accepted;
- pinned Python runtime tag reports Python 3.12.14;
- fixed Edge local image: UID/GID `65532:65532`, 14,489,167 bytes;
- Trivy CRITICAL rejection scan over the fixed image tar: 0 findings;
- fixed Source Proxy local image:
  `sha256:0bb04bf928bbb174ebd7ed7d8315e484b03446a5a655e84d9756ff34218967b6`,
  UID/GID `101:101`, 5,768,982 bytes;
- Trivy CRITICAL rejection scan over the exact fixed Source Proxy image: 0
  findings;
- fixed Control API local image:
  `sha256:817a0560c4ddcf6343f72779f5545358fdad8cf6ab7a3038a40654618c939b00`,
  user `node`, Node 22.23.2, 64,533,028 bytes;
- Trivy HIGH+CRITICAL scan over the exact fixed Control API image: 0 findings;
- package-manager absence proof: `npm` is not executable in the final image;
- publication regression gate locks the reviewed Edge, Proxy and Control API
  base digests plus the Control API package-manager removal boundary;
- full D2 image/PostgreSQL/migrator/source-dark integration gate: pass;
- no AWS metadata, IAM association, network, service or Trading System state
  changed.

## Remaining live stop gates

This remediation does not authorize D2. The live caller is the expected
`PrimusPortalExecutionD1Operator-v1` role, but the exact
`ModifyInstanceMetadataOptions(DryRun=true)` request still returns
`UnauthorizedOperation`, including the post-owner-attachment retry on
2026-08-24. The attached revision must become effective on that role, the
remediated commit must pass main CI and produce signed immutable D2 and D3
image evidence, and a fresh host/admission/change window must be accepted before
profile detachment or dark service deployment.

D3 remains ordered after accepted D2. D4 remains ordered after accepted D3 and
also requires the Trading System owner to publish a dedicated Paper read-only
identity, exact GET routes, cursor/completeness/resync semantics and approved
encrypted projection storage. No frontend live profile is unlocked.
