# Contributing to Portal

Portal is one monorepo. Make application and feature changes directly in the
appropriate tracked directory; do not create a nested repository, submodule or
separate source lock.

## Branch flow

`main` is the stable deployment branch and accepts only reviewed promotions from
`dev`. Direct local commits to an existing `main` branch are rejected by the
root hook. Start new work from up-to-date `dev`:

```bash
git switch dev
git pull --ff-only
git switch -c feat/<topic>
```

Use `fix/`, `chore/` or `docs/` when appropriate. Validate each completed
coherent change and commit it immediately with a focused message. Merge reviewed
work into `dev`; promote `dev` to `main` only after the complete stack is stable.
Never force-push or bypass hooks on shared branches.

`origin` is the canonical development remote. `primus-origin` is a manual,
source-preserving mirror: never set it as an upstream, force-push to it, or
delete its refs during a mirror operation. Sync it only when explicitly
requested, after comparing refs, and include both local branches and archive or
release tags.

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
