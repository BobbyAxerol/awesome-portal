# EDS-00 — Return-pack intake and immutable baseline

**Status:** `CONTRACT_LOCKED / SERVER_BASELINE_COMPLETE / NO_RUNTIME_MUTATION`  
**Campaign branch:** `feat/eds-current-bff`  
**Scope date:** 2026-09-04

## Result

EDS-00 turns the accepted EX-DP-07 return pack into one audited, sanitized
Portal baseline without treating it as a live data query. The Control API now
serves `GET /api/v1/execution/runtime-manifest` behind the normal Portal
session/workspace boundary. The endpoint returns only build/source readiness
metadata; it does not call the Edge, activate a profile, or assert that a
named product BFF operation is already live.

The immutable baseline pins:

- Trading System source revision `9081397de9e981c43b4e0f67fabe747e7ed964c7`;
- Edge revision `9266a6843d1863395e15b563ac53de32780e0f25` and image
  `sha256:47ea4d78099347706710879bf26e46a15cfaf80e4ef7ac22879f0a71f12c3077`;
- Manager catalogue and serving-policy digests;
- E5/E6 manifest digests, 96 readable relations, 34 frozen mappings and 23
  frozen screens;
- measured read policy: Paper=1, Sandbox=1, Live=2 concurrent named pages;
- current-page-only semantics and the four explicit external evidence gates.

`runtime_delivery.state=EDS_00_BASELINE_ONLY` and every profile declares
`portal_bff_delivery=NOT_YET_PUBLISHED`. This is intentional: it prevents a
metadata endpoint from accidentally claiming a deployed product or refreshing
the remote service on page load.

## Boundary retained

The implementation contains no source origin, private route, raw row, cursor,
JWT, certificate, database/Redis setting, source-proxy setting, command scope
or runtime path. It neither changes V1/D4 nor configures an Edge profile,
cache, container, source or Trading System service.

`CURRENT_CATALOGUE_BOUND_PAGE_ONLY` remains the stated source meaning. The
manifest explicitly does **not** claim global event order, replay/correction
history or complete history.

## Evidence and exit gate

The EDS-00 test verifies the in-image constants against
`owner-response.v2.json`, `DEPLOYED_RUNTIME_MANIFEST.json`, E5 and E7. Existing
E3 and E7 tests retain the frozen 23-screen inventory and every return-pack
hash. The intended verification sequence is:

```bash
python3 services/portal-execution-edge-rs/tools/validate_maximum_data_e7.py
(cd services/portal-execution-edge-rs/contracts/maximum-data-return-v1 && sha256sum --check MANIFEST.sha256)
./scripts/control-api-test.sh
```

EDS-00 is complete when those checks are green and the manifest endpoint stays
metadata-only, authenticated and workspace-bound. There is no internal
technical debt in this phase. The four named owner requirements are external
gates already present in the accepted E7 pack, not deferred implementation.

## Next phase

**EDS-01** replaces only `named_portal_operation=NOT_YET_PUBLISHED` for the
first E5 operation, `maximumDataDeploymentPageV1`. It must reuse the existing
deployment-bound mTLS and short-lived `execution:manager-v2:read` assertion,
with a fixed server-owned relation/field map. It must not modify the intake
baseline or activate a runtime profile.
