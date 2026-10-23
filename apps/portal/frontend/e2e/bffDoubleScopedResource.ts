/**
 * The SCOPED_V2 resource bodies for portfolios, accounts and bindings (`execution-resource-scoped.v2`
 * `{Portfolio,Account,Binding}ScopedResourceWireResponse`).
 *
 * Same opt-in as the alpha double (`bffDoubleAlpha.ts`): ONLY a request that names `workspace_id=ws_TEST_SCOPED_V2` explicitly
 * is answered with the v2 body; every other request keeps the legacy body the readers and screens were written against, byte for
 * byte. The v2 body is the producer's canonical case (`execution-resource-scoped.synthetic.valid.json`) with the requested id as
 * the resource id and the sentinel as the workspace, and nothing else changed: no label is invented (the canonical label is
 * kept as published), no total, no name, no money.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SCOPED_V2_WORKSPACE = "ws_TEST_SCOPED_V2";

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const SCHEMA_OF = { PORTFOLIO: "execution.portfolio-resource.v2", ACCOUNT: "execution.account-resource.v2", BINDING: "execution.binding-resource.v2" } as const;

export type ScopedResourceKind = keyof typeof SCHEMA_OF;

/** The v2 body when the request names the sentinel workspace, otherwise `null` (the caller serves its legacy body). */
export function scopedResourceV2(kind: ScopedResourceKind, id: string, search: URLSearchParams | string): Record<string, unknown> | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  if (params.get("workspace_id") !== SCOPED_V2_WORKSPACE) return null;
  const cases = (JSON.parse(readFileSync(join(CONTRACTS, "execution-resource-scoped.synthetic.valid.json"), "utf8")) as { cases: Record<string, unknown>[] }).cases;
  const found = cases.find((c) => c.schema_version === SCHEMA_OF[kind]);
  if (!found) throw new Error(`canonical scoped ${kind} case not found`);
  const body = structuredClone(found);
  body.workspace_id = SCOPED_V2_WORKSPACE;
  body.resource = { ...(body.resource as Record<string, unknown>), id };
  return body;
}
