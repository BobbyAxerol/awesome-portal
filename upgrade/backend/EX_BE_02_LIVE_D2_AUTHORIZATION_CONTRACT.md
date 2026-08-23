# EX-BE-02-LIVE — D2 owner authorization and change-window contract

> Status: `D2_AUTHORIZATION_CONTRACT_PREPARED / LIVE_D2_UNAUTHORIZED`  
> Evidence date: 2026-08-23 UTC  
> Scope: fail-closed authorization schema and validator; no AWS/runtime change

## 1. Outcome

D2 now has a versioned, machine-checkable boundary between preparation and a
live dark deployment. The public template is
[`deploy/execution-d2/owner-input.env.example`](../../deploy/execution-d2/owner-input.env.example);
the private completed copy must remain outside Git, Bobby-owned and mode
`0600`. The validator never sources the file and never prints its values.

The contract has three modes:

- `template` proves the committed example is complete, unauthorized and dark;
- `readiness` proves the owner has opened a positive window of at most two
  hours and approved every predecessor/evidence/isolation decision;
- `activation` additionally requires independent proof that the temporary
  instance profile is detached and IMDS hop-limit one is active.

Passing readiness is not activation. Passing activation permits only the D2
dark runbook; it is not D3, D4, frontend or command authority.

## 2. Bound evidence

Readiness binds all of the following instead of accepting a free-form approval:

1. exact D1/IAM status and a fresh D1 revalidation decision;
2. full deployment commit equal to the published image source commit;
3. publication artifact, workload-identity inventory and host-admission
   SHA-256 digests;
4. verified image signatures and an accepted zero-CRITICAL/HIGH disposition;
5. verified workload identities, accepted host admission, historical-OOM
   review and a bounded resource budget;
6. the exact temporary instance-profile association plus explicit detach and
   IMDS hardening approvals;
7. named owner, AWS operator, rollback, backup and observability owners;
8. a separately named D2 window containing the validator execution time.

The projection mode is locked to `LOCAL_DARK_NO_INGESTION`. This is an empty,
private, disposable pilot store only; no RPO/RTO or real-source claim is made.

## 3. Permanent D2 denials

The validator rejects any attempt to enable:

- projection ingestion or Trading System source reads;
- Query API, analytics or SSE;
- delivery-profile activation;
- commands of any environment/risk tier;
- changes to the Trading System.

It also rejects unknown/duplicate keys, shell expansions, symlink inputs,
non-`0600`-equivalent private permissions, malformed association IDs, partial
commit/digests, commit drift and expired/oversized windows.

## 4. Evidence

`scripts/test_execution_d2_authorization.py` covers the safe template,
readiness-versus-activation separation, profile/IMDS proof, every permanently
false capability and commit/evidence/window drift. The committed template
passes `--mode template` without changing state.

No D2 authorization is currently open. Host admission remains independently
rejected until live I/O pressure is below the locked threshold and Bobby has
reviewed historical OOM evidence. Signed deployment images, real workload
identities, profile detachment and IMDS hardening also remain unproven.

## 5. Frontend coordination

This contract changes no frontend capability. Claude keeps fixture/dark/
unavailable states, `source_available=false`, `stream_available=false`, Lane B
closed and all Query/analytics/SSE/command controls off. A later evidence
packet is required after an accepted live D2 deployment.
