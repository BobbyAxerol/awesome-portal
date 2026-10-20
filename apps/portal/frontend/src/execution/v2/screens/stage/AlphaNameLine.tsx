/**
 * The alpha part of a stage header's subtitle (FE-066): `Alpha <id> · <name>` with what the server published. A name that
 * is not published is not announced a second time: the id stands alone and the request and the server's reason are its
 * title. With neither, `Alpha Not available`. Never a name built from an id.
 */
import { NotPublished, gapTitle } from "../../blocks";
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
    <span title={identity.alphaName === null ? gapTitle(FE_IDENTITY, "Alpha name", identity.alphaReasonCode) : undefined}>
      Alpha{" "}
      {identity.alphaId === null ? null : <span className="exec-blk-num">{identity.alphaId}</span>}
      {identity.alphaId !== null && identity.alphaName !== null ? " · " : null}
      {identity.alphaName === null ? null : <span>{identity.alphaName}</span>}
    </span>
  );
}
