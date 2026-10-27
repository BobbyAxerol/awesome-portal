# Core backend continuation — 27 October 2026

## Scope and round-start pins

Bobby assigned Accounts/Portfolio/Exposure, Contributors/NET_PNL, metadata,
health, Score, History, Calendar and command bridge. This is a continuation of
ELP2-05/06/07/09/10, not a change to their exit gates. Core entry is
`docs/research-loop-plan@0134a4bf05e01b09c1af5c60410c4451e35ba78f`;
entry tree `2bbd3de55c594af25d59db49c2749157c5b8653e`. Claude's last
committed worktree `/home/bobby/portal-research-fe2` was clean at `00e7f6cff`;
its changes were previously included in the local consolidation. Edge was
read-only repinned on HK at `feat/execution-edge-upgrade-v1_2@9ae6f128144e8a17919d21ce7b12654c42d9ded4`;
its existing tracked and untracked WIP was not touched. The owned PM candidate
was clean at `9d114cea5f3e6b95bff299cee04bf6b7203e2382`. No secret read or
business runtime changed. Edge's latest source observation is retained in
[Paper authority and transport](PAPER_AUTHORITY_AND_SOURCE_TRANSPORT_2026-10-27.md).

## Accounts cut fence — implemented, not installed

The owning refresh rejected any financial observation later than its source
cut, but `mapBindingFinancialBatch` did not enforce this on retained or other
page-batch reads. The same validation now covers equity, virtual used,
headroom and sleeve-count clocks in both ingress paths. A snapshot whose cut is
unknown retains its previous behavior; this change does not assert a new
source cut. Invalid/future data returns the existing typed unavailable error.
No public schema, database, UI or permission semantics were changed.

Touched `apps/control-api/src/manager-lists/binding-financial-batch.ts` and
`apps/control-api/test/binding-financial-batch.spec.ts`. Six regression cases
exercise all four clocks, the actual retained batch adapter and an unknown cut. No qualified
source or actual API/browser receipt is implied.

## Current disposition and next owners

| Area | Current status / next action |
| --- | --- |
| Accounts, Portfolio, Exposure | Existing batch and projection plus new cut fence are source-only; bind the qualified source/permissions and check real refresh → API on one cut. |
| Contributors, NET_PNL | Group reader and shared dataset/series reducer exist; Edge coordinates source identity, economic census and ownership mapping, then Core performs actual parity checks. |
| Metadata, Operations health | Existing scoped mappers and health projection remain; exact field publication and health source facts need qualification before positive real-source acceptance. |
| Score | Existing formula and weights are unchanged; input/config/calibration approval and source-based tie-out remain open. Fixture values are not production calibration. |
| History | Byte budget and independent authorization tests exist; actual source/pagination/revoke performance receipt remains open. |
| Calendar | Portal seam exists; source provider remains `SOURCE_DARK`, not AVAILABLE. |
| Command | Source gateway tests do not commission submit/status/recovery; verify the same original intent through the approved gateway. Command and Live remain disabled. |

Claude can continue using the published contracts and linked fixtures; no
new field or component change is requested. After source installation,
browser acceptance must name the actual candidate and source. Edge is the
single coordinator for PM/TS inputs. ELP2-10 remains NOT_MET; no full phase,
runtime, browser, deployment or release success is claimed.

## Verification and rollback

- Before the change: 10 selected suites for the areas above, **300/300 PASS**
  with single-worker Vitest. This is synthetic/local evidence, not source
  qualification; counts include the then-current Accounts suite.
- After the change: Accounts focused suite **51/51 PASS**, including six new
  cases. These overlap the earlier run and must not be added as unique tests.
- Control API `tsc --noEmit -p tsconfig.build.json`: PASS on the changed source.
- `scripts/execution-tracking-test.sh`: PASS; receipt/link and diff checks PASS.
- The initial normal commit hook failed in contracts: 110 suites passed, two
  failed (one missing `read-fields.ts` in the isolated runner; two assertions
  still expected scoped runtime facts to be refused after FE-067/072). The
  runner now copies the exact pure dependency, and the old test now verifies
  the previously delivered positive runtime contract without weakening its
  reconciliation/session negatives. The exact two affected suites retook
  **82/82 PASS** in the networkless Docker contract cell. This is a retake,
  not a whole-hook PASS. Original failed attempt is not erased.
- The normal hook retake passed the full contract workspace **112 suites,
  1,897 tests**, then failed while building Control API: Node exhausted its
  roughly 1.5 GiB heap in the hook's 3 GiB container. The local TypeScript
  check above passed, but that does not turn this hook into a PASS. The four
  code/test/runner files remain staged and **not committed**; the next owner
  must resolve the bounded build heap and retake the required hook before
  landing. No resource limit was silently widened for this attempt.
- Follow-through on 27Oct: `scripts/control-api-test.sh` sets the build-only
  Node old-space to 2304 MiB inside the **unchanged 3 GiB / 3 CPU container**.
  The isolated Control API build, Accounts **51/51**, and PostgreSQL restore
  drill all passed. A subsequent normal hook again passed **112 contract suites,
  1,897 tests** and the Control API build, but its single-worker full Control
  API suite produced no completed suite for almost seven minutes while using
  CPU. The integrator deliberately stopped that run to bound resource use; it
  is **INTERRUPTED, not PASS or a diagnosed test failure**; a long first suite
  has not been proven to be a stall. The named test containers and network
  were confirmed absent afterwards. Diagnose duration and retake the normal
  gate before landing; all five source,
  test and gate-runner files remain staged, not committed.
- The normal hook created disposable test containers and a disposable test
  database through the repository scripts. No business database, listener,
  test credential or external business data was created or changed. Rollback
  is to revert the two Core files and the two contract-test/runner fixes if
  desired; retain source/audit data and all prior receipts. No remote push,
  dev/main change or activation.
