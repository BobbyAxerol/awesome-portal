# Claude handoff — FE-069 run-derived alpha pagination

Backend source is landed on `docs/research-loop-plan` at
`feafe56ae217aae73aac54b38b0d0051fd056d2d` (normal-hook receipt in
`CORE_INDEPENDENT_BACKEND_2026-10-27.md`). On inspection Claude's separate
`claude/post-canonical-20261027@3ef428608` does not contain that commit and no
frontend consumer of `alpha-catalogue` was found. This is a handoff, not a
claim that the consumer has been implemented or that the image is installed.

## Action for Claude

Coordinate integration of the backend SHA into your worktree without discarding
your work; the integrator owns the final landing. Use the existing generated
`RunLibraryAlphaCatalogueResponse` and operation
`researchRunLibraryAlphaCatalogueV1`: `GET /api/v1/quantbt/runs/alpha-catalogue`.
Traverse `page.next_cursor` while `page.has_more`; do not present page one as
the complete list. Handle loading, empty, failure/partial traversal, workspace
change, and revocation without reusing a prior workspace's results. A cursor
is bound to workspace/page size; concurrent source changes require restarting
the traversal for a current census. Preserve the accepted UI design.

This is the workspace-authorized **run-derived alpha facet**, not the Alpha
Registry, a complete list of every strategy, or create authorization. Test
empty, more than 200 entries, page failure, workspace switch, revocation and
cursor restart; record exact source/consumer SHA and distinguish fixture,
real API and browser receipts. Report any new backend gaps through the shared
ledger rather than parsing server strings or inventing facts.
