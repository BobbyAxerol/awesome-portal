# N13B — Current-source staged activation

Status: `PORTAL_IMPLEMENTATION_ACCEPTED / CURRENT_SOURCE_SET_PINNED / PROFILE_RUNTIME_DARK_PENDING_N14B`  
Date: 2026-08-29  
Authority: Portal Rust Execution Edge + TypeScript Control API  
Source policy: source-as-is, capability-by-capability

## 1. Outcome

N13B no longer waits for an ideal future Trading System API. It maps the
bounded sources that exist today into stable Portal-facing screen contracts,
while retaining an adapter boundary for later source revisions.

The accepted machine-readable boundary contains:

- 4 profile interpretations: Paper, Sandbox, Live and Portal-derived Canary;
- 16 fixed source bindings;
- 29 read/action capabilities;
- 20 registry screens covering 23 current views;
- 14 direct current facts, 10 deterministic Portal derivations, 4 supported
  but inactive capabilities and 1 honestly absent capability;
- exact Trading System, Manager catalogue/image, owner publication and runtime
  qualification pins.

No Trading System code, database, Redis, CLI, broker or command route was
modified. No Portal runtime or registry `data_mode` was promoted in this
implementation phase. That deployment/release decision belongs to N14B and is
profile- and screen-specific.

## 2. Current-source truth

| Profile | Current owner/source evidence | Portal delivery state after N13B |
| --- | --- | --- |
| Paper | Manager-v2 owner loopback passed TLS 1.3 mTLS, certificate-bound JWT, 96-relation catalogue, page/cursor bounds, load and loss/recovery | exact candidate accepted; BFF/Edge feature flag remains off until N14B |
| Sandbox | exact Manager profile/source predicate exists and bounded source check observed rows | supported, independently deployable; not activated |
| Live | exact Manager profile/source predicate exists; current bounded source check returned zero rows | supported, independently deployable; honest empty, not fixture-filled and not activated |
| Canary | no Trading System `canary` mode exists | Portal governance/promotion state joined to Live facts; unavailable until the Live read profile is active |

The two imported evidence anchors are:

- owner publication manifest `sha256:cd304194bdefde4d9470467f03b30b02487341656eea9fdd0bd96c3b07ac4c22`;
- runtime qualification manifest `sha256:281f2b73094e423bd888e3562e861cab07137f4878c43fd62d7ce43abb565c60`.

They contain no business rows or credentials. The runtime qualification says
`portal_reachable=false`; N13B does not rewrite that as active.

## 3. Rust boundary

The `current-source-compat` crate loads
`contracts/current-source-v1/capability-source-map.json` at build time and
rejects:

- unknown/missing/duplicate screens, capabilities, sources or profiles;
- unpinned contract, manifest, catalogue or image identities;
- arbitrary schema/relation/operation selection;
- a separate Canary source profile;
- a command capability classified as connected;
- a Manager relation absent from the authenticated runtime catalogue.

The Edge exposes two internal GET-only primitives:

```text
GET /internal/v1/current-source/screens/{screen_id}
GET /internal/v1/current-source/screens/{screen_id}/sources/{source_id}/relations/{relation}
```

The second primitive accepts only `limit<=200` and an opaque Manager cursor.
Screen, source and relation must be a valid chain in the canonical map. The
delegated resource is exact:

```text
execution:current-source:{SCREEN_ID}:read
```

The assertion environment, audience, `profile_id`, Edge environment and Edge
Manager profile must all match before source access. A cursor is bound to the
exact relation, catalogue and profile. The response preserves freshness,
completeness and provenance from the owner envelope. Non-Manager sources are
typed `SUPPORTED_BUT_NOT_ACTIVATED`, not silently substituted.

## 4. TypeScript BFF

Authenticated browser clients use only same-origin Control API routes:

```text
GET /api/v1/execution/current-source/{paper|sandbox|live|canary}/screens/{screen_id}
GET /api/v1/execution/current-source/{paper|sandbox|live|canary}/screens/{screen_id}/sources/{source_id}/relations/{relation}
```

The BFF owns mTLS and short-lived delegated JWTs. A browser cannot choose an
Edge origin, audience, profile ID, SQL, schema, generic URL or command scope.
Paper, Sandbox and Live have independent flags and exact origins/audiences.
Canary can request only `EXECUTION_CANARY_CONTROL_ROOM_SCREEN`; it uses the
Live profile and is labelled
`PORTAL_CANARY_GOVERNANCE_OVER_LIVE_FACTS`.

The transport has FIFO admission bounds, connect/request deadlines, HTTP/2
ALPN, a 2 MiB response ceiling and typed, sanitized error forwarding. Upstream
401/403 is treated as an internal delegated-identity failure rather than a
browser session failure. Therefore a source identity problem cannot create a
client logout/reconnect loop.

## 5. Deployment and rollback

`deploy/compose.execution-current-source.yaml` is an opt-in Control API
overlay. All three profile flags default false. Profile-specific Edge Compose
projects use private WireGuard host ports (recommended Paper `8443`, Sandbox
`8444`, Live `8445`) while retaining container port `8443`.

Rollback is affected-profile-only:

1. set the one profile flag false;
2. recreate Control API;
3. verify that profile returns `N13B_PROFILE_NOT_ACTIVATED` while sibling
   profiles remain unchanged;
4. stop only the matching profile Edge/Source Proxy project if required;
5. keep command relay false and retain audit/evidence.

No database rollback or Trading System restart is required for a BFF profile
rollback. Registry `data_mode` remains fixture/none until N14B proves the exact
deployed image, route, auth and rollback evidence.

## 6. Verification

Accepted gates:

- Rust canonical map: 4 profiles / 16 sources / 29 capabilities / 20 screens;
- Rust exact screen/profile authorization, non-Manager dark state, catalogue
  relation validation and Manager cursor/bounds tests;
- TypeScript build and 6 focused N13B BFF tests;
- full Control API PostgreSQL suite: `22 files / 199 tests`;
- real 182k Approval Inbox and Operations Queue scale corpus;
- PostgreSQL dump/restore signature equality;
- full monorepo pre-commit verification after each coherent commit;
- Compose rendering for base production, profile-isolated Edge and the N13B
  Control API overlay;
- no tracked secret/private key and no command/source mutation.

The source owner evidence additionally records Paper `20` bounded load
requests, maximum `47.075 ms`, p95 `12.122 ms`, maximum response `130547`
bytes under the 1 MiB owner limit, mTLS/JWT negative cases and transport
loss/recovery.

## 7. Honest unresolved states

- Gateway current market-latest and Historical/QDL chart adapters are mapped
  but not activated in N13B.
- Venue calendar has no current authoritative source.
- Live currently has no observed business rows in the inspected source set.
- Commands are inventory-only and remain dark until N16B.
- Source-to-Portal profile deployment and screen registry promotion are N14B,
  not hidden side effects of this commit.

## 8. Next phase

N14B may now build and verify the first immutable current-source release
candidate from this accepted set. It must bind exact image digests to one
profile, start with Paper, exercise rollback, then update only the screens that
pass. Sandbox and Live remain independent candidates; Live empty is a valid
read result, not evidence that Live trading is commissioned.

