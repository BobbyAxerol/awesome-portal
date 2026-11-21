# P23 gateway upstream-connect fault checkpoint — 2026-09-29

**Verdict:** isolated-cell fail-fast/recovery PASS; F5 typed-502, complete P23 and P24 remain OPEN. This is not a production rollout.

The owned `portal-research-p23-ol12` cell alone served `127.0.0.1:8096`. Before the change, source `a27048ca358a151c07fe91c8b18af95d3d04951e` served `GET /api/auth/context` as 200. With only that cell's Control API stopped, the same GET returned **zero bytes** and hit the client's five-second timeout. The service was restarted and the route returned 200 again.

Commit `94da8f8c5d6621f0af7d634bda5a1cdc4aeb6d9e` adds `proxy_connect_timeout 3s` to `/api/`, `/api/auth/` and the run-event route in `deploy/nginx/portal.conf`. It does not change the long-lived SSE read/send timeouts, any API or UI, auth, admission, or data. The full repository commit hook exited 0. Only the P23 `portal-web` image was rebuilt: `sha256:d10b54a35055d45b2c20fdaae1946a063a257c746cadd07e0b166b54512c0adf`; Control API remained `sha256:c65403a1e3de199a0ffeb5a82b6c9e9744710638146eac327da6a195f95c9f03`. Cell identity said `dirty=false`; `nginx -t` passed.

| Probe on the new image | HTTP | Content type | Elapsed |
| --- | ---: | --- | ---: |
| Control API stopped: `GET /api/auth/context` | 504 | `text/html` | 3.004523 s |
| Control API stopped: `GET /api/v1/research/alphas` | 504 | `text/html` | 3.003877 s |
| Control API restored: `GET /api/auth/context` | 200 | `application/json` | 0.011953 s |
| Control API restored: anonymous `GET /api/v1/research/alphas` | 401 | `application/json` | 0.003823 s |

Both fault GETs were read-only. The 504 is nginx's upstream-connect timeout, **not a typed Research 502** and not a pass for F5's browser refusal matrix. No claim is made about an already-in-flight POST or a slow, connected upstream. The P23 cell was stopped with `down` (no `-v`); test volumes and earlier receipts remain. Dev, stable, Execution, Trading System and the shared preview were not restarted.

Next: obtain the distinct real typed-502 and browser refusal receipt for F5, then retake complete P23/DR/BR/GX on a single immutable candidate. The earlier W06 500-ms passes are not re-labelled as evidence for this new web image.
