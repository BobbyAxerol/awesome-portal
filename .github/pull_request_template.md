## Summary

Describe the Portal module(s), API/UI contract and deployment surface affected.

## Monorepo boundaries

- [ ] Source changes remain inside the appropriate `apps/`, `features/` or `packages/` boundary.
- [ ] No nested Git repository, generated dependency/build output, credentials or data is included.
- [ ] `quantbt-engine` remains a pinned PyPI dependency; no sibling engine source was added.

- [ ] If a contributor workspace was used, its feature branch was pushed only to primus-origin and the contributor did not merge or alter dev or main.

## Validation

- [ ] `./scripts/portal verify`
- [ ] `./scripts/portal smoke` (or explain why Docker validation was not run)
- [ ] Relevant backend/frontend/browser tests were run.

## Deployment and security

- [ ] Compose, environment examples and runbook were updated if service wiring changed.
- [ ] Rollback impact and any required deployment steps are documented.
