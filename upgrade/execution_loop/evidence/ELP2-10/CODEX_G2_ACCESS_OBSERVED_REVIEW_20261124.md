# G2 — Access / Observed: independent Codex review, 24 Nov 2026

Disposition: **CHANGES_REQUESTED for both candidates.** Review is not activation,
installation, source qualification or frontend acceptance. Existing Claude WIP
was preserved; no grants, flags, databases, containers or runtime configuration
were changed by this review. G1 implementation proceeds independently.

## Pins, ownership and actual validation

- Access: `/home/bobby/portal/.claude/worktrees/agent-a70f0c149da09bdaf`,
  `feat/access-profiles-offline-20261123`, HEAD
  `cc861d38ec3d04761b28350d0c73e73444c2b1b8`. Seven untracked source/test files
  reviewed in place, not silently imported or committed by Codex.
- Observed: `/home/bobby/portal/.claude/worktrees/agent-a32d32e549a677a8b`,
  `feat/observed-mode-20261123`, HEAD
  `b34eb158220b8f0226446e50c9038c1b0c9f6160` (ten files).
- Authority: root AGENTS, campaign rules, 23 Nov owner access decision,
  Observed design including cumulative-PnL/irregular-grain source addendum,
  and the existing 24 Nov continuation plan G2. No formula or qualified gate
  was changed to make tests pass.
- Three disjoint reviewers: G1 producer lifecycle, G2 Access, G2 Observed.
  Root alone scheduled tests and owns integration/docs; reviewers ran no builds.
- All commands used `/usr/local/bin/primus-build -- ...`, sequentially, with
  3 CPU / memory.high 6 GiB / memory.max 8 GiB. No dependency install/download.
  Temporary ignored dependency links reused the existing baseline dependencies,
  were created only if absent, and removed by a trap. Candidate source was not
  rewritten for the tests.

Actual focused results (24 Nov, 06:19 UTC):

| Candidate / command inside its `apps/control-api` | Result |
| --- | --- |
| Observed: `npm exec --offline vitest -- run test/observed-read-service.spec.ts test/observed-read-figures.spec.ts test/observed-read-contract.spec.ts --maxWorkers=1 --no-file-parallelism` | 3 files / **35 PASS**, exit 0 |
| Access: `npm exec --offline vitest -- run test/access-profile-artifact.spec.ts --maxWorkers=1 --no-file-parallelism` | 1 file / **26 PASS**, exit 0 |
| Independent diagnostic suite against exact candidate imports | **5 confirmed defects**, exit 0; these assertions intentionally confirm current incorrect behavior, not correctness or five additional acceptance gates |

Private nonsecret harness/test locators:
`/home/bobby/.local/state/portal-integrations/20261124-g1-g2-review/`:
`run-g2-review.sh`, `vitest.config.mts`, `review-diagnostics.spec.ts`.
No real credential was used; the log-output diagnostic uses an explicitly
synthetic sentinel. Retain this small source-only harness for Claude's retake;
do not retain dependency links or a test server.

## Access — changes required before integration

Locators below are relative to `apps/control-api/` in the Access worktree.

| ID | Severity / source | Required change and regression |
| --- | --- | --- |
| G2-A1 | P2, `src/execution-v2/access-profile-artifact.ts:275`, `:287` | Invariants reduce principal pins to user ID and lose workspace. Independently confirmed: changing only the reader's pin to another workspace still passes. Validate exact `(user_id, workspace_id)`, duplicates, target owner and every grant. Real installer rejection is not a reason to call dry-run valid. |
| G2-A2 | P2, `access-profile-build-operator.ts:59`, `access-profile-artifact.ts:130`, `:185` under the same directory | Failure output echoes unrestricted invalid namespace/action values. Independently confirmed with a synthetic sensitive action. Return fixed public messages/codes; test stdout/stderr contain no submitted sentinel or private path. |
| G2-A3 | P2, `access-profile-build-operator.ts:23`, `ordinary-access-install-dry-run.ts:54` | `readFile` precedes the size limit. Bound reads to limit+1 and reject nonregular files before reading; test oversized file, FIFO/device, directory and symlink policy. Reuse bounded-file patterns, not a larger limit. |
| G2-A4 | P2, `ordinary-access-install-dry-run.ts:53–65` | The target JSON is not independently integrity-pinned. Bind target/manifest hash and required file provenance, or explicitly report structural-only validation with target qualification NOT_VERIFIED. Test substituted bytes and symlink target. Artifact hash alone does not pin this second authority input. |

Existing good boundaries remain: deterministic compact artifact, complete owner
ceiling for included seals/actions, missing Live profile SHA excluded, output
`wx`/0600, pinned root-owned artifact intake, no silent installation or STREAM.
The seven files do **not** implement renewable/hot-addable ordinary profiles:
first install rejects an existing policy, and native Paper successor's 2-hour
limit is not an ordinary 12-month renewal implementation. Keep this as owned
implementation work, not a request to weaken native limits. Stan delegation
remains explicitly unimplemented; installation/activation is a separate gate.

## Observed — changes required before integration

Locators below are relative to `apps/control-api/` in the Observed worktree.

| ID | Severity / source | Required change and regression |
| --- | --- | --- |
| G2-O1 | P1, `src/execution-v2/observed-read.service.ts:78–86`; `src/execution/retained-snapshot.ts:69–73` | Raw metadata digest is compared with the derived retained-view digest. Independently confirmed using the actual retained transformer, zero mirror rows and unchanged source: valid read returns ACCESS_CHANGED 409. Fence the exact representation being served, including mirror changes. Do not remove the fence. |
| G2-O2 | P1, `observed-read.figures.ts:177–192` under `src/execution-v2/` | Census is inferred only from surviving equity rows; reported always equals total. Same-snapshot accounts A+B but equity only A can be labelled COMPLETE/1-of-1. Pass same-snapshot expected account/currency population and degrade absent/invalid accounts. Logical-account dedupe is not proof of stronger economic fund-NAV ownership; require source economic proof only for that stronger claim. |
| G2-O3 | P2, `observed-read.service.ts:31–34`, `observed-read.figures.ts:184–215` | Preserve relation STALE/UNKNOWN; evaluate each contributing latest account and the actual Return/DD grid timestamps separately. Independently confirmed: old complete grid plus fresh nonmatching latest rows returns numeric Return labelled AVAILABLE/FRESH. Snapshot stale quality must also reach figure-level quality. |
| G2-O4 | P2, `observed-read.figures.ts:215` | Two common timestamps do not establish sufficient coverage. Truncated/sparse grids need explicit sufficiency semantics and negatives. Numerical calibration remains a separate decision; missing calibration can be typed unavailable now, not arbitrarily accepted. |
| G2-O5 | P2, `observed-read.figures.ts:83–90`; `paper-read/manager-records.ts:224–229` | Numeric string IDs use lexicographic ties. Independently confirmed: id "9" beats "10" in either input order. Normalize integer IDs losslessly (BigInt), test mixed representations and values beyond JS safe integer. Do not round IDs. |
| G2-O6 | Major, published contract absent | Add observed OpenAPI, generated types, generator/check registration and canonical fixtures/negatives. Local Zod alone is not a consumable shared HTTP contract. Keep qualified Manager contracts unchanged. |

Accepted: flag defaults OFF and is checked independently, SCOPED_V2 is refused
before snapshot work, existing deliver fence is reused, observed trust/schema
cannot impersonate qualified Manager data, exact decimal arithmetic is retained.
Source answer already supports cumulative Paper/OKX NET_PNL within its stated
scope; do not reopen that answered question or generalize it to other profiles.
Mock scope tests are not real session/revoke/browser evidence.

## Claude next / Codex next / remaining gates

Claude can fix these two existing lanes independently, with one writer per
file, preserving component/design/baseline and keeping Access offline / Observed
OFF. Add correctness regressions (invert the diagnostic expectations after the
fix), then return exact source hashes and focused exits. Do not merely add a UI
guard over wrong backend facts. No need to wait for a new Edge bundle to fix
these owned defects or publish the missing contract.

Codex next: review each returned fix, schedule only affected tests, and reconcile
against the G1 checkpoint before the next integration gate. This file is a
published handoff, **not a Claude consumer ACK**. Connected source, calibrated
coverage, activation and browser acceptance remain distinct. G2 is not closed.
