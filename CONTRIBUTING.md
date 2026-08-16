# Contributing to Portal

Portal is one monorepo. Make application and feature changes directly in the
appropriate tracked directory; do not create a nested repository, submodule or
separate source lock.

## Contributor access

The bobby account is the sole maintainer of the canonical checkout and its
origin. Thanh Vuong works in the separate workspace Bobby provisions for a
named feat, fix, chore or docs branch. That workspace has only primus-origin:
it permits a normal feature-branch push and a pull request to dev, but cannot
push to origin, dev, main, tags, or a differently named branch.

Read [Contributor Workspace and Handoff](docs/contributor-workspace.md) and
[Contributor Agent Rules](CONTRIBUTOR_AGENT_RULES.md) before handing work to a
contributor agent. Only Bobby may provision a contributor workspace. The
contributor may open or update a Primus pull request to dev, but must never
merge it.

## Branch flow

`main` is the stable deployment branch and normally accepts only reviewed
promotions from `dev`. The root hooks reject contributor commits, merge
commits, rebases and patch applications on either protected branch; the bobby
maintainer account deliberately retains full authority for recovery and release
work. The separate checkout and restricted Primus feature push protect the
canonical branches even if a contributor alters their own copy. Start new work
from up-to-date `dev`:

```bash
git switch dev
git pull --ff-only
git switch -c feat/<topic>
```

Use `fix/`, `chore/` or `docs/` when appropriate. Bobby validates each
completed coherent change and commits it immediately with a focused message.
Contributors commit normally on their assigned branch, then push only that
branch to primus-origin when asked to hand it off. Merge reviewed work into
`dev`; promote `dev` to `main` only after the complete stack is stable.
Never force-push or bypass hooks on shared branches.

## Required checks

```bash
./scripts/install-git-hooks.sh
./scripts/portal verify
./scripts/portal smoke
```

Run the affected backend/frontend tests as well. Root CI runs both backends,
both frontends, Roadmap browser parity and the composed smoke stack. Do not
commit market data, artifacts, databases, credentials, environments, dependency
caches or generated build output.

The QuantBT strategy kernel at `apps/portal/strategy/main.py` is protected.
Never edit it. `quantbt-engine==1.0.8` is a PyPI dependency, not a local source
tree.
