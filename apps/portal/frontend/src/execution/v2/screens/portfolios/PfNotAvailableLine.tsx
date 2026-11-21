/**
 * The Portfolio 360's one `Not available: ...` line. Same words and the same disclosure as the shared block, but no ticket code in the
 * hidden text (QA3 R1-10): the codes and reasons stay behind the GapWhy disclosure only.
 */
import { GapWhy, unavailableTitle, type UnavailableFact } from "../../blocks";

export function PfNotAvailableLine({ facts, className }: { facts: readonly UnavailableFact[]; className?: string }) {
  if (facts.length === 0) return null;
  const names = facts.map((fact) => fact.label).join(", ");
  return (
    <p className={className ? `exec-blk-nal ${className}` : "exec-blk-nal"} data-testid="not-available-line">
      <span className="exec-blk-np-word">Not available:</span> {names}
      <GapWhy name={`Why not available: ${names}`} rows={unavailableTitle(facts).split("\n")} />
    </p>
  );
}
