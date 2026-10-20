# UXM-07 — Consumer receipt: RV-09 (Fleet options and source) and RV-10 (Paper exit request, cockpit families), 2026-10-20

Writer: Claude (FE writer). Consumer's record, **not** an ACK of Bobby (§10.3) and not a source acceptance. `FRONTEND_BACKEND_SYNC.md` and
`UNIFIED_IMPLEMENTATION_PLAN.md` are not edited. Lane: `BFF_DOUBLE` (Fleet: the real HTTP client over a stubbed `fetch` serving the dataset
double built from the published fixtures) and `FIXTURE_LAB` (cockpit, exit gate). No `REAL_READ_*`. Base `052ff450`; commits `d83d9ddd` (RV-09),
`b3216494` (RV-10), this receipt. Tier R1 (focused vitest + tsc); R2 pending. No visual-suite, Docker or hook run.

## 1. RV-09 — Fleet

| Asked | Done |
| --- | --- |
| Owner/health options are not the loaded page presented as the population | **Published**: the dataset can group by `owner_user_id` and `health` (`query_options.group_fields`) and a group list covers the whole authorized filtered query (`totals_scope FULL_AUTHORIZED_FILTERED_QUERY`). One `limit 1` read per field, over the lens (environment + stages) only, never narrowed by the search/owner/health already chosen, lists every value. A list that reaches the reader's group bound (200) is marked "may be cut short"; more than 200 is refused whole by the reader and falls back. **Otherwise** (field not offered, read refused, answer for another scope, the fleet read, which publishes no catalogue): the choices are the rows loaded so far, one sentence says so, and a typed value (Enter / leaving the field) is sent to the server as the filter. A late answer for a lens the screen left is dropped. |
| Source control automatic | The "Fleet read / Manager dataset" toggle is **removed**. Dataset = the table's source exactly when it is published for the caller on a single-environment table lens (Real-funded, Sandbox, Paper); fleet read otherwise (All lens, Board, unpublished). **One chip** names source and population: `Manager dataset · alpha versions` / `Fleet read · alphas` (tooltip carries the stage rule and scope sentence; the long paragraph is assistive-only). The populations differ (one row per alpha vs one per alpha version and portfolio), so the only way across is the explicit "Use the fleet read" on a failed dataset read (`src=fleet`) and its "Use the dataset" way back. |
| Fleet Archived | No archived-alpha read is published (FE-034, source board: NONE; the dataset has no archived selector and is single-environment), so the lens makes no request and reads `Not available`. |

Tests (`screens/fleet`, 7 files, 1303 passed): published options with 130 rows / 3 pages (owner and health only on page 3 offered at once; two reads; no filters in them);
choosing the page-3 owner sends `EQ` and does not reload the choices; fallback when the dataset cannot group (paging grows the loaded list, sentence stays, typed value reaches the server;
Health menu typed value); wrong-environment answer refused; 503 not an empty list; **late answer dropped** across a lens switch; 200 groups not called complete; 201 refused whole;
Archived makes no request; **keyboard** (Enter commits, Escape reverts, empty clears; native select). Legacy: 130 rows over 3 pages, typed owner on page 1 reaches page 3.
`datasetDouble.testbase.ts` gained `variantFor` (per-request variant) because the rows and the choices now ask concurrently.

### Design deviation for Bobby's review (screenshots: `rv09-rv10-shots/`)

| | 1440 | 390 |
| --- | --- | --- |
| Before, default (toggle, fleet read) | `fleet-before-1440-default.png` | `fleet-before-390-default.png` |
| Before, `src=dataset` | `fleet-before-1440-dataset.png` | `fleet-before-390-dataset.png` |
| After (automatic, one chip) | `fleet-after-1440-default.png`, `-health-menu.png`, `-all-lens.png` | `fleet-after-390-default.png`, `-health-menu.png`, `-all-lens.png` |

What changes on screen, honestly: (1) the toggle is gone and a small chip appears; (2) on a published single-environment lens the table is now the dataset's by default,
so the **KPI strip and the lens counts (fleet read summary) are no longer shown there** (they were never shown in dataset mode; before, the default hid this because the toggle defaulted to the fleet read);
(3) Owner is a select (full list) or a typed field (loaded so far); Health menu lists the published words; (4) the long source paragraph is gone; (5) a flag in the partial banner no longer wraps letter by letter at 390.
Needs Bobby: is "dataset by default on single-environment lenses, no KPI strip there" acceptable, or should the fleet read stay the default? The chip text is unreviewed copy.
Pixels are unmeasured against the HiFi; the screenshots are from a temporary Playwright run (private ports, spec/config/builds deleted), not baselines.

## 2. RV-10

| Asked | Done |
| --- | --- |
| Paper exit review request control | `workbench/ExitReviewRequest.tsx` (+ pure `exitReviewRequest.ts`, own `css/exitReview.css`) in the exit gate: **one** control, "Request review", shut with one short reason or a small form (8..1000 chars) bound to the parent R2's published `capture_context` (workspace, parent approval, version, projection digest, this deployment; refused on another action/workspace/deployment, blocked, truncated list lacking the deployment). Opens only if the server offers `PAPER_EXIT_CREATE` **and** the binding exists. `paper.exit_review_request` eligibility only changes the words of a shut control (test: ELIGIBLE never enables). Receipt + link to the review in Approvals + status read back via `getGovernanceParent("exit")` (refused for another review/workspace/deployment; V1 shows the quorum only, no invented "Pending"). Unknown outcome retries under the same key; double click = one request; late answer after a scope change dropped; an answer for another workspace or without the review id is "unknown", never "requested". |
| Typed gap (no invention) | **No read publishes the R2 parent of a deployment** (the Paper profile has no approval id/version/digest; no deployment->R2 lookup; the V2 parent family has no `capture_context`). The live screen therefore passes none and the control is shut with `R2_PARENT_NOT_PUBLISHED_FOR_DEPLOYMENT`. Contract needed (Codex): either `capture_context` (or the same pins) on the Paper profile / a deployment-keyed lookup, or on the V2 R2 parent plus a deployment->R2 join. The Header lifecycle's disabled "Request exit review" (Header.tsx, outside my ownership) now duplicates this control: remove it when this lands. api/workspace are threaded through `OverviewTab` and `index.tsx` (3 lines). |
| `expected_versions` prefill | **Not done: no pending-control form exists in the FE** (only the discovery reader and the dock list; the preview/submit/reconcile routes have no port method or screen). Not invented. Needed: a pending-control preview form (owner: the command/UXM-09 slice) that reads `PendingRecallDiscovery.items[].versions` for the same resource, environment and `original_recall_id`. |
| Cockpit Archive / Reactivation / Capital | Chips are **selectable** (`view=archive|reactivation|capital`, restored on reload; the gate lane reads All and keeps its counts). Each opens a read-only panel (`FamilyPanel.tsx`) of what the contract publishes: archive and reactivation publish **nothing** (typed `Not published (FE-034)`, no list); Capital says capital changes are commands, not approvals, and links to the open recalls in Operations (workspace kept). Each request control stays disabled with ONE reason ("Not offered in the portal yet" / "Relay is not qualified yet"). While a panel is open no gate evidence is read for a leftover selection and J/K do nothing. |
| Fleet Archived | See section 1 (`Not available`, no request). |

Tests: `ExitReviewRequest.test.tsx` 37 (binding table, summary bounds incl. code points, fingerprint, capture check, read-back refusals, shut states, eligibility never enables, capability failure,
workspace change, exact POST body, receipt, double click, **keyboard**, refusal, unknown outcome same key, thrown request, wrong-workspace answer, **late response dropped**, panel integration);
cockpit family tests (selectable, URL, reload, typed absences, Capital link, disabled reason, no gate reads, no writes, keyboard).
Port methods added: **none**.

## 3. Gates

`vitest run src/execution/v2/screens/{fleet,cockpit,workbench} --maxWorkers=2`: fleet 7 files 1303, cockpit 6 files 651, workbench 7 files 1518, all passed.
`v2Hygiene`, `failClosed`, `disabledReason`, `absentValues`, `linkTargets`, `testHygiene`, `uxm10Css`, `boundary`: passed. `tsc --noEmit -p .`: exit 0.
NOT_RUN: Playwright suites, visual pinned image, hook R2/R3, `REAL_READ_*`; the e2e BFF doubles still do not serve `/manager/fleet` (debt, not my files).

## 4. Remaining (owner, closing condition)

1. R2 parent for a deployment (Codex): closes when a read carries the pins and the screen passes `captureContext` (one prop). Then a browser pass and a BFF_DOUBLE for the four governance routes.
2. Pending-control form and `expected_versions` prefill (command slice).
3. Archive/Reactivation read and executor (FE-034, Codex+PM+Research): the panels then read it.
4. Bobby: the Fleet default-source decision and chip copy (section 1); "Request review" copy; remove the Header duplicate.

## 5. Rollback

`git revert b3216494` (exit gate control, cockpit panels) and `git revert d83d9ddd` (Fleet): both read-only/additive on top of fail-closed reads; reverting restores the toggle and the disabled chips.
