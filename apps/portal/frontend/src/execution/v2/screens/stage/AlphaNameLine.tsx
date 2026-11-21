/**
 * The alpha part of a stage header's subtitle (FE-066): `Alpha <id> · <name>` with what the server published. A name that
 * is not published is not announced a second time: the id stands alone and the request and the server's reason are in a
 * disclosure (a "?" that opens by keyboard and touch). With neither, `Alpha Not available`. Never a name built from an id.
 */
import { GapWhy, NotPublished, gapTitle } from "../../blocks";
import { FE_IDENTITY, type StageIdentity } from "./identity";

export function AlphaNameLine({ identity }: { identity: StageIdentity }) {
  if (identity.alphaId === null && identity.alphaName === null) {
    return (
      <span>
        Alpha{" "}
        <NotPublished id={FE_IDENTITY} titleReason={identity.alphaReasonCode}>
          Alpha name
        </NotPublished>
      </span>
    );
  }
  return (
    <span>
      Alpha{" "}
      {/* The name is what the owner reads; the id is the secondary line (title) and is printed only when no name is published. */}
      {identity.alphaName !== null ? <span title={identity.alphaId ?? undefined}>{identity.alphaName}</span> : identity.alphaId === null ? null : <span className="exec-blk-num">{identity.alphaId}</span>}
      {identity.alphaName === null ? <GapWhy name="Why the alpha name is not available" rows={[gapTitle(FE_IDENTITY, "Alpha name", identity.alphaReasonCode)]} /> : null}
    </span>
  );
}
