# RF-01 rollback

Every change is additive or versioned; revert per commit, newest first.

| Commit | Revert effect |
|---|---|
| `50aaf532`, then `c9fcc7ba` | Frontend returns to per-screen mappers, no recovery slot, no 401 hand-over, two cursor codecs. No server change needed. |
| `c7cc1ceb` | Journey read stops accepting `stage` (a v2 link then gets 400 on S00); `codec` field disappears. Revert the frontend first if both go. |
| `c0166746` | `retained_artifacts` disappears from the progress read; S03 shows "does not publish retained tables" rather than breaking (field is optional). |
| `e5daa7e2` | Live route gate leaves `verify-workspace.sh`; P01 baseline check returns to HEAD-based `--verify`. |
| `a0d0004d` | Public Python `/api/v1/research/quantbt/atlas` returns. Under `PORTAL_WEB_UPSTREAM=portal-api:8000` the Research reads 404 either way (see `deploy/nginx/portal.conf`). |

No migration, no data, no runtime flag and no deployment were touched.
