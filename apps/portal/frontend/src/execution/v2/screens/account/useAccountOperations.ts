/**
 * The Portal's typed statement about account operations (FE-037/058, BE-P7): `GET /self-context` `account_operations`.
 *
 * One read when the screen or drawer mounts, nothing else: no polling, no storage, no retry by itself. A late answer (the port
 * changed, or the screen left) is dropped. The answer is used only inside its own session ceiling (`valid_until_ms`, end-exclusive,
 * one direction: it can only shut). It can only EXPLAIN a control that is already off: `rotateCredential` turns it into a sentence,
 * and no value here can enable anything. A read that is missing, failed, expired or malformed yields `null`, which is the
 * control's own earlier reason.
 */
import { useEffect, useState } from "react";

import type { ExecutionApi } from "../../../api/ports";
import { selfProjectionExpiry } from "../../readers/accessSelf";
import type { AccountOperation } from "../../readers/accessSelfContext";

export function useAccountOperations(api: Pick<ExecutionApi, "getSelfContext">): readonly AccountOperation[] | null {
  const [operations, setOperations] = useState<readonly AccountOperation[] | null>(null);
  useEffect(() => {
    setOperations(null);
    // A port that predates the read (a partial fake) has nothing to ask: the control keeps its earlier reason.
    if (typeof api.getSelfContext !== "function") return;
    let current = true;
    void Promise.resolve(api.getSelfContext())
      .then((result) => {
        if (!current) return; // the screen left, or the port changed: a late answer is dropped
        if (!result.ok || result.value.kind !== "self_context") return;
        const context = result.value.context;
        if (selfProjectionExpiry(context, Date.now()).state !== "live") return;
        setOperations(context.accountOperations);
      })
      .catch(() => {
        /* a failed read leaves the earlier reason */
      });
    return () => {
      current = false;
    };
  }, [api]);
  return operations;
}
