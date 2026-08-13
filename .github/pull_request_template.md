## Summary

Describe the integration-level change and the affected services.

## Child source and lock

- [ ] No child-repository source was added to this parent repository.
- [ ] `repos.lock` was updated and reviewed when a child revision is promoted.
- [ ] Child-repository changes were committed and reviewed in their own repo.

## Validation

- [ ] `./scripts/portal verify`
- [ ] `./scripts/portal smoke` (or explain why Docker validation was not run)
- [ ] Relevant child backend/frontend tests were run.

## Deployment and security

- [ ] Compose, environment examples and runbook were updated if service wiring changed.
- [ ] No credentials, market data, artifacts or generated output are included.
- [ ] Rollback impact and any required deployment steps are documented.
