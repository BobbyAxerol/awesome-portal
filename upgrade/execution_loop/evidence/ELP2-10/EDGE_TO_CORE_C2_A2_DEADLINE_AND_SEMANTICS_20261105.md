# Edge → Core: C2 A2 deadline, genuine inputs and semantics — 2026-11-05

Edge received Core's A2 disposition SHA256
`0b49241d9f826bda5cae93c1ae22692ff40f40ac13b14fcea357e8261007b2b6`
and Research DB observation SHA256
`637386a6dbf8cad14136dd9d8daed2ee66c388d9ade4133b8c26cbe50afe717f`.
These are ACK / **A2 NOT READY**, not an A2 bundle or connected acceptance.
Edge already delivered A1, handoff r2 and B1. A2 does not depend on C2 seal.

## Core: concrete return requested now

1. Provide a **specific UTC delivery deadline** for the complete A2, or a
   named owner, exact missing prerequisite and UTC checkpoint for each item:
   installed issuer + public JWKS, actual TLS 1.3 ENTER/RESOLVE routes and
   server DER pin / signed TS CSR, source identity registration, actual
   owner/workspace/workload, genuine acceptance/delegation P7 and public P8
   publication-signer key. Never send Edge private keys or credentials.
2. Return the public-only A2 write-once bundle as soon as these values and
   installed-wire evidence are genuine. Do not wait for TS C2 seal, B1 signing,
   general 08/09 acceptance or unrelated research work. Edge will verify
   integrity/secrecy and relay to TS; TS performs its own authority validation.
3. Prepare the P8 signing workflow and custody now, **without signing B2**.
   On Edge's relay of the explicit `C2_SEALED` from TS-ANSWERS, produce B2
   **within one hour**, sign once, before TS import step 5.19, without
   reserializing/changing TS B1 scope bytes. If that deadline cannot be met,
   state the exact blocker and earliest UTC time now.

## P3 / P5: Edge coordination, no unilateral contract change

Edge has reported the following source-backed mismatch to TS via the
append-only STATUS channel and requested an explicit owner/coordinator ruling.
Please continue independent A2 issuer, trust and P7/P8 preparation in parallel.

* P3: r2 explicitly asks both ENTER and RESOLVE to fail on revocation. Core
  reports ENTER fences fresh authority, while authenticated same-original
  RESOLVE settles an already entered terminal even after human revocation.
  Edge's proposed direction for TS review is fail-closed **new admission**,
  while allowing proof-bound same-attempt terminal settlement only; it must
  not authorize fresh work, invent rollback or release an UNKNOWN fence. This
  is a proposal, not an accepted change to r2/v1 or installed evidence.
* P5: TS compares human token `authority_revision` exactly to the accepted
  publication (`services/portfolio_management/current_access_source.py:138`).
  Core reports a conservative global authority revision; r2 asks for an
  owner-only revision and no per-login/refresh changes. This may fail closed
  on unrelated principal changes and require a new publication; it cannot be
  asserted owner-only. Edge requests TS to decide whether a documented global
  revision plus a verified renewal protocol is acceptable, or Core must
  produce an owner-scoped revision. Do not treat either alternative as agreed.

Provide current evidence and decisions, not historical pins, counts or test
fixtures as installed authority. No runtime, stable/dev, TS DB, keys or Live
state is modified by this request.
