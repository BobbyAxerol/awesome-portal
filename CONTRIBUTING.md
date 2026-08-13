# Contributing to the Portal Workspace

The parent repository owns cross-repository integration only. Make application
changes inside the relevant independent repository under `apps/`; do not force
add a child worktree to this repository.

## Branch flow

`main` is the stable deployment baseline and accepts only reviewed promotions
from `dev`. Direct commits to an existing local `main` branch are rejected by
the parent pre-commit hook.

`dev` is the primary integration-development branch. Start every new item from
an up-to-date `dev` branch, then use a short-lived branch and PR it back to
`dev`:

```bash
git switch dev
git pull --ff-only
git switch -c feat/<topic>
```

Use `fix/`, `chore/`, or `docs/` prefixes when they describe the work better.
Run the relevant validation, merge reviewed work into `dev`, and promote `dev`
to `main` only when the complete portal stack is stable. Do not force-push or
bypass hooks on shared branches.

After each completed, coherent change, run its relevant checks and commit it
immediately with a small, descriptive message. Do not batch unrelated finished
work. Commit an application change in its child repository first; commit the
parent `repos.lock` promotion as a separate parent change.

For a composed change:

1. Commit and push the child-repository change through its own review process.
2. Run `./scripts/portal sync` and `./scripts/portal lock`.
3. Review the resulting `repos.lock` diff and update Compose/docs/contracts if
   the service interface changed.
4. Run `./scripts/portal verify` and, when Docker is available,
   `./scripts/portal smoke`.
5. Open a parent PR into `dev`. Promote `dev` to `main` separately after the
   composed stack is release-ready.

Enable the parent guardrails once per clone:

```bash
./scripts/install-git-hooks.sh
pre-commit install
```

The pre-commit configuration is optional but recommended. It excludes `apps/`
because each child repository owns its own hooks and formatting policy.
