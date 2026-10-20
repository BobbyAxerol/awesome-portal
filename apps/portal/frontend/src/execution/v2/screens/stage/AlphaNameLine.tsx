/**
 * The alpha part of a stage header's subtitle (FE-066): the alpha id when the server published it, then the name or
 * `Alpha name Not published (FE-066)` with the server's reason code in the title. Never a name built from an id.
 */
import { NotPublished } from "../../blocks";
import { FE_IDENTITY, type StageIdentity } from "./identity";

export function AlphaNameLine({ identity }: { identity: StageIdentity }) {
  return (
    <>
      {identity.alphaId === null ? null : <span className="exec-blk-num">Alpha {identity.alphaId} · </span>}
      {identity.alphaName === null ? (
        <NotPublished id={FE_IDENTITY} titleReason={identity.alphaReasonCode}>
          Alpha name
        </NotPublished>
      ) : (
        <span>Alpha name {identity.alphaName}</span>
      )}
    </>
  );
}
