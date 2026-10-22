/**
 * A server code as its plain name (`displayNames.ts`). A code the dictionary names keeps the raw code in visually hidden text; any
 * other code is humanized and keeps the raw code behind a `GapWhy` disclosure, so it is reachable by keyboard and touch and
 * never drawn beside the name.
 */
import { codeName } from "../displayNames";
import { GapWhy } from "./notPublished";
import "../css/blocks.css";

export function CodeName({ code, className }: { code: string; className?: string }) {
  const { name, known } = codeName(code);
  return (
    <>
      <span className={className}>{name}</span>
      {known ? <span className="exec-blk-sr"> ({code})</span> : <GapWhy name={`${name}, code`} rows={[code]} next={null} />}
    </>
  );
}
