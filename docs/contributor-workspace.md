# Contributor Workspace and Handoff

Thanh Vuong works in a separate local Git checkout. It is intentionally not a
clone that can talk to the Portal remotes: it has no configured remote, no
Bobby credential, and a hook prevents any push if a remote is added later.
This lets a contributor or their coding agent make local changes and, when
explicitly authorized, local commits without being able to alter the canonical
Portal repository, dev, main, origin, or primus-origin.

## Roles

- Bobby is the sole maintainer. The bobby Linux account retains full local and
  remote authority, including both origin and primus-origin.
- Thanh is a local contributor. He may work only in the supplied checkout and
  only on the branch Bobby names.
- The canonical repository remains /home/bobby/portal. Do not grant Thanh
  access to this directory, its .git directory, or Bobby's SSH directory.

## Prepare an approved branch

Only Bobby performs these commands in the canonical repository. Create a
feature branch from current dev only when the work is requested:

    git switch dev
    git pull --ff-only origin dev
    git switch -c feat/<topic>
    make contributor-provision BRANCH=feat/<topic>

The provisioning command creates /srv/portal-contributors/feat/<topic>. It
uses passwordless sudo only to create and permission the isolated workspace.
It refuses an existing destination and never overwrites an earlier workspace.
It clones without hardlinks, removes origin immediately, removes upstream
tracking, enables the Portal hooks, and records the exact source commit.

Bobby may push the feature branch to origin if and only if Bobby wants to; the
provisioning command never pushes anything.

## Contributor work

The agent must read [CONTRIBUTOR_AGENT_RULES.md](../CONTRIBUTOR_AGENT_RULES.md)
before editing. In the supplied workspace, its initial check is:

    ./scripts/verify-contributor-workspace.sh

The check requires an approved feat, fix, chore, or docs branch and requires
that no Git remote exists. Hooks enforce the following for every non-bobby
Linux account:

- local commits, merge commits, rebases, and patch application are rejected on
  main and dev;
- control-plane files cannot be committed;
- every remote push is rejected, including origin and primus-origin;
- local work on the named feature branch remains possible only after the
  contributor workspace check passes.

A contributor may create a local commit only when Bobby asks. Otherwise the
agent hands back its uncommitted working tree. It must never create a PR, merge
changes, or use a remote command.

Git has no client-side hook before every branch checkout or fast-forward ref
movement. That is why this model does not treat a contributor's clone as a
security boundary: its lack of remotes, the push hook, and the contributor's
lack of Bobby credentials are what prevent any local experiment from changing
the canonical Portal branches.

## Review and import

When the contributor is done, only Bobby imports the local branch:

    make contributor-import BRANCH=feat/<topic>

The import creates or fast-forwards only the local reference
refs/remotes/contributor/thanhvuong/feat/<topic>. It refuses a contributor
workspace that has any remote configured. It does not checkout, merge, rebase,
commit, push, or rewrite any Portal branch.

Bobby reviews the handoff before choosing an integration action:

    git log --oneline feat/<topic>..contributor/thanhvuong/feat/<topic>
    git diff feat/<topic>...contributor/thanhvuong/feat/<topic>
    git switch feat/<topic>
    git merge --ff-only contributor/thanhvuong/feat/<topic>

If Bobby's branch has moved, inspect the changes and merge or cherry-pick
deliberately instead of forcing either history. Normal review then remains
feature branch to dev, followed by a release-ready dev to main promotion.

There is deliberately no automatic delete command for contributor workspaces.
After import and review, Bobby can inspect and remove the exact completed
workspace manually.

## Security boundary

Client-side Git hooks are helpful workflow controls but are not an
authorization system: a contributor can alter a copy they own. The protection
that matters is the separate Linux account, a standalone checkout with no
remote, no access to /home/bobby or its SSH key, and no GitHub write
permission. Do not add Thanh as a write, maintain, or admin collaborator on
the BobbyAxerol repository. If remote collaboration is needed later, use a
separate fork and keep Bobby as the only account permitted to merge or push
canonical branches.
