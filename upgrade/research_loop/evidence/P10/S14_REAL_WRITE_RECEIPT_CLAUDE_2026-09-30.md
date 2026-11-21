# S14 — first real write receipt on the Research preview (Claude, 2026-09-30)

**Package:** Unified §13.4.1 **E6** left-open item 3 ("real-backend browser receipt for the S14 write path") and the S14 half of **OL-01**.
**Worktree/branch:** `portal-research-w1-build`, `docs/research-loop-plan` at `d3d99f26`. Not pushed.
**Stack:** isolated `portal-research-preview` at `http://localhost:8095`, built from `d3d99f26`, migration head 069 (`identity.json`). Owner-approved for this purpose only: register (and activate, if admitted) **new** alphas.
**Account:** `claude-preview`. The server's own predicate `mayActivateResearchAlpha` is `role === ADMIN` and it answered `may_activate: true`, so this account is ADMIN.
**Sources read:** `E6_S14_HIFI_CLAUDE_2026-09-26.md`; `alphaImportClient.ts`, `AlphaImport.tsx`, `useAlphaImport.ts`; `research-alpha-import.openapi.json` + `.v1.schema.json` + the five `research-alpha-import.*.valid.json` fixtures; `alpha-import.controller.ts`, `alpha-import.service.ts`, `repository.ts` (`registerImportedAlphaVersion`, `activateImportedAlphaVersion`), migration `1723680000057`; `scripts/research-loop-v11/p07-alpha-import.spec.ts`; `scripts/research-preview/seed-run.mjs`.

## 1. What this proves, and what it does not

**Proven on a real server (real Postgres, real analyser, real session/CSRF/origin gates):**

- parse → seven gates → register (DRAFT) → activate (ACTIVE) works end to end, twice: once by calling the four same-origin paths directly, once through the S14 UI in a browser. No write was stubbed in either run.
- The UI follows the server's state: stepper markers, the header chip, the registration rows, the registry strip (reloaded after each write) and the Activate button (`may_activate`) all agree with the responses, at 1440 and 660, with no horizontal overflow in 18 of 18 screenshots.
- Fail-closed holds on real bytes: a module without `warmup_bars` fails gate 1, gates 2–7 are `SKIPPED`, registration is refused server-side (409) and disabled in the UI.
- Re-parsing bytes that are already registered fails gate 3 (`digest-unique`) with `QUARANTINED_DIGEST_ALREADY_REGISTERED`.
- No existing alpha or version changed (Delta's registry entry is byte-identical before and after).

**Not proven:**

- **Running an imported version.** Still blocked by OL-01 and still a typed absence on screen. I did not create a preflight or a run (both write), so the claim "run admission refuses this version" rests on the code (`run-admission.service.ts:153,160`), not on a server answer.
- The non-admitted branch (`may_activate: false`): this account is ADMIN, so "Activation needs a workspace ADMIN" was not shown by a real server (unit tests cover it).
- A second version of the same alpha (`SUPERSEDED`, a non-null `supersedes`, `superseded_alpha_version_id`): only new alphas were allowed, so every predecessor field was `null`.
- A lost activation CAS, an expired receipt, a 401 mid-session: not provoked.
- Anything on dev, stable or production. This is one isolated preview.

## 2. What now exists on the preview

| Object | API run | UI run |
|---|---|---|
| alpha id | `s14-api-receipt` | `s14-ui-receipt` |
| version | `av_s14_api_receipt_0_1_0` (`av_0_1_0`) | `av_s14_ui_receipt_0_1_0` (`av_0_1_0`) |
| source digest (12) | `d182e41cf8cc` | `cf6bb0b23d61` |
| final state | ACTIVE, `alpha_revision` 2 | ACTIVE, `alpha_revision` 2 |
| registered (UTC) | 2026-09-30 07:11:27 | 2026-09-30 07:16:05 |

Also created, nothing else: 5 quarantine source rows (3 API, 2 UI; two are bound to the versions above, the other three are unbound and expire with the 10-minute lease), 5 gate receipts, the audit rows for the two registrations and two activations, and some fifteen `claude-preview` login sessions. No run, no preflight, no other endpoint. Sources: `s14_api_receipt.py`, `s14_ui_receipt.py` (valid, differing only in a comment line so their digests differ) and two `*_nowarmup.py` (same minus `warmup_bars`); the module shape is the valid source of `test_research_alpha_analyzer.py` (`version` 0.1.0, `timeframes ["1h"]`, `warmup_bars` 32, one `int_range` parameter).

## 3. Run A — the four operations called directly (same-origin paths, cookie jar, CSRF header)

Login `POST /api/auth/login` → 201. Baseline `GET /api/v1/research/alphas` → 200, 1 entry (`delta-rsi-polynomial-alpha`, ACTIVE, rev 2); `GET /api/v1/alphas/imports` → 200, `[]`.

| # | Request | Status | What came back |
|---|---|---|---|
| 1 | `POST …/alphas/import/parse` `{original_filename, source_text}` | **201** | `parse_ok: true`; 16 mirror rows; `source_file_ref` `rasrc_` + 26; 64-hex `source_digest`; `expires_at_utc_ms` +10 min. 8 rows PASS (7 parsed + the server-computed digest), `version_note` missing/GATED, 7 rows NOT_APPLICABLE (`server_assigned` / `not_in_contract`) |
| 2 | `POST …/import/gates` `{source_file_ref}` | **201** | 7 gates all PASS, `all_pass: true`, `gate_receipt_id` `rgate_` + 26; analyser gates `ms: 0` with `analyser_us` 2…272; gate 3 `CONTROL_API` `ms: 5` |
| 3 | `POST …/import/register` `{source_file_ref, alpha_id, gate_receipt_id}` | **201** | `DRAFT`, `alpha_revision` 1, `supersedes: null`, `replayed: false`, `may_activate: true` |
| 4 | `GET …/alphas` | 200 | 2 entries; the new one `DRAFT`, `supersedes_state: RECORDED`, `display_name` = the alpha id, full declaration echoed |
| 5 | `POST …/alphas/av_s14_api_receipt_0_1_0/activate` `{expected_alpha_revision: 1}` | **201** | `ACTIVE`, `alpha_revision` 2, `superseded_alpha_version_id: null`, `replayed: false` |
| 6 | `GET …/alphas` | 200 | the entry is `ACTIVE`, rev 2 |

Extra probes, all on the same new alpha or on unregistered bytes:

| Request | Status | Result |
|---|---|---|
| register again, same body, after activation | **500** `INTERNAL_ERROR` | see §6 item 4 |
| activate again, same and with a stale `expected_alpha_revision: 1` | 201, 201 | `replayed: true`, rev 2 (an already-active version short-circuits before the CAS) |
| parse + gates on the registered bytes again | 201, 201 | gate 3 `FAIL` `QUARANTINED_DIGEST_ALREADY_REGISTERED` ("identical artifact already registered as av_s14_api_receipt_0_1_0 …"), gates 4–7 `SKIPPED`, `all_pass: false` |
| parse + gates on the no-`warmup_bars` module | 201, 201 | `parse_ok: true` (!); gate 1 `FAIL` `QUARANTINED_CONTRACT` "ALPHA_CONTRACT is missing required fields: warmup_bars.", gates 2–7 `SKIPPED` |
| register that no-`warmup_bars` source as `s14-api-negative` | **409** `RESEARCH_ALPHA_IMPORT_GATES_REQUIRED` | nothing registered (the alpha does not exist) |

## 4. Run B — through the S14 UI (Chromium, real server)

The built frontend of the preview, served at `/research/quantbt/alpha-import`; session from the same login. No route was stubbed; every request in the browser reached the real API. Source loaded through the real file input (`s14_ui_receipt.py`), alpha id typed as `s14-ui-receipt`.

| Stage | UI action | Real request → status | Chip | Stepper (1/2/3) | Screen |
|---|---|---|---|---|---|
| 1 empty | open | `GET /api/auth/context`, `GET …/alphas` 200 | none | open* / open / open | empty panels, Parse disabled with its reason |
| 2 parsed | choose file, Parse | `POST …/parse` **201** | `QUARANTINE` | done* / open / open | 16-row mirror, digest `sha256:cf6bb0b2…`, "482 B", expiry in UTC |
| 3 gates | Run gates | `POST …/gates` **201** | `QUARANTINE` | done / done* / open | 7 PASS, `0.270 ms · analyser`, `4 ms · registry`, receipt + expiry |
| 4 registered | Register draft | `POST …/register` **201**, then `GET …/alphas` 200 | `DRAFT · av_0_1_0` | done / done / done* | 9 registry rows incl. entrypoint and "registered at" from the reloaded registry, DRAFT note, Activate offered (twice: button and registry strip) |
| 5 activated | Activate this version | `POST …/activate` **201**, then `GET …/alphas` 200 | `ACTIVE · av_0_1_0` | done / done / done* | `ACTIVE · rev 2`, Activate gone, DRAFT note gone, strip shows `ACTIVE rev 2` |
| 6–8 negative | choose the no-`warmup_bars` file, Parse, Run gates, open step 3 | parse 201, gates 201 | `QUARANTINE` | 1 done / **2 failed** / 3 open | `version` row `FAIL` (see §6 item 5), gate 1 FAIL + 6 SKIPPED `not run`, fail-closed note, Register disabled: "A gate failed. Fix the module and submit it again." |

(* = the selected tab.) Checked at every stage, at 1440 and 660 (DOM, not by eye alone; then every image looked at):

- **Horizontal overflow:** 0 px in all 18 screenshots.
- **Stepper** follows the server: `done` only after a 2xx receipt, `failed` on `all_pass: false`, the view follows the newest receipt.
- **State chip:** from registration on it is the server's word (`DRAFT`, then `ACTIVE`, from `lifecycle_state`) with the server's `version_label`. Before registration the chip says `QUARANTINE`. That is the HiFi's own word (E6 14-1, dashed border), not a server lifecycle state — the server has none for an unregistered source. Recorded so nobody reads it as a server field.
- **"new run with this av_ →"** is a `SPAN` with no `href`, no `tabindex`, `data-absent-code=RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE`, at all 16 UI screenshots, DRAFT and ACTIVE alike. The only other "New Run" link is the crumb's plain `next: New Run →`, which is not pre-filled with the av_.
- **No ISO-with-milliseconds** anywhere (times print `2026-09-30 07:16 UTC`); no 64-hex; no raw `null`/`undefined`/`NaN`; missing fields print as typed absences (`missing`, `at register`, `not in v1`), never `0` or a dash.
- **Long ids:** one defect, found and fixed (§6 item 2, §7).
- axe on `[data-screen='alpha-import']` (the 16 UI screenshots): only `color-contrast` (the known shared `--ink-faint` D-B1 token), no other rule.

## 5. Post-conditions on the server (reads only)

| Check | Result |
|---|---|
| `GET …/alphas` after both runs | 3 entries: `s14-ui-receipt` ACTIVE rev 2, `s14-api-receipt` ACTIVE rev 2, `delta-rsi-polynomial-alpha` ACTIVE rev 2 |
| Delta entry vs baseline | **byte-identical** JSON (same digest `34dc1847d051`, rev 2, `HISTORICAL_NOT_RECORDED`) |
| API alpha's entry vs its post-activation snapshot | identical (the 500 and the replays changed nothing) |
| `GET …/alphas?alpha_id=` for each new alpha | 1 version each, ACTIVE |
| `GET /api/v1/alphas/imports` (the imports list) | 200, `[]` before and after — this is the legacy Portal API list and is **not** fed by the Research import path |
| `GET …/alphas/{id}/lineage` for both new alphas | 200, one version, `active_version_state: ACTIVE`, no attempts, promotion pick `NOT_PUBLISHED` — the S14 "lineage" link opens something real |

## 6. What the real server did that the stubs did not predict

The E6 browser run stubbed all four writes with the canonical fixtures, every one at HTTP 200.

| # | Real server | Stub / contract said | Effect | Action |
|---|---|---|---|---|
| 1 | `gates` and `activate` answer **201**; `parse` and `register` 201 | OpenAPI declares 200 for `gates` and `activate` (the controller has no `@HttpCode` on those two); E6 stubbed 200 for all four | none: `alphaImportClient.ts` tests `response.ok`, not the code | Backend request (§8): make the controller or the OpenAPI say the same thing |
| 2 | ids are `rasrc_`/`rgate_` + a 26-character ULID (32 characters): `rgate_06GF2AWT45559T5YQ32P3V7TY5` | fixture id `rgate-demo-01` (13 characters) | **UI defect:** step 2 printed the whole 32-character receipt. E1 `shortId` cuts only hex tails and leaves a base32 ULID whole | **Fixed** in `AlphaImport.tsx` (§7); now `rgate_06GF2AWT`, full id in title/copy/`data-full-id` |
| 3 | the preview control-api accepts one Origin only, its configured `https://research-portal.primusspark.com`. From `http://localhost:8095` login is `403 ORIGIN_DENIED` and the write I tried (parse) is `403 RESEARCH_ALPHA_IMPORT_INVALID` "Request origin is not allowed." (the controller uses that code for every mutation) | stubs never reach the origin gate | the UI handled it (alert with the code and request id, `terminal` panel) but its sentence for that code — "The import request is not valid. Check the source and try again." — misdescribes an origin refusal. A person cannot use this preview from `localhost:8095`; the browser run had to load the page at the configured origin (see §9) | Open item: preview `PORTAL_PUBLIC_ORIGIN` was changed from what `preview.sh init` writes (`http://localhost:$port`); decide whether that is intended |
| 4 | **register replay of a currently ACTIVE version → 500 `INTERNAL_ERROR`** (twice, on two different alphas). Replay before activation → 201 `replayed: true` (UI alpha) | the contract documents `replayed`; the fixture only has `false` | not reachable from the UI (Register is disabled once registered), but it is a server bug reachable by any client retry after activation | Backend request (§8). Cause consistent with the code, not confirmed from a server log: on replay the INSERT still runs with `supersedes_alpha_version_id = alphas.active_version_id`, which is the version itself, and `CHECK (supersedes_alpha_version_id IS DISTINCT FROM alpha_version_id)` (migration `…057`) fires before `ON CONFLICT DO NOTHING`. The existing DB spec covers a replay of a DRAFT (T06/T11) and of a superseded version (T07), never of the active one |
| 5 | at **parse** time the mirror marks `version` (value `0.1.0`, fine) `FAIL` and the field that is actually missing, `warmup_bars`, `GATED`; `parse_ok` stays `true` | fixture rows are all PASS/GATED/NOT_APPLICABLE, never FAIL | the UI prints exactly what the server says: a red FAIL on a correct field, before any gate ran. Honest to the response, confusing to read | Backend request (§8): the analyser attaches the failed gate's verdict to every row of that gate |
| 6 | gate timings are sub-millisecond: analyser gates `ms: 0` with `analyser_us` 2…282 | fixture `ms` 1…3 | none: the UI prints `analyser_us` as `0.270 ms · analyser`; `ms: 0` alone would have printed "0 ms" | none |
| 7 | FAIL rows carry `quarantine_code` (`QUARANTINED_CONTRACT`, `QUARANTINED_DIGEST_ALREADY_REGISTERED`); SKIPPED rows have `timing_source`/`analyser_us: null`, `ms: 0` | the fixture has no failing gate | none: the UI prints state, message and "not run"; the code is a contract field it does not show | none |
| 8 | `display_name` equals the alpha id (`name: input.alphaId`) | fixture "Alpha demo" | the `alpha_id` row reads `s14-ui-receipt · s14-ui-receipt`: redundant, not wrong | not changed (cosmetic); noted |
| 9 | activate with a stale `expected_alpha_revision` on an already-active version → 201 `replayed: true` | the UI treats `ACTIVATION_CONFLICT` as the stale-CAS answer | by design (short-circuit before the CAS); the conflict path needs a DRAFT with a moved revision | none |
| 10 | the parse lease and the gate receipt expire together (10 minutes from parse), not 10 minutes from gates | fixture has an arbitrary future expiry | the UI prints both expiries; a slow reader gets `SOURCE_EXPIRED`, already handled and tested | none |

One contradiction on screen that the real DRAFT makes concrete, not changed here: step 3's DRAFT row prints the spec's verbatim "a DRAFT version can run as evidence but cannot compose rc_" while the OL-01 card beside it says run admission "refuses a DRAFT as RESEARCH_RUN_ALPHA_NOT_ACTIVE". The first is spec 14 §2.3 verbatim (`DRAFT_NOTE`); which sentence is true for imports is a copy decision for Bobby.

## 7. Code changed (frontend only, S14 files)

| File | Change |
|---|---|
| `apps/portal/frontend/src/research/AlphaImport.tsx` | `ReceiptId` / `UlidId`: a receipt id shaped `prefix_` + 26 upper-case Crockford base32 characters prints as the prefix plus 8 characters, with the full id in `title`, `data-full-id`, `aria-label` and the copy. Anything else still goes through the shared `ShortId`. The gate receipt in step 2 uses it |
| `apps/portal/frontend/src/research/alphaImport.e6.test.tsx` | 3 tests in "E1 — display rules": the **canonical gates fixture** with the one field the real server answered differently (`gate_receipt_id` = the id from the first real write) prints short and keeps the full value and no 30-character token; copy writes the full id; the canonical `rgate-demo-01` prints as before |

Kept inside the fence on purpose. The root cause is the shared `shortId` (`researchFormat.ts`), which cuts only hex tails: a one-line change there would fix every screen that prints a ULID-shaped id, but it changes other screens and their baselines, so it is left as a follow-up (§8), not done here.

Red/green: with the call site reverted to `ShortId`, the first new test fails (`expected 'rgate_06GF2AWT45559T5YQ32P3V7TY5' to be 'rgate_06GF2AWT'`); with the fix it passes.

| Gate | Result |
|---|---|
| `npx vitest run` alphaImport.test, alphaImport.e6.test, useAlphaImport.test, researchBoundary.test, researchFormat.test | 5 files, **97/97** (e6: 28, was 25) |
| `npx vitest run src/research/w4.test.tsx` | 23/23 (includes another agent's uncommitted edits to that file) |
| `npx vitest run src/research` (whole folder) | 45 files, **1437/1437** (includes another agent's uncommitted edits to `NewRun.tsx` and `w4.test.tsx`) |
| `npx tsc -b` | clean, no output |
| Fixed bundle in a real browser (built locally with `vite build`, served over the preview's real API; the two quarantine writes answered with the responses the real server gave in Run B, so **no new server write**) | receipt `rgate_06GF2AWT` at 1440 and 660, title and `data-full-id` hold the full id, overflow 0, no 30-character token |

The preview itself still serves the `d3d99f26` bundle, so a fresh visit to the preview still shows the 32-character receipt until it is rebuilt (I did not rebuild or restart anything).

## 8. Backend requests raised (not done here: brief was frontend only)

| ID | Where | Request | Test |
|---|---|---|---|
| S14-RW-BR-01 | `repository.ts` `registerImportedAlphaVersion` | Replay of the currently ACTIVE version must answer 201 `replayed: true`, not 500. Smallest change: read the existing `alpha_versions` row first and skip the INSERT when it exists, or bind `supersedes` to null when `active_version_id` equals the version being inserted (on replay the predecessor is read from the row anyway) | add register → activate → register-again to `p07-alpha-import.spec.ts` (T06/T11 / T07 neighbours) |
| S14-RW-BR-02 | analyser mirror `check` | a failed gate's FAIL should sit on the field that failed (`warmup_bars`), not on the fields that passed; `version` FAIL beside `warmup_bars` GATED reads as contradiction | `test_w4_cg_p07_03_a_failed_gate_marks_its_fields_fail` neighbours |
| S14-RW-BR-03 | `alpha-import.controller.ts` / OpenAPI | `gates` and `activate` return 201; OpenAPI says 200. Add `@HttpCode(200)` or amend the contract | contracts-test |
| S14-RW-FE-01 | `researchFormat.ts` `shortId` | cut ULID tails (`^[0-9A-HJKMNP-TV-Z]{26}$`) like hex tails, then drop `UlidId` from S14 | `researchFormat.test.ts` + a look at every screen that prints `ratt_`/`req_`/`rgate_` |
| S14-RW-OPS-01 | preview | `PORTAL_PUBLIC_ORIGIN` in `preview.env` is the public host, not `http://localhost:8095`, so the localhost URL cannot log in or write | ops decision |

## 9. Transport notes (how the browser run reached the real server)

- The Run A calls went to `http://localhost:8095` with `origin` set to the configured public origin, as `seed-run.mjs` sends it. Nothing went to the public host.
- Run B's page had to *be* at the configured origin, because a browser at `localhost:8095` sends its natural `Origin: http://localhost:8095` and the server refuses it (§6 item 3); a header override did not take (the server still answered 403). The harness therefore loaded the page at `https://research-portal.primusspark.com` with that hostname mapped to "not found" in the browser (`--host-resolver-rules`), intercepted every request to it, and fetched it from `localhost:8095`, response untouched. The page, its cookies (`__Host-` session and CSRF) and every fetch were the product's own; no request could leave for the public host. Session cookies were copied from a login through the same helper.
- Three earlier browser attempts hit the origin gate before that was understood (the first full run, seen only as a timeout waiting for the mirror; two debugging runs, seen as `403` on `POST …/parse`): the refused writes stored nothing.
- One deliberate wrong-password login probe (401 `INVALID_CREDENTIALS`) and one with the wrong origin (403 `ORIGIN_DENIED`), to learn which origin the server accepts.

## 10. Screenshots (not committed; scratchpad `s14real/shots/`, sha256 first 16)

| File | sha256 | File | sha256 |
|---|---|---|---|
| 1-empty-1440 | `19c97f565285ebff` | 1-empty-660 | `19eb644a97ef68ff` |
| 2-parsed-1440 | `cdf3e4f047fc20d1` | 2-parsed-660 | `c5188f5ecc1bd084` |
| 3-gates-1440 | `c9eeaa7c25924607` | 3-gates-660 | `69e238b2ae344668` |
| 4-registered-1440 | `f02993e1c4b6a534` | 4-registered-660 | `1bba9c81245835c3` |
| 5-activated-1440 | `fe282132d9171b88` | 5-activated-660 | `bb410f5da867b12b` |
| 6-negative-parsed-1440 | `00a258dcb103f557` | 6-negative-parsed-660 | `6ccccd4f0fe11555` |
| 7-negative-gates-1440 | `6a17c70d45c77f45` | 7-negative-gates-660 | `f5b37a33f34db1c7` |
| 8-negative-register-blocked-1440 | `b82bf38f95778a05` | 8-negative-register-blocked-660 | `ba630d77caef3c8b` |
| fix-gates-1440 (fixed bundle) | `a17ece4728dbc35c` | fix-gates-660 (fixed bundle) | `6608c536fcaa9d0d` |

The empty screen hashes equal E6's `real14-empty-1440/660`: the empty state is pixel-identical on the real preview and on E6's stubbed run. Looked at by eye, every image: header, chip, stepper, two-column step 1 and step 3 at 1440 line up with E6; at 660 the columns stack and nothing leaves the viewport; the one visible defect was the 32-character receipt id, fixed in the last two images.

## 11. Left open

1. **OL-01 / E17:** running an imported version. Not attempted, not proven (§1).
2. The five requests in §8, S14-RW-BR-01 first (a 500 on a retry after activation).
3. Rebuild the preview to carry the receipt-id fix, then re-read step 2 on the real stack (needs the owner; I did not touch the containers).
4. The non-ADMIN branch and a second version of one alpha (`SUPERSEDED`) against a real server: needs a second account and permission to write a second version.
5. The DRAFT-note versus OL-01 sentence on step 3 (copy decision for Bobby), and the `QUARANTINE` chip word being a screen word, not a server state.
6. Bobby's visual approval of the E6 S14 deviations table is still open (unchanged by this record).

## 12. Commits

| Commit | Scope | numstat |
|---|---|---|
| (this commit) | receipt-id fix + 3 tests + this record | filled in the hand-off message |
