# ELP2-07 — source-pinned administrative control candidate codec

## Entry and limits — 2026-10-17

Bobby's existing02–10backend assignment, baseline322e2347 on
`docs/research-loop-plan`. Two-file private implementation/test slice:
`pm-control-adapter.ts`, `elp207-pm-control-adapter.spec.ts`.
APPLIED/UNCOMMITTED / NOT_RUN. No route/public schema/generated type, action/
grant, resolver, sender, factory, timer, migration, frontend, source/runtime
installation, command/Live enablement, push or release/deploy change.

Read-only HK source review10:29:15–10:31:23UTC pinned PM
`e62b68259761f020f3d6b77fa6b879c2a19a55f8`, Edge
`8560ac10cdc04a2ffd11a50c050b10235647b4eb`; peer dirty files untouched.
PM `operator_adapters.py`sha256
`5f0c5545a109ce3f17ab1b9a483b5f6d84964055b0d54f523ac2396b1e1e6641`,
`operator_wire.py`sha256
`3bfa1f6246224ae21da29668685835806112afa98d4893dd45a4c63b32b58fb9`.
This is source context, not deployed identity/installed authority. Independent
review accepted the local candidate with an explicit pin/context limit;
older differing adapter bytes were not substituted for the current source.

Follow-up10:54:36UTC re-read the exact committed source excerpts
`operator_adapters.py:82–103,274–303,542–548` and full `operator_wire.py`;
HEAD/digests unchanged and both files clean, unrelated owner WIP untouched.
Private source-contextsha256
`6794fd8b086432654328b1971963d5bd3b6330971efe29ef6d5cb6a35a252ee0`.
This closes the review's body-context limit, not mounted source qualification.

## Exact behavior

- Only `pma.operator-control.v1` ADMIN_LOCK and ADMIN_UNLOCK. LOCK requires
  lock_id/kind/amount and exactly budget/source CAS; UNLOCK lock_id and exactly
  budget/source/lock CAS, no amount/kind. Deployment-account targets need BOTH
  account/deployment IDs; Root/Portfolio cannot carry that pair. Closed own
  data records reject extra/prototype/symbol/getter fields without evaluation.
- Counter strings retain signed64 safety; decimal strings preserve zero and
  precision. Absolute-end checks reject terminal newline/Unicode separators.
  Lock-kind economic admissibility remains PM's decision, not a made-up enum.
- Fixed candidate capital preview/apply path, one bounded encoded server-
  selected target segment, no dynamic URL/query. Exact method/path/query/body
  bytes use the existing HTTP request digest, NOT PM's normalized intent hash.
- Descriptive PREVIEW_ONLY/UNKNOWN/claimedAPPLIED candidate result, CLI codes
  strings. Preview cannot reserve or carry an owning receipt. UNKNOWN keeps
  null business result and same-intent query direction. ClaimedAPPLIED requires
  actual receipt/event text and explicit no physical transfer; optional source
  facts stay absent. Unsupported states fail, never become success.
- Output ALWAYS candidate-only/NOT_AUTHENTICATED, authoritative business null,
  trusted command status null. An arbitrary receipt/target string is not real
  same-intent correspondence. Never feed this into accepted command ledger or
  fabricate the existing eight-operation capital full Outcome/amount partition.

Bounded32KiB maximum descriptive response and explicit caller byte caps are
codec defenses, NOT measured/approved production budgets. No owning effect is
possible through this pure module. Required BUDGET versus UNLOCK is descriptive
source capability, never a Portal grant or authentication proof.

## Validation, rollback and next

Synthetic codec tests cover exact CAS/target pairs, decimals/large counters/
zero, fixed HTTP bytes, accessors/extra fields, finite states/receipt shape,
line controls and unchanged default command trust. Include APIbuild in the
grouped04/06/07cell; no source/HTTP/PG/provider acceptance inferred from tests.
Results NOT_RUN at entry. Normal coherent hook still required for landing.

Rollback removes only this unmounted candidate module; no data/receipt/grant
deletion. Backend next: source-pinned reallocation/pending/profile/management
codecs plus genuine family Outcome/accepted current all-scope bridge. RETURN
still lacks owning writer; authenticated mounted command transport/current-
human through physical COMMIT remain independently OPEN. No second R1/PM
ledger or automatic Live trade. Claude NOT_STARTED_BY_OWNER_DIRECTION;
AWAITING_CONSUMER_REVIEW, no new frontend field delivered in this private slice.
