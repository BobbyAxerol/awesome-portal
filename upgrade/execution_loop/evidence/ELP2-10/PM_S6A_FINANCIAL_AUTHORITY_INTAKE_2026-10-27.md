# PM S6A financial/authority intake — Core through Edge

## Source and limits

Read-only SSH inspected the clean HK worktree `/home/bobby/.worktrees/pm-integration`
at `91f2d72208f6f01bb18af62a6c5517d0c2747520`. Its S6A journal is
`upgrade/PMA11_S6A_BUSINESS_FIXES_2026-10-27.md` at that pin. It states that
the slice is implemented and tested locally in disposable PostgreSQL, but
**unmounted**. This intake does not independently reproduce its test counts,
establish a deployed source, or publish Core data.

## Financial and authority implications

1. Candidate `25dbc19dae449597d13a582cb9a4f49aa9953b81`,
   `services/portfolio_management/admission_e1_assembly.py:83-87,539-545`,
   refuses an E4 witness with more than the one bound tradable account per
   pool using `PM_E1_SHARED_POOL_UNSUPPORTED`. This is an admission rule, not
   proof of economic ownership, disjoint leaves or a complete NAV/NET_PNL
   census. Core must not replace the existing proof fence with account-count
   inference. The candidate documents cross-account reallocation as two
   separately receipted commands, not an atomic operation.
2. Candidate `9c29f8460e4bdf2675bb24042b6cef9964fde5cb` adds an optional
   capital-statement budget block derived from budget revisions and durable
   receipts. The PM journal identifies its contents and says the old response
   shape is unchanged when that block is absent. This is a candidate carrier
   for budget facts, not a qualified Edge DTO or financial APPLIED/ACK proof;
   Core must bind the actual snapshot, scope, currency and receipt before use.
3. Candidate `4355016eb073d74684d51b73a5d2d5cfb4c77864`,
   `services/portfolio_management/committed_execution_source.py:34-66`,
   defines a v2 governance reference binding decision and publication hashes.
   Its journal explicitly says the S2 Paper outcome adapter still lacks
   governance/attribution, and the TS carrier needs v2 support. A passing
   S6A unit test does not close the actual Core→Edge→source attribution chain.
4. The same `25dbc19d` candidate adds single-pool package witness/refusal
   codes, but explicitly fails closed with `PM_E1_PACKAGE_TS_CANDIDATE_PENDING`
   until the TS candidate loader and command pin exist. These candidate codes
   are not currently published in Core's contract; do not fabricate a command
   success or expose them as installed gateway capability.

## Exact Edge follow-up

Edge is the only coordination endpoint for PM/TS. Please reconcile the actual
selected source and mounted catalogue with S6A: return its source/runtime and
schema pins, whether the optional budget carrier is published for the selected
Paper scope with revision/currency/receipt and authority, and the precise
ownership/census/leaf proof needed for Core's reducer. Confirm E1 v2 reference
carrier support and S2 attribution separately; return typed refusals through
the Edge contract only when commissioned. Do not send secrets or authorize a
new command/Live action in this response.

Core can continue isolated mapping and contract tests using the existing
synthetic graph; source-qualified balances, proof, APPLIED/ACK and browser
acceptance remain open. Claude has no new published field to consume from this
intake. The prior Paper membership/transport blockers and Calendar
`SOURCE_DARK` are unchanged. No source, runtime, credential, DB, frontend or
remote branch was modified by this review.

Verification: R0 Markdown-only intake and Unified link; exact paths,
`git diff --cached --check` and execution tracking. Tests were not rerun
because no executable source or contract changed.
