/**
 * V2 shared blocks. Plain props in, markup out: nothing here reads a store, a
 * route or a chart library. Screens import from this barrel only.
 *
 * - `Kpi` / `KpiStrip`: label, value, basis, with the three honest absences.
 * - `NotPublished` and the one FE-id table.
 * - `EventFeed`: a subject's events with a keyset `Load more` contract.
 * - `JourneySpine`: R1, R2, Paper, Sandbox, Canary, Live; never infers history.
 * - `Triad`: Internal, Broker, Difference; never computes; `suppressed` withholds Broker and Difference.
 * - `StageHeader`, `Tabs` / `UrlTabs`, `CapGauge`, `BlockerList`: the S3 stage-screen frame (Sandbox, Canary, Live).
 * - `ReplayPanel`: the V2 frame; the V1 chart loads lazily.
 * - `SectionPanel` / `PanelHead` / `StateBoundary` / `PanelGate`.
 */
export { Kpi, KpiStrip } from "./Kpi";
export type { KpiProps, KpiStripProps } from "./Kpi";
export { MetricText, NO_VALUE_COPY, UNREADABLE_COPY } from "./metric";
export type { MetricTextProps } from "./metric";
export {
  FE_FLEET,
  FE_OPERATIONS,
  FE_REQUEST_LABEL,
  NOT_PUBLISHED,
  CompactGaps,
  GAP_NEXT,
  GapLine,
  GapWhy,
  NaWhy,
  NotPublished,
  feLabel,
  gapTitle,
  notPublishedFact,
  notPublishedReason,
  notPublishedText,
} from "./notPublished";
export type { FeId, GapItem, GapWhyProps, NaWhyProps, NotPublishedId, NotPublishedProps, UnpublishedFact } from "./notPublished";
export { NotAvailableLine, unavailableTitle } from "./NotAvailableLine";
export type { NotAvailableLineProps, UnavailableFact } from "./NotAvailableLine";
export { QuietIds, QuietIdsWhy } from "./QuietIds";
export { EventFeed } from "./EventFeed";
export type { EventFeedCursor, EventFeedProps, EventFeedRow } from "./EventFeed";
export { JourneySpine, SPINE_STAGES, SPINE_STAGE_IDS, spineNodeState } from "./JourneySpine";
export type {
  SpineCriteria,
  SpineDomain,
  SpineNodeState,
  SpineStageFacts,
  SpineStageId,
  SpineStageSpec,
  SpineVariant,
  JourneySpineProps,
} from "./JourneySpine";
export { TRIAD_SUPPRESSED_COPY, Triad } from "./Triad";
export type { TriadCell, TriadNotComputed, TriadNotPublished, TriadProps, TriadRow, TriadSide } from "./Triad";
export { ChipBody, REAL_CAPITAL_AT_RISK, STAGE_CHIP_LABELS, STAGE_GUARD, StageChipRow, StageHeader } from "./StageHeader";
export type {
  StageChipId,
  StageChipValue,
  StageChips,
  StageCrumb,
  StageGuardSpec,
  StageGuardStage,
  StageHeaderProps,
} from "./StageHeader";
export { Tabs, UrlTabs, useUrlTab } from "./Tabs";
export type { StageTab, TabsProps, UrlTab, UrlTabsProps } from "./Tabs";
export { CapGauge, fractionToPercent, toneOfUsed } from "./CapGauge";
export type { CapGaugeProps } from "./CapGauge";
export { BlockerList } from "./BlockerList";
export type { BlockerItem, BlockerListProps } from "./BlockerList";
export { ReplayPanel } from "./ReplayPanel";
export type { ReplayChip, ReplayLogRow, ReplayPanelProps } from "./ReplayPanel";
export { LazyReplayCandleChart, LazyTradeReplayEvents } from "./replayLazy";
export { PanelHead, SectionPanel } from "./SectionPanel";
export type { PanelHeadLevel, PanelHeadProps, SectionPanelProps } from "./SectionPanel";
export { PanelGate, StateBoundary } from "./StateBoundary";
export type { PanelGateProps, StateBoundaryProps } from "./StateBoundary";
