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

The candidate now pins Python 3.12.14 in CI, the BAR-05 report and both Python
runtime images. The Python image is also pinned by digest, and a regression test
requires all four surfaces to remain aligned.

The Execution Edge runtime now uses pinned
`gcr.io/distroless/cc-debian12:nonroot`. It remains UID/GID `65532:65532`, has
no shell or package manager and contains only the C runtime boundary required
by the compiled Rust binary. The D2 harness no longer assumes a shell inside
the Edge image; fixture staging uses the isolated PostgreSQL utility image and
the real Edge still proves migration, projection-check and source-dark startup.

## Evidence

- exact Python 3.12.14 BAR-05 tests: 10/10;
- full Portal Research backend under Python 3.12.14:
  401 passed, 1 skipped, protected strategy hash accepted;
- pinned Python runtime tag reports Python 3.12.14;
- fixed Edge local image: UID/GID `65532:65532`, 14,489,167 bytes;
- Trivy CRITICAL rejection scan over the fixed image tar: 0 findings;
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
