# N16A source-dark same-domain emergency routing

This directory is an **unmounted, source-dark** route/origin-isolation
blueprint. N16A does not create a Cloudflare application, DNS/tunnel route,
public Nginx route, execution origin binding, credential or Trading System
request.

The future browser contract remains one logical Portal origin:

```text
https://portal.primusspark.com/ops/emergency/*
```

The browser must never receive an AWS-HK/internal hostname, delegated workload
token or a cross-origin redirect. Origin selection is server-side only. The
committed Nginx fragment has no `proxy_pass`; if an owner accidentally includes
it before N16B, it returns one typed `503` and therefore fails closed.

## N16A drill matrix

| Local-only fault | Expected result |
|---|---|
| Research unavailable | `DEGRADED`; `execution_ops` is only a future candidate, route target remains `NONE` |
| Cloudflare unavailable | `UNAVAILABLE`; no direct/internal bypass |
| Execution origin unavailable | `UNAVAILABLE`; no command and no fallback to DB/Redis/CLI |
| N12 R3 unpublished | break-glass control hidden; PLAN/APPLY/VERIFY all denied |
| rollback engaged | `ROLLBACK`; route target `NONE` |

Run `./scripts/execution-n16a-emergency-routing-test.sh`. N16B may be prepared
only after the accepted N12 R3 catalogue, dedicated command identity, N15B and
an owner change window exist. It must replace this source-dark template through
a separately reviewed change; editing flags in this directory is not an
activation mechanism.
