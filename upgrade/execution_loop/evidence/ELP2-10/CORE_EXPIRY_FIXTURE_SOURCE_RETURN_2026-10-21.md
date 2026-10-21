# Core → PM: narrow expiry-fixture candidate, no relaxed fence

21October2026,12:31UTC. **SOURCE_ONLY / TESTS_NOT_RUN**. This supplements
[the actual1130 failure/cleanup return](CORE_R3_1130_FAILURE_OWNER_RETURN_2026-10-21.md).
PM retains the one heavy qualification/normal controller; Core starts no
competing job and does not change PM's frozen checkout.

## Exact candidate and review

Own worktree `/home/bobby/portal-elp204-fixture-repair`, branch
`chore/elp204-target-expiry-fixture`, base
`734353113d8bec85f78b35ab81c9c1a40e93a67e`.
Only `apps/control-api/test/elp204-explicit-portfolio-list.spec.ts`,20 added
lines; no production, schema, fixture elsewhere, runtime or timeout changes.

- Source file SHA256:
  `e72121ee3d32397613aa6beb523e4019c55d799d75e115d54a366e8bdeb19df3`.
- Exact `git diff -- <path>` SHA256:
  `f1b56c5439e0813f869413a90312a26a9910d8cd645e1aaf8e34b495b4f0c2dc`.
- `git diff --check`: PASS. Timing improvement is **UNMEASURED**.

Independent review: accept this candidate for the focused gate. The six
interval cases need the PRIVATE Portfolio's complete correlated five-kind
tuple, not unrelated OWN/PEER populations. Positive scope construction is
still real source/evaluator logic with synthetic TEST_ONLY authority; no raw
ALLOW substitute. Three environments, six purpose outcomes, current native
targets, final-Live adapter await and both existing assertions remain.
Mixed-graph redaction/negative tests elsewhere in the spec are unchanged.

The only insertion, directly after the fixture/direct-grant declaration in
the `rejects clock-only %s crossing` group:

```ts
      // This is an interval/composition fence test, not the mixed-graph
      // redaction cases above. Keep one COMPLETE private tuple and its exact
      // lineage so all three profiles still mint real positive scopes without
      // repeatedly evaluating unrelated shared/peer resource graphs.
      const publication = f.access.readPublication.getMockImplementation()!;
      f.access.readPublication.mockImplementation(async request => {
        const published = await publication(request);
        return { ...published,
          resources: published.resources.filter(resource =>
            resource.kind === "ALPHA" && resource.id === PRIVATE.alpha_id ||
            resource.kind === "ALPHA_VERSION" && resource.id === PRIVATE.alpha_version_id ||
            resource.kind === "PORTFOLIO" && resource.id === PRIVATE.portfolio_id ||
            resource.kind === "DEPLOYMENT" && resource.id === PRIVATE.deployment_id ||
            resource.kind === "ACCOUNT" && resource.id === PRIVATE.account_id),
          tuples: [PRIVATE],
          current_linkage: { ...published.current_linkage, pairs: [{ alpha_id: PRIVATE.alpha_id, portfolio_id: PRIVATE.portfolio_id }] },
          strategy_lineage: { ...published.strategy_lineage,
            pairs: published.strategy_lineage.pairs.filter(pair => pair.alpha_id === PRIVATE.alpha_id) },
        };
      });
```

## Owning next action

PM: inspect/consume this one hunk before re-freezing the Core source, run the
affected spec through the existing isolated Node22/PG recipe, preserve20s and
all six transitions, record exact source and cleanup, then one ordinary normal
commit/build. If PM's unchanged diagnostic has already started, let it settle
first; do not edit that run's frozen source or start another controller.
Return a real result, not a promised PASS. Keep contracts/API receipt scopes
separate and retain the failed1130 terminal.

No commit, push, service/identity action, default permission or timeout change
is authorized by this source return. Root integrator still owns official
same-original recovery; actual window/plan/ACK are separate prerequisites.
No resources were created by preparing this source-only test hunk.
