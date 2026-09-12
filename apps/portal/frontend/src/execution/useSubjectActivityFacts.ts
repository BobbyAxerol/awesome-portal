/**
 * BR-EX-81 subject replay/funnel read.
 *
 * This replaces browser-side 40×200 page walks on Alpha 360 and Account 360.
 * A visible screen reads two named Portal BFF operations (orders and fills)
 * from the durable retained-current mirror.  Refreshes are tied to the
 * projection cadence/realtime revision, never a browser fan-out to AWS-HK.
 */
import { useEffect, useRef, useState } from "react";

import type { Drained, RelationEnvironment, RelationFacts } from "./api/managerRelations";
import type { ExecutionApi } from "./api/ports";
import type { SubjectActivityKind, SubjectActivityPage } from "./api/subjectActivity";
import { RELATION_REFRESH_MS, type RelationFactsState } from "./useRelationFacts";
import { usePollTick } from "./useRevision";
import { loadExecutionRuntime } from "./useExecutionRuntime";

export interface SubjectActivityTarget {
  kind: SubjectActivityKind;
  id: string;
}

function drained(page: SubjectActivityPage): Drained {
  return {
    rows: page.records.map((record) => record.values),
    pages: 1,
    exhausted: !page.page.hasMore,
    state: page.state,
    completeness: page.sourceHealth.completeness,
    freshness: page.sourceHealth.freshness,
    asOfMs: page.sourceHealth.asOfMs,
    reason: page.state === "UNAVAILABLE" ? "subject retained activity unavailable" : null,
    // The subject BFF serves one page and states its own limit; there is no
    // ladder here to settle on, so the limit is the page's own.
    pageLimit: page.page.limit ?? null,
    maximumPageRows: page.page.maximumPageRows,
    // This operation publishes no truncation flag; `false` here would be the
    // reader asserting something the source did not say.
    truncated: false,
  };
}

function factsFor(environment: RelationEnvironment, pages: readonly (SubjectActivityPage | null)[]): RelationFacts {
  const facts: Record<string, readonly Record<string, unknown>[]> = {};
  const coverage: Record<string, Drained> = {};
  const reasons: string[] = [];
  let asOfMs: number | null = null;
  let completeness: string | null = null;
  let pagesRead = 0;
  let answered = 0;
  let exhausted = true;
  for (const [relation, page] of [["orders", pages[0]], ["fills", pages[1]]] as const) {
    if (!page) {
      exhausted = false;
      reasons.push(`${relation}: no Portal response`);
      continue;
    }
    const cover = drained(page);
    coverage[relation] = cover;
    pagesRead += cover.pages;
    if (page.state !== "UNAVAILABLE") {
      facts[relation] = cover.rows;
      answered += 1;
    } else {
      exhausted = false;
      reasons.push(`${relation}: ${cover.reason ?? "unavailable"}`);
    }
    exhausted = exhausted && cover.exhausted;
    completeness ??= cover.completeness;
    if (cover.asOfMs !== null) asOfMs = asOfMs === null ? cover.asOfMs : Math.min(asOfMs, cover.asOfMs);
  }
  const primary = pages[0] ?? pages[1] ?? null;
  return {
    environment,
    origin: "PORTAL_RETAINED_CURRENT_WINDOW",
    timeframe: primary?.timeframe ? { value: primary.timeframe.value, provenance: primary.timeframe.provenance, sourceField: primary.timeframe.sourceField } : null,
    facts,
    coverage,
    pages: pagesRead,
    exhausted,
    completeness,
    asOfMs,
    state: answered === 0 ? "UNAVAILABLE" : answered === 2 ? "POPULATED" : "PARTIAL",
    reasons,
  };
}

/** Two exact BFF reads; no relation/cursor/source transport is browser-visible. */
export function useSubjectActivityFacts(
  api: ExecutionApi,
  environment: RelationEnvironment,
  target: SubjectActivityTarget,
  active = true,
  revisionKey: string | number | null = null,
): RelationFactsState {
  const armed = useRef(false);
  if (active) armed.current = true;
  const on = armed.current;
  const cadence = usePollTick(RELATION_REFRESH_MS, on);
  const [state, setState] = useState<RelationFactsState>({ status: "loading", value: null, refreshing: false });
  const identity = `${environment}:${target.kind}:${target.id}`;
  const lastIdentity = useRef({ api, identity });
  useEffect(() => {
    // Phase 3: subject screens never touch `useRelationFacts`, so without this
    // the manifest was never read on Alpha 360 or Account 360 — measured on
    // dev as zero manifest requests across four screens.
    void loadExecutionRuntime(api);
    if (!on) return undefined;
    let cancelled = false;
    const abort = new AbortController();
    const reader = api.withReadSignal?.(abort.signal) ?? api;
    const sameIdentity = lastIdentity.current.api === api && lastIdentity.current.identity === identity;
    lastIdentity.current = { api, identity };
    setState((current) => sameIdentity && current.value ? { ...current, refreshing: true } : { status: "loading", value: null, refreshing: false });
    void Promise.all([
      reader.getSubjectActivity({ environment, subjectKind: target.kind, subjectId: target.id, relation: "orders", limit: 500 }),
      reader.getSubjectActivity({ environment, subjectKind: target.kind, subjectId: target.id, relation: "fills", limit: 500 }),
    ]).then((results) => {
      if (cancelled) return;
      // Preserve relation slots: a failed orders read must never relabel fills.
      const values = results.map((result) => result.ok ? result.value : null);
      const facts = factsFor(environment, values);
      const failed = results.flatMap((result, index) => result.ok ? [] : [`${index === 0 ? "orders" : "fills"}: ${result.reason}`]);
      const value = failed.length > 0 ? { ...facts, reasons: [...facts.reasons, ...failed], state: facts.state === "POPULATED" ? "PARTIAL" as const : facts.state } : facts;
      setState({ status: value.state === "UNAVAILABLE" ? "unavailable" : "ok", value, refreshing: false });
    }).catch((error: unknown) => {
      if (cancelled) return;
      const reason = error instanceof Error ? error.message : "subject retained activity request failed";
      setState({ status: "unavailable", value: null, refreshing: false });
      void reason;
    });
    return () => { cancelled = true; abort.abort(); };
  }, [api, environment, target.kind, target.id, identity, on, cadence, revisionKey]);
  return lastIdentity.current.api === api && lastIdentity.current.identity === identity
    ? state : { status: "loading", value: null, refreshing: false };
}
