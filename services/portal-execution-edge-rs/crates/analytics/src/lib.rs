#![forbid(unsafe_code)]

mod capital;
mod correlation;
mod exposure;
mod funnel;
mod insight;
mod ledger;
mod series;
mod tiles;
mod types;

pub use capital::{
    build_capital_preview, CapitalBlocker, CapitalBucketInput, CapitalPreview,
    CapitalPreviewRequest,
};
pub use correlation::{
    build_correlation, CorrelationCluster, CorrelationInput, CorrelationLabel, CorrelationPair,
    CorrelationRepresentation, CorrelationResult, PackedTriangle, TrianglePacking,
};
pub use exposure::{
    aggregate_binding_exposure, BindingExposureBucket, BindingExposureInput, BindingExposureResult,
    VirtualAccountExposure,
};
pub use funnel::{
    build_order_funnel, FunnelEvent, FunnelInput, FunnelStage, FunnelStageResult, FunnelStageState,
    FunnelWindow, OrderFunnel,
};
pub use insight::{
    build_insight_batch, InsightBatch, InsightBatchRequest, InsightItemRequest, InsightItemResult,
    InsightItemState, InsightMetric, InsightMetricValue, InsightObservation,
};
pub use ledger::{
    build_capital_ledger, CapitalLedgerBucket, CapitalLedgerEntry, CapitalLedgerFact,
    CapitalLedgerInput, CapitalLedgerResult, CapitalLedgerWindow, LedgerDirection, MovementType,
};
pub use series::{
    build_equity_projection, ApprovedBand, ApprovedBandPoint, EquityPoint, EquityProjection,
    EquityProjectionInput, EquityProjectionResponse, RetentionSummary, SeriesGap, SeriesGapReason,
    MAX_ANALYTICS_RESPONSE_BYTES, MAX_SERIES_POINTS,
};
pub use tiles::{
    alpha_360_tile_catalogue, build_insight_tile_batch, BarPoint, FunnelStageSeries, HeatmapCell,
    HistogramBin, InsightSeries, InsightTile, InsightTileBatch, InsightTileInput, InsightTileState,
    LinePoint, TileDefinition, TileKind, WaterfallInputStep, WaterfallStep, MAX_HEATMAP_CELLS,
    MAX_INSIGHT_SERIES_ITEMS, MAX_INSIGHT_TILES,
};
pub use types::{
    AnalyticsError, CurrencyCode, DerivedAnalytics, FactQuality, PopulationCompleteness,
    ANALYTICS_SCHEMA_VERSION, MAX_BINDING_EXPOSURE_FACTS, MAX_CAPITAL_LEDGER_ENTRIES,
    MAX_CORRELATION_DIMENSION, MAX_CORRELATION_ENTITIES, MAX_FUNNEL_EVENTS,
    MAX_INSIGHT_PREVIEW_ITEMS, MAX_RANKED_CORRELATION_PAIRS,
};
