# N14B — Immutable current-source release compatibility

Status: `N14B_PORTAL_COMPATIBILITY_ACCEPTED / PAPER_CANDIDATE_PINNED /
PROFILE_RUNTIME_NOT_ACTIVATED`

Date: 2026-08-29  
Authority: Portal release tooling and protected-main image publication  
Trading System change: none  
Runtime/source traffic: none

## 1. Outcome

N14B consumes the exact N13B source-as-is map without requiring a new Trading
System endpoint or image. It adds an immutable compatibility adjunct to the
existing N14A release pack rather than editing or weakening the source-dark
manifest.

The first release target is deliberately narrow:

- profile `PAPER` / environment `paper`;
- Manager profile `PAPER_BINANCE_USDM`;
- delegated audience `portal-execution-edge-paper`;
- screen `PAPER_TRADING_SCREEN` only;
- three accepted reads: positions, execution quality and current sessions;
- four qualified Manager-v2 bindings: deployments, performance, positions and
  sessions;
- no actions, Gateway market feed, Historical/QDL, Event, Artifact or command.

This is the complete N14B compatibility scope. It is not a claim that Paper
traffic, a registry screen or a stable release is already active.

## 2. Immutable compatibility chain

`portal-current-source-release.py` first validates the complete N14A candidate,
including its six digest images and evidence. It then binds:

1. the exact N14A release-manifest digest and protected-main source commit;
2. the N13B current-source map digest, contract revision and all owner/source
   pins;
3. the exact Paper profile-definition digest;
4. thirteen Control API, Compose and Rust adapter files by SHA-256;
5. immutable `control-api`, `execution-edge` and `source-proxy` image digests
   from the same N14A pack;
6. the profile-scoped rollback runbook digest and optional prior compatibility
   digest for a forward-fix chain.

Unknown fields, duplicate JSON keys, symlinks, unsafe/secret-shaped artifacts,
tags, zero candidate digests, source-map drift, profile widening and N14A
evidence drift fail closed.

The protected-main image workflow generates and uploads
`portal-current-source-compatibility-<commit>` from the same verified bytes as
the N14A candidate. A feature-branch or local image cannot be relabelled as the
published adjunct.

## 3. Authority and environment isolation

Bobby's explicit N14B approval authorizes this implementation and compatibility
scope. It is recorded separately from runtime authority. The adjunct has these
hard states:

- `current_source_release_compatible=true`;
- `runtime_deployed=false`;
- `registry_promoted=false`;
- source, Query, SSE and command activation false;
- Trading System release false;
- database copy between channels false.

The candidate render enables only the Paper configuration shape. Sandbox and
Live remain false. Command, projection, realtime, analytics and shadow flags
remain false. Dev/stable databases, routes, projects and secrets retain N14A's
separation; no database is copied or migrated by N14B.

## 4. Rollback and forward fix

Rollback is affected-profile-only:

1. set the Control API Paper current-source flag false;
2. set the Edge Manager-v2 read flag false;
3. stop only `portal-execution-edge-paper` if a later change window deployed
   it;
4. leave Sandbox, Live, databases and Trading System unchanged;
5. retain the rejected digest and operator-visible reason.

A forward fix requires a new protected-main N14A pack. Its N14B adjunct must
name the prior adjunct SHA-256 and retain the exact source set/profile. A source
scope change is a reviewed compatibility revision, not a silent forward fix.

## 5. Verification

- N14B unit/security suite: **11/11 passed**;
- exact Paper capability/source derivation: passed;
- N14A manifest/image tamper rejection: passed;
- source-map/profile/adapter/runbook/checksum drift rejection: passed;
- Sandbox/Live/command/runtime widening rejection: passed;
- symlink and secret-shaped artifact rejection: passed;
- prior-digest forward-fix chain and negative case: passed;
- Paper candidate and rollback Docker Compose renders: passed;
- GitHub Actions `actionlint 1.7.7`: passed;
- full `./scripts/portal verify`: passed;
- no container was started and no source, registry, stable or production state
  changed.

## 6. Exit and next phase

N14B is accepted at the Portal compatibility/release-authority layer. The real
immutable adjunct will be mechanically published when these commits reach
protected `main`; that publication does not reopen the phase design decision
or authorize runtime activation.

N15B is next. It may accept the current Query interface for this exact Paper
set independently. Missing Event or Artifact publication cannot block Query.
Commands remain the separate N16B identity and approval lane.

Canonical assets:

- [`current-source-paper-release-profile.v1.json`](../../deploy/manifests/current-source-paper-release-profile.v1.json)
- [`portal-current-source-release.py`](../../scripts/portal-current-source-release.py)
- [`portal-n14b-current-source-release-and-rollback.md`](../../deploy/runbooks/portal-n14b-current-source-release-and-rollback.md)
