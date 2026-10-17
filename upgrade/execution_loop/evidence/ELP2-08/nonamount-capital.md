# ELP2-08 — non-amount target-setting receipts, 2026-10-17

Bobby's approved remaining-backend batch; same research branch at fdab164c.
**UNCOMMITTED / PENDING_GATE**. Primary integrates the privately reviewed
validator/generator/fixture/test draft; no foreign staging or frontend changes.
No new executor/route, ledger, schema migration or runtime/source activation.

## Confirmed bug and delivered implementation

Strict PM input uses `target_budget` for ADJUST_TARGET_BUDGET and
`target_root_limit` for SET_ROOT_LIMIT, and forbids `amount` on both.
Command merge already accepts a correlated known outcome without an amount
partition on those wires. Workflow validation incorrectly required one for
every known state. It now permits null amounts only for these two operations,
while requiring receipt_ref/source_event_ref/revision for every known state.
UNKNOWN still requires all four fields null. Any supplied amount partition
retains exact arithmetic and state validation. RECALL_FULL still needs its
source-resolved partition; target values are never substituted for transfers.

Zod runtime and generated WorkflowCapital JSON conditions change together.
Operation/schema version stays `portal.execution.capital-workflow.v1`, generated
type `WorkflowCapital` in `execution-workflows.d.ts`; no property is added or
made optional. Two canonical synthetic stories in
`execution-workflows.synthetic.valid.json`: W08-ROOT-LIMIT-NONAMOUNT and
W08-TARGET-BUDGET-REJECTED-NONAMOUNT. They are TEST_ONLY, not real receipts.
Regenerate with `npm --prefix packages/contracts run generate:execution-workflows`;
refresh snapshot using the repository script, never hand-edit generated types.

Planned validation: strict wire→merge→workflow regressions, eight workflow
operation cases, JSON/Zod parity plus canonical fixture stories, affected alias
regressions/build/normal hook in one coherent batch. Actual results NOT_RUN
at preparation; no standalone positive source claim. Budget one4CPU/4GiB/8GiB
correctness lane, not load/coexistence/G2.

## Handoff, remaining debt and rollback

Claude remains NOT_STARTED_BY_OWNER_DIRECTION/AWAITING_CONSUMER_REVIEW. When
assigned, an actual target-setting receipt may have `amounts:null`: show its
owning outcome/target-setting effect without drawing a fabricated five-way
transfer partition. Rejected remains rejected; UNKNOWN queries original intent,
no resend. No UI layout/design change is made by Codex.

Actual PM/Edge null-amount outcome compatibility and source-mounted workflows
remain07-001/002 and08 source acceptance; this local correction does not open
those adapters. Backend next can continue exact per-grant command checks and
other supported workflow families without waiting for frontend. Rollback the
validator/generator/fixture/generated outputs together; never undo receipts,
grants, audit or financial facts. Full08 remains NOT_MET_SOURCE_DESIGN_BROWSER.

## Terminal focused correctness — 2026-10-17T09:04:12Z

Strict wire→merge→workflow and Zod/JSON/canonical-fixture regressions PASS:
84workflow API cases and43command cases are included in247/247API tests across
7files. APIbuild/scopedPGdump/restore/four row digests PASS. The same sequential
window passed84/84contracts in2files, including both synthetic target-setting
stories and Regime schema/fixture parity. Do not add overlapping counts as
new coverage or confuse synthetic source pins with genuine PM receipts.

Generation succeeded using the existing pinned API dependency environment:
`NODE_PATH=/home/bobby/portal-research/apps/control-api/node_modules npm --prefix packages/contracts run generate:execution-workflows`.
Generator check and repository `snapshot.py` refresh/check succeeded; no
dependency installation, lockfile edit or handwritten generated type. The
initial host attempt missing zod remains an environment failure, not a PASS.

Controller and loghash are [recorded with the same bounded reader gate](../ELP2-04/finite-retained-aliases.md#terminal-focused-correctness--2026-10-17t090412z).
Source/index/protected runtimes unchanged; owned resources/lease removed.
Actual samples and capacity are there, not a production budget or G2 result.
This corrects the earlier PENDING focused result only. Coherent normal-hook
landing is pending foreign-index coordination; actual source-mounted adapter
acceptance and Claude's consumer/browser gates remain OPEN. No command sent.
