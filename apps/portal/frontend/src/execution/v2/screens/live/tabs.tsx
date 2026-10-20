/**
 * The four tabs of Live operations and the rail's protective ladder.
 *
 * Exposure & orders, Continuity, Predecessor envelope and Guard rules read from the one `LiveModel`
 * (model.ts); a V2 body adds its retained-observation tables on the first two. Nothing here decides a
 * fact: a value the body did not publish prints `Not published (FE-xxx)` or `Not available`.
 */
import { useId } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { withoutOrigin } from "../../backTo";
import { DockAction } from "../../Drawer";
import { Flag } from "../../Flag";
import { GapLine, SectionPanel, Triad, type GapItem } from "../../blocks";
import type { LiveSourceOperationsV2 } from "../../readers/liveSourceOperations";
import { withContext } from "../../urlState";
import { stageWhy, type StageAction } from "../stage/reasons";
import { useStageReason } from "../stage/StageEligibility";
import { ContextLink, KeyedTable, PanelSection, V1RowsSection } from "./parts";
import { ACCESS_PATH, CONTINUITY_PANELS, EXPOSURE_PANELS, panelReason, panelTitle, type LiveModel } from "./model";
import type { PanelPaging } from "./useLiveReads";

import "../../css/decisions.css";

/* ── rail: the protective ladder ─────────────────────────────────────────── */

/** The three rungs as the eligibility read names them (display identifiers, not capability names). */
const RUNG_ACTION: Readonly<Record<string, StageAction>> = {
  halt: "live.halt",
  reduce: "live.reduce",
  "emergency-close": "live.emergency_close",
};

/**
 * Halt, Reduce, Emergency close. There is no real command route on this build, so every rung is a
 * disabled `DockAction` with the one-line reason and the My access link; no state of the body enables one
 * (D6: the V1 screen hid or enabled these from the policy flags; this one never does).
 */
export function ProtectiveLadder({ model }: { model: LiveModel }) {
  const reason = stageWhy("liveClosed");
  // FE-068: the server's own reason for a rung that is off, when it published one; today's sentence otherwise. Text only.
  const reasonFor = useStageReason();
  const reasonId = useId();
  const [params] = useSearchParams();
  const reasons = model.ladder.map((rung) => (RUNG_ACTION[rung.key] ? reasonFor(RUNG_ACTION[rung.key]!, reason) : reason));
  // Every rung is off for the same reason: the reason is printed once, under the ladder, with one My access link. A rung the server
  // gave its own reason keeps its own `DockAction`, so no reason is ever merged with a different one.
  const same = reasons.every((text) => text === reasons[0]);
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
            {same ? (
              <button type="button" className="exec-dock-btn" disabled aria-describedby={reasonId}>{rung.title}</button>
            ) : (
              <div className="exec-stage-dec"><DockAction label={rung.title} reason={reasons[index]} accessHref={ACCESS_PATH} /></div>
            )}
          </div>
        ))}
      </div>
      {same ? (
        <div className="exec-stage-dec-why">
          <p id={reasonId} className="exec-dock-reason" title={reasons[0]}>{reasons[0]}</p>
          <Link className="exec-dock-access" to={withContext(ACCESS_PATH, withoutOrigin(params))} aria-label={`My access: ${model.ladder.map((rung) => rung.title).join(", ")}`}>My access</Link>
        </div>
      ) : null}
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
  // No figure in the triad (none published, or every cell the server's NOT_PUBLISHED): ONE line instead of three columns of the same words.
  const cells = model.triad === null ? [] : model.triad.rows.flatMap((row) => [row.internal, row.broker, row.difference]);
  const triadGap =
    model.triad === null ||
    (!model.triad.suppressed &&
      cells.every((cell) => cell === undefined || (typeof cell === "object" && cell !== null && cell.kind === "not-published")));
  const triadReason =
    [...new Set(cells.flatMap((cell) => (typeof cell === "object" && cell !== null && cell.kind === "not-published" && cell.reasonCode ? [cell.reasonCode] : [])))].join(" · ") || null;
  const unpublishedPanels = v2 === null ? [] : EXPOSURE_PANELS.filter((name) => v2.panels[name].state === "NOT_PUBLISHED");
  return (
    <div className="exec-liv-stack">
      {triadGap ? (
        <SectionPanel level={2} title="Reconciliation">
          <GapLine items={[{ label: "Internal, Broker and Difference figures", id: "FE-072", reason: triadReason }]} />
        </SectionPanel>
      ) : model.triad === null ? null : (
        <Triad rows={model.triad.rows} internal={model.triad.internal} broker={model.triad.broker} suppressed={model.triad.suppressed} />
      )}
      {v2 !== null ? (
        <>
          {EXPOSURE_PANELS.filter((name) => !unpublishedPanels.includes(name)).map((name) => (
            <PanelSection key={name} panel={v2.panels[name]} page={paging.page(name)} onMore={() => paging.loadMore(name)} />
          ))}
          <GapLine items={unpublishedPanels.map((name): GapItem => ({ label: panelTitle(name), reason: panelReason(v2.panels[name].reasonCode) }))} />
        </>
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
          <SectionPanel level={2} title="What this read covers">
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
          {/* A panel the source did not publish is a row of the coverage table above (state and reason), not a second panel of the same words. */}
          {CONTINUITY_PANELS.filter((name) => v2.panels[name].state !== "NOT_PUBLISHED").map((name) => (
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
          <span className="exec-blk-na" title={p.reason}>Not available</span>
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
        <div className="exec-stage-dec" title="A gap blocks these first; the ladder's protective actions are separate.">
          <DockAction label="Risk-increasing action" reason={reason} accessHref={ACCESS_PATH} />
        </div>
      </SectionPanel>
    </div>
  );
}
