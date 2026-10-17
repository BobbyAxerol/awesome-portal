# ELP2-07/08 — Finite PM management candidate codecs

## Scope and source pins

Local backend continuation at `docs/research-loop-plan@f1f5fc7d`; no sender,
runtime mount, permission grant, native operation or source activation.
These are source-aligned **candidate codecs**, not trusted command Outcomes.
Private source context/reviews are retained under local-state20261017.

Read-only SSH recheck approximately11:54UTC: AWS HK
`bobby@16.163.212.33`, PM worktree
`/home/bobby/.worktrees/trading-system-pm-v1_1`, HEAD
`49a6acc33f04989b1aac6cd0375a0cf5ac2ff73a`.
Owner-modified Unified/concurrency/campaign scripts and three untracked fund
probe files were observed and preserved. Source files used by these codecs
remain byte-identical to the earlier full-body review:

| File in PM `services/portfolio_management/` | SHA256 |
|---|---|
| `operator_adapters.py` | `5f0c5545a109ce3f17ab1b9a483b5f6d84964055b0d54f523ac2396b1e1e6641` |
| `operator_management.py` | `f0e18d47649040af67b708978b5ae07dba7faeafc65e91ac73e82525d2d956ab` |
| `operator_wire.py` | `3bfa1f6246224ae21da29668685835806112afa98d4893dd45a4c63b32b58fb9` |

Source SHA/cleanliness does not prove deployment, installed provider, schema,
trusted transport or supported canonical instance identity. No DB/credential
was read and no remote code/test/resource was changed.

## Actual local delivery

| Family | Files | Closed semantics |
|---|---|---|
| `APPLY_PENDING`, `CANCEL_REMAINING` | `pm-pending-control-adapter.ts`, matching spec | Exact `pma.operator-control.v1`, five string CAS versions, original command/recipient/currency/pair matching, fixed preview/apply/status paths and byte digest |
| `REGISTER_INSTANCE` | `pm-instance-registration-adapter.ts`, matching spec | Exact `pma.management-command.v1`, two int64 string CAS pins, declared instance fields and fixed management/status paths |

Pending result retains exact applied/pending/cancelled/rejected partition.
Partial cancellation never reverses the already-applied part; UNKNOWN is
null/QUERY_SAME_INTENT, never zero/success. Missing source partition is typed
not-published, not inferred. Preserve original-receipt lineage and actual
source state; unsupported finite states reject rather than translate.

Registration APPLIED is only a source presentation fact about a registry
command. `target_id` is an opaque **source-reported** ID; neither equality
nor inequality with registration reference proves a canonical account,
deployment, identity or lifecycle. The currently inspected source presenter
cannot qualify that mapping. No funded/active/bound/trading state is inferred.

Both return `authority:NOT_AUTHENTICATED`, authoritative business result and
trusted command status null. They do not implement `SourceCommandResult`,
perform HTTP calls, install current-human providers, create grants or enable
actions. Existing full capital Outcome is not substituted for a family-specific
candidate response. Source-compatible bytes alone cannot close original07.

## Tests, status and rollback

At entry **APPLIED/UNCOMMITTED, new tests NOT_RUN**. Exact-scalar/path/pair/CAS,
prototype/getter/array/counter/byte bounds, preview/unknown, receipt correlation,
partial amount partition and opaque target cases are included in the grouped
normal-hook API gate. No live command test or source/runtime acceptance claimed.
Private independent registration review's identity wording correction is
applied; source state coverage is a finite subset, not all management operations.

No public OpenAPI/FE field is introduced by these private codecs. Claude
remains NOT_STARTED_BY_OWNER_DIRECTION/AWAITING_CONSUMER_REVIEW. Existing08
disabled/unknown/preview states remain appropriate; do not display a success
action simply because these modules compile.

Remaining backend: REALLOCATE_BUDGET, profile/assignment/rebind/lifecycle/
monitor families, canonical source target resolution, full request/result
bindings, authenticated factory and current-human authority held through owning
COMMIT. RETURN_CAPITAL still lacks its own economic writer; never alias recall
or negative FUND. Continue independent families within approved scope, while
original source/wire/current grant gates remain OPEN. Resource gate shares the
bounded Core cell; no HK job/build/migration. Rollback removes only candidate
callers/code, preserving all original receipts, data, pending obligations and
audit. No push/deploy/Live operation.

**Impacted candidate validation12:35UTC:** APIbuild PASS; pending-control39
and instance-registration36 tests PASS in the isolated cell. Input/output
fixtures are synthetic source examples, not authenticated PM business
outcomes. The overall18-suite batch still failed one unrelated new capture
assertion; restore NOT_RUN and final normal hook pending. [Exact terminal,
hash and limits](../ELP2-06/original-restated.md#elp206-restated-focus-1235).
No command commissioning, sender, credentials, grants or runtime activation.

## Profile and reallocation follow-through —2026-10-17

Read-only source repin12:40–12:49UTC: same HK PM worktree/branch,
`7ea79f91f9f4c0e1a24c1f978a9268ff7a4f7346`. Owner economic/current-root/
manifest/guide WIP remains preserved, not a clean-whole-tree claim. Relevant
operator_adapters/operator_wire bytes still match the table above. Additional
source pins (exact paths; reallocation repository belongs to `risk_pool`):

| File | SHA256 |
|---|---|
| `services/portfolio_management/binding_repository.py` | `cee38e2c62415043a00e8ba1b36d8e0da4747df3ef49f4ca5ceed5c00ffaa9b1` |
| `services/portfolio_management/lock_reallocation_contract.py` | `8e90855dc08c9457cb396cda218cefb767ef87cff11274cd263a354b2ef628cf` |
| `services/risk_pool/lock_reallocation_repository.py` | `698d638dce94b28695c1fcb3751cd0e7efb9ad5eaa214d2e870e2ddc95810075` |

Source current-human provider remains UNBOUND_FAIL_CLOSED/unmounted; these
bytes do not prove deployment or authenticated financial authority.

- `pm-profile-adapter.ts`: SET_LEVERAGE/MARGIN_MODE/POSITION_MODE/ACCOUNT_MODE,
  exact nine-field `pma.profile-command.v1`, string int64 profile CAS and opaque
  desired/affected fields. Fixed PREVIEW/PREPARE/RECONCILE/status paths and
  request-byte digest. Minimal/full UNKNOWN, GUARDED, PREVIEW_ONLY and APPLIED
  stay distinct; even presented APPLIED requires QUERY_SAME_INTENT here.
- `pm-reallocation-adapter.ts`: exact12-field `pma.operator-control.v1`, seven
  CAS counters, portfolio parent, distinct source/destination accounts and
  deployments. Exact BigInt decimal conservation, parent delegated bound,
  three-by-two version advances and immutable RETURN/REGRANT legs. Never a
  recall-plus-fund or native transfer shortcut. The presenter's missing request
  identity is explicit NOT_PUBLISHED/SOURCE_SUMMARY_REQUEST_IDENTITY_NOT_PUBLISHED,
  not inferred from an amount or outcome.
- Both remain NOT_AUTHENTICATED, business/trusted status null, no network or
  public CommandIntent union. Independent static reviews accepted only this
  source-compatible scope; new unit cases are NOT_RUN before grouped gate.

This supersedes the earlier *candidate codec missing* note for these two
families, not their full authenticated-family bridge requirement. Assignment,
rebind/lifecycle/monitor, canonical target mapping, RETURN owning writer,
family-specific public DTO/policy/status and held current-human COMMIT remain
OPEN. No new FE fields; Claude held. Rollback only candidate callers/code;
preserve grants, receipts, pending effects, financial records and audit.

**Impacted validation13:16UTC:** profile22/22 and reallocation20/20 PASS;
APIbuild and264/264 total tests across11files PASS. Post-test shared-Core
restore fixture failed before dump because this isolated narrow selection
does not initialize its Core base tables. [Exact terminal and limitations](../ELP2-06/scoped-score-history.md#impacted-gate-terminal-2026-10-17t1316utc).
Normal full Core hook/restore remains required. No source call or authenticated
outcome is claimed by these synthetic candidate tests.
