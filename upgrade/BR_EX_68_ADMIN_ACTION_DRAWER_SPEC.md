# BR-EX-68 — Admin Action Drawer WF 1i: operator-task catalog + command relay flow
### Detailed backend request · filed 2026-08-30 · Claude (frontend lead) · status `RECEIVED`

> §7.2 row: EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md (BR-EX-68) · summary section §7.10
> points here. Mirror: hifi_execution_loop/BACKEND_PLAN_7_2_ROWS_2026-08-25.md ·
> FE tracking: apps/portal/registry/FRONTEND_HANDOFF.md §8.36.

The owner's WF 1i hi-fi (2026-08-30) specifies the drawer the relay will one day serve. The
frontend ships the FULL interaction as a DECLARED DEMO on `adminCli.smoke.ts` — that file is this
request's reference for every shape below — while the published F0 truth (catalogue rev 2, 64
entries, relay `DISABLED`, `portal_reachable: false` everywhere) stays quoted on screen and
rendered in full underneath. This spec turns the demo into six deliverable contracts (A–F), each
with its own fixtures and enable point, so the relay can be lit tier by tier instead of all at
once.

Frontend reference points (all live on `feat/execution-loop-uiux-continuation`):
`adminCli.smoke.ts` (shapes + copy) · `adminCli.test.tsx` (28 interaction cases = the acceptance
narrative) · `AdminActionDrawer.tsx` (render seams: every server verdict has exactly one render
site and the browser computes none of them).

## 1. Contract A — operator-task catalog (`execution.command-tasks.v1`)

The hi-fi groups by OPERATOR TASK, F0 groups by system domain, and F0's handoff settled that the
server's `group` wins for the published listing. The task view therefore needs its own
server-declared fields. **Decision for codex — (A1) additive fields on `execution.command-catalog`
entries, or (A2) a parallel `execution.command-tasks.v1` joined on the same `noun/verb` key.**
The frontend reads either; (A2) keeps rev-2 byte-stable and is the FE recommendation.

```jsonc
{
  "schema_version": "execution.command-tasks.v1",
  "catalogue_revision": 3,               // must name the catalogue rev it joins
  "task_groups": [                       // ORDER IS THE CONTRACT — the six WF 1i groups
    "READ_INSPECT", "PORTFOLIO_CAPITAL", "DEPLOYMENT_RISK",
    "ACCOUNT", "BROKER_SYNC_RECONCILIATION", "EMERGENCY_DESTRUCTIVE"
  ],
  "tasks": [
    {
      "key": "account/policy",           // join key into the catalogue; null ONLY for
                                         // entries the catalogue does not carry (see rules)
      "task_group": "ACCOUNT",
      "task_title": "Account policy",
      "tag": "MUTATION",                 // READ | MUTATION | DANGER | BLOCKED
      "scope": "account",
      "cli_forms": ["cli account policy sandbox-binance-carry --mode sandbox …"],
      "meta": "mutation · R2-scoped policy",
      "params": [
        { "key": "account_id", "source_registry": "accounts", "constraint": null,
          "required": true, "default": null },
        { "key": "--position-accounting-mode", "source_registry": null,
          "constraint": "NET | HEDGE", "required": true, "default": "HEDGE" },
        { "key": "--reason", "source_registry": null, "constraint": "required · audit",
          "required": true, "default": null }
      ],
      "request_preview": "METHOD: POST\nPATH: /v1/admin/account-policies\n…",   // generic mutations
      "authority_checks": "✓ NET on shared binding — risk rejects …",            // generic mutations
      "default_reason": "enable hedge mode for shared sandbox binding",
      "confirm_word": null               // DANGER only: "CLOSE" · "BINANCE_TESTNET_ONLY"
    }
  ]
}
```

Rules:
- `source_registry` is an enum of REAL registries (`portfolios`, `accounts`, `alphas`,
  `deployments`, `bindings`, `venues`, `modes`, `symbols`) — the UI renders a picker from that
  registry and NEVER free-types an id; `source_registry: null` renders as a constrained literal
  (`constraint` is the operator-facing rule text).
- `BLOCKED` tasks (lab reset) are still listed with their refusal prose — the catalog is a map,
  not a menu.
- **Key gap to close:** the hi-fi's `System health` and `Change allocation` have no rev-2 key.
  Either add `system/health` and `capital/allocation` (or their real names) to catalogue rev 3,
  or declare here that they stay catalogue-less and this contract carries them with `"key": null`
  + an explicit `unlisted_reason`. Silence is not an option — today the drawer prints "not in
  published catalogue rev 2" for both.
- Canonical fixture: `execution-command-tasks.valid.json` carrying ALL 24 hi-fi tasks verbatim
  (copy source: `adminCli.smoke.ts` `CLI_ACTIONS` / `CLI_PARAMS`).

## 2. Contract B — read execution (R0, no step-up)

`POST /api/v1/execution/commands/{key}/run`

- Request: `{ "params": { "--mode": "all", … } }` — validated against Contract A's param spec;
  unknown/missing-required params → typed 422 naming the param, never a partial run.
- Eligibility: `risk_tier == R0_READ` only. Any other tier → typed 403 `CATALOG_TIER_VIOLATION`.
  Relay disabled for the key → typed 409 `COMMAND_RELAY_DISABLED` (the F0 refusal semantics stay).
- Response:

```jsonc
{
  "operation_kind": "READ",
  "transcript": [ "$ cli health", "gateway            READY    42ms    rev 2.14.1", "…" ],
  "exit_code": 0,                        // verbatim; the UI prints it, never grades it
  "as_of": "2026-08-30T10:42:01.000Z",   // when the read was true at the cell
  "duration_ms": 184
}
```

- Transcript lines are VERBATIM cell output — no server-side coloring, truncation or paraphrase;
  the UI's line toning (`$`→cmd, `exit`→dim, REJECTED/DENIED/MISMATCH/ERROR→bad,
  READY/FRESH/MATCH/OK→good) is presentation only. ≤200 lines; longer output is cut server-side
  WITH a final line `"… output truncated at 200 lines — run from the CLI host for the full stream"`.
- **Decision (B1): one-shot response vs SSE line stream.** The hi-fi streams; one-shot + client
  reveal is what the demo does and is sufficient. FE recommendation: one-shot, SSE never required.
- Watch is CLIENT-side re-run on a timer; the endpoint stays stateless. Freshness belongs to the
  row: every response carries `as_of`.
- Expected transcripts for the seven R0 tasks: `adminCli.smoke.ts` `CLI_OUT` (shape reference).

## 3. Contract C — plan (mutations and DANGER)

`POST /api/v1/execution/commands/{key}/plan`

- Request: `{ "params": {…}, "reason": "Scale within R2 cap after 12 clean observation days." }`
  — `reason` REQUIRED for every mutation (lands in `portfolio_audit_log`); missing → 422.
- Response:

```jsonc
{
  "plan_id": "cmd_9f12",
  "ttl_s": 60,
  "expires_at": "2026-08-30T10:45:02.000Z",
  "expected_revision": { "subject": "account paper-binance-carry-v32", "rev": 88 },
  "idempotency_key_digest": "sha256:…",   // HASH ONLY — F0 payload policy holds
  "preflight": [
    { "check_id": "identity_lineage",  "verdict": "OK",   "label": "identity & lineage — artifact digest 41bb7d… pinned" },
    { "check_id": "approval_valid",    "verdict": "OK",   "label": "approval AP-207 valid · amount within approved cap",
      "refs": [{ "kind": "APPROVAL", "id": "AP-207" }] },
    { "check_id": "cell_health",       "verdict": "OK",   "label": "execution cell health READY · broker sync FRESH 0.9s" },
    { "check_id": "expected_revision", "verdict": "OK",   "label": "expected revision pinned — account rev 88" },
    { "check_id": "concentration",     "verdict": "WARN", "label": "concentration +4.6% — WARN, non-blocking" },
    { "check_id": "idempotency",       "verdict": "OK",   "label": "idempotency key minted · plan TTL 60s" }
  ],
  "impact": {                              // allocation-family commands only
    "before": { "allocated": "50000.00", "pf_weight_pct": "8.1",  "marginal_risk_pct": "5.2" },
    "after":  { "allocated": "75000.00", "pf_weight_pct": "11.7", "marginal_risk_pct": "8.9" }
  },
  "policy_checks": [
    { "verdict": "OK",   "text": "R2 AP-207 valid · digest match",     "refs": [{ "kind": "APPROVAL", "id": "AP-207" }] },
    { "verdict": "OK",   "text": "within approved max capital 100000.00" },
    { "verdict": "OK",   "text": "ledger row will be written · movement ALLOCATE" },
    { "verdict": "WARN", "text": "concentration +4.6% — warning, not blocking" },
    { "verdict": "INFO", "text": "blast radius: dep_74 · account · risk capacity",
      "refs": [{ "kind": "DEPLOYMENT", "id": "dep_74" }] }
  ],
  "flatten_plan": null                     // emergency-close only: cancels/closes/residue prose rows
}
```

- EVERY verdict (`OK | WARN | FAIL`) is server-computed; the browser renders and never derives. A
  `FAIL` preflight row disables Apply server-side too — applying a failed plan → 409
  `PREFLIGHT_FAILED`.
- `impact` numbers are exact decimal strings under the MONEY_ARITHMETIC rules; weight/marginal
  carry their formula version where DERIVED (`marginal.v1` — same convention as BR-EX-51's
  what-if; reuse that engine, do not fork it).
- `refs[]` carry ids only; the FE owns routing (`APPROVAL` → gate review, `DEPLOYMENT` → stage
  workbench). The server never emits portal URLs.
- Unreachable key / relay disabled: the EXISTING F0 plan refusal is returned unchanged — this
  contract extends F0's endpoint, it does not fork it.

## 4. Contract D — apply (step-up enforced)

`POST /api/v1/execution/plans/{plan_id}/apply`

- Request: `{ "step_up_token": "…", "confirm_word": "CLOSE" }` — `confirm_word` REQUIRED for
  DANGER tier and must equal Contract A's declared word; wrong/missing → 422 naming only the
  requirement, never echoing the payload.
- Step-up: U07's web step-up token, verified server-side; absent/expired → typed 401
  `STEP_UP_REQUIRED`. The CLI password path and this token are the SAME command authority — the
  browser never runs a shell.
- Plan expiry: TTL passed → typed 410 `PLAN_EXPIRED`; the answer is a NEW plan (fresh preflight),
  never a silent re-plan.
- Two-man rule (Contract F): an OPERATOR apply without an issued key → 403 `EXECUTION_KEY_REQUIRED`.
- Response: `202 { "operation_id": "op_1251" }` — **202 is acceptance, NEVER success**; the UI
  chips it "202 — NOT success yet" and moves to VERIFY.
- Idempotency: re-apply of the same plan reuses the minted key — duplicates impossible; the
  PARTIAL residue path re-applies with the SAME key.

## 5. Contract E — verify (authoritative timeline)

`GET /api/v1/execution/operations/{operation_id}/verify`

```jsonc
{
  "command_ref": "cmd_9f12",
  "timeline": [
    { "at": "2026-08-30T10:44:02.114Z", "verdict": "INFO", "text": "command accepted", "http": 202 },
    { "at": "2026-08-30T10:44:02.480Z", "verdict": "OK",   "text": "execution cell re-validated identity · approvals · expected revision" },
    { "at": "2026-08-30T10:44:02.512Z", "verdict": "OK",   "text": "local risk / policy re-checked (portal cannot bypass)" },
    { "at": "2026-08-30T10:44:02.688Z", "verdict": "OK",   "text": "change applied · audit row written · terminal state" }
  ],
  "terminal": {
    "state": "VERIFIED",                  // VERIFIED | PARTIAL | null (still running)
    "residue": [],                        // PARTIAL: [{ "symbol": "BTCUSDT", "qty": "0.0100", "why": "broker max-qty chunking" }]
    "reapply": null                       // PARTIAL: { "same_idempotency_key": true }
  },
  "audit_refs": ["portfolio_audit_log", "command journal"]
}
```

- Timeline rows come ONLY from authoritative ACKs; the drawer waits for `terminal.state` instead
  of timing out into a fake green, and `PARTIAL` NEVER renders green — both sentences are UI law
  already; this contract must make them true.
- Polling (2s) is sufficient; SSE overlay optional and NOT requested.
- Emergency-close verify additionally carries the flatten counts (`2/2 cancels ACKed`,
  `2/2 reduce-only closes filled · exposure 0`).

## 6. Contract F — two-man rule (OPERATOR execution keys)

- `POST /api/v1/execution/plans/{plan_id}/key-request` → `202 { "request_id": "…" }`; notifies
  admins via the alerts stream (BR-EX-43 family).
- `GET /plans/{plan_id}/key-state` → one of:

```jsonc
{ "state": "NONE" }
{ "state": "PENDING", "requested_at": "2026-08-30T10:44:22.000Z", "admin": "Lan" }
{ "state": "ISSUED",  "key_display": "AGK-7F2C-9D41", "issued_by": "Lan",
  "single_use": true, "bound_plan": "cmd_9f12", "expires_at": "…" }
```

- The key is SINGLE-USE, bound to exactly one `plan_id`, TTL ≤ 120s, never grants a second
  command; issuance AND use land in the audit log. Expiry returns state to `NONE` — the operator
  asks again, nothing auto-renews. Admin issuance UI/CLI is out of this request's scope.
- Role model: role → per-task-group command grants, admin-issued and revocable. `VIEWER` holds no
  grant (catalog stays visible — visibility ≠ authority; R0 reads stay available); `OPERATOR`
  needs the key per apply; `ADMIN` applies without one. The drawer renders the role from the
  server's actor payload — never from a client guess.

## 7. Authority, audit, failure honesty

| Artifact | Authority | Audit row |
|---|---|---|
| task catalog | `PORTAL_CONTROL` | catalogue revision history |
| transcripts, preflight verdicts, verify timeline | `EXECUTION` (cell ACKs only) | command journal |
| impact before/after | `DERIVED` (`marginal.v1`) over `EXECUTION` reads | — (labeled estimate) |
| plans, applies, key request/issue/use | `PORTAL_CONTROL` | `portfolio_audit_log` + command journal |

Failure honesty (all already asserted by `adminCli.test.tsx` against the demo): 202 ≠ success ·
PARTIAL never green · expired plan = refusal, not retry · failed preflight blocks apply
server-side · refusals for unreachable keys keep F0's exact semantics · payloads stored
`HASH_ONLY_NO_RAW` and never echoed back.

## 8. Cardinality & perf

catalog ≤64 tasks · params ≤8/command · transcript ≤200 lines (truncation line mandatory) ·
preflight ≤10 rows · policy checks ≤10 · verify timeline ≤20 rows · key TTL ≤120s · plan TTL 60s.
Read run p95 ≤ 2s; plan p95 ≤ 3s (it runs the preflight); verify poll ≤50ms (served from the
operation record).

## 9. Delivery order and enable points

| Stage | Ships | Enable point in the UI |
|---|---|---|
| F1 | Contract A (tasks) | drawer joins stop saying "not in published catalogue"; groups come from the server |
| F2 | Contract B (R0 run) | `Run ▸ read-only` stops being a demo — SMOKE note drops from READ drawers |
| F3 | Contracts C+D+E, R1 paper tier only | `Generate plan` / `Apply` live for paper-tier mutations; SMOKE note drops there |
| F4 | Contract F + R2→R4 tiers | two-man rule live; DANGER tier last — each tier gated on Bobby approval separately |

Each stage flips its own enable point; nothing else changes hands. Relay stays `DISABLED` for
every tier not yet delivered and the drawer keeps the declared-demo copy for exactly those.

## 10. Test matrix & canonical fixtures

`execution-command-tasks.valid.json` (24 tasks) · `execution-command-run.health.valid.json`
(+ truncated-transcript variant) · `execution-command-plan.alloc.valid.json` (WARN preflight) ·
`execution-command-plan.emergency.valid.json` (flatten plan + confirm word) ·
`execution-command-plan.failed.valid.json` (FAIL row → apply 409) ·
`execution-command-verify.verified.valid.json` / `.partial.valid.json` (residue + same-key
reapply) · `execution-command-key.pending/issued/expired.valid.json`.
Negative tests: apply without step-up (401) · OPERATOR apply without key (403) · expired plan
(410) · wrong confirm word (422) · non-R0 run (403).
Frontend `adminCli.test.tsx` (28 cases) is the interaction acceptance narrative, rewired from
smoke to fixtures at each stage.

## 11. Open decisions for codex

1. **(A1 vs A2)** additive catalogue fields vs parallel `execution.command-tasks.v1` — FE reads both, recommends A2.
2. **Keys for `System health` / `Change allocation`** — add to catalogue rev 3, or declare catalogue-less with `unlisted_reason`.
3. **(B1)** read transcript one-shot vs SSE — FE recommends one-shot.
4. **Impact computation owner** — `marginal.v1` lives with BR-EX-51's what-if engine; confirm reuse, don't fork.
5. **Step-up dependency** — confirm this rides U07's token verification, not a new mechanism.
6. **Credential rotation command is missing from BOTH catalogs.** Accounts & Bindings and
   Binding Detail already deep-link `/administration/actions?action=rotate_credential&binding=…`
   (expiring-credential flows), but neither the WF 1i hi-fi's 24 tasks nor catalogue rev 2
   carries a rotation command. The drawer answers the deep link honestly today (banner + link
   back to Accounts). Decide: add `binding/rotate-credential` (MUTATION, binding scope,
   `--binding` from the bindings registry, reason required) to Contract A, or name the real
   command it maps to.

**Retire on delivery (per stage):** the delivered slice of `adminCli.smoke.ts`, the SMOKE cases in
`adminCli.test.tsx` for that tier, the "declared demo" copy for the delivered tier, and the
`?role=/?outcome=` demo addresses (F4).
