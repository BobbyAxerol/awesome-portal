# Research backend closeout checkpoint — 2026-10-01

This is a scoped implementation receipt, **not** P23/P24 product acceptance. Source branch: `codex/be-gaps`, base `4c9526c9`. No production, dev, preview or remote ref changed in this slice.

## LEGACY-EXPORT-SEC — code and focused tests

- The Control API facade requires the run to exist in `run_read_models` for the selected personal workspace. Cross-workspace/unmirrored runs return 404; any USER receives 403 even for a run in scope; encoded route aliases fail before proxying. Only ADMIN can export, and remains scoped to the selected workspace.
- `POST /api/runs/{run_id}/export` is the explicit archive preparation step. It still traverses the existing ADMIN + same-origin CSRF write boundary, and the private Portal API independently requires a signed ADMIN principal.
- `GET /api/runs/{run_id}/export` requires the same private principal but **never materializes an archive**. It returns 404 until an archive was prepared. Archive preparation uses an owned scratch directory and atomic ZIP replacement; a failed rebuild leaves the last complete ZIP unchanged.
- Existing legacy UI `<a>` export links must be changed by Claude to an explicit prepare-then-download action (or be hidden with a typed unavailable state). This is an intentional security contract change, not a UI design change by Codex. Do not deploy the code with a live link claiming immediate GET export until that FE consumer is updated.
- No existing artifact, source data, run, volume or account was deleted. The only new DB was a disposable local PostgreSQL test container; it is stopped after the focused test.

Focused evidence (not a full gate): Python `test_audit_and_export_endpoints` and atomic failure test **2/2 PASS**; Control API facade isolated PostgreSQL test **1/1 PASS** (anonymous 401, wrong workspace 404, encoded alias 400, missing CSRF 403, allowed scoped POST 201/GET 200); `npm run build` PASS. The initial facade attempt could not reach port 5432; it was rerun against the disposable PostgreSQL on loopback 55439. The Python test environment reused the pinned main-worktree venv while executing this worktree source. No QuantBT engine image was rebuilt.

## BR-TXT-01 — scoped copy reduction

- The WFO/P04 Report server-owned `headline_footnote` is now a short source-scope caption. The old-seal test still asserts the numeric `NET_RETURN` is typed absent and the account-path equity is not relabelled OOS. Focused Control API report test **1/1 PASS**.
- The broader server-copy inventory and `AtlasNotPublishedFact.reason_code` remain open; this change does not claim full BR-TXT-01 closure.

## MIG-075/076 — known stack ledger census

Read-only `pgmigrations` query on 2026-10-01: Research preview has canonical 075 and 076; current dev and stable have neither 068/069 nor 075/076. Therefore the known dev/stable stacks have no old-name collision today. Repeat the same read-only preflight for any other long-lived DB before upgrading; do not rewrite a ledger speculatively.

## Frontend handoff — do not duplicate F2

Claude already landed F2 at `9dd23ec7` and has additional uncommitted FE work. Bind only the still-unread product facts after reviewing its newest commit:

| Screen | Backend fact | Consumer rule |
|---|---|---|
| S03 | `ProgressRunIdentity.planned_folds`, `trial_completed.rate_trials_per_s` / snapshot rate | Planned rail is not observed progress; old journals show typed absence, never zero throughput. |
| S04 | `EvidenceHub.core.window_disclosure` | Show retained IS/OOS window counts; overlapping fold sums are not a distinct bar total. |
| S09 | `equity.digest`, `digest_scope`, `digest_availability` | Byte digest is from a new P05 seal only; old seals remain typed absent. F4 analytics v2 is all-time here. |
| S14 | `ResearchAlphaRegistryV1.next_cursor` | Paginate only with the opaque workspace/filter-bound cursor, not client-side slicing. |
| Research shell | workspace-scoped Run Library | `LW-08`: count/status must not come from legacy `/api/runs`. |
| S01/S04/S09 | `summary_analytics_v2` / `last_30d` | F4: S04/S09 all-time, only S01 last 30D; old seal absence stays explicit until AN-29 sidecar is verified. |

F3 visual/real-API and F5 write-path acceptance are separate; fixture success is not a real product receipt. No Research TSX/CSS/visual baseline was edited here.

## Still open after this slice

LW-03 needs a QuantBT owner source revision that retains OOS-generation records. Fresh WFO/seal receipts, HMD metadata index, AN-29 sidecar (Bobby approved), P21 fixture pack, requested-spec v2 executable admission, T12/T14, one-candidate P23 retake and P24 signed-release rehearsal remain work, not claimed PASS.
