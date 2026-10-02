/**
 * Screen 14 on its canonical product route (`FD-P09-02`, resolved in plan §13).
 *
 * `/research/quantbt/alpha-import`. The path lives under QuantBT rather than
 * under `ALPHA_POOL`, which the registry still marks `COMMISSIONED` — serving a
 * working screen there would contradict the feature's own badge. Legacy
 * `/research/quantbt/imports` is untouched and `/research/alphas/import` stays
 * unmounted.
 */

import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AlphaImport } from "./AlphaImport";
import { useAlphaImport } from "./useAlphaImport";

/** Same shape `useAlphaImport` admits for a registry filter; anything else is not mirrored into the URL. */
const ALPHA_QUERY = /^[a-z][a-z0-9-]{2,63}$/;

/**
 * F2b: `?alpha=<id>` is the screen's one piece of context. It arrives from
 * Lineage ("import new version →"), pre-fills the alpha id (so the registry is
 * already filtered to it), and is kept in step with a valid typed id with
 * `replace`, so "copy link" and Back land on the same alpha. The uploaded bytes
 * and receipts are never in the URL: they belong to this tab.
 */
export function AlphaImportRoute() {
  const [params, setParams] = useSearchParams();
  const [initialAlpha] = useState(() => params.get("alpha") ?? "");
  const controller = useAlphaImport(undefined, initialAlpha);
  const { onAlphaIdChange } = controller;
  const mirrorAlpha = useCallback(
    (value: string) => {
      onAlphaIdChange(value);
      const typed = value.trim();
      if (!ALPHA_QUERY.test(typed)) return;
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("alpha", typed);
          return next;
        },
        { replace: true },
      );
    },
    [onAlphaIdChange, setParams],
  );
  return (
    <AlphaImport
      contextAlpha={ALPHA_QUERY.test(initialAlpha) ? initialAlpha : null}
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
      registryTotal={controller.registryTotal}
      registryAlpha={controller.registryAlpha}
      registryShowAll={controller.registryShowAll}
      onToggleRegistryShowAll={controller.onToggleRegistryShowAll}
      registryNext={controller.registryNext}
      registryMore={controller.registryMore}
      onLoadMoreRegistry={controller.onLoadMoreRegistry}
      parseState={controller.parseState}
      gatesState={controller.gatesState}
      registerState={controller.registerState}
      registryState={controller.registryState}
      onRetryRegistry={controller.onRetryRegistry}
      activationPending={controller.activationPending}
      refusal={controller.refusal}
      refusalStep={controller.refusalStep}
      alphaId={controller.alphaId}
      onAlphaIdChange={mirrorAlpha}
      onParse={controller.onParse}
      onRunGates={controller.onRunGates}
      onRegister={controller.onRegister}
      onActivate={controller.onActivate}
      onActivateEntry={controller.onActivateEntry}
      activationAttemptId={controller.activationAttemptId}
      activationAdmitted={controller.activationAdmitted}
      busyStep={controller.busyStep}
      activationRefusal={controller.activationRefusal}
    />
  );
}
