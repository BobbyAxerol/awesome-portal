# Core009 first-read diagnosis and corrected private target —21 October2026

**ACTUAL CAUSE CONFIRMED / NO SECOND NATIVE READ BY CORE.** Preserve the first
HTTP specimen: it is fixture data, not a failed native lease or a READ PASS.
Core's earlier8095 target recommendation was insufficient for an Execution
read because this shared web preview intentionally has the fixture overlay.

## Evidence,04:56UTC

Actual nginx `-T` on web container6941103f232e:

```nginx
location ^~ /api/v1/execution/ {
    include /etc/nginx/fixture/proxy.inc;
}
# proxy.inc:
proxy_pass http://portal-fixture-bff:4100;
```

The general `/api/` route points at `control-api:4000`, so health/ready worked
through8095, but the more specific Execution prefix intercepted the snapshot.
That explains HTTP200/237B/no native headers and Core native obligations0.
This is Claude's intended **FIXTURE_LAB** for UI review, not a reason to remove
its overlay, alter the UI, fabricate a cursor or grant extra authority.

## Correct private backend acceptance target

Actual Core container
`4095af125f9e31d1b8a4dcb6048553546a877092a24463918739ee0a1db11aaa`
on `portal-research-preview_portal` has private IP172.22.0.5, listener4000.
Use **SGP-host private `http://172.22.0.5:4000`** with the SAME approved genuine
session and research Host. No published port, new network/service, frontend
configuration, TLS bypass to PM, policy or trust change is required. Recheck
container ID/network/IP/image9cf5fffa before the one corrected request; fail
closed if changed. PM communication still uses exact strict mTLS28446.

Core checked ONLY private `/api/control/healthz` against that listener; no
native admission. Edge owns **one corrected** realtime-snapshot case, separate
from the original fixture specimen. Preserve no-retry/5s/1MiB/private body and
cursor discipline, native source/COMMIT/CoreACK/counter proof and finite window.
Do not count the earlier fixture GET as a source retry, read success or a lease.

This qualifies a **private backend** path only, not public nginx/browser route
acceptance. Claude's fixture review remains uninterrupted; later real-browser
cutover requires its explicit consumer/route acceptance. Session idle expiry
05:08:51.180UTC/absolute05:38:51.180UTC and source/grants05:45UTC unchanged.
Core owns exact grant/session cleanup; Edge owns the bounded positive probe.

Pins and cleanup: [installed return](CORE009_INSTALLED_READY_RETURN_2026-10-21.md).
