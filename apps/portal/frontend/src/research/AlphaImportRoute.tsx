/**
 * Screen 14 on its canonical product route (`FD-P09-02`, resolved in plan §13).
 *
 * `/research/quantbt/alpha-import`. The path lives under QuantBT rather than
 * under `ALPHA_POOL`, which the registry still marks `COMMISSIONED` — serving a
 * working screen there would contradict the feature's own badge. Legacy
 * `/research/quantbt/imports` is untouched and `/research/alphas/import` stays
 * unmounted.
 */

import { AlphaImport } from "./AlphaImport";
import { useAlphaImport } from "./useAlphaImport";

export function AlphaImportRoute() {
  const controller = useAlphaImport();
  return (
    <AlphaImport
      sourceText={controller.sourceText}
      fileName={controller.fileName}
      onSourceChange={controller.onSourceChange}
      multiFileRejected={controller.multiFileRejected}
      onMultiFileRejected={controller.onMultiFileRejected}
      parse={controller.parse}
      gates={controller.gates}
      registration={controller.registration}
      activation={controller.activation}
      registry={controller.registry}
      parseState={controller.parseState}
      gatesState={controller.gatesState}
      registerState={controller.registerState}
      registryState={controller.registryState}
      activationPending={controller.activationPending}
      refusal={controller.refusal}
      alphaId={controller.alphaId}
      onAlphaIdChange={controller.onAlphaIdChange}
      onParse={controller.onParse}
      onRunGates={controller.onRunGates}
      onRegister={controller.onRegister}
      onActivate={controller.onActivate}
      activationAdmitted={controller.activationAdmitted}
    />
  );
}
