/**
 * Look up a receipt by its id. A READ: it never sends, never reconciles and never touches a receipt the page holds.
 *
 * Two shapes of id, told apart by the id alone (`routeLookup`): `ecm_` + 32 hex is a capital command, anything else that is a valid
 * identifier is an F0 operation. The reader that parses the answer is chosen by the body, not by the id. An id the grammar refuses is
 * never sent. Enter does not run the lookup: a click does, as everywhere on this page.
 */
import { useEffect, useId, useRef, useState } from "react";

import { classifyLookup, type LookupView } from "./lookup";
import { LookupResult } from "./parts";
import { routeLookup } from "./model";
import { READ_DISABLED_REASON, type CommandPort } from "./port";

import "../../css/command.css";

export function StatusLookup({ port }: { port: CommandPort }) {
  const base = useId();
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<LookupView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const result = useRef<HTMLDivElement>(null);
  const blocked = port.kind === "disabled" ? READ_DISABLED_REASON : null;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The answer is where attention belongs after the click. An id the grammar refused is explained beside the field, where focus already is.
  useEffect(() => {
    if (view !== null) result.current?.focus({ preventScroll: false });
  }, [view]);

  const run = () => {
    if (inFlight.current || blocked !== null) return;
    const route = routeLookup(id);
    if (route.kind === "invalid") {
      setView(null);
      setProblem(route.reason);
      return;
    }
    inFlight.current = true;
    setProblem(null);
    setBusy(true);
    let pending: Promise<unknown>;
    try {
      pending = Promise.resolve(port.lookup({ id: route.id }));
    } catch {
      pending = Promise.resolve({ kind: "no_response", why: "network" });
    }
    void pending.catch(() => ({ kind: "no_response", why: "network" })).then((raw) => {
      inFlight.current = false;
      if (!mounted.current) return;
      setView(classifyLookup(raw as Parameters<typeof classifyLookup>[0]));
      setBusy(false);
    });
  };

  return (
    <div className="exec-cf-lookup" data-step="lookup">
      <div className="exec-cf-fld">
        <label htmlFor={`${base}-id`} className="exec-cf-label"><span>Receipt id</span></label>
        <input
          id={`${base}-id`}
          className="exec-cf-control exec-cf-mono"
          value={id}
          autoComplete="off"
          spellCheck={false}
          placeholder="ecm_… or op_…"
          aria-invalid={problem !== null || undefined}
          aria-describedby={`${base}-help`}
          onChange={(e) => setId(e.target.value)}
          // A lookup is a read, but the rule is one rule: a click runs it, Enter never does.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />
        <p id={`${base}-help`} className={problem !== null ? "exec-cf-error" : "exec-cf-meta"}>
          {problem ?? <span title="A command id (ecm_ and 32 hex characters) or an operation id. Looking up changes nothing.">A command id or an operation id</span>}
        </p>
      </div>
      <div className="exec-cf-acts">
        <button
          type="button"
          className="exec-cf-btn"
          data-variant="primary"
          aria-disabled={busy || blocked !== null}
          title={blocked ?? (busy ? "A lookup is in progress." : undefined)}
          onClick={run}
        >
          {busy ? "Looking up…" : "Look up"}
        </button>
      </div>
      {blocked !== null ? <p className="exec-cf-why" role="status">{blocked}</p> : null}
      {view !== null ? (
        <div ref={result} className="exec-cf-query" role="status" tabIndex={-1} aria-label="What the lookup found">
          <LookupResult view={view} />
        </div>
      ) : null}
    </div>
  );
}
