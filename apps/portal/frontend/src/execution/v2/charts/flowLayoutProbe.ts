/** Test seam: the layout functions, re-exported so tests do not reach into component internals. */
import { trace, type FlowBlock } from "./flowLayout";

export { layoutFlow, NODE_W } from "./flowLayout";

export function connectedNodes(block: FlowBlock, id: string): Set<string> {
  return new Set([...trace(block, id, "up").nodes, ...trace(block, id, "down").nodes]);
}
