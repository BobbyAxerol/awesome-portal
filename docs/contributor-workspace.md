# Contributor Workspace and Pull Request Flow

Thanh Vuong works in a separate Git checkout under
/srv/portal-contributors/<branch>. It is a normal local checkout for the
requested feature branch, with one carefully limited remote:

- origin is absent, so the contributor cannot push to the BobbyAxerol
  canonical repository from this workspace.
- primus-origin is the only remote and points to
  git@github.com:PrimusSpark/awesome-primus-portal.git.
- Hooks allow a contributor to push only the same named feat, fix, chore, or
  docs branch to primus-origin. They reject every push to dev, main, tags,
  origin, another remote, branch deletion, or a differently named destination.

The canonical checkout remains /home/bobby/portal. Its Linux ownership keeps
the thanhvuong account out of Bobby's working tree and its .git directory, so
the contributor cannot locally merge into Bobby's dev or main.

## Roles

- The bobby Linux account owns the canonical checkout and has its normal full
  authority for local work and the BobbyAxerol origin.
- The thanhvuong Linux account works only in its supplied workspace. Its GitHub
  identity is thanhvuong1105.
- On primus-origin, both accounts use the access granted by PrimusSpark. The
  repository owner must protect dev and main so contributors can create pull
  requests but cannot merge or update those branches.

## One-time host and GitHub prerequisites

Before the first push, Bobby must arrange these items:

1. Give the thanhvuong Linux account a usable, private home directory and its
   own SSH key. Do not copy Bobby's SSH key or credential helper. The current
   declared home directory needs its ownership checked before adding SSH
   configuration.
2. Register that public key with GitHub account thanhvuong1105 and verify that
   SSH identifies as that account.
3. Grant that GitHub account enough permission on PrimusSpark/awesome-primus-portal
   to push feature branches. If it has only read or triage permission, use a
   fork instead.
4. In the Primus repository, protect main and dev: require a pull request,
   block direct/force updates, and do not add thanhvuong1105 to a bypass or
   allowed-updater list. The repository owner controls this rule.

## Prepare a requested branch

Only Bobby prepares the branch and workspace:

    git switch dev
    git pull --ff-only origin dev
    git switch -c feat/<topic>
    ./scripts/provision-contributor-workspace.sh --branch feat/<topic>

Provisioning never pushes. It clones without hardlinks, removes origin, adds
only primus-origin, sets the local Git identity Thanh Vuong
<thanhvuong@local.invalid>, and enables the shared hooks.

## Contributor work

The contributor agent must first read
[CONTRIBUTOR_AGENT_RULES.md](../CONTRIBUTOR_AGENT_RULES.md), then run:

    cd /srv/portal-contributors/feat/<topic>
    ./scripts/verify-contributor-workspace.sh

Normal feature work is allowed: inspect status, edit, test, add files, and
commit focused changes on the supplied branch. After Bobby has authorized the
handoff, the contributor may push only that branch:

    git push -u primus-origin feat/<topic>

The contributor may then create a pull request on primus-origin with base
branch dev. Creating a PR is allowed; merging it is not. Do not create a PR
to main, do not push a protected branch, and do not use origin.

## Review and merge

Review takes place on the Primus pull request. The contributor stops after
opening or updating it. Only a person with the repository's approved merge
permission may merge it into dev. Promotion from dev to main remains a
separate release decision.

## Security boundary

Hooks provide useful local guardrails but can be changed in a clone that a
contributor owns. The durable protections are Linux isolation from
/home/bobby/portal, no Bobby credential in the contributor workspace, origin
being absent, and Primus branch protection. The hook is deliberately narrow:
it permits normal feature collaboration while preventing accidental protected
branch pushes from the thanhvuong account.
