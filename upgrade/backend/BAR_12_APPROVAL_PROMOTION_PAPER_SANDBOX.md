# BAR-12 — Approval, Promotion, Paper & Sandbox foundations

> **Version:** 0.1<br>
> **Status:** BAR-12 complete (approval authority + paper ledger + reconciliation)<br>
> **Updated:** 2026-08-16<br>
> **Unified phase:** U15 Approval, Promotion, Paper & Sandbox<br>
> **Guide authority:** v0.4 §10.4–10.6 promotion/gates, §12 paper/sandbox/live

## 1. Goal and scope

BAR-12 lays the U15 backend foundations without opening Live:

- `services/approval_authority.py`: versioned approval policy, evidence-bound
  approval requests, separation of duties, the §10.4 promotion state machine
  and the §10.5 gate matrix evaluated server-side at command time.
- `services/paper_ledger.py`: deterministic append-only paper accounts
  (cash/positions/orders/fills) storing only secret REFERENCES, replayable
  state and venue reconciliation with drift detection.
- Crafted self-approval, skipped stages, digest changes and gate failures are
  all denied with typed errors.

Non-goals: Live canary/scale, incident links, step-up policy (U16), approval
UI, venue adapters beyond the stub feed.

## 2. Locked decisions

1. **Approval binds immutable digests.** A request carries the exact artifact
   + audit digests; a promotion with a changed artifact digest is invalid.
2. **Separation of duties is structural.** The requester can never decide
   their own request; approval requires explicit gate evidence for the
   target environment.
3. **Gates are server-side.** The §10.5 matrix (paper/sandbox/live-canary
   minimum sets) is evaluated at command time; missing evidence = denied.
4. **Paper state replays deterministically from fills** and stores only
   secret references; drift against the venue feed fails reconciliation.

## 3. Implementation evidence

- [x] ApprovalAuthority with policy v1, requests, decisions (approve/reject/
  waiver), promotion transitions RESEARCH→PAPER_APPROVED→PAPER_ACTIVE→
  SANDBOX_APPROVED→SANDBOX_ACTIVE→LIVE_CANARY_APPROVED→LIVE_CANARY→
  LIVE_SCALED + PAUSED/ROLLED_BACK/RETIRED; gate matrix for PAPER/SANDBOX/
  LIVE_CANARY.
- [x] PaperLedger with accounts (secret reference only), deterministic
  replay, insufficient-cash/negative-order rejection and reconciliation
  drift detection.
- [x] BE suite: `9` tests (gate matrix, state machine coverage,
  request/decision flow with self-approval denial, crafted promotion
  denial, invalid transition + digest-change denial, pause/rollback/retire,
  ledger determinism/replay, crafted order rejection, reconciliation
  drift).
- [x] Full Portal backend regression `362 passed, 1 skipped`; full Planning
  backend `18 passed`; workspace verification passes including the
  protected strategy hash. No change was pushed or deployed.

Technical debt and rollback:

- Actor identity currently comes from command payloads; the signed
  BFF principal wiring lands with the façade approval routes. Live control
  and step-up remain U16.
- Rollback: revert the BAR-12 commits; research run flows are unchanged.

## 4. Next slice

BAR-13 (U16): live control & operational safety foundations — incident,
pause/resume and protective-action commands with dual approval, without
live keys in the prototype.
