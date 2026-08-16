/**
 * Module header — the contract every feature surface must fill (v0.4 §P0.8):
 * title, description, maturity, data mode, and its own actions.
 *
 * The data-mode banner is not decoration: it is what stops a FIXTURE or
 * STATIC_PREVIEW screen from being read as real evidence (v0.4 §P0.24).
 */
import type { ReactNode } from "react";

import { MaturityBadge } from "../components/semantic";
import { dataModeBanner } from "../lib/portalState";
import type { FeatureDataMode, FeatureMaturity } from "../portal/contracts";

export function ModuleHeader({
  title,
  description,
  maturity,
  dataMode,
  actions,
  children,
}: {
  title: string;
  description?: string;
  maturity: FeatureMaturity;
  dataMode: FeatureDataMode;
  actions?: ReactNode;
  /** Context chips or a module subnav rendered under the title block. */
  children?: ReactNode;
}) {
  const banner = dataModeBanner(dataMode);
  return (
    <header className="portal-module-header">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="section-title">{title}</h1>
        <MaturityBadge maturity={maturity} />
        <span className="mono text-[10px] uppercase text-ink-faint">{dataMode}</span>
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <p className="dek mt-1">{description}</p> : null}
      {banner ? (
        <p className="portal-datamode-banner mono" role="note">
          {banner}
        </p>
      ) : null}
      {children}
    </header>
  );
}
