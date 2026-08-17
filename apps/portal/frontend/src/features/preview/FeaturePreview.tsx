/**
 * Commissioned / blocked feature preview — U03 (v0.4 §P0.19).
 *
 * A commissioned nav item is clickable so a manager can see where the product
 * is going, but the screen shows only what the registry actually asserts:
 * brief, screens, concerns, repositories and the activation gate.
 *
 * There is no fake metric, no skeleton dressed as a value, and every
 * compute/mutation CTA is disabled with the specific gate that blocks it.
 */
import { Copy } from "lucide-react";
import { useState } from "react";

import { ModuleHeader } from "../../app/ModuleHeader";
import { usePortalContext } from "../../app/context";
import { PLANNING_TASK_ROUTE } from "../planning/planningLinks";
import { StateView } from "../../components/ui";
import { Link } from "react-router-dom";

import type { PortalFeatureDefinition } from "../../portal/contracts";
import { blockingConcernsFor, screensForFeature } from "../../portal/navigation";

function CopyId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      <Copy size={12} />
      {copied ? "Đã copy" : `Copy ${value}`}
    </button>
  );
}

export function FeaturePreview({ feature }: { feature: PortalFeatureDefinition }) {
  const { registry } = usePortalContext();
  const screens = registry ? screensForFeature(registry, feature.id) : [];
  const concerns = registry ? blockingConcernsFor(registry, feature.id) : [];
  const gate = feature.activation_gate;

  return (
    <>
      <ModuleHeader
        title={feature.label}
        description={feature.description}
        maturity={feature.maturity}
        dataMode={feature.data_mode}
        actions={<CopyId value={feature.id} />}
      />

      <p className="portal-callout" role="note">
        Feature này nằm trong định hướng Portal đã được duyệt nhưng <strong>chưa được triển khai</strong>.
        Không có runtime nào đang kết nối, nên trang này chỉ hiển thị brief và contract.
      </p>

      <div className="portal-grid-2">
        <section className="portal-card">
          <h2 className="portal-card-title">Trải nghiệm mục tiêu</h2>
          {screens.length === 0 ? (
            <StateView kind="empty" message="Registry chưa khai báo screen contract cho feature này." />
          ) : (
            <ul className="portal-screen-list">
              {screens.map((screen) => (
                <li key={screen.screen_id}>
                  <div className="portal-screen-id mono">{screen.screen_id}</div>
                  <div className="portal-screen-decision">{screen.primary_decision}</div>
                  <dl className="portal-details">
                    <div className="portal-detail-row">
                      <dt className="label">Persona</dt>
                      <dd className="mono">{screen.primary_persona}</dd>
                    </div>
                    <div className="portal-detail-row">
                      <dt className="label">Hành động chính</dt>
                      <dd className="mono">{screen.primary_action ?? "chưa xác định"}</dd>
                    </div>
                    <div className="portal-detail-row">
                      <dt className="label">Route dự kiến</dt>
                      <dd className="mono">{screen.route}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="portal-card">
          <h2 className="portal-card-title">Bối cảnh bàn giao</h2>
          <dl className="portal-details">
            <div className="portal-detail-row">
              <dt className="label">Maturity</dt>
              <dd className="mono">{feature.maturity}</dd>
            </div>
            <div className="portal-detail-row">
              <dt className="label">Data mode</dt>
              <dd className="mono">{feature.data_mode}</dd>
            </div>
            <div className="portal-detail-row">
              <dt className="label">Roadmap epic</dt>
              {/* U05 exit gate: the epic is a destination, not a label. An
                * unmapped one still says so rather than linking nowhere. */}
              <dd className="mono">
                {feature.roadmap_epic_id ? (
                  <Link to={PLANNING_TASK_ROUTE.roadmap}>{feature.roadmap_epic_id}</Link>
                ) : (
                  "chưa map"
                )}
              </dd>
            </div>
            <div className="portal-detail-row">
              <dt className="label">Task mặc định</dt>
              <dd className="mono">
                {feature.default_task_id ? (
                  <Link to={PLANNING_TASK_ROUTE.task(feature.default_task_id)}>
                    {feature.default_task_id}
                  </Link>
                ) : (
                  "chưa map"
                )}
              </dd>
            </div>
            <div className="portal-detail-row">
              <dt className="label">Figma frame</dt>
              <dd className="mono">{feature.prototype_frame_id ?? "chưa map"}</dd>
            </div>
            <div className="portal-detail-row">
              <dt className="label">Environments</dt>
              <dd className="mono">{feature.environments.join(", ")}</dd>
            </div>
            <div className="portal-detail-row">
              <dt className="label">Permissions (mô tả)</dt>
              <dd className="mono">{feature.permissions.join(", ") || "—"}</dd>
            </div>
          </dl>

          <h3 className="portal-subhead">Blocking concerns</h3>
          {concerns.length === 0 ? (
            <p className="mono text-[12px] text-ink-soft">Không có blocking concern nào đang mở.</p>
          ) : (
            <ul className="portal-concerns">
              {concerns.map((concern) => (
                <li key={concern.id}>
                  <span className="mono text-[10px] uppercase text-ink-faint">{concern.category}</span>
                  <div>{concern.statement}</div>
                  {concern.activation_gate ? (
                    <div className="mono text-[11px] text-ink-faint">Gate: {concern.activation_gate}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="portal-block">
        <h2 className="portal-block-title">Hành động</h2>
        <div className="flex flex-wrap items-center gap-2">
          <CopyId value={feature.id} />
          <button
            type="button"
            className="btn-primary"
            disabled
            title={gate ?? "Feature chưa qua activation gate"}
          >
            Chạy capability
          </button>
          <span className="mono text-[11px] text-ink-faint">
            {gate ? `Bị chặn bởi activation gate: ${gate}` : "Bị chặn: chưa có activation gate được ghi nhận."}
          </span>
        </div>
      </section>
    </>
  );
}
