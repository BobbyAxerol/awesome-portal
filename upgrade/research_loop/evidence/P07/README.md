# P07 evidence — Alpha Registry, Import and immutable version binding

Status: `BACKEND_AND_CONTRACT_COMPLETE_FE_PRODUCT_ROUTE_PENDING` on 2026-09-20.

P07 implements the Research-only server authority for one bounded Python
source file: parse → seven ordered gates → immutable `DRAFT` AlphaVersion →
authorized `ACTIVE` binding. Control API owns bytes, TTL, receipts, registry
identity and activation CAS. Portal API is only a private HMAC-authenticated
AST/restricted-definition analyser; it neither writes the Research database
nor imports, instantiates or calls a submitted strategy.

Read in this order:

1. [phase-report.md](./phase-report.md) — exact authority and boundary.
2. [changes.json](./changes.json) — source inventory and explicit non-changes.
3. [test-results.json](./test-results.json) — commands, counts and deliberate
   non-run consumer/deploy gates.
4. [frontend-handoff-claude.md](./frontend-handoff-claude.md) — Screen 14
   generated same-origin contract plus route decision; Claude owns UI and
   browser receipt.
5. [resource-cleanup.json](./resource-cleanup.json) and
   [rollback.md](./rollback.md) — bounded retention and reversal discipline.
6. [debt-register.json](./debt-register.json) — no P07 backend debt is open;
   later phase ownership is explicitly distinguished.

This packet is credential-free. It is not a runtime rollout, worker execution
path, dependency installer, Research dev deployment or approval to run
imported code.

`may_activate` in the registry and registration responses is caller-specific
server admission, derived by the same policy that protects the activation
write. Screen 14 → Screen 02 `av_` prefill (`T07`) is explicitly owned by P10
New Run and is not claimed by P07.
