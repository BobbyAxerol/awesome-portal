/// <reference path="./positive-world-shims.d.ts" />
/**
 * WP-P: the one place the fixture BFF imports Codex's positive producers (packages/contracts/tooling/*.mjs).
 * rolldown bundles them into dist/server.mjs with the rest of the BFF (they import only node:crypto and each other), so nothing is
 * read from disk at run time. Fixture only: never imported by product code.
 */
export { buildPositiveManagerSeries } from "../../../packages/contracts/tooling/execution-manager-positive-series-fixtures.mjs";
export { positiveManagerWorld } from "../../../packages/contracts/tooling/execution-manager-positive-world.mjs";
export type { PositiveWorld, PositiveTuple } from "../../../packages/contracts/tooling/execution-manager-positive-world.mjs";
