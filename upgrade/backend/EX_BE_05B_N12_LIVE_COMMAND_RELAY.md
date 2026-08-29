# N12 — Live Command Relay

Status: `PORTAL_COMMAND_PUBLICATION_GATE_AND_RELAY_COMPLETE / OWNER_PUBLICATION_PENDING / PRODUCTION_INACTIVE`  
Date: 2026-08-26  
Portal owner: Codex; external publication owner: Trading System

## 1. Outcome

N12 closes the Portal-owned command boundary without granting execution
authority. The existing TypeScript F0 plan/apply/verify control plane remains
the user/RBAC/SoD/audit authority on SGP; the Rust Execution Edge now has a
strict pre-dispatch authorization and durable pure journal contract; the
Trading System remains the only command acceptance and terminal-truth owner.

```text
Browser -> TypeScript plan/apply/verify (SGP; command flags still false)
             -> one-operation delegated proof
             -> Rust N12 publication/authorization/journal gate (AWS-HK design)
             -> exact owner-published command route (not published yet)
             -> Trading System acceptance + terminal verification truth
```

No Trading System code, AWS-HK runtime, Source Proxy, listener, network rule,
secret, mTLS/JWT issuer, database, Redis, CLI, broker, registry profile or
command flag was changed.

## 2. Master-request command annex

N12 is not sent as a separate owner request. It is the command machine annex
of
[`TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md`](./TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md),
which also covers incremental source, external reads and future Event/Artifact
authority.

The request pack replaces phase-by-phase command asks with nine exact future
capabilities:

- Paper R1: halt and cancel open orders;
- Sandbox R2: halt and cancel open orders;
- Live R3: halt, bounded reduce and emergency close;
- Live R4: resume and scale.

Every entry binds environment, risk tier, protective versus risk-increasing
effect, target types, exact POST/GET paths, mTLS plus one-operation JWT,
idempotency/monotonicity, WebAuthn/dual-approval policy and request/response
byte ceilings. The owner may publish a strict subset, but missing capabilities
stay unavailable and cannot be substituted by CLI, direct DB/Redis or generic
order APIs.

The 64-entry revision-2 F0 catalogue remains a discovery/UX reference only.
It does not become command authority. In particular, the observed
`ops/emergency-close-verify` route and ambiguous `ops/emergency-close` mapping
cannot be combined into a reachable command without an accepted owner pack.

## 3. Byte-bound publication verifier

`execution-n12-command-publication-verify.py` separates template, candidate
and acceptance modes. It verifies:

- exact capability/risk/effect/route/auth/bounds and dedicated command identity;
- actual request/receipt schemas and request/accepted/terminal fixture bytes;
- duplicate-key, regular-file, symlink, traversal and size controls;
- source commit/image identity and manifest digests;
- accepted `202` fixture remains `ACCEPTED_NONTERMINAL`;
- terminal truth is only `SUCCEEDED|FAILED|DENIED|PARTIAL`;
- complete identity/scope/step-up/SoD/idempotency/ambiguity/restart/source-loss/
  kill-switch/rollback negative evidence;
- no DB, Redis, CLI or broker authority.

Even an owner-accepted pack returns `portal_activation=false`. Publication and
activation remain distinct gates.

## 4. Rust relay safety model

The `command-relay` crate is still transport-free but is no longer only an F0
deny stub. It now provides:

- exact owner-published capability validation; an F0 row cannot be promoted by
  construction;
- four independent command lanes plus a command-only kill switch; query/SSE
  flags are absent from this decision;
- one-operation delegation binding over operation, payload hash, environment
  and target;
- target-type, actor-role, expected-version, expiry, WebAuthn and distinct-
  approver checks;
- bounded request/response route blueprint with `source_request_sent=false`
  until an external transport actually dispatches;
- append/replay journal states `PREPARED -> DISPATCHED -> ACCEPTED ->
  ACKNOWLEDGED -> terminal/UNCERTAIN`;
- `202` is non-terminal and cannot be automatically retried;
- serialized restart snapshots that preserve `UNCERTAIN` and target locks;
- same-target R4 block while uncertain;
- an uncertain target permits a new protective intent only when the owner
  explicitly proves both source idempotency and monotonic protection. Thus
  halt can qualify, while quantity-based reduce/emergency-close remains blocked
  until authoritative reconciliation;
- uncertainty resolves only through a later authoritative terminal observation.

This model intentionally stops before live HTTP, secret loading and source
dispatch because the owner pack has not been published.

## 5. Test evidence

Focused gates completed:

- N12 template verifier: 9 requested capabilities, non-authoritative;
- N12 verifier unit suite: 9/9;
- Rust `command-relay`: 11/11;
- focused strict Clippy: passed.

Full backend regression completed:

- Rust workspace: 217/217;
- workspace-wide strict Clippy: passed;
- PostgreSQL projection backup/restore signature: matched.

Portal monorepo workspace verification passed, including tracked-source,
contract-template, D1–D4 offline, image-publication and shared tracking gates.
The complete repository pre-commit gate also passed.

The corpus covers command-identity separation, wrong audience/scope/target,
expiry, stale version, step-up/dual approval, duplicate/conflict, 202
non-terminal, timeout/disconnect/unknown status, restart/replay, uncertainty
target locks, broker/source loss, command kill switch and rollback.

## 6. Honest remaining gate

Trading System has not published the command capability pack or dedicated
command identity. Therefore N12 does not claim a live command route, Paper
activation or owner acceptance. All existing runtime command flags remain
false and the current TypeScript apply path continues to return
`COMMAND_RELAY_DISABLED`.

After one owner pack is returned, Portal imports the exact artifacts and runs
the declared Paper drills. N13 then promotes a Paper protective subset first,
Sandbox second, Live protective later and Live risk-increasing last. Each lane
has its own owner/evidence/profile gate; there is no global enable switch.

## 7. Rollback

N12 has no external side effect or migration. Rollback is this source commit:
remove the request/verifier and restore the pure F0 relay implementation.
Runtime remains unchanged either way.
