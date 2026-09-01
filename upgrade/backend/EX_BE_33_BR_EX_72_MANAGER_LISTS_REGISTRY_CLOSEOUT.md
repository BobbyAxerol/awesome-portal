# EX-BE-33 — BR-EX-72 Manager Lists and Registry Closeout

**Date:** 2026-08-31  
**Branch:** `feat/execution-manager-campaign`  
**Status:** `COMPLETE / RELEASE_CANDIDATE_READY / PROTECTED_MAIN_PENDING`  
**Runtime effect:** none

## 1. Outcome

BR-EX-72 is delivered as one bounded package. The Alpha Fleet and Accounts &
Bindings entry screens now consume same-origin TypeScript BFF contracts instead
of `TYPED_UNAVAILABLE`; both unit and browser doubles consume one canonical Live
Review fixture; registry revision 6 describes the same-origin product truth.

The implementation does not expose Trading System tables, credentials, DSNs or
external references to the browser. It does not activate a source, command,
Paper/Sandbox/Live mutation, runtime image or stable deployment.

## 2. Delivered contracts and routes

The canonical schema, OpenAPI and generated TypeScript declaration publish:

- `execution.alpha-fleet-list.v1`;
- `execution.bindings-list.v1`;
- `execution.binding-detail.v1`.

The session-, workspace- and role-scoped BFF routes are:

- `GET /api/v1/execution/alphas`;
- `GET /api/v1/execution/broker-bindings`;
- `GET /api/v1/execution/broker-bindings/:binding_id`.

List reads use the existing Control Plane query authority: allowlisted filters
and sorts, signed bidirectional keysets, exact total/filtered counts and a hard
50-row response limit. Detail returns one exact binding or a typed 404. Every
envelope carries environment, source/retrieval time, freshness, completeness and
projection provenance.

## 3. Projection and current-source boundary

Migration `1723680000016_execution-manager-lists.sql` adds one source snapshot
table and two Portal-owned projection tables. A refresh drains only the current
Manager-v2 populations required by BR-EX-72, then atomically replaces the
workspace/environment projection inside a serializable transaction:

| Product model | Qualified source relations |
| --- | --- |
| Alpha Fleet | `strategies`, `strategy_deployments` |
| Bindings | `accounts`, `venue_accounts`, `broker_account_sync_effective` |

Source reads are capped at ten pages of 200 rows, coalesced for five seconds per
workspace/environment, and rejected outside Paper/Sandbox/Live or outside this
exact relation set. `venue_credentials` is explicitly forbidden. Empty source
populations become honest empty projections; incomplete/invalid populations
fail closed and never become partial browser truth.

### Dev runtime hardening — 2026-09-01

The first source-backed Alpha Fleet acceptance exposed a latency defect rather
than a data gap: Bobby's Paper projection already contained 48 alphas and 43
deployments, but an expired five-second refresh lease made the request wait for
a complete AWS-HK population drain. Manager lists now use bounded
stale-while-revalidate semantics. A committed atomic projection is returned
immediately with its original `source_as_of`, freshness and completeness, while
one in-flight refresh is coalesced per workspace/environment/kind. A first-ever
read still waits for source truth and fails closed when none can be committed.

Focused PostgreSQL coverage proves the stale response completes while the fake
source is deliberately paused, retains the previous committed rows, and then
atomically observes the refreshed population after the source is released.
The real dev browser route subsequently passes with BFF `200`, 48/48 linked
alpha rows, 43 deployments, no unavailable panel and no console warning.

## 4. Canonical fixture and registry revision

`governance-live-review.valid.json` is now the single schema-validated fixture
for unit and browser doubles. The duplicate hand-composed representations were
removed.

Registry revision 6 adds truthful shadow rows for:

- Alpha Fleet list;
- Accounts & Bindings list;
- New Approval;
- Gate LIVE Review;
- Waivers & Conditions.

Alpha Fleet and Accounts & Bindings now advertise `REAL` data mode and
`portal_control_current` delivery. The governance rows advertise only the
capability each route actually owns. Registry metadata remains descriptive;
server authorization is always the enforcer and no registry bit grants runtime
or command authority.

## 5. Frontend integration

The product route graph now maps `/deployments/alphas`,
`/deployments/accounts` and `?binding=` to same-origin BFF consumers. The
containers render bounded rows, exact count/freshness metadata, signed-keyset
navigation, honest empty/refusal states and narrow drill-down links. No product
module imports `createFixtureApi()`.

## 6. Verification

- Control API: 28 files / 253 tests, fresh PostgreSQL migration and custom
  dump/restore drill — pass.
- Contracts: 112 tests, JSON Schema/OpenAPI/generated-type and snapshot parity
  — pass.
- Registry: 62 tests, source/public fixture and screen-policy parity — pass.
- Portal frontend: 93 files / 1,785 tests passed, three intentional skips and
  zero failures; clean Docker TypeScript/Vite production build and two
  pinned-Chromium same-origin/Carbon product-route checks — pass.
- BR-EX-72 focused coverage includes source allowlist rejection, credential
  exclusion, page bounds, projection replacement, workspace/environment
  isolation, exact keysets/counts, typed detail 404, canonical fixture drift,
  registry revision and same-origin consumers.

## 7. N29 release consequence

`N29-BE-72` is resolved and removed from the debt register. N29 is now
`RELEASE_CANDIDATE_READY_PROTECTED_RELEASE_PENDING`; the only remaining release
gate is `N29-REL-01`, which requires the normal protected-main workflow to build,
sign and attest immutable images. That release action is intentionally outside
this implementation commit.
