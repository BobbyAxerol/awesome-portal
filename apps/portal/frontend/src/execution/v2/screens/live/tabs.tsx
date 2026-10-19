/**
 * The four tabs of Live operations and the rail's protective ladder.
 *
 * Exposure & orders, Continuity, Predecessor envelope and Guard rules read from the one `LiveModel`
 * (model.ts); a V2 body adds its retained-observation tables on the first two. Nothing here decides a
 * fact: a value the body did not publish prints `Not published (FE-xxx)` or `Not available`.
 */
import { Link, useSearchParams } from "react-router-dom";

import { DockAction } from "../../Drawer";
import { Flag } from "../../Flag";
import { NotPublished, SectionPanel, Triad } from "../../blocks";
import type { LiveSourceOperationsV2 } from "../../readers/liveSourceOperations";
import { withContext } from "../../urlState";
import { stageWhy } from "../stage/reasons";
import { ContextLink, KeyedTable, PanelSection, V1RowsSection } from "./parts";
import { ACCESS_PATH, CONTINUITY_PANELS, EXPOSURE_PANELS, type LiveModel } from "./model";
import type { PanelPaging } from "./useLiveReads";

/* ── rail: the protective ladder ─────────────────────────────────────────── */

/**
 * Halt, Reduce, Emergency close. There is no real command route on this build, so every rung is a
 * disabled `DockAction` with the one-line reason and the My access link; no state of the body enables one
 * (D6: the V1 screen hid or enabled these from the policy flags; this one never does).
 */
export function ProtectiveLadder({ model }: { model: LiveModel }) {
  const reason = stageWhy("liveClosed");
  return (
    <SectionPanel level={2} title="Protective ladder" aside="Halt → Reduce → Close">
      <div className="exec-liv-ladder">
        {model.ladder.map((rung, index) => (
          <div key={rung.key} className="exec-liv-rung" data-rung={index + 1}>
            <div className="exec-liv-rung-head">
              <b className="exec-liv-rung-name">{rung.title}</b>
              <span className="exec-liv-step">Step {rung.step}</span>
            </div>
            <p className="exec-liv-rung-note">{rung.note}</p>
            <DockAction label={rung.title} reason={reason} accessHref={ACCESS_PATH} />
          </div>
        ))}
      </div>
      {model.gapNote ? <p className="exec-liv-line">{model.gapNote}</p> : null}
    </SectionPanel>
  );
}

/* ── Exposure & orders ───────────────────────────────────────────────────── */

export interface TabProps {
  model: LiveModel;
  v2: LiveSourceOperationsV2 | null;
  paging: PanelPaging;
}

export function ExposureTab({ model, v2, paging }: TabProps) {
  const [params] = useSearchParams();
  const blotter = model.deploymentId === null ? null : withContext(`/deployments/blotter?deployment=${encodeURIComponent(model.deploymentId)}`, params);
  return (
    <div className="exec-liv-stack">
      {model.triad !== null ? (
        <>
          <Triad rows={model.triad.rows} internal={model.triad.internal} broker={model.triad.broker} suppressed={model.triad.suppressed} />
          {model.triad.rowsPublished ? null : (
            <p className="exec-liv-line">
              Reconciliation figures: <NotPublished id="FE-072">Internal, Broker and Difference rows</NotPublished>
            </p>
          )}
        </>
      ) : (
        <SectionPanel level={2} title="Reconciliation">
          <p className="exec-liv-line">
            <NotPublished id="FE-072">Internal, Broker and Difference figures</NotPublished>
          </p>
        </SectionPanel>
      )}
      {v2 !== null ? (
        EXPOSURE_PANELS.map((name) => (
          <PanelSection key={name} panel={v2.panels[name]} page={paging.page(name)} onMore={() => paging.loadMore(name)} />
        ))
      ) : (
        <>
          <V1RowsSection title="Positions" aside="Internal figures" rows={model.v1Rows?.positions ?? { kind: "none" }} what="Position rows" />
          <V1RowsSection title="Orders" rows={model.v1Rows?.orders ?? { kind: "none" }} what="Open order rows" />
        </>
      )}
      {blotter === null ? null : (
        <p className="exec-liv-line">
          <Link className="exec-blk-link" to={blotter}>Open the full blotter for this deployment</Link>
        </p>
      )}
    </div>
  );
}

/* ── Continuity ──────────────────────────────────────────────────────────── */

export function ContinuityTab({ model, v2, paging }: TabProps) {
  const c = model.continuity;
  return (
    <div className="exec-liv-stack">
      <SectionPanel level={2} title="Display continuity" aside={<Flag kind={c.flag.kind} label={c.flag.label} size="sm" />}>
        <KeyedTable
          label="Display continuity"
          columns={[{ key: "check", label: "Check" }, { key: "result", label: "Result" }]}
          rows={c.rows.map((row) => ({ key: row.key, cells: [{ t: "text", text: row.label }, row.value] }))}
        />
        {c.provenance.length > 0 ? (
          <details className="exec-blocker-prov">
            <summary>Provenance</summary>
            <ul className="exec-blocker-codes">
              {c.provenance.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </SectionPanel>
      {v2 !== null ? (
        <>
          <SectionPanel level={2} title="What this read covers" aside="Retained observations">
            <KeyedTable
              label="Panel coverage"
              columns={[{ key: "panel", label: "Panel" }, { key: "state", label: "State" }, { key: "rows", label: "On this page", numeric: true }, { key: "why", label: "Why" }]}
              rows={model.coverage.map((row) => ({
                key: row.name,
                cells: [
                  { t: "text", text: row.title },
                  { t: "flag", kind: row.state === "PARTIAL" ? "partial" : "na", label: row.state === "PARTIAL" ? "Partial" : "Not published" },
                  { t: "text", text: `${row.returned}${row.hasMore ? " · more available" : ""}` },
                  { t: "text", text: row.reason },
                ],
              }))}
            />
          </SectionPanel>
          {CONTINUITY_PANELS.map((name) => (
            <PanelSection key={name} panel={v2.panels[name]} page={paging.page(name)} onMore={() => paging.loadMore(name)} />
          ))}
        </>
      ) : null}
    </div>
  );
}

/* ── Predecessor envelope ────────────────────────────────────────────────── */

export function PredecessorTab({ model }: { model: LiveModel }) {
  const p = model.predecessor;
  return (
    <SectionPanel level={2} title="Canary envelope" aside="Predecessor">
      {p.present ? (
        <>
          <p className="exec-liv-line">
            <Flag kind={p.activeFlag.kind} label={p.activeFlag.label} />
            {p.meta ? <span className="exec-liv-meta"> {p.meta}</span> : null}
          </p>
          <KeyedTable
            label="Predecessor Canary envelope"
            columns={[{ key: "cap", label: "Cap" }, { key: "approved", label: "Approved", numeric: true }, { key: "applies", label: "Applies to Live" }]}
            rows={p.rows.map((row) => ({ key: row.key, cells: [{ t: "text", text: row.label }, row.approved, row.applies] }))}
          />
        </>
      ) : (
        <p className="exec-liv-line">
          <span className="exec-blk-na">Not available · {p.reason}</span>
        </p>
      )}
      <p className="exec-liv-line">
        <ContextLink to={p.canaryHref}>Open the Canary control room</ContextLink>
      </p>
    </SectionPanel>
  );
}

/* ── Guard rules ─────────────────────────────────────────────────────────── */

export function GuardRulesTab({ model }: { model: LiveModel }) {
  const reason = stageWhy("liveClosed");
  return (
    <div className="exec-liv-stack">
      <SectionPanel level={2} title="Guard rules">
        <KeyedTable
          label="Guard rules"
          columns={[{ key: "when", label: "When" }, { key: "effect", label: "Effect" }, { key: "now", label: "Now" }]}
          rows={model.guardRules.map((rule) => ({ key: rule.key, cells: [{ t: "text", text: rule.when }, rule.effect, rule.now] }))}
        />
        {model.guardProvenance.length > 0 ? (
          <details className="exec-blocker-prov">
            <summary>Provenance</summary>
            <ul className="exec-blocker-codes">
              {model.guardProvenance.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </SectionPanel>
      <SectionPanel level={2} title="Risk-increasing actions">
        <p className="exec-liv-line">A gap blocks these first; the ladder's protective actions are separate.</p>
        <DockAction label="Risk-increasing action" reason={reason} accessHref={ACCESS_PATH} />
      </SectionPanel>
    </div>
  );
}
