# FE-CAT-8 and FE-CAT-9: additive facts, owning contract by owning contract (2026-10-23)

Level: R0 note. One fact is delivered end to end at fixture level (Users `last_sign_in_at`); every other fact is ACCEPTED_FOR_IMPLEMENTATION because the repository shows no identifiable owning source for it. Rule applied: where the source is not identifiable the Portal adds no field and no allowlist entry (a field with no source is an invented fact); the exact Edge/Core input is recorded here instead.

## 1. How the repository was read (what "published" means here)
- Edge-published relations are the generated registry `apps/control-api/src/execution/eds11r-manager-relation-registry.generated.ts` (fields by relation). The control-api narrows each relation to an allowlist (`managerPage(..., allowedFields)`): a name in the allowlist that the source does not send is simply not emitted, a name not in the allowlist is dropped.
- Two Account 360 paths exist. `execution-profile-read.v1` (`ProfileRead`) rows are OPEN (`ManagerRecord`: any scalar key, no `additionalProperties:false`), so that schema already allows every key below; the gate is the source relation and the allowlist. `execution-resource-scoped.v2` rows are CLOSED (`additionalProperties:false`, `BrokerSyncScopedRow` has only `profile_environment` and its panel is `UNAVAILABLE / EXECUTION_CUSTODY_READ_NOT_COMMISSIONED`).
- Premise corrected: the Users screen did not draw a role preset or a last sign-in from the lane before this slice (both cells were typed gaps, and a test proves a hostile `role_preset` key is ignored). The simulated lane served neither for Users. Account 360 and Blotter do draw the lane's keys from open rows.

## 2. Per fact

### FE-CAT-8

| Fact | Owning contract today | Published source found | Status |
|---|---|---|---|
| Users `last_sign_in_at` | `portal-account-lifecycle` `AccountSummary` (closed, Portal-owned) | Portal's own `auth_sessions.created_at` (a session is created per successful sign-in) | DELIVERED (contract, mapper, FE, lane); SQL ACCEPTED |
| Users role preset | `AccountSummary` (closed) | none: presets are FE navigation sets over capability grants (`V2_ROLE_PRESETS`); no stored label per account | ACCEPTED, no field |
| `portfolio_name` | scoped rows closed; profile-read open | `portfolios.name` (Edge) | ACCEPTED (server join needs a decision) |
| `strategy_name`, `deployment_name` | same | none (`strategies` has `description` only; `strategy_deployments` has no label) | ACCEPTED, no field |
| Order `average_fill_price` | `/screens/blotter` order rows (open) | only `conditional_order_group_legs.average_fill_price` (leg grain); `orders` has none | ACCEPTED, no field |
| Order `fee` + `fee_currency` | same | only fill grain: `fills.commission`, `fills.commission_currency` (already read by the Blotter fills) | ACCEPTED, no field |

**Users last sign-in, delivered.** `AccountSummary.last_sign_in_at`: optional, `string(date-time) | null`, roster reads only. Omitted = the producer does not publish it; `null` = the account has never signed in; a string is the instant of the newest successful sign-in. It is a published timestamp and authorizes nothing (said in the schema description). Lifecycle history entries never carry it: `projectAccount` (which builds the immutable audit states) is unchanged; the new pure `withLastSignIn(account, lastSignIn)` (control-api `repos/account-lifecycle.ts`) omits the key when the fact is `undefined` or unreadable and never guesses `null`. FE: `rosterReader.ts` reads it strictly (a real UTC instant or `null`; anything else refuses the roster row), `AccountSummary.lastSignInAt?` (type-only addition to the V1 file), the "Last seen (UTC)" cell prints the instant, `Never signed in` for `null`, and keeps today's typed gap when omitted; "Role preset" stays a gap. Fixture lane: `bffDoubleUsers.ts` (`setUsersDoubleLastSignIn`, off by default, on for the populated and layout-stress fixture profiles; roster reads only).
ACCEPTED (exact input, owner Codex with PG): add to the roster statement (`ROSTER_PAGE_SQL` in `repos/users.ts`) `(SELECT max(s.created_at) FROM auth_sessions s WHERE s.user_id = u.user_id)` using `auth_sessions_user_idx`, pass it through `withLastSignIn`, re-measure the EXPLAIN case of the BE-P23 PG spec. Two cautions before publishing `null`: the retention of `auth_sessions` (expired sessions may be purged, in which case "no session row" is not "never signed in": publish `null` only if retention is proven to cover the account's life, otherwise omit) and that SSO sign-ins create the same session row. Not run here: no PG.

**Role preset, no field.** There is no owning source. A preset must never be an authorization fact; if Codex wants a stored label it must be a display-only column on the account record, published as `role_preset` (string label, closed vocabulary decided by Codex), omitted until it exists. Authorization stays in capability grants.

**Display names.** `portfolio_name`: the Edge `portfolios.name` is published, but the Account 360 scoped path cannot join it without reading the portfolios relation under the same authorization (a hidden portfolio's name must not leak) and its allocation/deployment rows are closed. Input for Codex: add `portfolio_name` (label, nullable) to `PortfolioAllocationsScopedRow` / `DeploymentsScopedRow` filled from `portfolios.name` only for portfolios the caller is authorized for in the same snapshot; typed null when not authorized or not read; labels never authorize. `strategy_name` and `deployment_name`: Edge must publish a label column on `strategies` and `strategy_deployments` first.

**Blotter average price and fee.** Edge input: on the `orders` relation `average_fill_price` (DECIMAL, the volume-weighted price of the order's fills, quote currency of the instrument) and `fee_total` + `fee_currency` (DECIMAL + currency; a mixed-currency order is a list of per-currency entries, never a sum), each with the order's `updated_at` as observation. Until then the Blotter keeps the typed absence; a fee is never defaulted to zero, and the Portal never sums fill commissions (they exist per fill with their own currency).

### FE-CAT-9 (Account 360), all ACCEPTED, no field added

| Fact | Where it would live | Why not added | Exact input |
|---|---|---|---|
| `wallet_balance`, `native_equity` | `broker_sync` rows (profile-read open; allowlist `BROKER_SYNC_FIELDS`) | `broker_account_sync_effective` publishes only `buying_power`, `currency`, `synced_at`, status; scoped `BrokerSyncScopedRow` is closed and UNAVAILABLE | Edge: two DECIMAL columns on `broker_account_sync_effective`, in the row's `currency`, observed at the row's `synced_at`; two distinct figures (the wallet balance is never a fallback for equity, and equity never for wallet). Then Codex adds the two names to the allowlists (`profile-read.service`, `profile-projection.catalog`) and re-pins the source catalogue digest |
| `budget_used`, `budget_approved` | `portfolio_allocations` rows | the relation has `allocated_capital` and `max_capital`; which of them (if either) is the "approved budget" and what "used" means is not stated by any published contract | Codex/Edge decision on the definitions; then DECIMAL columns in the allocation's `currency`, observed at `updated_at` |
| `exposure_gross`, `exposure_long`, `exposure_short` | allocation grain | no published source at that grain (`positions_v2` has `notional` and `side` per position; a sum is a derivation nobody published) | Edge: three DECIMAL columns at allocation grain, one currency each, same observation; gross is published or absent, never computed by the Portal |

Common rules (same as FE-CAT-4): exact decimal strings, one currency per figure, a mixed-currency owner is a list of per-currency entries and never a sum, observation time = the row's own timestamp, coverage = the page/capability state, typed null = the source did not report it, omitted = no owning source, zero only when published. The scoped v2 rows stay closed until the source exists; then the contract change is a separate additive slice.

## 3. Pins and effects
- `contracts-snapshot.json`: one added line (the new roster fixture). `portal-account-lifecycle.openapi.json` and its d.ts are not snapshot-tracked, so no hash changes. The N29 product acceptance pins `br72_*` (manager-lists) only; nothing here needs an N29 re-pin.
- The Users double and `fixture-bff/app.ts` gained an opt-in flag (additive); populated-profile Users visual baselines will differ (the Last seen column now has times). Not re-recorded.
