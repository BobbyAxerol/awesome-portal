# Core009 PREPARED owner return — Core → Edge (2026-10-20)

From: Claude (backend writer for Core009 under Bobby's 2026-10-20 assignment). To: Edge, PM, Codex (review).
Answers `CLAUDE_CORE009_PRIORITY_HANDOFF_2026-10-20.md` §4–5. Analysis:
[CORE009_PREPARATION_2026-10-20.md](CORE009_PREPARATION_2026-10-20.md); steps:
[CORE009_OPERATOR_RUNBOOK_2026-10-20.md](CORE009_OPERATOR_RUNBOOK_2026-10-20.md).

**Disposition: `PREPARED_SOURCE_ONLY`. Nothing is INSTALLED and nothing is CONNECTED.**
No runtime, database, Docker, SSH, secret, session, grant or policy was touched while writing this.
Values below marked `NOT_PROVIDED` are inputs Core cannot invent; each names its owner.

## 1. State markers (one row per claim; do not merge them)

| Item | PREPARED | INSTALLED | CONNECTED | Owner of the next step |
| --- | --- | --- | --- | --- |
| Source: validator, templates, readback SQL, tests, runbook | **YES** (§2) | NOT_RUN | n/a | Codex review |
| Filled `portal.native-core-runtime.v1` (hash-pinned) | NOT_RUN | NOT_RUN | n/a | Core (needs §4 pins from Edge, Core private refs) |
| Filled `portal.private-owner-manager-commissioning.v1` (independently reviewed) | NOT_RUN | NOT_RUN | n/a | Bobby approves; Core fills; Codex reviews |
| Reverse bootstrap quiesced at zero custody | n/a | NOT_RUN | n/a | approved operator |
| Policy install (`execution-native-install policy`) + ACK | n/a | NOT_RUN | n/a | approved operator |
| Standard `main → prepareNativeCoreRuntime → composeNativeCore → AppModule` process | n/a | NOT_RUN | n/a | approved operator (Codex lane) |
| READ (`business.read_all`) end to end | n/a | n/a | NOT_RUN | Edge + Core |
| STREAM (`stream.subscribe`) independent of READ | n/a | n/a | NOT_RUN | Edge + Core |
| Revoke / cache / cursor / no-late-byte / restart / same-obligation recovery | n/a | n/a | NOT_RUN | Edge + Core |
| Genuine owner session reference | n/a | NOT_RUN | NOT_RUN | open decision (Bobby) |

Last observed runtime facts (Edge's 05:45Z read, **not re-observed by this writer**): container
`5f3252b7…`, image `sha256:7b2c7f34f134323201f447084440973b9aefd22318fdb09ff1e1bc35c4c4395d`, restarts 0,
no `CONTROL_API_NATIVE_CORE_CONFIG_*`, exact workspace 0 policy / 0 grants / 0 events, owner ACTIVE.

## 2. Source pins (computed with git in this worktree)

| Pin | Value |
| --- | --- |
| Worktree / branch | `/home/bobby/portal/.claude/worktrees/agent-a3965389c36a192f6`, branch `worktree-agent-a3965389c36a192f6` reset to `claude/fe-parity` base |
| Base (not modified) | `5152cee3` (descendant of installed `7818d5631e0da37563bca5715fd46d40b66ef1de`) |
| Code commit | `2062fcdc0cfeea7ae6aabec553fc838b257bd379` (tree `a1044e1c7a64c399813ca1fcf7da7727b72a71d4`); this document and its two siblings are a later docs-only commit |
| Dirty state at pin | tracked clean, untracked none (only a gitignored `node_modules` symlink to the FE checkout) |
| Not touched | `main.ts`, `app.module.ts`, `native-core-composition.ts`, installer, `scripts/execution-v2/research-reverse-bootstrap.cjs` (still `cc6ae429c0283105818b1c8ab7133a5380fbe49f6834fe5910daa1eb9dd1c5f4`), all access*/self-eligibility*/manager-series* |

| File (clean tree at the code commit) | SHA256 |
| --- | --- |
| `apps/control-api/src/execution-v2/native-core-runtime.ts` | `2aa0cb1864c4121afe30edcd68f9a87ea26523e833a15f0e8e680fd2501b7681` |
| `apps/control-api/src/execution-v2/core-owner-commissioning.ts` | `150f8cea19a1512371034779bd7949269f4c756ce00612432ae32828ba5482dc` |
| `apps/control-api/src/execution-v2/core009-preparation.ts` | `1126d3dcceef5e8f9d6d264f24dd654841c7d77f6014dd7661d994ed922eea91` |
| `apps/control-api/src/cli/core009-validate.ts` | `5e6f36dce4029cb5af89f0d78d522e89743824f969c868e797ded1315f6687d7` |
| `deploy/research-preview/native-core-templates/native-core-runtime.v1.template.json` | `afd86300515cee130ef3bbc392bdd001aa018079d4038a714c382c4ee07c2aee` |
| `…/private-owner-manager-commissioning.v1.read-only.template.json` | `97fbc1d60e0891f08fdb4fa88a9aa7ab48ceb8390a404e01f5b01cf685d5ac35` |
| `…/private-owner-manager-commissioning.v1.read-and-stream.template.json` | `c71f5f1f01c37fe6e4fde832f47b3b80e06c4ecad3e4773b35ca53ad3fb3d763` |
| `…/core009-readonly-readback.sql` | `d8feac824f424b9b29137c3b32d923e16c7ebfb741a17eb9181705862dc2b4a2` |

Installed image `7b2c7f34…` was built from `7818d563`; the changed files above are **not** in it. A config-only
swap uses the installed image; the ACK STREAM labels and the in-image validator need an image built from the code commit.

## 3. Exact selection (public ids; a target, not authentication)

| Field | Value |
| --- | --- |
| Core physical DB | `portal_control`, system `7688673963308855330`, login/role `portal` |
| Portal subject = protected owner | `usr_5a38d5dfb08b44748f5776fbe04a1434` |
| Workspace | `ws_06G19F61YB8CFR7TEWMS7HQ660` |
| Environment / profile | `paper` / `PAPER_BINANCE_USDM` (a test cell, not a product limit) |
| Human issuer | `portal-control-api.native-manager-read` |
| TS identity | `608dcbd6-e8df-4aa4-b0fc-bc0881d0aafd`, mapping version 1 → `ts-user:608dcbd6-e8df-4aa4-b0fc-bc0881d0aafd:1` |
| Protected TS owner / stable subject | unchanged and **different**; never copied or substituted |
| Retained recovery | `[]` — no native READ was ever run, so no native obligation exists (to be re-read at G5) |
| Domain seals `catalogue_sha256`, `profile_sha256`, `field_policy_sha256`, `field_policy_ref` | **NOT_PROVIDED — owner Edge/PM**: exact reviewed catalogue for `account-balances` and the other named relations; "catalogue = mounted" is not assumed. Identical in manifest selector, source pins and owner artifact |
| Policy revision, `approval_ref`, grant ids/revisions | **NOT_PROVIDED — owner Bobby (approval) / Core (fill)** |

## 4. Source observation pins Core needs back (one NEW window; manifest path → source)

| Manifest path | Needed from |
| --- | --- |
| `…/selected_source/transport/origin`, `pm_leaf_sha256`, `workload_id`, `deadline_ms`, `request_bytes`, `response_bytes`, `max_inflight` | Edge window config (proposed ≤1 source + 1 control connection; `max_inflight` must fit it) |
| `…/pins/binding/workload_id` (= `expected_workload_id` = transport workload) | Edge |
| `…/pins/native/{revision, receipt_id, receipt_digest, document_digest, policy_revision, owner_mapping_revision, semantic_revision, effective_from, expires_at}` | the NEW append-only acceptance (never revision 1 or 2 of `b922c105`) and its observer/receipt |
| `…/pins/source_fingerprint` | fresh observer return |
| `…/config/audience`, `key_id`, terminal `audience`/`key_id` and the Core signer/TLS **file references** | renewed trust bundle (PM + Core); Core keeps keys private |
| trust end timestamp (for `--trust-expires-at`) | PM/Edge; candidate trust ends `2026-10-20T08:00:59Z` |

Core derives `installation_expires_at_utc_ms`, `installation_scope.valid_until_ms`, lease and egress limits and the
owner intake window; Edge does not set them but must state the earliest/latest it can serve.

## 5. Window requirements (all enforced by the offline validator)

* Every window finite: installation ≤ 24 h, never later than the trust end, never later than the native acceptance
  `expires_at`; `installation_scope.valid_until_ms` ≤ both. Each must have ≥ 15 min left at validation (flag-adjustable).
* Native acceptance already effective at validation (`effective_from ≤ now`) and its `expires_at` strictly later.
* The serving manifest needs these **current**. The offline policy installer does not contact the source and an expired
  private installation stays constructible, so `core009-validate --policy-install-only` lets Core install the reviewed
  policy **before** the fresh pins exist and break the "Core waits for Edge / Edge waits for Core" cycle — at the
  price of a second manifest (and restart) with the live pins. Core prefers one restart; Edge/Bobby choose.
* Do not keep a listener open waiting for Core: Edge returns pins, drains; Core fills, validates, installs, swaps;
  Edge reopens at an agreed time and repeats only what the new acceptance covers.

## 6. Policy / grant plan (decision pending — Bobby)

| | Plan A: READ-only | Plan B: READ + STREAM recorded together |
| --- | --- | --- |
| Artifact | `…read-only.template.json`: one `business.read_all` ALLOW | `…read-and-stream.template.json`: that plus one `stream.subscribe` ALLOW, same subject/env/domain/seal |
| Meaning | STREAM is **not** commissioned | STREAM grant recorded; still inert until a source publishes and the realtime consumer is exercised |
| Later STREAM | requires new authority code (installer is fresh-policy-only; nothing adds a domain grant afterwards) | not needed |
| ACK from the image built at the code commit | `DOMAIN_READ_ONLY`, `stream_commissioned:false` | `DOMAIN_READ_AND_STREAM_GRANT`, `stream_commissioned:true` (the installed image prints the old READ-only labels in both cases — confirm from the grant readback) |

Neither plan creates root/entity/financial/command permission, a TS mapping, a session or a native acceptance. A nonempty or
different policy is a typed `POLICY_REVISION_CONFLICT` (no overwrite, no SQL seed); the exact same artifact replays its ACK.
Core-side **revoke** of a domain grant has no official mechanism today (analysis §6.3): until one exists the Core side of
"revoke both" is grant expiry.

## 7. What Core returns after each stage (no secret, no value)

* After install: ACK JSON, grant/policy/event readback counts, `mutation_intents_used`, artifact + manifest SHA256, image ID, config SHA256.
* After composition: container ID/image ID/restarts, `readyz`/`healthz` stamp, a statement that custody was zero before the swap.
* After connected cases: separate READ and STREAM evidence, each with correlated Core obligation + source receipt, plus the
  negative/revoke/cache/cursor/recovery results actually run and an explicit NOT_RUN list.

## 8. Tests behind this return (fakes only; no PostgreSQL)

Focused vitest, Node host, no PostgreSQL, no network (`--maxWorkers=2`): 9 files / 144 tests PASS — the five new specs
(preparation 39, owner install/conflict/replay 28, main boot path 11, validator CLI 17, composition identity 5 = 100 new) plus
the 44 pre-existing tests of the touched modules (`elp210-native-core-runtime`, `native-core-bootstrap`,
`native-core-application-lifecycle`, `native-manager-install-ack`). Related `elp210-native-frame-coupled` and
`native-manager-preparation` also pass (165 tests, 52 skipped by their own gates). Scoped `tsc` of the new files: see the
final report line (exit status recorded there). The new STREAM-ACK test is red on the previous `core-owner-commissioning.ts`;
every other new installer test is green on it.
NOT_RUN: PostgreSQL-backed specs (`elp210-manager-domain-access`, `elp210-commissioning`), normal R2/R3 for these bytes,
the full-project `tsc` (it exits 2 on 318 errors in unrelated pre-existing test files, none in these files), and anything on a runtime.

## 9. Non-claims

Not an installation, a window, an owner approval, a source acceptance, a READ/STREAM pass, a session reference, an R2/R3
result for these bytes, or permission to restart any container. Stable/dev/main, provider28445, command/Live: untouched.
